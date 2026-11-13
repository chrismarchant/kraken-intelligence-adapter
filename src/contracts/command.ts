import { z } from "zod";
import { HumanActor, Id, IsoDateTime } from "./common.ts";

export const PROVISIONAL_COMMAND_SCHEMA = "kic.provisional-publish-command/v0";

export const NON_EXECUTABLE_NOTICE =
  "NON-EXECUTABLE. Provisional fixture produced by KIC for contract convergence only. " +
  "It is not a Kraken command, carries no authority and must not be sent to any publishing system.";

/**
 * A provisional, non-authoritative description of an approved post, shaped for later
 * translation into Kraken's accepted contract. The schema cannot express an executable
 * command: the three guard fields are literals, and there is no endpoint, credential,
 * account or clock-time field to act on.
 */
export const ProvisionalPublishCommand = z.strictObject({
  schema: z.literal(PROVISIONAL_COMMAND_SCHEMA),
  status: z.literal("NON-EXECUTABLE"),
  authoritative: z.literal(false),
  executable: z.literal(false),
  notice: z.literal(NON_EXECUTABLE_NOTICE),
  commandId: Id,
  programmeId: Id,
  channel: z.literal("linkedin"),
  kind: z.literal("organic-post"),
  /** Relative position only. KIC never proposes a date or time. */
  sequence: z.strictObject({
    slot: z.number().int().min(1),
    week: z.number().int().min(1),
    orderInWeek: z.number().int().min(1),
  }),
  content: z.strictObject({
    draftId: Id,
    body: z.string().min(1),
    hashtags: z.array(z.string()),
    bodySha256: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  approval: z.strictObject({
    decisionId: Id,
    approvedBy: HumanActor,
    approvedAt: IsoDateTime,
    /** True when the approval's operator signature was checked. False only in unsigned development mode. */
    signatureVerified: z.boolean(),
  }),
  translation: z.strictObject({
    target: z.literal("kraken"),
    /** Kraken's accepted contract version. Null until one is accepted and integration is authorised. */
    contract: z.null(),
    note: z.string(),
  }),
});
export type ProvisionalPublishCommand = z.infer<typeof ProvisionalPublishCommand>;
