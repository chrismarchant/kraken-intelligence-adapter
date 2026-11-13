import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import type { KeyObject } from "node:crypto";
import type { EditorialDecision } from "../contracts/index.ts";
import { canonicalJson } from "../util/runtime.ts";

/**
 * Editorial decisions are signed with a key that only the operator's tool holds.
 * The agent-facing server holds the public half: it can check a decision but cannot make
 * one, and neither can anything else that is able to write to the campaign store.
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

/** The exact bytes a signature covers: the campaign and every field of the decision. */
export function decisionPayload(campaignId: string, decision: UnsignedDecision): string {
  return canonicalJson({
    campaignId,
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

/**
 * True when the decision may be relied on. With a verifier, the decision must carry a
 * valid signature from the operator key. Without one (development only), unsigned
 * decisions are accepted and the programme package says so.
 */
export function decisionIsAuthentic(campaignId: string, decision: EditorialDecision, verifier: DecisionVerifier | null): boolean {
  if (verifier === null) return true;
  if (decision.signature === null) return false;
  const { signature, ...unsigned } = decision;
  return verifier.verify(signature.keyId, decisionPayload(campaignId, unsigned), signature.value);
}
