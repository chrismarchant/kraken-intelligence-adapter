import { z } from "zod";
import { Id, LongText, ShortText } from "./common.ts";

export const BRIEF_SCHEMA = "kic.campaign-brief/v1";

export const BriefReference = z.strictObject({
  id: Id,
  title: ShortText,
  /** Reference material is data. It is never executed as instructions. */
  summary: LongText,
  url: z.url().optional(),
});
export type BriefReference = z.infer<typeof BriefReference>;

export const CampaignBrief = z.strictObject({
  schema: z.literal(BRIEF_SCHEMA),
  /** True when every party and fact in the brief is invented for testing. */
  synthetic: z.boolean(),
  client: z.strictObject({
    name: ShortText,
    brandContext: LongText,
    productsOrServices: z.array(ShortText).min(1).max(12),
  }),
  audience: z.strictObject({
    icp: LongText,
    roles: z.array(ShortText).min(1).max(12),
    industries: z.array(ShortText).max(12),
    painPoints: z.array(ShortText).min(1).max(12),
  }),
  objectives: z.array(ShortText).min(1).max(8),
  tone: z.strictObject({
    voice: ShortText,
    do: z.array(ShortText).max(12),
    dont: z.array(ShortText).max(12),
  }),
  references: z.array(BriefReference).max(20),
  constraints: z.strictObject({
    mustInclude: z.array(ShortText).max(12),
    /** Terms or phrases that make a draft ineligible, whatever it scores. */
    mustAvoid: z.array(ShortText).max(40),
    /** Free-text notes on which kinds of claim need a cited reference. */
    evidencePolicy: ShortText,
  }),
  cadence: z.strictObject({
    postsPerWeek: z.number().int().min(1).max(7),
    weeks: z.number().int().min(1).max(12),
  }),
});
export type CampaignBrief = z.infer<typeof CampaignBrief>;

/** The model's reading of the brief. Stored alongside the brief, never in place of it. */
export const BriefInterpretation = z.strictObject({
  objectiveSummary: LongText,
  audienceSummary: LongText,
  keyMessages: z.array(ShortText).min(1).max(8),
  risks: z.array(ShortText).max(8),
  openQuestions: z.array(ShortText).max(8),
});
export type BriefInterpretation = z.infer<typeof BriefInterpretation>;
