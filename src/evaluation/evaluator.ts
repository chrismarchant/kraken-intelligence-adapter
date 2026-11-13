import type {
  CampaignBrief,
  CandidateEvaluation,
  Criterion,
  CriterionScore,
  Evaluation,
  PostDraft,
  ProgrammeSlot,
} from "../contracts/index.ts";
import type { Limits } from "../limits.ts";
import type { Clock, IdSource } from "../util/runtime.ts";
import { DEFAULT_CRITERIA, normalisedWeights } from "./criteria.ts";
import type { JevTransport } from "./jev.ts";
import { ANY_FIT_QUESTION, PREFERRED_QUESTION, QUESTION_SEPARATOR, buildJevRequest } from "./jev.ts";
import { analyseDraft } from "./signals.ts";

export interface EvaluateSlotInput {
  brief: CampaignBrief;
  slot: ProgrammeSlot;
  drafts: readonly PostDraft[];
  criteria?: readonly Criterion[];
}

export interface EvaluatorDeps {
  transport: JevTransport;
  limits: Limits;
  clock: Clock;
  ids: IdSource;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Compare the candidate drafts for one slot.
 *
 * Two things are kept apart on purpose. Eligibility and the observations shown as evidence
 * come from deterministic code and cannot be overridden. Scores come from the evaluator and
 * are judgements, to inform an editor, never to replace one.
 */
export async function evaluateSlot(input: EvaluateSlotInput, deps: EvaluatorDeps): Promise<Evaluation> {
  const criteria = input.criteria ?? DEFAULT_CRITERIA;
  if (input.drafts.length === 0) throw new Error(`No drafts to evaluate for slot ${input.slot.slot}.`);

  const request = buildJevRequest(input.brief, input.slot, input.drafts, criteria);
  const response = await deps.transport.systemone(request);
  const weights = normalisedWeights(criteria);

  const candidates: CandidateEvaluation[] = input.drafts.map((draft) => {
    const analysis = analyseDraft(input.brief, input.slot, draft, deps.limits);
    const scores: CriterionScore[] = criteria.map((criterion) => {
      const answer = response.answers[`${draft.id}${QUESTION_SEPARATOR}${criterion.key}`];
      if (!answer || !("score" in answer)) {
        throw new Error(`Evaluator returned no score for draft ${draft.id}, criterion ${criterion.key}.`);
      }
      const top = criterion.levels.length - 1;
      const bounded = Math.max(0, Math.min(top, answer.score));
      return {
        criterion: criterion.key,
        score: round3(bounded / top),
        confidence: answer.confidence,
        level: criterion.levels[Math.round(bounded)] as string,
      };
    });
    const weightedTotal = scores.reduce((sum, s) => sum + s.score * (weights.get(s.criterion) ?? 0), 0);
    const confidences = scores.map((s) => s.confidence).filter((c): c is number => c !== null);
    return {
      draftId: draft.id,
      scores,
      weightedTotal: round3(weightedTotal),
      confidence: round3(confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0),
      signals: analysis.signals,
      eligibility: { eligible: analysis.failures.length === 0, failures: analysis.failures },
    };
  });

  // Eligible drafts always rank above ineligible ones, whatever they score.
  const ranking = [...candidates]
    .sort(
      (a, b) =>
        Number(b.eligibility.eligible) - Number(a.eligibility.eligible) ||
        b.weightedTotal - a.weightedTotal ||
        a.draftId.localeCompare(b.draftId),
    )
    .map((c) => c.draftId);

  const limitations = [
    deps.transport.live
      ? "Scores are judgements by a decision model, not measurements of how an audience will respond."
      : "Scores come from a deterministic stand-in for the JEV decision model. They reflect text features only and are not model judgements.",
    "Mandatory constraints are checked by code and override every score: an ineligible draft cannot be approved.",
    "Confidence is the evaluator's own figure. It says nothing about commercial outcome.",
  ];

  const choice = response.answers[PREFERRED_QUESTION];
  const anyFit = response.answers[ANY_FIT_QUESTION];
  let preferred: string | null = null;
  if (choice && "choice" in choice && anyFit && "noul" in anyFit && anyFit.noul > 0.7) {
    const chosen = candidates.find((c) => c.draftId === choice.choice);
    if (chosen?.eligibility.eligible) preferred = chosen.draftId;
    else limitations.push("The evaluator's preferred draft failed a mandatory constraint, so no preference is recorded.");
  } else {
    limitations.push("The evaluator did not judge any candidate fit, so no preference is recorded.");
  }

  return {
    id: deps.ids.next("eval"),
    slot: input.slot.slot,
    evaluator: {
      kind: deps.transport.kind,
      version: deps.transport.version,
      live: deps.transport.live,
      description: deps.transport.description,
    },
    criteria: criteria.map((c) => ({ ...c, levels: [...c.levels] })),
    candidates,
    ranking,
    preferred,
    limitations,
    evaluatedAt: deps.clock.now().toISOString(),
  };
}
