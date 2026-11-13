import { z } from "zod";
import { Id, IsoDateTime, ShortText } from "../contracts/common.ts";

/**
 * Creator intelligence contracts. Nothing here contacts a creator, a marketplace or a data
 * provider: these are the shapes evidence must arrive in, and the shape of a ranking.
 */

export const CREATOR_SET_SCHEMA = "kic.creator-candidates/v0";

export const EvidenceKind = z.enum([
  "recent-post",
  "engagement-observation",
  "posting-cadence",
  "profile-fact",
  "commercial-terms",
  "brand-safety",
]);

export const EvidenceItem = z.strictObject({
  id: Id,
  kind: EvidenceKind,
  summary: ShortText,
  observedAt: IsoDateTime,
  /** Where the observation came from and how, so its weight can be judged. */
  provenance: z.strictObject({
    source: ShortText,
    method: ShortText,
    /** Terms the source places on use of the observation, or "none stated". */
    licenceNote: ShortText,
  }),
  /** True when the observation was invented for testing. */
  synthetic: z.boolean(),
});
export type EvidenceItem = z.infer<typeof EvidenceItem>;

export const CreatorCandidate = z.strictObject({
  id: Id,
  displayName: ShortText,
  headline: ShortText,
  topics: z.array(ShortText).min(1).max(12),
  languages: z.array(z.string().regex(/^[a-z]{2}$/)).min(1),
  availability: z.enum(["available", "unavailable", "unknown"]),
  /** Indicative fee for one commissioned post, or null when not known. */
  indicativeFeePerPost: z.number().nonnegative().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  /** Whether the creator has agreed that their post may be sponsored as an advertisement. */
  sponsorshipConsent: z.enum(["granted", "refused", "unknown"]),
  /** Concerns that rule a creator out. Each must cite the evidence it rests on. */
  blockingConcerns: z.array(z.strictObject({ kind: z.enum(["brand-safety", "competitor-conflict", "legal"]), detail: ShortText, evidenceId: Id })),
  evidence: z.array(EvidenceItem),
  synthetic: z.boolean(),
});
export type CreatorCandidate = z.infer<typeof CreatorCandidate>;

export const CreatorSet = z.strictObject({
  schema: z.literal(CREATOR_SET_SCHEMA),
  synthetic: z.boolean(),
  candidates: z.array(CreatorCandidate).min(1),
});
export type CreatorSet = z.infer<typeof CreatorSet>;

export const Dimension = z.enum([
  "icp_relevance",
  "engagement_quality",
  "professional_credibility",
  "commercial_efficiency",
  "operational_suitability",
]);
export type Dimension = z.infer<typeof Dimension>;

/** One judgement about one creator on one dimension, with the evidence it rests on. */
export const DimensionAssessment = z.strictObject({
  creatorId: Id,
  dimension: Dimension,
  /** 0..1. A judgement by an assessor, not a measurement. */
  score: z.number().min(0).max(1),
  rationale: ShortText,
  evidenceIds: z.array(Id).min(1),
  /** Who or what made the judgement. */
  assessor: ShortText,
});
export type DimensionAssessment = z.infer<typeof DimensionAssessment>;

export const ScoringPolicy = z.strictObject({
  /** Relative weights. Normalised to sum to 1. Every dimension must be given. */
  weights: z.record(Dimension, z.number().positive()),
  requiredLanguage: z.string().regex(/^[a-z]{2}$/),
  /** True when the programme plans to sponsor creator posts, which needs the creator's consent. */
  sponsorshipPlanned: z.boolean(),
  minEvidenceItems: z.number().int().min(1),
  /** Evidence older than this counts for nothing towards confidence. */
  maxEvidenceAgeDays: z.number().int().min(1),
  maxFeePerPost: z.number().positive().nullable(),
});
export type ScoringPolicy = z.infer<typeof ScoringPolicy>;

export const IneligibilityReason = z.strictObject({
  rule: z.enum([
    "unavailable",
    "blocking-concern",
    "language",
    "sponsorship-refused",
    "insufficient-evidence",
    "over-budget",
  ]),
  detail: ShortText,
});

export const CreatorResult = z.strictObject({
  creatorId: Id,
  displayName: ShortText,
  eligible: z.boolean(),
  ineligibility: z.array(IneligibilityReason),
  dimensions: z.array(
    z.strictObject({ dimension: Dimension, score: z.number().min(0).max(1), weight: z.number().min(0).max(1), rationale: ShortText, evidenceIds: z.array(Id) }),
  ),
  weightedTotal: z.number().min(0).max(1),
  /** How far the evidence can be relied on, 0..1: fresh, enough, and from more than one source. */
  evidenceConfidence: z.number().min(0).max(1),
});
export type CreatorResult = z.infer<typeof CreatorResult>;

export const CreatorRanking = z.strictObject({
  synthetic: z.boolean(),
  rankedAt: IsoDateTime,
  policy: ScoringPolicy,
  /** Eligible creators first, by weighted total; ineligible creators after them. */
  results: z.array(CreatorResult),
  caveats: z.array(ShortText).min(1),
});
export type CreatorRanking = z.infer<typeof CreatorRanking>;
