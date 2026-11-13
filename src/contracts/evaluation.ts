import { z } from "zod";
import { Id, IsoDateTime, ShortText } from "./common.ts";

export const CriterionKey = z.enum([
  "relevance",
  "brand_fit",
  "clarity",
  "grounding",
  "hook",
  "call_to_action",
]);
export type CriterionKey = z.infer<typeof CriterionKey>;

export const Criterion = z.strictObject({
  key: CriterionKey,
  label: ShortText,
  /** Relative weight. Weights are normalised to sum to 1 before use. */
  weight: z.number().positive(),
  /** Ordered level descriptions, worst first. The score indexes into these. */
  levels: z.array(ShortText).min(2).max(7),
});
export type Criterion = z.infer<typeof Criterion>;

/** Something observed in the text by deterministic code, shown to the editor as evidence. */
export const Signal = z.strictObject({
  criterion: CriterionKey,
  observation: ShortText,
  /** Short excerpts or matched terms that the observation rests on. */
  evidence: z.array(z.string().max(200)).max(12),
});
export type Signal = z.infer<typeof Signal>;

export const CriterionScore = z.strictObject({
  criterion: CriterionKey,
  /** 0..1, where 1 is the top level description. A judgement, not a measurement. */
  score: z.number().min(0).max(1),
  /** The evaluator's own confidence in this score, 0..1, or null when it reports none. */
  confidence: z.number().min(0).max(1).nullable(),
  level: ShortText,
});
export type CriterionScore = z.infer<typeof CriterionScore>;

export const EligibilityFailure = z.strictObject({
  rule: z.enum([
    "over-length",
    "must-avoid-term",
    "unsupported-claim",
    "unknown-evidence-reference",
    "unlisted-statistic",
    "empty-body",
  ]),
  detail: ShortText,
});
export type EligibilityFailure = z.infer<typeof EligibilityFailure>;

export const CandidateEvaluation = z.strictObject({
  draftId: Id,
  scores: z.array(CriterionScore).min(1),
  /** Weighted mean of the criterion scores. Not comparable across evaluators. */
  weightedTotal: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  signals: z.array(Signal),
  /**
   * Mandatory constraints, checked by code. An ineligible draft cannot be approved,
   * whatever its total.
   */
  eligibility: z.strictObject({
    eligible: z.boolean(),
    failures: z.array(EligibilityFailure),
  }),
});
export type CandidateEvaluation = z.infer<typeof CandidateEvaluation>;

export const EvaluatorInfo = z.strictObject({
  /**
   * mock-jev: deterministic stand-in that answers JEV-shaped questions from text heuristics.
   * jev: the real decision model. Not available in this build.
   */
  kind: z.enum(["mock-jev", "jev"]),
  version: ShortText,
  /** True only when a real external evaluator was called. Always false in this build. */
  live: z.boolean(),
  description: ShortText,
});
export type EvaluatorInfo = z.infer<typeof EvaluatorInfo>;

export const Evaluation = z.strictObject({
  id: Id,
  slot: z.number().int().min(1),
  evaluator: EvaluatorInfo,
  criteria: z.array(Criterion).min(1),
  candidates: z.array(CandidateEvaluation).min(1),
  /** Eligible drafts first, by weighted total; ineligible drafts last. */
  ranking: z.array(Id).min(1),
  /** The evaluator's single preferred draft, or null when it judged that none fits. */
  preferred: Id.nullable(),
  limitations: z.array(ShortText).min(1),
  evaluatedAt: IsoDateTime,
});
export type Evaluation = z.infer<typeof Evaluation>;
