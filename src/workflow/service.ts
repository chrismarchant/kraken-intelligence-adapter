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
import { costOf } from "../gateway/gateway.ts";
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
import { canonicalJson, canonicalText, mapLimitSettled, randomCodes, randomIds, sha256, systemClock } from "../util/runtime.ts";
import type { DecisionNotice, OperatorChannel } from "./operator.ts";
import type { DecisionSigner, DecisionVerifier, UnsignedDecision } from "./signing.ts";
import { decisionIsAuthentic, decisionPayload } from "./signing.ts";

export const SKILL_VERSION = "0.1.0";

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
   * The operator's signing key. Present only in the operator's own process. A service
   * without it cannot record a decision when a verifier is configured.
   */
  signer?: DecisionSigner | null;
  /**
   * The operator's public key. When present, a decision counts only if it carries a valid
   * signature, however the campaign record came to say otherwise.
   */
  verifier?: DecisionVerifier | null;
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
}

/** What an agent sees of a pending decision. The confirmation code is never part of it. */
export interface DecisionRequestView {
  requestId: string;
  subject: DecisionSubject;
  action: DecisionAction;
  state: DecisionRequest["state"];
  expiresAt: string;
}

export function draftContentHash(draft: Pick<PostDraft, "hook" | "body" | "callToAction" | "hashtags">): string {
  return sha256(canonicalJson({ hook: draft.hook, body: draft.body, callToAction: draft.callToAction, hashtags: draft.hashtags }));
}

export function narrativeContentHash(narrative: Pick<Narrative, "title" | "angle" | "coreMessage">): string {
  return sha256(canonicalJson({ title: narrative.title, angle: narrative.angle, coreMessage: narrative.coreMessage }));
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

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

// Model text is canonicalised before it is clipped or stored, so that no rule downstream
// can be sidestepped with invisible or look-alike compatibility characters.
const short = (text: string) => clip(canonicalText(text), 400);
const long = (text: string) => clip(canonicalText(text), 6000);

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

  /** Refuse a step whose calls, or whose nominal token allowance, would take the campaign over budget. */
  private assertBudget(budget: BudgetUsage, calls: number, nominalTokens: number): void {
    if (budget.modelCalls + calls > this.limits.maxModelCalls) {
      throw new LimitExceededError(
        "maxModelCalls",
        `This step needs ${calls} model call(s); ${budget.modelCalls} of ${this.limits.maxModelCalls} are already used.`,
      );
    }
    if (budget.usage.completionTokens + nominalTokens > this.limits.maxCompletionTokens) {
      throw new LimitExceededError(
        "maxCompletionTokens",
        `The campaign has used ${budget.usage.completionTokens} completion tokens and this step may use ${nominalTokens} more; ` +
          `the limit is ${this.limits.maxCompletionTokens}.`,
      );
    }
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
   *    the latest record, check the budget, and charge the calls. A step that cannot afford
   *    its calls never starts, and two steps started together cannot both spend the same
   *    remaining budget.
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
    const { context, requests } = await this.mutate(spec.campaignId, (record) => {
      const prepared = spec.prepare(record);
      this.assertBudget(record.budget, prepared.requests.length, prepared.requests.reduce((sum, r) => sum + r.maxTokens, 0));
      record.budget.modelCalls += prepared.requests.length;
      return prepared;
    });

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

    type Outcome = { ok: true; value: O } | { ok: false; error: unknown };
    const outcome = await this.mutate(spec.campaignId, (record): Outcome => {
      this.addCosts(record, costs);
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

  /** True when a decision in the record can be relied on (see signing.ts). */
  private authentic(record: CampaignRecord, decision: EditorialDecision): boolean {
    return decisionIsAuthentic(record.id, decision, this.verifier);
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
      budget: { modelCalls: 0, providerRequests: 0, usage: { promptTokens: 0, completionTokens: 0, reasoningTokens: 0 } },
      audit: [{ at, event: "campaign-created", detail: `Brief accepted (${slots} posts planned, synthetic: ${brief.synthetic}).` }],
    };
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
          context: { narrativeId: narrative.id, narrativeHash: narrativeContentHash(narrative), slotCount },
          requests: [{ purpose: "programme-plan", user: planPrompt(record.brief, narrative, slotCount), schema: PlanOutput, schemaName: "programme_plan", maxTokens: 10000 }],
        };
      },
      commit: (record, [result], context) => {
        // The editor's selection must still stand, on the same text, when the plan is stored.
        const narrative = selected(record);
        if (narrative.id !== context.narrativeId || narrativeContentHash(narrative) !== context.narrativeHash) {
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
      body: canonicalText(variant.body).trim(),
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

  /** Write alternative drafts for the given slots (all slots without drafts by default). */
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
        const numbers = options.slots ?? plan.slots.filter((s) => liveCount(record, s.slot) === 0).map((s) => s.slot);
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
            maxTokens: 12000,
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
      const hash = draftContentHash(draft);
      const instruction = [...record.decisions]
        .reverse()
        .find((d) => d.action === "request-revision" && d.subject.id === draftId && d.subjectContentSha256 === hash && this.authentic(record, d));
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
      try {
        return await this.mutate(campaignId, (record) => {
          if (record.revision !== before.revision) throw new RetryUpdate();
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
      return narrativeContentHash(narrative);
    }

    const draft = record.drafts.find((d) => d.id === subject.id);
    if (!draft) throw new WorkflowError("unknown-draft", `No draft ${subject.id} in this campaign.`);
    if (draft.status === "superseded") throw new WorkflowError("draft-superseded", `Draft ${subject.id} was superseded by a revision.`);
    if (draft.status === "rejected") throw new WorkflowError("draft-rejected", `Draft ${subject.id} was rejected.`);
    if (action === "approve") {
      if (draft.status === "approved") throw new WorkflowError("already-approved", `Draft ${subject.id} is already approved.`);
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
    return draftContentHash(draft);
  }

  /** What the editor is shown: the content itself, not the requester's description of it. */
  private noticeContent(record: CampaignRecord, subject: DecisionSubject): DecisionNotice["content"] {
    if (subject.kind === "narrative") {
      const narrative = record.narratives.find((n) => n.id === subject.id) as Narrative;
      return { kind: "narrative", title: narrative.title, text: `${narrative.angle}\n\nCore message: ${narrative.coreMessage}`, hashtags: [], eligibilityFailures: [], evaluation: null };
    }
    const draft = record.drafts.find((d) => d.id === subject.id) as PostDraft;
    const failures = analyseDraft(record.brief, this.slotOf(record, draft.slot), draft, this.limits).failures;
    const evaluation = this.latestEvaluationFor(record, draft.id);
    const candidate = evaluation?.candidates.find((c) => c.draftId === draft.id);
    return {
      kind: "draft",
      title: `Post ${draft.slot}, ${draft.variant}`,
      text: draft.body,
      hashtags: draft.hashtags,
      eligibilityFailures: failures.map((f) => `${f.rule}: ${f.detail}`),
      evaluation:
        evaluation && candidate
          ? `Ranked ${evaluation.ranking.indexOf(draft.id) + 1} of ${evaluation.ranking.length} by ${evaluation.evaluator.kind} (total ${Math.round(candidate.weightedTotal * 100)}/100).`
          : null,
    };
  }

  /**
   * Ask a person to make an editorial decision. Nothing changes until that person confirms
   * through the operator's tool. The one-time code and the content to be decided on are
   * delivered to the operator channel; the code is never returned here.
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

    const { request, notice } = await this.mutate(input.campaignId, (record) => {
      const contentHash = this.checkDecision(record, input.subject, input.action);
      const waiting = record.decisionRequests.filter((r) => r.state === "pending" && Date.parse(r.expiresAt) >= Date.parse(requestedAt)).length;
      if (waiting >= this.limits.maxPendingDecisions) {
        throw new LimitExceededError("maxPendingDecisions", `${waiting} decisions are already waiting for the editor; the limit is ${this.limits.maxPendingDecisions}.`);
      }
      const created: DecisionRequest = {
        id: this.ids.next("req"),
        subject: input.subject,
        action: input.action,
        proposedRationale: rationale.data,
        revisionInstruction,
        requestedBy: short(input.requestedBy || "unknown"),
        requestedAt,
        expiresAt,
        subjectContentSha256: contentHash,
        codeHash: sha256(code),
        failedAttempts: 0,
        state: "pending",
      };
      record.decisionRequests.push(created);
      this.audit(record, "decision-requested", `${created.id}: ${input.action} ${input.subject.kind} ${input.subject.id}, requested by ${created.requestedBy}.`);
      const delivered: DecisionNotice = {
        requestId: created.id,
        campaignId: record.id,
        subject: input.subject,
        action: input.action,
        summary: `${input.action} ${input.subject.kind} ${input.subject.id}`,
        proposedRationale: rationale.data,
        revisionInstruction,
        requestedBy: created.requestedBy,
        content: this.noticeContent(record, input.subject),
        contentSha256: contentHash,
        code,
        expiresAt,
      };
      return { request: created, notice: delivered };
    });

    try {
      await this.operator.deliver(notice);
    } catch {
      // A request the editor never received must not stay open.
      await this.mutate(input.campaignId, (record) => {
        const stored = record.decisionRequests.find((r) => r.id === request.id);
        if (stored && stored.state === "pending") stored.state = "voided";
        this.audit(record, "decision-undelivered", `${request.id}: the operator channel could not be reached; request voided.`);
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
   * Record a person's decision. Requires the one-time code that only the operator received
   * and, when decisions are signed, the operator's key: a process without that key (the
   * agent-facing server) cannot record a decision at all.
   */
  async confirmDecision(input: DecisionConfirmation): Promise<EditorialDecision> {
    if (this.verifier !== null && this.signer === null) {
      throw new WorkflowError("cannot-record-decisions", "This process does not hold the operator's key. Decisions are recorded with the operator tool.");
    }
    const actor = HumanActorSchema.safeParse(input.actor);
    if (!actor.success) throw new WorkflowError("invalid-actor", "A decision must name the person making it (kind: human, id, name).");
    const rationale = ShortText.safeParse(input.rationale);
    if (!rationale.success) throw new WorkflowError("invalid-rationale", "The editor must give a reason of 1 to 400 characters.");

    // A wrong code must be recorded even though the call fails, so the outcome is decided
    // inside the write and the error is thrown after it.
    type Outcome = { ok: true; decision: EditorialDecision } | { ok: false; error: WorkflowError };
    const outcome = await this.mutate(input.campaignId, (record): Outcome => {
      const decidedAt = this.now();
      const opened = this.openRequest(record, input.requestId, input.code, decidedAt);
      if ("error" in opened) return { ok: false, error: opened.error };
      const request = opened.request;
      let contentHash: string;
      try {
        contentHash = this.checkDecision(record, request.subject, request.action);
        // The editor was shown particular text. If it has changed since, the request is void.
        if (contentHash !== request.subjectContentSha256) {
          throw new WorkflowError("subject-changed", `The ${request.subject.kind} changed after decision ${request.id} was requested.`);
        }
      } catch (error) {
        if (!(error instanceof WorkflowError)) throw error;
        request.state = "voided";
        this.audit(record, "decision-voided", `${request.id}: no longer possible (${error.code}).`);
        return { ok: false, error };
      }
      const unsigned: UnsignedDecision = {
        id: this.ids.next("dec"),
        requestId: request.id,
        subject: request.subject,
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
      return { ok: true, decision };
    });
    if (!outcome.ok) throw outcome.error;
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
        // The draft stays as it is; reviseDraft acts on the recorded instruction.
        break;
    }
  }

  async pendingDecisions(campaignId: string): Promise<DecisionRequestView[]> {
    const record = await this.store.get(campaignId);
    return record.decisionRequests
      .filter((r) => r.state === "pending")
      .map((r) => ({ requestId: r.id, subject: r.subject, action: r.action, state: r.state, expiresAt: r.expiresAt }));
  }
}

/**
 * The latest decision about a subject, counting only decisions that can be relied on.
 * A later decision always supersedes an earlier one, so a rejection after an approval wins.
 */
export function latestDecisionFor(record: CampaignRecord, subject: DecisionSubject, verifier: DecisionVerifier | null): EditorialDecision | null {
  for (let i = record.decisions.length - 1; i >= 0; i--) {
    const decision = record.decisions[i] as EditorialDecision;
    if (decision.subject.kind !== subject.kind || decision.subject.id !== subject.id) continue;
    if (decision.action === "request-revision") continue;
    if (!decisionIsAuthentic(record.id, decision, verifier)) continue;
    return decision;
  }
  return null;
}

/** The narrative an editor selected, backed by a valid decision on its exact text; otherwise null. */
export function selectedNarrativeOf(record: CampaignRecord, verifier: DecisionVerifier | null): Narrative | null {
  for (const narrative of record.narratives) {
    if (narrative.status !== "selected") continue;
    const decision = latestDecisionFor(record, { kind: "narrative", id: narrative.id }, verifier);
    if (decision?.action === "select" && decision.subjectContentSha256 === narrativeContentHash(narrative)) return narrative;
  }
  return null;
}
