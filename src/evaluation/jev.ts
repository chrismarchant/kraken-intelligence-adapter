import { z } from "zod";
import type { CampaignBrief, Criterion, PostDraft, ProgrammeSlot } from "../contracts/index.ts";
import { CampaignBrief as CampaignBriefSchema, CriterionKey } from "../contracts/index.ts";
import type { Limits } from "../limits.ts";
import { assertNoSecrets, redactDeep } from "./redaction.ts";
import { analyseDraft } from "./signals.ts";

/**
 * The request and response shapes of a System One decision model, as documented by the
 * jev-router project: one `state`, many typed questions, structured answers. JEV decides;
 * it does not write. KIC uses it only to score and choose between drafts a model wrote.
 */
export type JevQuestion =
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } };

export interface JevRequest {
  model: string;
  state: unknown;
  questions: Record<string, JevQuestion>;
}

export type JevAnswer =
  | { score: number; confidence: number }
  | { choice: string; probabilities: Record<string, number>; confidence: number }
  | { noul: number };

export interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
}

export interface JevTransport {
  /** True only for a transport that contacts the real service. */
  readonly live: boolean;
  readonly kind: "mock-jev" | "jev";
  readonly version: string;
  readonly description: string;
  systemone(request: JevRequest): Promise<JevResponse>;
}

export class JevDisabledError extends Error {
  constructor() {
    super(
      "Live JEV execution is disabled. Its security, redaction and authority gates have not been passed " +
        "and this build contains no live transport. Use the deterministic mock.",
    );
    this.name = "JevDisabledError";
  }
}

/**
 * The only way to obtain an evaluator transport. "jev" always throws: there is no code
 * path in this build that contacts the service, and no configuration value creates one.
 */
export function createJevTransport(mode: string | undefined, limits: Pick<Limits, "linkedinMaxChars">): JevTransport {
  if (mode === undefined || mode === "" || mode === "mock-jev") return new MockJevTransport(limits);
  if (mode === "jev") throw new JevDisabledError();
  throw new Error(`Unknown evaluator "${mode}". The only available evaluator is "mock-jev".`);
}

export const QUESTION_SEPARATOR = "__";
export const PREFERRED_QUESTION = "preferred";
export const ANY_FIT_QUESTION = "any_fit";

const StateCandidate = z.object({
  hook: z.string(),
  body: z.string(),
  callToAction: z.string(),
  hashtags: z.array(z.string()),
  claims: z.array(z.object({ text: z.string(), needsEvidence: z.boolean(), evidenceRef: z.string().nullable() })),
});

const EvaluatorState = z.object({
  brief: z.object({
    audience: CampaignBriefSchema.shape.audience,
    tone: CampaignBriefSchema.shape.tone,
    constraints: CampaignBriefSchema.shape.constraints,
    references: z.array(z.object({ id: z.string(), title: z.string(), summary: z.string() })),
  }),
  slot: z.object({ theme: z.string(), intent: z.string(), callToAction: z.string() }),
  candidates: z.record(z.string(), StateCandidate),
});
type EvaluatorState = z.infer<typeof EvaluatorState>;

const GENERIC_NAME_WORDS = new Set(
  "the and of for analytics company group limited ltd inc corp corporation plc llc gmbh solutions services systems global international consulting partners technologies technology software labs digital data media logistics".split(" "),
);

/** Replace the client's name, and its distinctive words, wherever they occur in the state. */
function withoutClientName<T>(clientName: string, value: T): T {
  const full = clientName.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  // The full name, and each distinctive word of it. Generic company words are left alone so
  // that ordinary vocabulary in a draft is not blanked out.
  const names = [full, ...full.split(/\s+/).filter((w) => w.length >= 3 && /^[A-Z]/.test(w) && !GENERIC_NAME_WORDS.has(w.toLowerCase()))].filter(Boolean);
  const pattern = new RegExp(names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
  const scrub = (v: unknown): unknown => {
    if (typeof v === "string") return names.length ? v.replace(pattern, "[client]") : v;
    if (Array.isArray(v)) return v.map(scrub);
    if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, scrub(x)]));
    return v;
  };
  return scrub(value) as T;
}

/** Build one fan-out request for a slot: every criterion for every candidate, one state. */
export function buildJevRequest(
  brief: CampaignBrief,
  slot: ProgrammeSlot,
  drafts: readonly PostDraft[],
  criteria: readonly Criterion[],
  model = "jev-latest",
): JevRequest {
  const state: EvaluatorState = withoutClientName(brief.client.name, redactDeep({
    brief: {
      // Client identity and brand context are left out, and the client's name is removed from
      // every string that is sent: the evaluator does not need to know whose campaign this is.
      audience: brief.audience,
      tone: brief.tone,
      constraints: brief.constraints,
      references: brief.references.map((r) => ({ id: r.id, title: r.title, summary: r.summary })),
    },
    slot: { theme: slot.theme, intent: slot.intent, callToAction: slot.callToAction },
    candidates: Object.fromEntries(
      drafts.map((d) => [
        d.id,
        { hook: d.hook, body: d.body, callToAction: d.callToAction, hashtags: d.hashtags, claims: d.claims },
      ]),
    ),
  }));
  assertNoSecrets(state);

  const questions: Record<string, JevQuestion> = {};
  for (const draft of drafts) {
    for (const criterion of criteria) {
      questions[`${draft.id}${QUESTION_SEPARATOR}${criterion.key}`] = {
        type: "score",
        instructions:
          `Rate \`candidates.${draft.id}.body\` on ${criterion.label.toLowerCase()}, ` +
          "for the audience in `brief.audience` and the slot in `slot`.",
        criteria: [...criterion.levels],
      };
    }
  }
  questions[PREFERRED_QUESTION] = {
    type: "choice",
    instructions: "Which candidate in `candidates` best serves `slot` for the audience in `brief.audience`?",
    criteria: Object.fromEntries(drafts.map((d) => [d.id, `The post in candidates.${d.id}`])),
  };
  questions[ANY_FIT_QUESTION] = {
    type: "noul",
    instructions: "Is at least one candidate in `candidates` fit to put in front of an editor for `slot`?",
    criteria: { true: "At least one candidate is on brief and usable", false: "None is usable" },
  };
  return { model, state, questions };
}

/**
 * Deterministic stand-in for JEV. It answers the same typed questions from the same
 * request, using only the text observations in `signals.ts`, so a given request always
 * yields the same answers. It is not a model and its scores are not JEV's.
 */
export class MockJevTransport implements JevTransport {
  readonly live = false;
  readonly kind = "mock-jev" as const;
  readonly version = "mock-jev/0.1.0";
  readonly description =
    "Deterministic stand-in that answers JEV-shaped questions from text heuristics. Not a model; not JEV.";
  private readonly limits: Pick<Limits, "linkedinMaxChars">;

  constructor(limits: Pick<Limits, "linkedinMaxChars">) {
    this.limits = limits;
  }

  async systemone(request: JevRequest): Promise<JevResponse> {
    const state = EvaluatorState.parse(request.state);
    const briefView = {
      audience: state.brief.audience,
      tone: state.brief.tone,
      constraints: state.brief.constraints,
      references: state.brief.references,
    } as unknown as CampaignBrief;

    const features = new Map<string, Record<CriterionKey, number>>();
    const eligible = new Map<string, boolean>();
    for (const [id, candidate] of Object.entries(state.candidates)) {
      const analysis = analyseDraft(briefView, state.slot, candidate, this.limits);
      features.set(id, analysis.features);
      eligible.set(id, analysis.failures.length === 0);
    }

    const answers: Record<string, JevAnswer> = {};
    for (const [name, question] of Object.entries(request.questions)) {
      if (question.type !== "score") continue;
      const [draftId, key] = name.split(QUESTION_SEPARATOR) as [string, string];
      const parsedKey = CriterionKey.safeParse(key);
      const feature = parsedKey.success ? features.get(draftId)?.[parsedKey.data] : undefined;
      if (feature === undefined) throw new Error(`Mock evaluator cannot answer question "${name}".`);
      const top = question.criteria.length - 1;
      answers[name] = {
        // Like the real primitive, the score may fall between two level descriptions.
        score: Math.round(feature * top * 100) / 100,
        // Further from the middle of the scale reads as more certain. A fixed rule, not a judgement.
        confidence: Math.round((0.55 + 0.4 * Math.abs(2 * feature - 1)) * 100) / 100,
      };
    }

    const choice = request.questions[PREFERRED_QUESTION];
    if (choice?.type === "choice") {
      const ids = Object.keys(choice.criteria);
      const totals = ids.map((id) => {
        const f = features.get(id);
        const mean = f ? Object.values(f).reduce((a, b) => a + b, 0) / Object.values(f).length : 0;
        return { id, total: eligible.get(id) ? mean : mean * 0.25 };
      });
      const sum = totals.reduce((a, t) => a + t.total, 0) || 1;
      const best = [...totals].sort((a, b) => b.total - a.total || a.id.localeCompare(b.id))[0];
      const probabilities = Object.fromEntries(totals.map((t) => [t.id, Math.round((t.total / sum) * 1000) / 1000]));
      answers[PREFERRED_QUESTION] = {
        choice: best?.id ?? "",
        probabilities,
        confidence: Math.round(Math.min(0.95, 0.4 + (probabilities[best?.id ?? ""] ?? 0)) * 100) / 100,
      };
    }
    if (request.questions[ANY_FIT_QUESTION]?.type === "noul") {
      answers[ANY_FIT_QUESTION] = { noul: [...eligible.values()].some(Boolean) ? 0.9 : 0.1 };
    }
    return { model: this.version, answers };
  }
}
