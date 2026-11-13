import type { CreatorCandidate, CreatorRanking, CreatorResult, Dimension, DimensionAssessment, ScoringPolicy } from "./contracts.ts";
import { CreatorRanking as CreatorRankingSchema, CreatorSet, Dimension as DimensionSchema, DimensionAssessment as AssessmentSchema, ScoringPolicy as PolicySchema } from "./contracts.ts";

export class CreatorRankingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreatorRankingError";
  }
}

const DAY = 86_400_000;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export const CAVEATS = [
  "Scores are judgements about public evidence. They are not measurements, and they do not predict campaign results.",
  "Observed engagement on a creator's posts does not establish who their audience is.",
  "Mandatory constraints are checked by code and override every score: an ineligible creator is never ranked above an eligible one.",
  "This ranking is decision support for a person. It commissions, contacts and pays no one.",
];

function ineligibility(candidate: CreatorCandidate, policy: ScoringPolicy, fresh: number): CreatorResult["ineligibility"] {
  const reasons: CreatorResult["ineligibility"] = [];
  if (candidate.availability === "unavailable") reasons.push({ rule: "unavailable", detail: "The creator is not available." });
  for (const concern of candidate.blockingConcerns) {
    reasons.push({ rule: "blocking-concern", detail: `${concern.kind}: ${concern.detail} (evidence ${concern.evidenceId})` });
  }
  if (!candidate.languages.includes(policy.requiredLanguage)) {
    reasons.push({ rule: "language", detail: `Does not publish in "${policy.requiredLanguage}".` });
  }
  if (policy.sponsorshipPlanned && candidate.sponsorshipConsent === "refused") {
    reasons.push({ rule: "sponsorship-refused", detail: "The programme plans sponsorship and the creator has refused it." });
  }
  if (fresh < policy.minEvidenceItems) {
    reasons.push({ rule: "insufficient-evidence", detail: `${fresh} recent evidence item(s); at least ${policy.minEvidenceItems} are required.` });
  }
  if (policy.maxFeePerPost !== null && candidate.indicativeFeePerPost !== null && candidate.indicativeFeePerPost > policy.maxFeePerPost) {
    reasons.push({ rule: "over-budget", detail: `Indicative fee ${candidate.indicativeFeePerPost} ${candidate.currency} exceeds the limit of ${policy.maxFeePerPost}.` });
  }
  return reasons;
}

/**
 * Rank creator candidates with a transparent weighted score.
 *
 * The judgements on each dimension are supplied; this function never invents one. It checks
 * that every judgement cites evidence the candidate actually has, applies the weights,
 * derives a confidence figure from how fresh and how varied the evidence is, and applies the
 * mandatory constraints, which no score can override.
 */
export function rankCreators(input: { set: unknown; assessments: unknown; policy: unknown; now: Date }): CreatorRanking {
  const set = CreatorSet.parse(input.set);
  const assessments = AssessmentSchema.array().parse(input.assessments);
  const policy = PolicySchema.parse(input.policy);
  const dimensions = DimensionSchema.options;
  for (const dimension of dimensions) {
    if (!(dimension in policy.weights)) throw new CreatorRankingError(`The policy gives no weight for "${dimension}".`);
  }
  const totalWeight = dimensions.reduce((sum, d) => sum + (policy.weights[d] as number), 0);
  const ids = new Set<string>();
  for (const candidate of set.candidates) {
    if (ids.has(candidate.id)) throw new CreatorRankingError(`Creator id "${candidate.id}" appears twice.`);
    ids.add(candidate.id);
  }

  const results: CreatorResult[] = set.candidates.map((candidate) => {
    const evidence = new Map(candidate.evidence.map((e) => [e.id, e]));
    const isFresh = (observedAt: string) => input.now.getTime() - Date.parse(observedAt) <= policy.maxEvidenceAgeDays * DAY;
    const fresh = candidate.evidence.filter((e) => isFresh(e.observedAt));

    const scored = dimensions.map((dimension: Dimension) => {
      const found = assessments.filter((a) => a.creatorId === candidate.id && a.dimension === dimension);
      if (found.length !== 1) {
        throw new CreatorRankingError(`Creator ${candidate.id} needs exactly one assessment of "${dimension}"; ${found.length} were given.`);
      }
      const assessment = found[0] as DimensionAssessment;
      for (const evidenceId of assessment.evidenceIds) {
        if (!evidence.has(evidenceId)) {
          throw new CreatorRankingError(`The assessment of ${candidate.id} on "${dimension}" cites evidence "${evidenceId}", which the candidate does not have.`);
        }
      }
      return {
        dimension,
        score: assessment.score,
        weight: round3((policy.weights[dimension] as number) / totalWeight),
        rationale: assessment.rationale,
        evidenceIds: assessment.evidenceIds,
        // A judgement resting only on stale evidence is not trusted.
        backedByFresh: assessment.evidenceIds.some((id) => isFresh((evidence.get(id) as { observedAt: string }).observedAt)),
      };
    });

    const weightedTotal = scored.reduce((sum, s) => sum + s.score * ((policy.weights[s.dimension] as number) / totalWeight), 0);
    const coverage = scored.filter((s) => s.backedByFresh).length / scored.length;
    const sources = new Set(fresh.map((e) => e.provenance.source)).size;
    const volume = Math.min(1, fresh.length / (policy.minEvidenceItems * 2));
    // One source cannot corroborate itself: confidence is capped until a second source agrees.
    const evidenceConfidence = coverage * volume * (sources >= 2 ? 1 : 0.6);

    const reasons = ineligibility(candidate, policy, fresh.length);
    return {
      creatorId: candidate.id,
      displayName: candidate.displayName,
      eligible: reasons.length === 0,
      ineligibility: reasons,
      dimensions: scored.map(({ backedByFresh: _unused, ...rest }) => rest),
      weightedTotal: round3(weightedTotal),
      evidenceConfidence: round3(evidenceConfidence),
    };
  });

  results.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.weightedTotal - a.weightedTotal || a.creatorId.localeCompare(b.creatorId));
  return CreatorRankingSchema.parse({ synthetic: set.synthetic, rankedAt: input.now.toISOString(), policy, results, caveats: CAVEATS });
}
