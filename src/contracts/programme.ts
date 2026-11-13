import { z } from "zod";
import { BriefInterpretation, CampaignBrief } from "./brief.ts";
import { ProvisionalPublishCommand } from "./command.ts";
import { Id, IsoDateTime, SCHEMA_VERSION, ShortText, TokenUsage } from "./common.ts";
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
  modelCalls: z.number().int().nonnegative(),
  usage: TokenUsage,
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
  provenance: z.strictObject({
    generator: z.literal("kraken-intelligence-companion"),
    generatorVersion: z.string(),
    models: z.array(z.string()),
    evaluators: z.array(z.string()),
    budget: BudgetUsage,
    notes: z.array(z.string()),
  }),
});
export type ProgrammePackage = z.infer<typeof ProgrammePackage>;
