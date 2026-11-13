import { z } from "zod";
import { HumanActor, Id, IsoDateTime, ShortText } from "./common.ts";

export const DecisionSubject = z.strictObject({
  kind: z.enum(["narrative", "draft"]),
  id: Id,
});
export type DecisionSubject = z.infer<typeof DecisionSubject>;

export const DecisionAction = z.enum(["select", "approve", "reject", "request-revision"]);
export type DecisionAction = z.infer<typeof DecisionAction>;

/**
 * A decision an agent has asked a person to make. It has no effect until a person
 * confirms it with the one-time code that was delivered to the operator channel.
 */
export const DecisionRequest = z.strictObject({
  id: Id,
  subject: DecisionSubject,
  action: DecisionAction,
  /** Why the requester proposes this. Shown to the editor; not the editor's rationale. */
  proposedRationale: ShortText,
  /** For request-revision: what the editor wants changed. */
  revisionInstruction: ShortText.nullable(),
  requestedBy: ShortText,
  requestedAt: IsoDateTime,
  expiresAt: IsoDateTime,
  /** SHA-256 of the subject's content when the request was made. A changed subject voids the request. */
  subjectContentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** SHA-256 of the one-time code. The code itself is never stored or returned to the agent. */
  codeHash: z.string().regex(/^[0-9a-f]{64}$/),
  failedAttempts: z.number().int().min(0),
  state: z.enum(["pending", "confirmed", "expired", "voided"]),
});
export type DecisionRequest = z.infer<typeof DecisionRequest>;

export const EditorialDecision = z.strictObject({
  id: Id,
  /** Position in the campaign's decision log, from 1. Covered by the signature. */
  sequence: z.number().int().min(1),
  /** Digest of the decision before this one in the log; sixty-four zeros for the first. Covered by the signature. */
  previousSha256: z.string().regex(/^[0-9a-f]{64}$/),
  requestId: Id,
  subject: DecisionSubject,
  /**
   * For a decision about a draft, the post it is a draft of; null for a narrative. Covered by
   * the signature, so that which draft holds a post can be read from the log alone and never
   * from a status field or from where a draft is filed now.
   */
  subjectSlot: z.number().int().min(1).nullable(),
  action: DecisionAction,
  actor: HumanActor,
  /** The editor's own reason, recorded verbatim. */
  rationale: ShortText,
  revisionInstruction: ShortText.nullable(),
  decidedAt: IsoDateTime,
  /** SHA-256 of the content the editor decided on, so a later edit cannot inherit the decision. */
  subjectContentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  /**
   * Signature by the operator's key over the campaign id and every field above.
   * Null only where unsigned decisions were explicitly allowed (development).
   */
  signature: z
    .strictObject({
      alg: z.literal("ed25519"),
      keyId: z.string().regex(/^[0-9a-f]{16}$/),
      value: z.string().min(1),
    })
    .nullable(),
});
export type EditorialDecision = z.infer<typeof EditorialDecision>;
