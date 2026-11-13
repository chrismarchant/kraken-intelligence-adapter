import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type {
  BudgetUsage,
  CampaignRecord,
  DecisionAction,
  DecisionRequest,
  DecisionSubject,
  EditorialDecision,
  Evaluation,
  GenerationMeta,
  HumanActor,
  Narrative,
  PostDraft,
  ProgrammeSlot,
} from "../contracts/index.ts";
import {
  BriefInterpretation,
  CAMPAIGN_RECORD_SCHEMA,
  CampaignBrief,
  HumanActor as HumanActorSchema,
  PostDraft as PostDraftSchema,
  ProgrammePlan,
  SCHEMA_VERSION,
  ShortText,
} from "../contracts/index.ts";
import { evaluateSlot } from "../evaluation/evaluator.ts";
import type { JevTransport } from "../evaluation/jev.ts";
import { analyseDraft } from "../evaluation/signals.ts";
import type { CallCost, GenerateRequest, GenerateResult, ModelGateway } from "../gateway/gateway.ts";
import { MAX_TOKEN_FACTOR, costOf } from "../gateway/gateway.ts";
import type { Limits } from "../limits.ts";
import { DEFAULT_LIMITS, LimitExceededError } from "../limits.ts";
import {
  DraftOutput,
  type DraftVariantOutput,
  InterpretationOutput,
  NarrativeOutput,
  PROMPT_VERSION,
  PlanOutput,
  RevisionOutput,
  draftPrompt,
  interpretPrompt,
  narrativePrompt,
  planPrompt,
  revisionPrompt,
  systemPrompt,
} from "../skills/prompts.ts";
import type { CampaignStore } from "../store/store.ts";
import type { Clock, CodeSource, IdSource } from "../util/runtime.ts";
import { canonicalJson, canonicalText, mapLimitSettled, randomCodes, randomIds, settledCanonicalText, sha256, systemClock, truncate } from "../util/runtime.ts";
import type { OperatorChannel } from "./operator.ts";
import type { SpendLedger } from "./spend.ts";
import { MemorySpendLedger } from "./spend.ts";
import type { DecisionSigner, DecisionVerifier, LogHead, OperatorLedger, UnsignedDecision } from "./signing.ts";
import { GENESIS_SHA256, decisionDigest, decisionPayload, logContainsHead, verifyDecisionLog } from "./signing.ts";

export const SKILL_VERSION = "0.1.0";
/** Token allowance of one drafting call (one post, all its variants). */
const DRAFT_MAX_TOKENS = 12000;

/** A request that the current state of the campaign does not allow. */
export class WorkflowError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "WorkflowError";
    this.code = code;
  }
}

export interface ServiceDeps {
  store: CampaignStore;
  gateway: ModelGateway;
  evaluator: JevTransport;
  operator: OperatorChannel;
  clock?: Clock;
  ids?: IdSource;
  codes?: CodeSource;
  limits?: Limits;
  /**
   * The instance's own account of model spending, kept outside the campaign store. Without
   * one, an account that lives only as long as this service is used.
   */
  spend?: SpendLedger;
  /**
   * The operator's signing key. Present only in the operator's own process. A service
   * without it cannot record a decision when a verifier is configured.
   */
  signer?: DecisionSigner | null;
  /**
   * The operator's public key. When present, a decision counts only if it carries a valid
   * signature, however the campaign record came to say otherwise.
   */
  verifier?: DecisionVerifier | null;
  /**
   * The operator's own record of each campaign's decision log, kept outside the store.
   * Present only in the operator's process.
   */
  ledger?: OperatorLedger | null;
}

export interface DecisionRequestInput {
  campaignId: string;
  subject: DecisionSubject;
  action: DecisionAction;
  proposedRationale: string;
  revisionInstruction?: string | null;
  requestedBy: string;
}

export interface DecisionConfirmation {
  campaignId: string;
  requestId: string;
  code: string;
  actor: HumanActor;
  rationale: string;
  /**
   * The digest of the request as the editor read it (`describeRequest().digest`): one value
   * that covers the campaign, the request, the action, the subject, any revision instruction
   * and the exact content. The decision is refused unless the stored request and the current
   * content still produce the same digest.
   */
  expected: { digest: string };
}

/** Everything about a request that the editor's confirmation must pin, as one digest. */
export function requestDigest(input: {
  campaignId: string;
  requestId: string;
  action: DecisionAction;
  subject: DecisionSubject;
  revisionInstruction: string | null;
  contentSha256: string;
}): string {
  return sha256(
    canonicalJson({
      campaignId: input.campaignId,
      requestId: input.requestId,
      action: input.action,
      subject: input.subject,
      revisionInstruction: input.revisionInstruction,
      contentSha256: input.contentSha256,
    }),
  );
}

/** What the editor is shown before deciding. Everything in it is read from the campaign record. */
export interface RequestDescription {
  requestId: string;
  campaignId: string;
  state: DecisionRequest["state"];
  action: DecisionAction;
  subject: DecisionSubject;
  /** Why the requester proposed this. Written by the requester, so not to be relied on. */
  proposedRationale: string;
  revisionInstruction: string | null;
  requestedBy: string;
  expiresAt: string;
  content: {
    title: string;
    text: string;
    hashtags: string[];
    /**
     * Parts of a draft that are recorded and covered by its hash but are not published:
     * the opening line as the model labelled it, and its call to action. Shown so that
     * nothing the hash covers is hidden from the editor.
     */
    unpublished: Array<{ label: string; text: string }>;
    /** Mandatory constraints the content fails. A draft with any cannot be approved. */
    eligibilityFailures: string[];
    evaluation: string | null;
    /**
     * What the decision also rests on and its hash also covers, read from the record: the
     * planned post, the claims the draft makes and what each cites, and the parts of the
     * brief the mandatory constraints were checked against. Shown so that the editor can
     * see a brief or a plan that is not the one they expect.
     */
    basis: Array<{ label: string; lines: string[] }>;
  };
  /**
   * Everything the content hash is computed over, in full: the draft or narrative as stored
   * (apart from its status and how it was generated), the planned post, and the whole brief.
   * Shown to the editor so that nothing the digest covers is signed unseen.
   */
  covers: Record<string, unknown>;
  /** SHA-256 of the content as it is now. */
  contentSha256: string;
  /** What the editor confirms: a digest of this request, its action, subject, instruction and content. */
  digest: string;
  /** False when the content has changed since the request was made; such a request cannot be confirmed. */
  unchanged: boolean;
}

/** What an agent sees of a pending decision. The confirmation code is never part of it. */
export interface DecisionRequestView {
  requestId: string;
  subject: DecisionSubject;
  action: DecisionAction;
  state: DecisionRequest["state"];
  expiresAt: string;
}

/** The brief exactly as stored. Every decision is made against one brief; a changed brief voids it. */
export function briefHash(brief: CampaignBrief): string {
  return sha256(canonicalJson(brief));
}

type HashContext = Pick<CampaignRecord, "brief" | "plan">;

/**
 * What a decision about a draft is a decision about: every stored field of the draft except
 * its status and how it was generated (its text, its claims and what they cite, which post
 * it is for), the planned post it belongs to, and the brief it was checked against. If any
 * of these is changed after the editor decided, the decision no longer applies.
 */
export function draftContentHash(record: HashContext, draft: PostDraft): string {
  const { status: _status, generation: _generation, ...content } = draft;
  const slot = record.plan?.slots.find((s) => s.slot === draft.slot) ?? null;
  return sha256(canonicalJson({ kind: "draft", brief: briefHash(record.brief), slot, content }));
}

/** As for a draft: every stored field of the narrative except its status and provenance, and the brief. */
export function narrativeContentHash(record: HashContext, narrative: Narrative): string {
  const { status: _status, generation: _generation, ...content } = narrative;
  return sha256(canonicalJson({ kind: "narrative", brief: briefHash(record.brief), content }));
}

function codesMatch(expectedHash: string, code: string): boolean {
  const a = Buffer.from(expectedHash, "hex");
  const b = Buffer.from(sha256(code), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Bring model-written hashtags into the contract's form, dropping anything unusable. */
function normaliseHashtags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    const cleaned = `#${tag.replace(/^#+/, "").replace(/[^A-Za-z0-9_]/g, "")}`;
    if (cleaned.length > 1 && cleaned.length <= 61 && !out.includes(cleaned)) out.push(cleaned);
  }
  return out.slice(0, 8);
}

export function clip(text: string, max: number): string {
  // Brought to canonical form first, and to rest there: text that a further pass would still
  // change cannot be cut to something canonical.
  const trimmed = settledCanonicalText(text).trim();
  if (trimmed.length <= max) return trimmed;
  // Cut by whole characters, never through one, and end in three full stops, not the single
  // ellipsis character. The result must still be in canonical form, or the draft it belongs to
  // is refused as carrying compatibility characters: a cut can leave the joining character of
  // an emoji at the end, so the cut moves back, a character at a time, until what is left is
  // canonical and fits. A few steps are enough; the search is bounded all the same.
  const characters = [...trimmed];
  let keep = characters.length;
  for (let length = trimmed.length; length > max - 3 && keep > 0; keep--) length -= (characters[keep - 1] as string).length;
  for (let steps = 0; keep > 0 && steps < 64; keep--, steps++) {
    const cut = `${characters.slice(0, keep).join("").trimEnd()}...`;
    if (cut.length <= max && canonicalText(cut) === cut) return cut;
  }
  return truncate(trimmed.replace(/[^\x20-\x7e\n]/g, ""), max);
}

// Model text is canonicalised before it is clipped or stored, so that no rule downstream
// can be sidestepped with invisible or look-alike compatibility characters.
const short = (text: string) => clip(text, 400);
const long = (text: string) => clip(text, 6000);

type ModelRequest<T> = Omit<GenerateRequest<T>, "system" | "signal">;

/** Thrown inside a store update to abandon it without writing, so the caller can try again. */
class RetryUpdate extends Error {}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : "unknown error";
}
const shortList = (items: readonly string[], max: number) => items.map(short).filter(Boolean).slice(0, max);

/**
 * The campaign preparation workflow: brief, narratives, programme plan, drafts, comparison,
 * editorial decisions, assembly. Every step is bounded, every model output is validated, and
 * nothing is selected or approved except by a person.
 */
export class CampaignService {
  private readonly store: CampaignStore;
  private readonly gateway: ModelGateway;
  private readonly evaluator: JevTransport;
  private readonly operator: OperatorChannel;
  private readonly clock: Clock;
  private readonly ids: IdSource;
  private readonly codes: CodeSource;
  private readonly signer: DecisionSigner | null;
  private readonly ledger: OperatorLedger | null;
  private readonly spend: SpendLedger;
  readonly verifier: DecisionVerifier | null;
  readonly limits: Limits;

  constructor(deps: ServiceDeps) {
    this.store = deps.store;
    this.gateway = deps.gateway;
    this.evaluator = deps.evaluator;
    this.operator = deps.operator;
    this.clock = deps.clock ?? systemClock;
    this.ids = deps.ids ?? randomIds;
    this.codes = deps.codes ?? randomCodes;
    this.limits = deps.limits ?? DEFAULT_LIMITS;
    this.signer = deps.signer ?? null;
    this.verifier = deps.verifier ?? null;
    this.ledger = deps.ledger ?? null;
    this.spend = deps.spend ?? new MemorySpendLedger();
    if (this.signer && this.verifier && this.signer.keyId !== this.verifier.keyId) {
      throw new Error("The decision signing key and the verification key do not belong together.");
    }
  }

  // --- state helpers ---------------------------------------------------------------

  private now(): string {
    return this.clock.now().toISOString();
  }

  async getCampaign(campaignId: string): Promise<CampaignRecord> {
    return this.store.get(campaignId);
  }

  async listCampaigns(): Promise<string[]> {
    return this.store.list();
  }

  /**
   * Change a campaign. Updates are serialised per campaign by the store, so `change`
   * always sees the latest record and nothing it decides can be overtaken by another writer.
   * If `change` throws, nothing is written.
   */
  private mutate<T>(campaignId: string, change: (record: CampaignRecord) => T): Promise<T> {
    return this.store.update(campaignId, (record) => {
      const result = change(record);
      record.updatedAt = this.now();
      return result;
    });
  }

  private audit(record: CampaignRecord, event: string, detail: string): void {
    record.audit.push({ at: this.now(), event: clip(event, 400), detail: clip(detail, 1000) });
  }

  /**
   * Refuse a step whose calls, or whose worst-case token use, would take the campaign over
   * budget. Tokens that steps already in flight may still spend count as spent.
   */
  private assertBudget(budget: BudgetUsage, calls: number, worstCaseTokens: number): void {
    if (budget.modelCalls + calls > this.limits.maxModelCalls) {
      throw new LimitExceededError(
        "maxModelCalls",
        `This step needs ${calls} model call(s); ${budget.modelCalls} of ${this.limits.maxModelCalls} are already used.`,
      );
    }
    const inFlight = budget.reservations.reduce((sum, r) => sum + r.completionTokens, 0);
    if (budget.usage.completionTokens + inFlight + worstCaseTokens > this.limits.maxCompletionTokens) {
      throw new LimitExceededError(
        "maxCompletionTokens",
        `The campaign has used ${budget.usage.completionTokens} completion tokens, steps in progress may use ${inFlight} more, ` +
          `and this step may use up to ${worstCaseTokens}; the limit is ${this.limits.maxCompletionTokens}.`,
      );
    }
  }

  /** A step that was started and never settled is charged at its full allowance. */
  private expireReservations(record: CampaignRecord): void {
    const cutoff = this.clock.now().getTime() - this.limits.reservationTtlMs;
    const [expired, live] = [record.budget.reservations.filter((r) => Date.parse(r.reservedAt) < cutoff), record.budget.reservations.filter((r) => Date.parse(r.reservedAt) >= cutoff)];
    for (const reservation of expired) {
      record.budget.usage.completionTokens += reservation.completionTokens;
      this.audit(record, "step-unsettled", `${reservation.step} (${reservation.id}) never settled; its full allowance of ${reservation.completionTokens} tokens is charged.`);
    }
    record.budget.reservations = live;
  }

  private addCosts(record: CampaignRecord, costs: readonly CallCost[]): void {
    for (const cost of costs) {
      record.budget.providerRequests += cost.providerRequests;
      record.budget.usage.promptTokens += cost.usage.promptTokens;
      record.budget.usage.completionTokens += cost.usage.completionTokens;
      record.budget.usage.reasoningTokens += cost.usage.reasoningTokens;
    }
  }

  private meta(skill: string, result: GenerateResult<unknown>): GenerationMeta {
    return {
      provider: result.provider,
      model: result.model,
      skill,
      skillVersion: SKILL_VERSION,
      promptVersion: PROMPT_VERSION,
      source: result.source,
      generatedAt: this.now(),
      usage: result.usage,
    };
  }

  /** One model call with a hard time limit. When the limit passes, the request itself is cancelled. */
  private async callModel<T>(request: ModelRequest<T>, cancelAll: AbortSignal): Promise<GenerateResult<T>> {
    const own = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      own.abort();
    }, this.limits.modelCallTimeoutMs);
    try {
      return await this.gateway.generateJson({ ...request, system: systemPrompt, signal: AbortSignal.any([own.signal, cancelAll]) });
    } catch (error) {
      if (!timedOut) throw error;
      const limit = new LimitExceededError("modelCallTimeoutMs", `Model call for "${request.purpose}" exceeded ${this.limits.modelCallTimeoutMs} ms and was cancelled.`);
      (limit as LimitExceededError & { cost?: CallCost }).cost = costOf(error);
      throw limit;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Run one model-backed step in three phases.
   *
   * 1. Reserve. Under the campaign lock: check the step is allowed, build its requests from
   *    the latest record, check the budget, charge the calls and reserve the most tokens the
   *    step could use. A step that cannot afford that never starts, and two steps started
   *    together cannot both spend the same remaining budget.
   * 2. Call the model, outside the lock, with bounded concurrency. After the first failure
   *    no further call is started and the rest are cancelled.
   * 3. Settle. Under the lock again: record what every call cost, whether it succeeded or
   *    not, then check that the campaign still allows the result and apply it. If the
   *    campaign changed in a way that rules the result out, the result is discarded; the
   *    cost stays on the books.
   */
  private async step<C, T, O>(spec: {
    campaignId: string;
    name: string;
    prepare: (record: CampaignRecord) => { context: C; requests: ModelRequest<T>[] };
    commit: (record: CampaignRecord, results: GenerateResult<T>[], context: C) => O;
  }): Promise<O> {
    const { context, requests, reservationId, worstCase } = await this.mutate(spec.campaignId, (record) => {
      this.expireReservations(record);
      const prepared = spec.prepare(record);
      // Each call may use up to MAX_TOKEN_FACTOR times its allowance once retries are counted.
      const worstCase = prepared.requests.reduce((sum, r) => sum + r.maxTokens * MAX_TOKEN_FACTOR, 0);
      this.assertBudget(record.budget, prepared.requests.length, worstCase);
      record.budget.modelCalls += prepared.requests.length;
      const id = this.ids.next("res");
      record.budget.reservations.push({ id, step: spec.name, calls: prepared.requests.length, completionTokens: worstCase, reservedAt: this.now() });
      return { ...prepared, reservationId: id, worstCase };
    });

    // The same charge in the instance's own account, which the campaign store cannot reset.
    // If it refuses, the reservation in the record is withdrawn and nothing is called.
    const reserved = { calls: requests.length, tokens: worstCase };
    try {
      await this.spend.reserve(spec.campaignId, reserved.calls, reserved.tokens, this.limits);
    } catch (error) {
      await this.mutate(spec.campaignId, (record) => {
        if (!record.budget.reservations.some((r) => r.id === reservationId)) return;
        record.budget.reservations = record.budget.reservations.filter((r) => r.id !== reservationId);
        record.budget.modelCalls = Math.max(0, record.budget.modelCalls - reserved.calls);
      });
      throw error;
    }

    const cancelAll = new AbortController();
    const settled = await mapLimitSettled(requests, this.limits.maxConcurrency, (request) => this.callModel(request, cancelAll.signal), () => cancelAll.abort());
    const costs: CallCost[] = [];
    const results: GenerateResult<T>[] = [];
    let failure: unknown = null;
    let neverStarted = 0;
    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        results.push(outcome.value);
        costs.push({ usage: outcome.value.usage, providerRequests: outcome.value.providerRequests });
      } else if (outcome.status === "rejected") {
        costs.push(costOf(outcome.reason));
        failure ??= outcome.reason;
      } else {
        neverStarted += 1;
      }
    }

    // Correct the instance's account to what was used. If that fails, the worst case stays charged.
    const usedTokens = costs.reduce((sum, c) => sum + c.usage.completionTokens, 0);
    await this.spend.settle(spec.campaignId, reserved, { calls: requests.length - neverStarted, tokens: usedTokens }).catch(() => undefined);

    type Outcome = { ok: true; value: O } | { ok: false; error: unknown };
    const outcome = await this.mutate(spec.campaignId, (record): Outcome => {
      const stillReserved = record.budget.reservations.some((r) => r.id === reservationId);
      record.budget.reservations = record.budget.reservations.filter((r) => r.id !== reservationId);
      // If the reservation had already expired, its full allowance was charged then; only
      // the request count is added now, so tokens are not counted twice.
      this.addCosts(record, stillReserved ? costs : costs.map((c) => ({ ...c, usage: { promptTokens: c.usage.promptTokens, completionTokens: 0, reasoningTokens: 0 } })));
      // Calls that were reserved but never sent are given back.
      record.budget.modelCalls -= neverStarted;
      if (failure !== null) {
        this.audit(record, "step-failed", `${spec.name}: ${describe(failure)} Nothing from this step was stored.`);
        return { ok: false, error: failure };
      }
      try {
        return { ok: true, value: spec.commit(record, results, context) };
      } catch (error) {
        if (!(error instanceof WorkflowError) && !(error instanceof LimitExceededError)) throw error;
        this.audit(record, "step-discarded", `${spec.name}: ${describe(error)} The result was discarded; its cost is recorded.`);
        return { ok: false, error };
      }
    });
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }

  /** The narrative an editor selected: its status says so and a valid decision on its exact text backs it. */
  private selectedNarrative(record: CampaignRecord): Narrative | null {
    return selectedNarrativeOf(record, this.verifier);
  }

  private slotOf(record: CampaignRecord, slotNumber: number): ProgrammeSlot {
    const slot = record.plan?.slots.find((s) => s.slot === slotNumber);
    if (!slot) throw new WorkflowError("unknown-slot", `The programme has no slot ${slotNumber}.`);
    return slot;
  }

  // --- step 1: brief ---------------------------------------------------------------

  async createCampaign(briefInput: unknown): Promise<CampaignRecord> {
    const parsed = CampaignBrief.safeParse(briefInput);
    if (!parsed.success) throw new WorkflowError("invalid-brief", z.prettifyError(parsed.error));
    const brief = parsed.data;
    const slots = brief.cadence.postsPerWeek * brief.cadence.weeks;
    if (slots > this.limits.maxSlots) {
      throw new LimitExceededError("maxSlots", `The cadence implies ${slots} posts; the limit is ${this.limits.maxSlots}.`);
    }
    const referenceIds = brief.references.map((r) => r.id);
    if (new Set(referenceIds).size !== referenceIds.length) {
      throw new WorkflowError("invalid-brief", "Reference ids in the brief must be unique.");
    }
    const at = this.now();
    const record: CampaignRecord = {
      schema: CAMPAIGN_RECORD_SCHEMA,
      schemaVersion: SCHEMA_VERSION,
      id: this.ids.next("camp"),
      revision: 0,
      createdAt: at,
      updatedAt: at,
      brief,
      interpretation: null,
      narratives: [],
      plan: null,
      drafts: [],
      evaluations: [],
      decisionRequests: [],
      decisions: [],
      budget: { modelCalls: 0, providerRequests: 0, usage: { promptTokens: 0, completionTokens: 0, reasoningTokens: 0 }, reservations: [] },
      audit: [{ at, event: "campaign-created", detail: `Brief accepted (${slots} posts planned, synthetic: ${brief.synthetic}).` }],
    };
    // Counted in the instance's own account first: campaigns are limited, so that a new one is not a new allowance.
    await this.spend.registerCampaign(record.id, this.limits);
    await this.store.create(record);
    return record;
  }

  async interpretBrief(campaignId: string): Promise<BriefInterpretation> {
    return this.step({
      campaignId,
      name: "interpret-brief",
      prepare: (record) => ({
        context: null,
        requests: [{ purpose: "campaign-brief", user: interpretPrompt(record.brief), schema: InterpretationOutput, schemaName: "brief_interpretation", maxTokens: 8000 }],
      }),
      commit: (record, [result]) => {
        if (!result) throw new WorkflowError("model-count-mismatch", "The model returned no interpretation.");
        const parsed = BriefInterpretation.safeParse({
          objectiveSummary: long(result.value.objectiveSummary),
          audienceSummary: long(result.value.audienceSummary),
          keyMessages: shortList(result.value.keyMessages, 8),
          risks: shortList(result.value.risks, 8),
          openQuestions: shortList(result.value.openQuestions, 8),
        });
        if (!parsed.success) throw new WorkflowError("model-output-invalid", "The interpretation did not have the required content.");
        record.interpretation = parsed.data;
        this.audit(record, "brief-interpreted", `${parsed.data.openQuestions.length} open questions raised.`);
        return parsed.data;
      },
    });
  }

  // --- step 2: narratives and plan ---------------------------------------------------

  async generateNarratives(campaignId: string, count = 3): Promise<Narrative[]> {
    if (!Number.isInteger(count) || count < 2) throw new WorkflowError("invalid-count", "Ask for at least two narratives.");
    // Checked when the step is reserved and again when it commits: a second run started
    // meanwhile must not push the campaign past the limit.
    const allowed = (record: CampaignRecord) => {
      if (record.plan) throw new WorkflowError("plan-exists", "A programme plan already exists for this campaign.");
      if (record.narratives.length + count > this.limits.maxNarratives) {
        throw new LimitExceededError(
          "maxNarratives",
          `${record.narratives.length} narratives exist; ${count} more would exceed the limit of ${this.limits.maxNarratives}.`,
        );
      }
    };
    return this.step({
      campaignId,
      name: "generate-narratives",
      prepare: (record) => {
        allowed(record);
        return {
          context: null,
          requests: [
            { purpose: "narrative-fanout", user: narrativePrompt(record.brief, record.interpretation, count), schema: NarrativeOutput, schemaName: "narrative_alternatives", maxTokens: 10000 },
          ],
        };
      },
      commit: (record, [result]) => {
        allowed(record);
        if (!result || result.value.narratives.length !== count) {
          throw new WorkflowError("model-count-mismatch", `Asked for ${count} narratives; the model returned ${result?.value.narratives.length ?? 0}.`);
        }
        const generation = this.meta("narrative-fanout", result);
        const narratives: Narrative[] = result.value.narratives.map((n) => ({
          id: this.ids.next("nar"),
          title: short(n.title),
          angle: long(n.angle),
          coreMessage: long(n.coreMessage),
          supportingThemes: shortList(n.supportingThemes, 8),
          audienceFit: long(n.audienceFit),
          evidenceRequirements: shortList(n.evidenceRequirements, 8),
          risks: shortList(n.risks, 8),
          status: "candidate",
          generation,
        }));
        record.narratives.push(...narratives);
        this.audit(record, "narratives-generated", `${narratives.length} alternatives: ${narratives.map((n) => n.id).join(", ")}.`);
        return narratives;
      },
    });
  }

  async planProgramme(campaignId: string): Promise<ProgrammePlan> {
    const selected = (record: CampaignRecord): Narrative => {
      if (record.plan) throw new WorkflowError("plan-exists", "A programme plan already exists for this campaign.");
      const narrative = this.selectedNarrative(record);
      if (!narrative) throw new WorkflowError("no-narrative-selected", "An editor must select a narrative before a programme can be planned.");
      return narrative;
    };
    return this.step({
      campaignId,
      name: "plan-programme",
      prepare: (record) => {
        const narrative = selected(record);
        const slotCount = record.brief.cadence.postsPerWeek * record.brief.cadence.weeks;
        return {
          context: { narrativeId: narrative.id, narrativeHash: narrativeContentHash(record, narrative), slotCount },
          requests: [{ purpose: "programme-plan", user: planPrompt(record.brief, narrative, slotCount), schema: PlanOutput, schemaName: "programme_plan", maxTokens: 10000 }],
        };
      },
      commit: (record, [result], context) => {
        // The editor's selection must still stand, on the same text, when the plan is stored.
        const narrative = selected(record);
        if (narrative.id !== context.narrativeId || narrativeContentHash(record, narrative) !== context.narrativeHash) {
          throw new WorkflowError("selection-changed", "The selected narrative changed while the programme was being planned.");
        }
        if (!result || result.value.slots.length !== context.slotCount) {
          throw new WorkflowError("model-count-mismatch", `Asked for ${context.slotCount} posts; the model planned ${result?.value.slots.length ?? 0}.`);
        }
        const perWeek = record.brief.cadence.postsPerWeek;
        const parsed = ProgrammePlan.safeParse({
          narrativeId: narrative.id,
          campaignObjective: long(result.value.campaignObjective),
          coreNarrative: long(result.value.coreNarrative),
          supportingThemes: shortList(result.value.supportingThemes, 8),
          intendedAudience: long(result.value.intendedAudience),
          // Position in the sequence is assigned by code, not taken from the model.
          slots: result.value.slots.map((s, index) => ({
            slot: index + 1,
            week: Math.floor(index / perWeek) + 1,
            orderInWeek: (index % perWeek) + 1,
            theme: short(s.theme),
            intent: s.intent,
            sequencingRationale: short(s.sequencingRationale),
            callToAction: short(s.callToAction),
            evidenceRequirements: shortList(s.evidenceRequirements, 6),
          })),
          generation: this.meta("programme-plan", result),
        });
        if (!parsed.success) throw new WorkflowError("model-output-invalid", "The programme plan did not have the required content.");
        record.plan = parsed.data;
        this.audit(record, "programme-planned", `${parsed.data.slots.length} posts planned on narrative ${narrative.id}.`);
        return parsed.data;
      },
    });
  }

  // --- step 3: candidate generation ---------------------------------------------------

  private toDraft(
    variant: DraftVariantOutput,
    slot: ProgrammeSlot,
    narrativeId: string,
    generation: GenerationMeta,
    revision: { of: string; pass: number } | null,
  ): PostDraft {
    const parsed = PostDraftSchema.safeParse({
      id: this.ids.next("draft"),
      slot: slot.slot,
      narrativeId,
      variant: short(variant.variant),
      approach: short(variant.approach),
      hook: short(variant.hook),
      body: settledCanonicalText(variant.body).trim(),
      callToAction: short(variant.callToAction),
      hashtags: normaliseHashtags(variant.hashtags.map(canonicalText)),
      claims: variant.claims.slice(0, 12).map((c) => ({
        text: short(c.text),
        needsEvidence: c.needsEvidence,
        // An id the model made up is kept as written so that the eligibility check can refuse it.
        evidenceRef: c.evidenceRef === null ? null : c.evidenceRef.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 80) || null,
      })),
      status: "candidate",
      revisionOf: revision?.of ?? null,
      revisionPass: revision?.pass ?? 0,
      generation,
    });
    if (!parsed.success) throw new WorkflowError("model-output-invalid", `A draft for slot ${slot.slot} did not have the required content.`);
    return parsed.data;
  }

  /**
   * Write alternative drafts. With slots named, all of them or none: a set that does not fit
   * the remaining budget is refused. With none named, the next batch of posts that have no
   * drafts yet: as many as the step limit and the remaining budget allow, in plan order, so a
   * long programme is drafted by asking again until `slotsWithoutDrafts` is empty.
   */
  async generateDrafts(campaignId: string, options: { slots?: number[]; variants?: number } = {}): Promise<PostDraft[]> {
    const variants = options.variants ?? 2;
    if (!Number.isInteger(variants) || variants < 2) {
      throw new WorkflowError("invalid-count", "Ask for at least two variants per post so the editor has a choice.");
    }
    const liveCount = (record: CampaignRecord, slot: number) =>
      record.drafts.filter((d) => d.slot === slot && d.status !== "superseded" && d.revisionOf === null).length;
    const withinLimit = (record: CampaignRecord, slot: number) => {
      if (liveCount(record, slot) + variants > this.limits.maxVariantsPerSlot) {
        throw new LimitExceededError(
          "maxVariantsPerSlot",
          `Slot ${slot} has ${liveCount(record, slot)} drafts; ${variants} more would exceed the limit of ${this.limits.maxVariantsPerSlot}.`,
        );
      }
    };
    return this.step({
      campaignId,
      name: "generate-drafts",
      prepare: (record) => {
        const plan = record.plan;
        if (!plan) throw new WorkflowError("no-plan", "Plan the programme before drafting posts.");
        const numbers = options.slots ?? this.nextDraftBatch(record, plan.slots.filter((s) => liveCount(record, s.slot) === 0).map((s) => s.slot));
        if (new Set(numbers).size !== numbers.length) throw new WorkflowError("invalid-slots", "Each slot may be named once.");
        const targets = numbers.map((n) => this.slotOf(record, n));
        if (targets.length === 0) throw new WorkflowError("nothing-to-draft", "Every slot already has drafts. Name the slots to draft again.");
        for (const slot of targets) withinLimit(record, slot.slot);
        return {
          context: { slots: targets.map((s) => s.slot), narrativeId: plan.narrativeId },
          // Bounded fan-out: one call per slot, a fixed number in flight.
          requests: targets.map((slot) => ({
            purpose: `linkedin-draft.slot-${slot.slot}`,
            user: draftPrompt(record.brief, plan, slot, variants),
            schema: DraftOutput,
            schemaName: "post_drafts",
            maxTokens: DRAFT_MAX_TOKENS,
          })),
        };
      },
      commit: (record, results, context) => {
        if (record.plan?.narrativeId !== context.narrativeId) throw new WorkflowError("plan-changed", "The programme plan changed while drafts were being written.");
        const drafts: PostDraft[] = [];
        context.slots.forEach((slotNumber, index) => {
          const slot = this.slotOf(record, slotNumber);
          withinLimit(record, slotNumber);
          const result = results[index];
          if (!result || result.value.variants.length !== variants) {
            throw new WorkflowError("model-count-mismatch", `Asked for ${variants} variants for slot ${slotNumber}; got ${result?.value.variants.length ?? 0}.`);
          }
          const generation = this.meta("linkedin-draft", result);
          for (const variant of result.value.variants) drafts.push(this.toDraft(variant, slot, context.narrativeId, generation, null));
        });
        record.drafts.push(...drafts);
        this.audit(record, "drafts-generated", `${drafts.length} drafts for slots ${context.slots.join(", ")}.`);
        return drafts;
      },
    });
  }

  /**
   * The posts to draft next when the caller named none: the first undrafted ones, as many as
   * one step may take and the campaign's remaining calls and tokens cover at their worst case.
   * Never fewer than one, so that a campaign with no room left gets the budget refusal.
   */
  private nextDraftBatch(record: CampaignRecord, undrafted: number[]): number[] {
    const inFlight = record.budget.reservations.reduce((sum, r) => sum + r.completionTokens, 0);
    const tokensLeft = this.limits.maxCompletionTokens - record.budget.usage.completionTokens - inFlight;
    const affordable = Math.floor(tokensLeft / (DRAFT_MAX_TOKENS * MAX_TOKEN_FACTOR));
    const callsLeft = this.limits.maxModelCalls - record.budget.modelCalls;
    return undrafted.slice(0, Math.max(1, Math.min(this.limits.maxSlotsPerDraftStep, affordable, callsLeft)));
  }

  /** Planned posts that have no draft an editor could still choose. */
  slotsWithoutDrafts(record: CampaignRecord): number[] {
    if (!record.plan) return [];
    return record.plan.slots
      .filter((s) => !record.drafts.some((d) => d.slot === s.slot && d.status !== "superseded" && d.revisionOf === null))
      .map((s) => s.slot);
  }

  /** Revise a draft. Allowed only after an editor asked for it, and only a bounded number of times. */
  async reviseDraft(campaignId: string, draftId: string): Promise<PostDraft> {
    // Everything a revision depends on, read from the record it is given. Run at reserve
    // and again at commit, so two revisions of one draft cannot both be stored.
    const revisable = (record: CampaignRecord) => {
      const draft = record.drafts.find((d) => d.id === draftId);
      if (!draft) throw new WorkflowError("unknown-draft", `No draft ${draftId} in this campaign.`);
      if (draft.status === "superseded" || draft.status === "rejected") {
        throw new WorkflowError("draft-not-revisable", `Draft ${draftId} is ${draft.status}.`);
      }
      // One revision per draft, read from what exists and not from the status field: a request to
      // revise is used up by the revision it produced. A further change is asked for on the revision.
      const existing = record.drafts.find((d) => d.revisionOf === draftId);
      if (existing) throw new WorkflowError("draft-not-revisable", `Draft ${draftId} has already been revised as ${existing.id}.`);
      const hash = draftContentHash(record, draft);
      // The latest decision about the draft must be the editor's request to revise this exact text.
      const latest = latestDecisionFor(record, { kind: "draft", id: draftId }, this.verifier);
      const instruction = latest?.action === "request-revision" && latest.subjectContentSha256 === hash ? latest : undefined;
      if (!instruction?.revisionInstruction) {
        throw new WorkflowError("no-revision-requested", `No editor has asked for draft ${draftId} to be revised.`);
      }
      if (draft.revisionPass >= this.limits.maxRevisionPasses) {
        throw new LimitExceededError("maxRevisionPasses", `Draft ${draftId} has reached the limit of ${this.limits.maxRevisionPasses} revision passes.`);
      }
      return { draft, hash, instruction, text: instruction.revisionInstruction };
    };
    return this.step({
      campaignId,
      name: "revise-draft",
      prepare: (record) => {
        const { draft, hash, instruction, text } = revisable(record);
        const slot = this.slotOf(record, draft.slot);
        return {
          context: { hash, decisionId: instruction.id },
          requests: [{ purpose: `linkedin-revise.${draftId}`, user: revisionPrompt(record.brief, slot, draft, text), schema: RevisionOutput, schemaName: "post_revision", maxTokens: 12000 }],
        };
      },
      commit: (record, [result], context) => {
        const { draft, hash, instruction } = revisable(record);
        if (hash !== context.hash || instruction.id !== context.decisionId) {
          throw new WorkflowError("draft-changed", `Draft ${draftId} changed while it was being revised.`);
        }
        if (!result) throw new WorkflowError("model-count-mismatch", "The model returned no revision.");
        const slot = this.slotOf(record, draft.slot);
        const revised = this.toDraft(result.value, slot, draft.narrativeId, this.meta("linkedin-draft", result), {
          of: draft.id,
          pass: draft.revisionPass + 1,
        });
        if (draft.status === "approved") this.audit(record, "approval-withdrawn", `${draft.id} superseded by a revision after approval.`);
        draft.status = "superseded";
        record.drafts.push(revised);
        this.audit(record, "draft-revised", `${draftId} superseded by ${revised.id} (pass ${revised.revisionPass}) on decision ${instruction.id}.`);
        return revised;
      },
    });
  }

  // --- step 4: comparative evaluation ---------------------------------------------------

  /** Evaluate the live drafts of each slot (all slots with drafts by default). */
  async evaluateDrafts(campaignId: string, options: { slots?: number[] } = {}): Promise<Evaluation[]> {
    // The evaluator runs outside the campaign lock. Its result is stored only if the
    // campaign has not changed since the drafts were read; otherwise it is recomputed.
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = await this.store.get(campaignId);
      if (!before.plan) throw new WorkflowError("no-plan", "Plan the programme before evaluating drafts.");
      const live = (slot: number) => before.drafts.filter((d) => d.slot === slot && d.status !== "superseded" && d.status !== "rejected");
      // Each post is evaluated once in a call. Evaluating makes no model call and so draws on no
      // budget; a post named many times would otherwise store an evaluation each time.
      if (options.slots && new Set(options.slots).size !== options.slots.length) {
        throw new WorkflowError("duplicate-slot", "Name each post at most once.");
      }
      const slots = (options.slots ?? before.plan.slots.map((s) => s.slot).filter((n) => live(n).length > 0)).map((n) => this.slotOf(before, n));
      if (slots.length === 0) throw new WorkflowError("nothing-to-evaluate", "There are no drafts to evaluate.");

      const evaluations: Evaluation[] = [];
      for (const slot of slots) {
        const drafts = live(slot.slot);
        if (drafts.length === 0) throw new WorkflowError("nothing-to-evaluate", `Slot ${slot.slot} has no drafts to evaluate.`);
        evaluations.push(
          await evaluateSlot(
            { brief: before.brief, slot, drafts },
            { transport: this.evaluator, limits: this.limits, clock: this.clock, ids: this.ids },
          ),
        );
      }
      // Evaluating again what has not changed changes nothing: not the record, and not its audit
      // trail. Evaluation makes no model call and draws on no budget, so a call that only
      // repeats an earlier one must not be able to make the record grow.
      // "Has not changed" means the same as the latest evaluation stored for the post, which is
      // the one the editor is shown. An older evaluation that happens to match is not enough: if
      // a post's drafts have gone back to an earlier set, the evaluation of that set must become
      // the latest again.
      const substance = (e: Evaluation) => JSON.stringify({ ...e, id: null, evaluatedAt: null });
      const latest = (slot: number) => [...before.evaluations].reverse().find((e) => e.slot === slot);
      if (evaluations.every((e) => { const shown = latest(e.slot); return shown !== undefined && substance(shown) === substance(e); })) {
        return evaluations.map((e) => latest(e.slot) as Evaluation);
      }
      try {
        return await this.mutate(campaignId, (record) => {
          if (record.revision !== before.revision) throw new RetryUpdate();
          // An evaluation of the same drafts of the same post replaces the earlier one. Drafts do
          // not change once written, so nothing is lost, and evaluating again and again does not
          // make the record grow: it grows only with new drafts, which the budget limits.
          const covers = (e: Evaluation) => `${e.slot}:${e.candidates.map((c) => c.draftId).sort().join(",")}`;
          const replaced = new Set(evaluations.map(covers));
          record.evaluations = record.evaluations.filter((e) => !replaced.has(covers(e)));
          record.evaluations.push(...evaluations);
          this.audit(record, "drafts-evaluated", `Slots ${slots.map((s) => s.slot).join(", ")} evaluated by ${this.evaluator.kind} (live: ${this.evaluator.live}).`);
          return evaluations;
        });
      } catch (error) {
        if (!(error instanceof RetryUpdate)) throw error;
      }
    }
    throw new WorkflowError("campaign-busy", "The campaign kept changing while its drafts were being evaluated. Try again.");
  }

  /** The most recent evaluation that covers this exact text of a draft, if any. */
  private latestEvaluationFor(record: CampaignRecord, draftId: string): Evaluation | undefined {
    return [...record.evaluations].reverse().find((e) => e.candidates.some((c) => c.draftId === draftId));
  }

  // --- step 5: editorial decisions -------------------------------------------------------

  /**
   * Check that a decision is possible in the campaign's current state and return the hash
   * of the content it would apply to. Run when a decision is requested and again when it is
   * confirmed, because the state may have moved between.
   */
  private checkDecision(record: CampaignRecord, subject: DecisionSubject, action: DecisionAction): string {
    if (subject.kind === "narrative") {
      const narrative = record.narratives.find((n) => n.id === subject.id);
      if (!narrative) throw new WorkflowError("unknown-narrative", `No narrative ${subject.id} in this campaign.`);
      if (action !== "select" && action !== "reject") {
        throw new WorkflowError("invalid-action", "A narrative can only be selected or rejected.");
      }
      if (record.plan) throw new WorkflowError("plan-exists", "The programme is already planned; the narrative can no longer change.");
      if (narrative.status === "rejected") throw new WorkflowError("narrative-rejected", `Narrative ${subject.id} was rejected.`);
      return narrativeContentHash(record, narrative);
    }

    const draft = record.drafts.find((d) => d.id === subject.id);
    if (!draft) throw new WorkflowError("unknown-draft", `No draft ${subject.id} in this campaign.`);
    // What has happened to a draft is read from the signed log and from what exists, not only from its status field.
    const latest = latestDecisionFor(record, subject, this.verifier);
    if (draft.status === "superseded" || record.drafts.some((d) => d.revisionOf === draft.id)) {
      throw new WorkflowError("draft-superseded", `Draft ${subject.id} was superseded by a revision.`);
    }
    if (draft.status === "rejected" || latest?.action === "reject") throw new WorkflowError("draft-rejected", `Draft ${subject.id} was rejected.`);
    if (action === "approve") {
      const held = settledByLog(record, this.verifier).approvals.get(draft.slot);
      if (held?.subject.id === draft.id && held.subjectContentSha256 === draftContentHash(record, draft)) {
        throw new WorkflowError("already-approved", `Draft ${subject.id} is already approved.`);
      }
      // The editor must have been shown a comparison of this exact draft before approving it.
      if (!this.latestEvaluationFor(record, draft.id)) {
        throw new WorkflowError("not-evaluated", `Draft ${subject.id} has not been evaluated. Evaluate the slot before approval.`);
      }
      // Mandatory constraints are re-checked on the current text. No score can override them.
      const analysis = analyseDraft(record.brief, this.slotOf(record, draft.slot), draft, this.limits);
      if (analysis.failures.length > 0) {
        throw new WorkflowError(
          "ineligible",
          `Draft ${subject.id} fails mandatory constraints and cannot be approved: ${analysis.failures.map((f) => `${f.rule} (${f.detail})`).join("; ")}`,
        );
      }
    }
    return draftContentHash(record, draft);
  }

  /** What the editor is shown: the content itself, read from the record, not the requester's description of it. */
  private contentOf(record: CampaignRecord, subject: DecisionSubject): RequestDescription["content"] {
    if (subject.kind === "narrative") {
      const narrative = record.narratives.find((n) => n.id === subject.id) as Narrative;
      return {
        title: narrative.title,
        text: `${narrative.angle}\n\nCore message: ${narrative.coreMessage}`,
        hashtags: [],
        unpublished: [
          { label: "Audience fit", text: narrative.audienceFit },
          { label: "Supporting themes", text: narrative.supportingThemes.join("; ") },
        ],
        eligibilityFailures: [],
        evaluation: null,
        basis: this.briefBasis(record),
      };
    }
    const draft = record.drafts.find((d) => d.id === subject.id) as PostDraft;
    const slot = this.slotOf(record, draft.slot);
    const failures = analyseDraft(record.brief, slot, draft, this.limits).failures;
    const evaluation = this.latestEvaluationFor(record, draft.id);
    const candidate = evaluation?.candidates.find((c) => c.draftId === draft.id);
    return {
      title: `Post ${draft.slot}, ${draft.variant}`,
      text: draft.body,
      hashtags: draft.hashtags,
      unpublished: [
        { label: "Opening line as labelled", text: draft.hook },
        { label: "Call to action as labelled", text: draft.callToAction },
      ],
      eligibilityFailures: failures.map((f) => `${f.rule}: ${f.detail}`),
      evaluation:
        evaluation && candidate
          ? `Ranked ${evaluation.ranking.indexOf(draft.id) + 1} of ${evaluation.ranking.length} by ${evaluation.evaluator.kind} (total ${Math.round(candidate.weightedTotal * 100)}/100). Advice only: the ranking is not signed and not covered by the digest.`
          : null,
      basis: [
        {
          label: `Planned post ${slot.slot} (week ${slot.week}, number ${slot.orderInWeek} in the week)`,
          lines: [`Theme: ${slot.theme}`, `Purpose: ${slot.intent}`, `Planned call to action: ${slot.callToAction}`],
        },
        {
          label: "Claims the draft records",
          lines: draft.claims.length ? draft.claims.map((c) => `${c.text} [${c.evidenceRef ? `cites ${c.evidenceRef}` : "cites nothing"}]`) : ["none"],
        },
        ...this.briefBasis(record),
      ],
    };
  }

  /** The parts of the brief that the mandatory constraints are checked against. */
  private briefBasis(record: CampaignRecord): Array<{ label: string; lines: string[] }> {
    const brief = record.brief;
    return [
      { label: `Brief for ${brief.client.name} (sha256 ${briefHash(brief)})`, lines: [`Evidence policy: ${brief.constraints.evidencePolicy}`] },
      { label: "The brief rules out", lines: brief.constraints.mustAvoid.length ? brief.constraints.mustAvoid : ["nothing"] },
      { label: "References a figure may be backed by", lines: brief.references.length ? brief.references.map((r) => `${r.id}: ${r.title}. ${r.summary}`) : ["none"] },
    ];
  }

  /** What the content hash of a subject is computed over, with the brief in full instead of as a hash. */
  private coveredBy(record: CampaignRecord, subject: DecisionSubject): Record<string, unknown> {
    if (subject.kind === "narrative") {
      const { status: _status, generation: _generation, ...content } = record.narratives.find((n) => n.id === subject.id) as Narrative;
      return { narrative: content, brief: record.brief };
    }
    const { status: _status, generation: _generation, ...content } = record.drafts.find((d) => d.id === subject.id) as PostDraft;
    return { draft: content, plannedPost: record.plan?.slots.find((s) => s.slot === content.slot) ?? null, brief: record.brief };
  }

  private contentHashOf(record: CampaignRecord, subject: DecisionSubject): string | null {
    if (subject.kind === "narrative") {
      const narrative = record.narratives.find((n) => n.id === subject.id);
      return narrative ? narrativeContentHash(record, narrative) : null;
    }
    const draft = record.drafts.find((d) => d.id === subject.id);
    return draft ? draftContentHash(record, draft) : null;
  }

  /**
   * Describe a decision request for the editor. Everything returned is read from the
   * campaign record now: the action and subject from the stored request, the content from
   * the stored narrative or draft. Nothing comes from the operator channel, which the
   * requester's side can write.
   */
  async describeRequest(campaignId: string, requestId: string): Promise<RequestDescription> {
    const record = await this.store.get(campaignId);
    const request = record.decisionRequests.find((r) => r.id === requestId);
    if (!request) throw new WorkflowError("unknown-request", `No decision request ${requestId}.`);
    const hash = this.contentHashOf(record, request.subject);
    if (hash === null) throw new WorkflowError("unknown-subject", `The ${request.subject.kind} ${request.subject.id} no longer exists.`);
    return {
      requestId: request.id,
      campaignId: record.id,
      state: request.state,
      action: request.action,
      subject: request.subject,
      proposedRationale: request.proposedRationale,
      revisionInstruction: request.revisionInstruction,
      requestedBy: request.requestedBy,
      expiresAt: request.expiresAt,
      content: this.contentOf(record, request.subject),
      covers: this.coveredBy(record, request.subject),
      contentSha256: hash,
      digest: requestDigest({ campaignId: record.id, requestId: request.id, action: request.action, subject: request.subject, revisionInstruction: request.revisionInstruction, contentSha256: hash }),
      unchanged: hash === request.subjectContentSha256,
    };
  }

  /**
   * Ask a person to make an editorial decision. Nothing changes until that person confirms
   * through the operator's tool. The operator channel is told only that a request is
   * waiting, and is given its one-time code; the code is never returned here.
   */
  async requestDecision(input: DecisionRequestInput): Promise<DecisionRequestView> {
    const rationale = ShortText.safeParse(input.proposedRationale);
    if (!rationale.success) throw new WorkflowError("invalid-rationale", "Give a short reason for the proposed decision.");
    let revisionInstruction: string | null = null;
    if (input.action === "request-revision") {
      const parsed = ShortText.safeParse(input.revisionInstruction ?? "");
      if (!parsed.success) throw new WorkflowError("invalid-instruction", "A revision request needs an instruction of 1 to 400 characters.");
      revisionInstruction = parsed.data;
    }
    const code = this.codes.next();
    const requestedAt = this.now();
    const expiresAt = new Date(Date.parse(requestedAt) + this.limits.decisionRequestTtlMs).toISOString();

    const request = await this.mutate(input.campaignId, (record) => {
      const contentHash = this.checkDecision(record, input.subject, input.action);
      // Asking for a decision makes no model call and draws on no budget, so asking again and
      // again must not make the record, the audit trail or the editor's channel grow. Two rules
      // see to that. One decision on one subject is asked for once at a time: while a request
      // for it is waiting for the editor, a second is refused, and nothing is stored, said or
      // sent. And a request that came to nothing (it expired, was never delivered, or was
      // voided after wrong codes) is replaced by the new request, not kept beside it.
      const sameDecision = (r: DecisionRequest) => r.action === input.action && r.subject.kind === input.subject.kind && r.subject.id === input.subject.id;
      const isWaiting = (r: DecisionRequest) => r.state === "pending" && Date.parse(r.expiresAt) >= Date.parse(requestedAt);
      const standing = record.decisionRequests.find((r) => sameDecision(r) && isWaiting(r));
      if (standing) {
        throw new WorkflowError("decision-pending", `Decision request ${standing.id} for this decision is already waiting for the editor, until ${standing.expiresAt}. Wait for it to be answered or to expire.`);
      }
      const cameToNothing = (r: DecisionRequest) => r.state === "expired" || r.state === "voided" || (r.state === "pending" && !isWaiting(r));
      const replaced = record.decisionRequests.filter((r) => cameToNothing(r) && sameDecision(r));
      let undelivered = false;
      if (replaced.length > 0) {
        record.decisionRequests = record.decisionRequests.filter((r) => !replaced.includes(r));
        // The lines that said those requests were made, and that they could not be delivered,
        // go with them: the line written below for the new request stands in their place, so
        // the trail names the request that stands and does not grow by asking again.
        const gone = replaced.map((r) => `${r.id}:`);
        const about = (e: { event: string; detail: string }) => (e.event === "decision-requested" || e.event === "decision-undelivered") && gone.some((prefix) => e.detail.startsWith(prefix));
        undelivered = record.audit.some((e) => e.event === "decision-undelivered" && about(e));
        record.audit = record.audit.filter((e) => !about(e));
      }
      // What is left is bounded as well: a backstop, far above what a campaign can need.
      if (record.decisionRequests.length >= this.limits.maxDecisionRequests) {
        throw new LimitExceededError("maxDecisionRequests", `This campaign holds ${record.decisionRequests.length} decision requests; the limit is ${this.limits.maxDecisionRequests}.`);
      }
      const waiting = record.decisionRequests.filter(isWaiting).length;
      if (waiting >= this.limits.maxPendingDecisions) {
        throw new LimitExceededError("maxPendingDecisions", `${waiting} decisions are already waiting for the editor; the limit is ${this.limits.maxPendingDecisions}.`);
      }
      const created: DecisionRequest = {
        id: this.ids.next("req"),
        subject: input.subject,
        action: input.action,
        proposedRationale: settledCanonicalText(rationale.data),
        revisionInstruction: revisionInstruction === null ? null : settledCanonicalText(revisionInstruction),
        requestedBy: short(input.requestedBy || "unknown"),
        requestedAt,
        expiresAt,
        subjectContentSha256: contentHash,
        codeHash: sha256(code),
        failedAttempts: 0,
        state: "pending",
      };
      record.decisionRequests.push(created);
      // One line in the audit trail for the request that stands for this decision.
      // What the line says of the request it replaces is what an investigator would otherwise
      // lose with it: who asked, when, and whether it ever reached the editor.
      const last = replaced.at(-1);
      const instead = !last
        ? ""
        : ` It replaces ${last.id}${replaced.length > 1 ? ` and ${replaced.length - 1} more` : ""}, requested by ${last.requestedBy} at ${last.requestedAt}, which came to nothing (${undelivered ? "the operator channel could not be reached" : last.state === "voided" ? "voided" : "expired"}).`;
      this.audit(record, "decision-requested", `${created.id}: ${input.action} ${input.subject.kind} ${input.subject.id}, requested by ${created.requestedBy}.${instead}`);
      return created;
    });

    try {
      await this.operator.deliver({ requestId: request.id, campaignId: input.campaignId, code, expiresAt });
    } catch {
      // A request the editor never received must not stay open.
      await this.mutate(input.campaignId, (record) => {
        const stored = record.decisionRequests.find((r) => r.id === request.id);
        if (stored && stored.state === "pending") stored.state = "voided";
        // One line for each request that could not be delivered. It is removed with the
        // request when the decision is asked for again, so an outage is recorded each time it
        // happens and attempts made while the channel stays down do not pile up. A delivery
        // that fails only after its request has expired and been replaced leaves no line: the
        // request it would name is gone, and nothing would ever remove the line.
        if (stored) this.audit(record, "decision-undelivered", `${request.id}: the operator channel could not be reached; request voided.`);
      });
      throw new WorkflowError("operator-unreachable", "The decision request could not be delivered to the editor and was withdrawn.");
    }
    return { requestId: request.id, subject: request.subject, action: request.action, state: request.state, expiresAt };
  }

  /**
   * Find a pending request and check the one-time code. Wrong codes are counted and void
   * the request at the limit. Returns the request, or the error to report.
   */
  private openRequest(record: CampaignRecord, requestId: string, code: string, at: string): { request: DecisionRequest } | { error: WorkflowError } {
    const request = record.decisionRequests.find((r) => r.id === requestId);
    if (!request) return { error: new WorkflowError("unknown-request", `No decision request ${requestId}.`) };
    if (request.state !== "pending") return { error: new WorkflowError("request-not-pending", `Decision request ${request.id} is ${request.state}.`) };
    if (Date.parse(at) > Date.parse(request.expiresAt)) {
      request.state = "expired";
      this.audit(record, "decision-expired", `${request.id} expired before it was confirmed.`);
      return { error: new WorkflowError("request-expired", `Decision request ${request.id} has expired.`) };
    }
    if (!codesMatch(request.codeHash, code)) {
      request.failedAttempts += 1;
      const voided = request.failedAttempts >= this.limits.maxDecisionCodeAttempts;
      if (voided) request.state = "voided";
      this.audit(record, "decision-code-rejected", `${request.id}: wrong code (attempt ${request.failedAttempts})${voided ? "; request voided" : ""}.`);
      return { error: new WorkflowError("invalid-code", voided ? `Wrong code. Decision request ${request.id} is now void.` : "Wrong confirmation code.") };
    }
    return { request };
  }

  /**
   * The decision log, checked: every entry in sequence, chained to the one before and (when
   * decisions are signed) validly signed. In the operator's process the log must also
   * contain everything the operator's own ledger says was decided. A log that fails either
   * check is not relied on at all.
   */
  private async checkedHead(record: CampaignRecord): Promise<LogHead> {
    const check = verifyDecisionLog(record, this.verifier);
    if (!check.ok) throw new WorkflowError("decision-log-invalid", `The campaign's decision log cannot be trusted: ${check.reason}.`);
    if (this.ledger && !logContainsHead(check, await this.ledger.get(record.id))) {
      throw new WorkflowError("decision-log-rolled-back", "The campaign's decision log is missing decisions the operator recorded. The store has been rolled back or altered.");
    }
    return check.head;
  }

  /**
   * Record a person's decision. Requires the one-time code that only the operator received
   * and, when decisions are signed, the operator's key: a process without that key (the
   * agent-facing server) cannot record a decision at all. The decision is refused unless
   * the stored request and the current content are exactly what the editor was shown.
   */
  async confirmDecision(input: DecisionConfirmation): Promise<EditorialDecision> {
    if (this.verifier !== null && this.signer === null) {
      throw new WorkflowError("cannot-record-decisions", "This process does not hold the operator's key. Decisions are recorded with the operator tool.");
    }
    const actor = HumanActorSchema.safeParse(input.actor);
    if (!actor.success) throw new WorkflowError("invalid-actor", "A decision must name the person making it (kind: human, id, name).");
    const rationale = ShortText.safeParse(input.rationale);
    if (!rationale.success) throw new WorkflowError("invalid-rationale", "The editor must give a reason of 1 to 400 characters.");

    // The ledger is read before the campaign is locked; it changes only in this process.
    const ledgerHead = this.ledger ? await this.ledger.get(input.campaignId) : null;

    // A wrong code must be recorded even though the call fails, so the outcome is decided
    // inside the write and the error is thrown after it.
    type Outcome = { ok: true; decision: EditorialDecision; head: LogHead } | { ok: false; error: WorkflowError };
    const outcome = await this.mutate(input.campaignId, (record): Outcome => {
      const decidedAt = this.now();
      // Nothing is signed on top of a log that is broken or has lost decisions.
      const check = verifyDecisionLog(record, this.verifier);
      if (!check.ok) return { ok: false, error: new WorkflowError("decision-log-invalid", `The campaign's decision log cannot be trusted: ${check.reason}.`) };
      if (!logContainsHead(check, ledgerHead)) {
        return { ok: false, error: new WorkflowError("decision-log-rolled-back", "The campaign's decision log is missing decisions the operator recorded. Nothing was signed.") };
      }
      const opened = this.openRequest(record, input.requestId, input.code, decidedAt);
      if ("error" in opened) return { ok: false, error: opened.error };
      const request = opened.request;
      let contentHash: string;
      try {
        contentHash = this.checkDecision(record, request.subject, request.action);
        // The content must be what it was when the request was made.
        if (contentHash !== request.subjectContentSha256) {
          throw new WorkflowError("subject-changed", `The ${request.subject.kind} is not the text decision ${request.id} was requested for.`);
        }
        // And the request, as stored now, must be exactly the one the editor read: same action,
        // subject, revision instruction and content. One digest covers all of them.
        const current = requestDigest({ campaignId: record.id, requestId: request.id, action: request.action, subject: request.subject, revisionInstruction: request.revisionInstruction, contentSha256: contentHash });
        const given = Buffer.from(input.expected.digest, "utf8");
        if (given.length !== current.length || !timingSafeEqual(given, Buffer.from(current, "utf8"))) {
          throw new WorkflowError("request-mismatch", `Decision request ${request.id} (${request.action} ${request.subject.kind} ${request.subject.id}) is not the request that was confirmed.`);
        }
      } catch (error) {
        if (!(error instanceof WorkflowError)) throw error;
        request.state = "voided";
        this.audit(record, "decision-voided", `${request.id}: not confirmed (${error.code}).`);
        return { ok: false, error };
      }
      const unsigned: UnsignedDecision = {
        id: this.ids.next("dec"),
        sequence: check.head.sequence + 1,
        previousSha256: check.head.sequence === 0 ? GENESIS_SHA256 : check.head.sha256,
        requestId: request.id,
        subject: request.subject,
        // Read from the record under the lock; the content hash the editor confirmed covers it.
        subjectSlot: request.subject.kind === "draft" ? (record.drafts.find((d) => d.id === request.subject.id)?.slot ?? null) : null,
        action: request.action,
        actor: actor.data,
        rationale: rationale.data,
        revisionInstruction: request.revisionInstruction,
        decidedAt,
        subjectContentSha256: contentHash,
      };
      const decision: EditorialDecision = {
        ...unsigned,
        signature: this.signer ? { alg: "ed25519", keyId: this.signer.keyId, value: this.signer.sign(decisionPayload(record.id, unsigned)) } : null,
      };
      request.state = "confirmed";
      record.decisions.push(decision);
      this.apply(record, decision);
      this.audit(record, "decision-recorded", `${decision.id}: ${actor.data.name} chose ${decision.action} for ${decision.subject.kind} ${decision.subject.id}.`);
      return { ok: true, decision, head: { sequence: decision.sequence, sha256: decisionDigest(record.id, decision) } };
    });
    if (!outcome.ok) throw outcome.error;
    await this.ledger?.set(input.campaignId, outcome.head);
    return outcome.decision;
  }

  /** The editor declines a request. It is closed at once instead of being left to expire. */
  async declineDecision(input: { campaignId: string; requestId: string; code: string }): Promise<void> {
    const error = await this.mutate(input.campaignId, (record) => {
      const opened = this.openRequest(record, input.requestId, input.code, this.now());
      if ("error" in opened) return opened.error;
      opened.request.state = "voided";
      this.audit(record, "decision-declined", `${opened.request.id}: declined by the editor.`);
      return null;
    });
    if (error) throw error;
  }

  /** Apply a recorded decision to the campaign. Only called from confirmDecision. */
  private apply(record: CampaignRecord, decision: EditorialDecision): void {
    if (decision.subject.kind === "narrative") {
      for (const narrative of record.narratives) {
        if (narrative.id === decision.subject.id) narrative.status = decision.action === "select" ? "selected" : "rejected";
        else if (decision.action === "select" && narrative.status === "selected") narrative.status = "candidate";
      }
      return;
    }
    const draft = record.drafts.find((d) => d.id === decision.subject.id);
    if (!draft) return;
    const others = record.drafts.filter((d) => d.slot === draft.slot && d.id !== draft.id);
    switch (decision.action) {
      case "select":
        for (const other of others) if (other.status === "selected") other.status = "candidate";
        if (draft.status === "candidate") draft.status = "selected";
        break;
      case "approve":
        // One approved draft per slot. Approving another withdraws the earlier approval.
        for (const other of others) {
          if (other.status === "approved" || other.status === "selected") {
            if (other.status === "approved") this.audit(record, "approval-withdrawn", `${other.id} replaced by ${draft.id} for slot ${draft.slot}.`);
            other.status = "candidate";
          }
        }
        draft.status = "approved";
        break;
      case "reject":
        if (draft.status === "approved") this.audit(record, "approval-withdrawn", `${draft.id} rejected after approval.`);
        draft.status = "rejected";
        break;
      case "request-revision":
        // Asking for changes to an approved draft withdraws its approval.
        if (draft.status === "approved") {
          this.audit(record, "approval-withdrawn", `${draft.id}: a revision was requested after approval.`);
          draft.status = "candidate";
        }
        break;
    }
  }

  async pendingDecisions(campaignId: string): Promise<DecisionRequestView[]> {
    const record = await this.store.get(campaignId);
    return record.decisionRequests
      .filter((r) => r.state === "pending")
      .map((r) => ({ requestId: r.id, subject: r.subject, action: r.action, state: r.state, expiresAt: r.expiresAt }));
  }

  /**
   * The operator's view of the decision log: its head if it is intact and complete.
   * Throws if the log is broken or, in the operator's process, has lost decisions.
   */
  async decisionLogHead(campaignId: string): Promise<LogHead> {
    return this.checkedHead(await this.store.get(campaignId));
  }

  /** True when this process holds the operator's signing key. */
  get canSign(): boolean {
    return this.signer !== null;
  }

  /** Sign a release statement with the operator's key. Null in unsigned mode. */
  signRelease(statement: string): { alg: "ed25519"; keyId: string; value: string } | null {
    if (this.verifier !== null && this.signer === null) {
      throw new WorkflowError("cannot-release", "This process does not hold the operator's key. A programme is released with the operator tool.");
    }
    return this.signer ? { alg: "ed25519", keyId: this.signer.keyId, value: this.signer.sign(statement) } : null;
  }

  /**
   * A campaign record together with the head of its decision log, both from one read, after
   * the log has been checked. For anything that is about to be signed.
   */
  async checkedRecord(campaignId: string): Promise<{ record: CampaignRecord; head: LogHead }> {
    const record = await this.store.get(campaignId);
    return { record, head: await this.checkedHead(record) };
  }

  /**
   * Bring the operator's ledger up to the store's log when the log is intact, contains
   * everything the ledger knows, and is longer. This closes the gap left if the process
   * stopped after a decision was stored and before the ledger was advanced.
   */
  async advanceLedger(campaignId: string): Promise<void> {
    if (!this.ledger) return;
    const head = await this.checkedHead(await this.store.get(campaignId));
    await this.ledger.set(campaignId, head);
  }
}

/**
 * The decisions of a campaign, in order, after the whole log has been checked. Throws when
 * the log is broken, mis-signed or out of order: a tampered record is not partly trusted.
 */
export function trustedDecisions(record: CampaignRecord, verifier: DecisionVerifier | null): EditorialDecision[] {
  const check = verifyDecisionLog(record, verifier);
  if (!check.ok) throw new WorkflowError("decision-log-invalid", `The campaign's decision log cannot be trusted: ${check.reason}.`);
  return record.decisions;
}

/**
 * The latest decision about a subject. A later decision always supersedes an earlier one:
 * a rejection, or a request for revision, after an approval withdraws it.
 */
export function latestDecisionFor(record: CampaignRecord, subject: DecisionSubject, verifier: DecisionVerifier | null): EditorialDecision | null {
  const decisions = trustedDecisions(record, verifier);
  for (let i = decisions.length - 1; i >= 0; i--) {
    const decision = decisions[i] as EditorialDecision;
    if (decision.subject.kind === subject.kind && decision.subject.id === subject.id) return decision;
  }
  return null;
}

/**
 * What the signed decision log, and nothing else, says the editor has settled: which draft
 * holds each post, and which narrative is chosen. Status fields are a convenience for display
 * and are never consulted, because whoever can write the store can write them.
 *
 * A post is held by the draft of the latest approval for that post. A later rejection of, or
 * request to revise, that same draft empties the post. An earlier approval never comes back:
 * if the latest one no longer stands, the post is undecided. The chosen narrative is the one
 * of the latest selection, unless it was rejected afterwards.
 */
export interface SettledByLog {
  /** Post number to the approval that currently holds it. */
  approvals: Map<number, EditorialDecision>;
  selection: EditorialDecision | null;
}

export function settledByLog(record: CampaignRecord, verifier: DecisionVerifier | null): SettledByLog {
  const approvals = new Map<number, EditorialDecision>();
  let selection: EditorialDecision | null = null;
  for (const decision of trustedDecisions(record, verifier)) {
    if (decision.subject.kind === "narrative") {
      if (decision.action === "select") selection = decision;
      else if (decision.action === "reject" && selection?.subject.id === decision.subject.id) selection = null;
      continue;
    }
    if (decision.action === "approve") {
      if (decision.subjectSlot === null) continue; // not a decision this version could have signed
      // A draft holds one post at most: approving it for a post takes it out of any other.
      for (const [slot, held] of approvals) if (held.subject.id === decision.subject.id) approvals.delete(slot);
      approvals.set(decision.subjectSlot, decision);
    } else if (decision.action === "reject" || decision.action === "request-revision") {
      for (const [slot, held] of approvals) if (held.subject.id === decision.subject.id) approvals.delete(slot);
    }
  }
  return { approvals, selection };
}

/** The narrative an editor selected: the one of the latest selection in the log, on its exact text; otherwise null. */
export function selectedNarrativeOf(record: CampaignRecord, verifier: DecisionVerifier | null): Narrative | null {
  const { selection } = settledByLog(record, verifier);
  if (!selection) return null;
  const narrative = record.narratives.find((n) => n.id === selection.subject.id);
  if (!narrative) return null;
  return selection.subjectContentSha256 === narrativeContentHash(record, narrative) ? narrative : null;
}
