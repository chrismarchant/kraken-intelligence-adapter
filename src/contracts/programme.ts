import { z } from "zod";
import { BriefInterpretation, CampaignBrief } from "./brief.ts";
import { ProvisionalPublishCommand } from "./command.ts";
import { HumanActor, Id, IsoDateTime, SCHEMA_VERSION, ShortText, TokenUsage } from "./common.ts";
import { Narrative, PostDraft, ProgrammePlan, ProgrammeSlot } from "./content.ts";
import { DecisionRequest, EditorialDecision } from "./decision.ts";
import { Evaluation } from "./evaluation.ts";

export const PROGRAMME_PACKAGE_SCHEMA = "kic.programme-package/v0";
export const CAMPAIGN_RECORD_SCHEMA = "kic.campaign-record/v0";

export const AuditEvent = z.strictObject({
  at: IsoDateTime,
  event: ShortText,
  detail: z.string().max(1000),
});
export type AuditEvent = z.infer<typeof AuditEvent>;

export const BudgetUsage = z.strictObject({
  /** Model steps started. Charged when a step is reserved, whether or not it then succeeds. */
  modelCalls: z.number().int().nonnegative(),
  /** HTTP requests actually sent to the model provider, including retries. */
  providerRequests: z.number().int().nonnegative(),
  usage: TokenUsage,
  /**
   * Steps that have been started and not yet settled, with the most each may still spend.
   * They count against the token limit until they settle. One that never settles (the
   * process died) is charged at its full allowance when it expires.
   */
  reservations: z.array(
    z.strictObject({ id: Id, step: ShortText, calls: z.number().int().nonnegative(), completionTokens: z.number().int().nonnegative(), reservedAt: IsoDateTime }),
  ),
});
export type BudgetUsage = z.infer<typeof BudgetUsage>;

/** The durable working state of one campaign. One file per campaign. */
export const CampaignRecord = z.strictObject({
  schema: z.literal(CAMPAIGN_RECORD_SCHEMA),
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Id,
  revision: z.number().int().nonnegative(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  brief: CampaignBrief,
  interpretation: BriefInterpretation.nullable(),
  narratives: z.array(Narrative),
  plan: ProgrammePlan.nullable(),
  drafts: z.array(PostDraft),
  evaluations: z.array(Evaluation),
  decisionRequests: z.array(DecisionRequest),
  decisions: z.array(EditorialDecision),
  budget: BudgetUsage,
  audit: z.array(AuditEvent),
});
export type CampaignRecord = z.infer<typeof CampaignRecord>;

export const PackagedPost = z.strictObject({
  slot: ProgrammeSlot,
  state: z.enum(["approved", "pending"]),
  /** Present only when a person approved a draft for this slot. */
  approvedDraft: PostDraft.nullable(),
  /** Every other draft considered for the slot, with its final status. */
  alternatives: z.array(PostDraft),
  evaluation: Evaluation.nullable(),
});
export type PackagedPost = z.infer<typeof PackagedPost>;

export const ProgrammePackage = z.strictObject({
  schema: z.literal(PROGRAMME_PACKAGE_SCHEMA),
  schemaVersion: z.literal(SCHEMA_VERSION),
  programmeId: Id,
  campaignId: Id,
  assembledAt: IsoDateTime,
  synthetic: z.boolean(),
  /** complete: every slot has an approved draft. partial: some do. */
  approvalState: z.enum(["complete", "partial"]),
  brief: CampaignBrief,
  interpretation: BriefInterpretation.nullable(),
  narrative: Narrative,
  rejectedNarratives: z.array(Narrative),
  plan: ProgrammePlan,
  posts: z.array(PackagedPost),
  decisions: z.array(EditorialDecision),
  /** One per approved post. Always non-authoritative and non-executable. */
  provisionalCommands: z.array(ProvisionalPublishCommand),
  /**
   * The editor's sign-off on this exact package, made with the operator tool after it has
   * checked that the campaign's decision log is complete. Null for a preview assembled by
   * the agent-facing server: a preview is not a released programme.
   */
  release: z
    .strictObject({
      releasedBy: HumanActor,
      releasedAt: IsoDateTime,
      rationale: ShortText,
      /** SHA-256 of the canonical JSON of this package with `release` set to null. */
      packageSha256: z.string().regex(/^[0-9a-f]{64}$/),
      /** Number of decisions in the log the release was made on. */
      decisionLogSequence: z.number().int().nonnegative(),
      signature: z.strictObject({ alg: z.literal("ed25519"), keyId: z.string().regex(/^[0-9a-f]{16}$/), value: z.string().min(1) }).nullable(),
    })
    .nullable(),
  provenance: z.strictObject({
    generator: z.literal("kraken-intelligence-companion"),
    // Written by code and shown to the editor at review: bounded, and free of control characters, like everything else shown.
    generatorVersion: ShortText,
    models: z.array(ShortText).max(50),
    evaluators: z.array(ShortText).max(50),
    budget: BudgetUsage,
    notes: z.array(ShortText).max(50),
  }),
});
export type ProgrammePackage = z.infer<typeof ProgrammePackage>;
