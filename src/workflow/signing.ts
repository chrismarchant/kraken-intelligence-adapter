import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import type { KeyObject } from "node:crypto";
import type { CampaignRecord, EditorialDecision } from "../contracts/index.ts";
import { canonicalJson } from "../util/runtime.ts";

/**
 * Editorial decisions are signed with a key that only the operator's tool holds, and each
 * one is chained to the one before it. The agent-facing server holds the public half: it
 * can check the log but cannot add to it, and anything else that can write the campaign
 * store can neither forge a decision nor reorder, replace or remove one from the middle of
 * the log without the chain breaking. Removing decisions from the END of the log is caught
 * by the operator's own ledger (see OperatorLedger), which lives outside the store.
 */
export interface DecisionSigner {
  readonly keyId: string;
  sign(payload: string): string;
}

export interface DecisionVerifier {
  readonly keyId: string;
  verify(keyId: string, payload: string, signature: string): boolean;
}

export type UnsignedDecision = Omit<EditorialDecision, "signature">;

export const GENESIS_SHA256 = "0".repeat(64);

/** The exact bytes a signature covers: the campaign, the position in the log, and every field of the decision. */
export function decisionPayload(campaignId: string, decision: UnsignedDecision): string {
  return canonicalJson({
    campaignId,
    sequence: decision.sequence,
    previousSha256: decision.previousSha256,
    id: decision.id,
    requestId: decision.requestId,
    subject: decision.subject,
    action: decision.action,
    actor: decision.actor,
    rationale: decision.rationale,
    revisionInstruction: decision.revisionInstruction,
    decidedAt: decision.decidedAt,
    subjectContentSha256: decision.subjectContentSha256,
  });
}

/** The value the next decision in the log must name as its predecessor. */
export function decisionDigest(campaignId: string, decision: EditorialDecision): string {
  const { signature, ...unsigned } = decision;
  return createHash("sha256").update(`${decisionPayload(campaignId, unsigned)}\n${signature?.value ?? ""}`, "utf8").digest("hex");
}

function keyIdOf(publicKey: KeyObject): string {
  return createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("hex").slice(0, 16);
}

export function signerFromPrivateKeyPem(pem: string): DecisionSigner {
  const privateKey = createPrivateKey(pem);
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("The operator key must be an Ed25519 private key.");
  const keyId = keyIdOf(createPublicKey(privateKey));
  return { keyId, sign: (payload) => sign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64") };
}

export function verifierFromPublicKeyPem(pem: string): DecisionVerifier {
  const publicKey = createPublicKey(pem);
  if (publicKey.asymmetricKeyType !== "ed25519") throw new Error("The decision key must be an Ed25519 public key.");
  const keyId = keyIdOf(publicKey);
  return {
    keyId,
    verify(candidateKeyId, payload, signature) {
      if (candidateKeyId !== keyId) return false;
      try {
        return verify(null, Buffer.from(payload, "utf8"), publicKey, Buffer.from(signature, "base64"));
      } catch {
        return false;
      }
    },
  };
}

export interface DecisionKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
  signer: DecisionSigner;
  verifier: DecisionVerifier;
}

export function generateDecisionKeyPair(): DecisionKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return { privateKeyPem, publicKeyPem, signer: signerFromPrivateKeyPem(privateKeyPem), verifier: verifierFromPublicKeyPem(publicKeyPem) };
}

export interface LogHead {
  /** Number of decisions in the log. Zero for an empty log. */
  sequence: number;
  /** Digest of the last decision, or the genesis value for an empty log. */
  sha256: string;
}

export type LogCheck = { ok: true; head: LogHead; digests: string[] } | { ok: false; reason: string };

/**
 * Check the whole decision log of a campaign. Every decision must sit at its own sequence
 * number, name the digest of the one before it, and (when a verifier is given) carry a
 * valid operator signature. One bad entry invalidates the log: a record that has been
 * tampered with is not partly trusted.
 */
export function verifyDecisionLog(record: Pick<CampaignRecord, "id" | "decisions">, verifier: DecisionVerifier | null): LogCheck {
  let previous = GENESIS_SHA256;
  const digests: string[] = [];
  for (let index = 0; index < record.decisions.length; index++) {
    const decision = record.decisions[index] as EditorialDecision;
    if (decision.sequence !== index + 1) return { ok: false, reason: `decision ${decision.id} is at position ${index + 1} but is numbered ${decision.sequence}` };
    if (decision.previousSha256 !== previous) return { ok: false, reason: `decision ${decision.id} does not follow the decision before it` };
    if (verifier !== null) {
      if (decision.signature === null) return { ok: false, reason: `decision ${decision.id} is not signed` };
      const { signature, ...unsigned } = decision;
      if (!verifier.verify(signature.keyId, decisionPayload(record.id, unsigned), signature.value)) {
        return { ok: false, reason: `decision ${decision.id} does not carry a valid operator signature` };
      }
    }
    previous = decisionDigest(record.id, decision);
    digests.push(previous);
  }
  return { ok: true, head: { sequence: record.decisions.length, sha256: previous }, digests };
}

/**
 * The operator's own record of how far each campaign's decision log has reached. It is kept
 * with the operator's key, outside the campaign store, so that a store rolled back to an
 * earlier state (a later rejection removed, say) is recognised as such.
 */
export interface OperatorLedger {
  get(campaignId: string): Promise<LogHead | null>;
  set(campaignId: string, head: LogHead): Promise<void>;
}

export class MemoryOperatorLedger implements OperatorLedger {
  private readonly heads = new Map<string, LogHead>();

  async get(campaignId: string): Promise<LogHead | null> {
    return this.heads.get(campaignId) ?? null;
  }

  async set(campaignId: string, head: LogHead): Promise<void> {
    this.heads.set(campaignId, head);
  }
}

/** True when the log in the store contains everything the operator's ledger says was decided. */
export function logContainsHead(check: Extract<LogCheck, { ok: true }>, head: LogHead | null): boolean {
  if (head === null || head.sequence === 0) return true;
  return check.head.sequence >= head.sequence && check.digests[head.sequence - 1] === head.sha256;
}
