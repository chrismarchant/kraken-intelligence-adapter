import { z } from "zod";
import { GenerationMeta, Id, LongText, NO_CONTROL_CHARACTERS, ShortText } from "./common.ts";

export const Narrative = z.strictObject({
  id: Id,
  title: ShortText,
  angle: LongText,
  coreMessage: LongText,
  supportingThemes: z.array(ShortText).min(1).max(8),
  audienceFit: LongText,
  /** What would have to be evidenced for this narrative to be published honestly. */
  evidenceRequirements: z.array(ShortText).max(8),
  risks: z.array(ShortText).max(8),
  status: z.enum(["candidate", "selected", "rejected"]),
  generation: GenerationMeta,
});
export type Narrative = z.infer<typeof Narrative>;

export const PostIntent = z.enum([
  "problem-framing",
  "point-of-view",
  "proof",
  "how-to",
  "story",
  "invitation",
]);

/** Far above any limit an instance sets; a bound so that no record can carry an absurd count. */
export const MAX_POSTS_IN_A_PLAN = 500;
const Position = z.number().int().min(1).max(MAX_POSTS_IN_A_PLAN);

export const ProgrammeSlot = z.strictObject({
  slot: Position,
  week: Position,
  orderInWeek: Position,
  theme: ShortText,
  intent: PostIntent,
  /** Why this post sits here in the sequence. */
  sequencingRationale: ShortText,
  callToAction: ShortText,
  evidenceRequirements: z.array(ShortText).max(6),
});
export type ProgrammeSlot = z.infer<typeof ProgrammeSlot>;

export const ProgrammePlan = z.strictObject({
  narrativeId: Id,
  campaignObjective: LongText,
  coreNarrative: LongText,
  supportingThemes: z.array(ShortText).min(1).max(8),
  intendedAudience: LongText,
  // Posts are numbered 1 to n, each number once: a number names one post, here and in every decision.
  slots: z
    .array(ProgrammeSlot)
    .min(1)
    .max(MAX_POSTS_IN_A_PLAN)
    .refine((slots) => slots.every((s, index) => s.slot === index + 1), "posts must be numbered 1 to n in order, each number once"),
  generation: GenerationMeta,
});
export type ProgrammePlan = z.infer<typeof ProgrammePlan>;

export const DraftClaim = z.strictObject({
  text: ShortText,
  /** True when the claim states a fact a reader could check: a number, a result, a comparison. */
  needsEvidence: z.boolean(),
  /** Id of a brief reference that supports the claim, or null when none does. */
  evidenceRef: Id.nullable(),
});
export type DraftClaim = z.infer<typeof DraftClaim>;

export const DraftStatus = z.enum(["candidate", "selected", "approved", "rejected", "superseded"]);
export type DraftStatus = z.infer<typeof DraftStatus>;

export const PostBody = z.string().trim().min(1).max(8000).regex(NO_CONTROL_CHARACTERS, "must not contain control characters");
export const Hashtags = z.array(z.string().regex(/^#[A-Za-z0-9_]{1,60}$/)).max(8);

export const PostDraft = z.strictObject({
  id: Id,
  slot: Position,
  narrativeId: Id,
  variant: ShortText,
  /** The approach this variant takes, in the model's words. */
  approach: ShortText,
  hook: ShortText,
  body: PostBody,
  callToAction: ShortText,
  hashtags: Hashtags,
  claims: z.array(DraftClaim).max(12),
  status: DraftStatus,
  /** Set when this draft is a revision of another. */
  revisionOf: Id.nullable(),
  revisionPass: z.number().int().min(0),
  generation: GenerationMeta,
});
export type PostDraft = z.infer<typeof PostDraft>;
