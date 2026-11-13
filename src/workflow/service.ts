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
import type { GenerateRequest, GenerateResult, ModelGateway } from "../gateway/gateway.ts";
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
import { canonicalJson, mapLimit, randomCodes, randomIds, sha256, systemClock } from "../util/runtime.ts";
import type { OperatorChannel } from "./operator.ts";

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

const short = (text: string) => clip(text, 400);
const long = (text: string) => clip(text, 6000);
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

  /** Read, change and write a record. The change is applied to the latest stored revision. */
  private async mutate<T>(campaignId: string, change: (record: CampaignRecord) => T): Promise<T> {
    const record = await this.store.get(campaignId);
    const result = change(record);
    record.revision += 1;
    record.updatedAt = this.now();
    await this.store.put(record);
    return result;
  }

  private audit(record: CampaignRecord, event: string, detail: string): void {
    record.audit.push({ at: this.now(), event: short(event), detail: clip(detail, 1000) });
  }

  private assertBudget(budget: BudgetUsage, callsNeeded: number): void {
    if (budget.modelCalls + callsNeeded > this.limits.maxModelCalls) {
      throw new LimitExceededError(
        "maxModelCalls",
        `This step needs ${callsNeeded} model call(s); ${budget.modelCalls} of ${this.limits.maxModelCalls} are already used.`,
      );
    }
    if (budget.usage.completionTokens >= this.limits.maxCompletionTokens) {
      throw new LimitExceededError(
        "maxCompletionTokens",
        `The campaign has used ${budget.usage.completionTokens} completion tokens; the limit is ${this.limits.maxCompletionTokens}.`,
      );
    }
  }

  private charge(record: CampaignRecord, results: ReadonlyArray<GenerateResult<unknown>>): void {
    for (const result of results) {
      record.budget.modelCalls += 1;
      record.budget.usage.promptTokens += result.usage.promptTokens;
      record.budget.usage.completionTokens += result.usage.completionTokens;
      record.budget.usage.reasoningTokens += result.usage.reasoningTokens;
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

  private async call<T>(request: Omit<GenerateRequest<T>, "system">): Promise<GenerateResult<T>> {
    const timeout = new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new LimitExceededError("modelCallTimeoutMs", `Model call for "${request.purpose}" exceeded ${this.limits.modelCallTimeoutMs} ms.`)),
        this.limits.modelCallTimeoutMs,
      );
      timer.unref();
    });
    return Promise.race([this.gateway.generateJson({ ...request, system: systemPrompt }), timeout]);
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
      budget: { modelCalls: 0, usage: { promptTokens: 0, completionTokens: 0, reasoningTokens: 0 } },
      audit: [{ at, event: "campaign-created", detail: `Brief accepted (${slots} posts planned, synthetic: ${brief.synthetic}).` }],
    };
    await this.store.create(record);
    return record;
  }

  async interpretBrief(campaignId: string): Promise<BriefInterpretation> {
    const before = await this.store.get(campaignId);
    this.assertBudget(before.budget, 1);
    const result = await this.call({
      purpose: "campaign-brief",
      user: interpretPrompt(before.brief),
      schema: InterpretationOutput,
      schemaName: "brief_interpretation",
      maxTokens: 8000,
    });
    const interpretation = BriefInterpretation.parse({
      objectiveSummary: long(result.value.objectiveSummary),
      audienceSummary: long(result.value.audienceSummary),
      keyMessages: shortList(result.value.keyMessages, 8),
      risks: shortList(result.value.risks, 8),
      openQuestions: shortList(result.value.openQuestions, 8),
    });
    return this.mutate(campaignId, (record) => {
      this.charge(record, [result]);
      record.interpretation = interpretation;
      this.audit(record, "brief-interpreted", `${interpretation.openQuestions.length} open questions raised.`);
      return interpretation;
    });
  }

  // --- step 2: narratives and plan ---------------------------------------------------

  async generateNarratives(campaignId: string, count = 3): Promise<Narrative[]> {
    const before = await this.store.get(campaignId);
    if (!Number.isInteger(count) || count < 2) throw new WorkflowError("invalid-count", "Ask for at least two narratives.");
    if (before.narratives.length + count > this.limits.maxNarratives) {
      throw new LimitExceededError(
        "maxNarratives",
        `${before.narratives.length} narratives exist; ${count} more would exceed the limit of ${this.limits.maxNarratives}.`,
      );
    }
    if (before.plan) throw new WorkflowError("plan-exists", "A programme plan already exists for this campaign.");
    this.assertBudget(before.budget, 1);

    const result = await this.call({
      purpose: "narrative-fanout",
      user: narrativePrompt(before.brief, before.interpretation, count),
      schema: NarrativeOutput,
      schemaName: "narrative_alternatives",
      maxTokens: 10000,
    });
    if (result.value.narratives.length !== count) {
      throw new WorkflowError("model-count-mismatch", `Asked for ${count} narratives; the model returned ${result.value.narratives.length}.`);
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
    return this.mutate(campaignId, (record) => {
      this.charge(record, [result]);
      record.narratives.push(...narratives);
      this.audit(record, "narratives-generated", `${narratives.length} alternatives: ${narratives.map((n) => n.id).join(", ")}.`);
      return narratives;
    });
  }

  async planProgramme(campaignId: string): Promise<ProgrammePlan> {
    const before = await this.store.get(campaignId);
    if (before.plan) throw new WorkflowError("plan-exists", "A programme plan already exists for this campaign.");
    const narrative = before.narratives.find((n) => n.status === "selected");
    if (!narrative) {
      throw new WorkflowError("no-narrative-selected", "An editor must select a narrative before a programme can be planned.");
    }
    this.assertBudget(before.budget, 1);
    const slotCount = before.brief.cadence.postsPerWeek * before.brief.cadence.weeks;

    const result = await this.call({
      purpose: "programme-plan",
      user: planPrompt(before.brief, narrative, slotCount),
      schema: PlanOutput,
      schemaName: "programme_plan",
      maxTokens: 10000,
    });
    if (result.value.slots.length !== slotCount) {
      throw new WorkflowError("model-count-mismatch", `Asked for ${slotCount} posts; the model planned ${result.value.slots.length}.`);
    }
    const perWeek = before.brief.cadence.postsPerWeek;
    const plan = ProgrammePlan.parse({
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
    return this.mutate(campaignId, (record) => {
      if (record.plan) throw new WorkflowError("plan-exists", "A programme plan already exists for this campaign.");
      this.charge(record, [result]);
      record.plan = plan;
      this.audit(record, "programme-planned", `${plan.slots.length} posts planned on narrative ${narrative.id}.`);
      return plan;
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
    return PostDraftSchema.parse({
      id: this.ids.next("draft"),
      slot: slot.slot,
      narrativeId,
      variant: short(variant.variant),
      approach: short(variant.approach),
      hook: short(variant.hook),
      body: variant.body.trim(),
      callToAction: short(variant.callToAction),
      hashtags: normaliseHashtags(variant.hashtags),
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
  }

  /** Write alternative drafts for the given slots (all slots without drafts by default). */
  async generateDrafts(campaignId: string, options: { slots?: number[]; variants?: number } = {}): Promise<PostDraft[]> {
    const before = await this.store.get(campaignId);
    const plan = before.plan;
    if (!plan) throw new WorkflowError("no-plan", "Plan the programme before drafting posts.");
    const variants = options.variants ?? 2;
    if (!Number.isInteger(variants) || variants < 2) {
      throw new WorkflowError("invalid-count", "Ask for at least two variants per post so the editor has a choice.");
    }
    const liveCount = (slot: number) =>
      before.drafts.filter((d) => d.slot === slot && d.status !== "superseded" && d.revisionOf === null).length;
    const targets = (options.slots ?? plan.slots.filter((s) => liveCount(s.slot) === 0).map((s) => s.slot)).map((n) =>
      this.slotOf(before, n),
    );
    if (targets.length === 0) throw new WorkflowError("nothing-to-draft", "Every slot already has drafts. Name the slots to draft again.");
    for (const slot of targets) {
      if (liveCount(slot.slot) + variants > this.limits.maxVariantsPerSlot) {
        throw new LimitExceededError(
          "maxVariantsPerSlot",
          `Slot ${slot.slot} has ${liveCount(slot.slot)} drafts; ${variants} more would exceed the limit of ${this.limits.maxVariantsPerSlot}.`,
        );
      }
    }
    this.assertBudget(before.budget, targets.length);

    // Bounded fan-out: one call per slot, a fixed number in flight.
    const results = await mapLimit(targets, this.limits.maxConcurrency, (slot) =>
      this.call({
        purpose: `linkedin-draft.slot-${slot.slot}`,
        user: draftPrompt(before.brief, plan, slot, variants),
        schema: DraftOutput,
        schemaName: "post_drafts",
        maxTokens: 12000,
      }),
    );
    const drafts: PostDraft[] = [];
    results.forEach((result, index) => {
      const slot = targets[index] as ProgrammeSlot;
      if (result.value.variants.length !== variants) {
        throw new WorkflowError("model-count-mismatch", `Asked for ${variants} variants for slot ${slot.slot}; got ${result.value.variants.length}.`);
      }
      const generation = this.meta("linkedin-draft", result);
      for (const variant of result.value.variants) drafts.push(this.toDraft(variant, slot, plan.narrativeId, generation, null));
    });
    return this.mutate(campaignId, (record) => {
      this.charge(record, results);
      record.drafts.push(...drafts);
      this.audit(record, "drafts-generated", `${drafts.length} drafts for slots ${targets.map((s) => s.slot).join(", ")}.`);
      return drafts;
    });
  }

  /** Revise a draft. Allowed only after an editor asked for it, and only a bounded number of times. */
  async reviseDraft(campaignId: string, draftId: string): Promise<PostDraft> {
    const before = await this.store.get(campaignId);
    const draft = before.drafts.find((d) => d.id === draftId);
    if (!draft) throw new WorkflowError("unknown-draft", `No draft ${draftId} in this campaign.`);
    if (draft.status === "superseded" || draft.status === "rejected") {
      throw new WorkflowError("draft-not-revisable", `Draft ${draftId} is ${draft.status}.`);
    }
    const instruction = [...before.decisions]
      .reverse()
      .find((d) => d.action === "request-revision" && d.subject.id === draftId && d.subjectContentSha256 === draftContentHash(draft));
    if (!instruction?.revisionInstruction) {
      throw new WorkflowError("no-revision-requested", `No editor has asked for draft ${draftId} to be revised.`);
    }
    if (draft.revisionPass >= this.limits.maxRevisionPasses) {
      throw new LimitExceededError("maxRevisionPasses", `Draft ${draftId} has reached the limit of ${this.limits.maxRevisionPasses} revision passes.`);
    }
    this.assertBudget(before.budget, 1);
    const slot = this.slotOf(before, draft.slot);

    const result = await this.call({
      purpose: `linkedin-revise.${draftId}`,
      user: revisionPrompt(before.brief, slot, draft, instruction.revisionInstruction),
      schema: RevisionOutput,
      schemaName: "post_revision",
      maxTokens: 12000,
    });
    const revised = this.toDraft(result.value, slot, draft.narrativeId, this.meta("linkedin-draft", result), {
      of: draft.id,
      pass: draft.revisionPass + 1,
    });
    return this.mutate(campaignId, (record) => {
      this.charge(record, [result]);
      const original = record.drafts.find((d) => d.id === draftId);
      if (original) original.status = "superseded";
      record.drafts.push(revised);
      this.audit(record, "draft-revised", `${draftId} superseded by ${revised.id} (pass ${revised.revisionPass}) on decision ${instruction.id}.`);
      return revised;
    });
  }

  // --- step 4: comparative evaluation ---------------------------------------------------

  /** Evaluate the live drafts of each slot (all slots with drafts by default). */
  async evaluateDrafts(campaignId: string, options: { slots?: number[] } = {}): Promise<Evaluation[]> {
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
    return this.mutate(campaignId, (record) => {
      record.evaluations.push(...evaluations);
      this.audit(record, "drafts-evaluated", `Slots ${slots.map((s) => s.slot).join(", ")} evaluated by ${this.evaluator.kind} (live: ${this.evaluator.live}).`);
      return evaluations;
    });
  }

  /** The most recent evaluation that covers a draft, if any. */
  private latestEvaluationFor(record: CampaignRecord, draftId: string): Evaluation | undefined {
    return [...record.evaluations].reverse().find((e) => e.candidates.some((c) => c.draftId === draftId));
  }

  // --- step 5: editorial decisions -------------------------------------------------------

  /**
   * Check that a decision is possible in the campaign's current state. Run when a decision
   * is requested and again when it is confirmed, because the state may have moved between.
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

  /**
   * Ask a person to make an editorial decision. Nothing changes until that person confirms
   * with the one-time code, which is delivered to the operator channel and never returned here.
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
      this.checkDecision(record, input.subject, input.action);
      const created: DecisionRequest = {
        id: this.ids.next("req"),
        subject: input.subject,
        action: input.action,
        proposedRationale: rationale.data,
        revisionInstruction,
        requestedBy: short(input.requestedBy || "unknown"),
        requestedAt,
        expiresAt,
        codeHash: sha256(code),
        failedAttempts: 0,
        state: "pending",
      };
      record.decisionRequests.push(created);
      this.audit(record, "decision-requested", `${created.id}: ${input.action} ${input.subject.kind} ${input.subject.id}, requested by ${created.requestedBy}.`);
      return created;
    });

    await this.operator.deliver({
      requestId: request.id,
      campaignId: input.campaignId,
      subject: input.subject,
      action: input.action,
      summary: `${input.action} ${input.subject.kind} ${input.subject.id}. Proposed because: ${rationale.data}`,
      code,
      expiresAt,
    });
    return { requestId: request.id, subject: request.subject, action: request.action, state: request.state, expiresAt };
  }

  /** Record a person's decision. Requires the one-time code that only the operator received. */
  async confirmDecision(input: DecisionConfirmation): Promise<EditorialDecision> {
    const actor = HumanActorSchema.safeParse(input.actor);
    if (!actor.success) throw new WorkflowError("invalid-actor", "A decision must name the person making it (kind: human, id, name).");
    const rationale = ShortText.safeParse(input.rationale);
    if (!rationale.success) throw new WorkflowError("invalid-rationale", "The editor must give a reason of 1 to 400 characters.");

    // A wrong code must be recorded even though the call fails, so the outcome is decided
    // inside the write and the error is thrown after it.
    type Outcome = { ok: true; decision: EditorialDecision } | { ok: false; error: WorkflowError };
    const outcome = await this.mutate(input.campaignId, (record): Outcome => {
      const request = record.decisionRequests.find((r) => r.id === input.requestId);
      if (!request) return { ok: false, error: new WorkflowError("unknown-request", `No decision request ${input.requestId}.`) };
      if (request.state !== "pending") {
        return { ok: false, error: new WorkflowError("request-not-pending", `Decision request ${request.id} is ${request.state}.`) };
      }
      const decidedAt = this.now();
      if (Date.parse(decidedAt) > Date.parse(request.expiresAt)) {
        request.state = "expired";
        this.audit(record, "decision-expired", `${request.id} expired before it was confirmed.`);
        return { ok: false, error: new WorkflowError("request-expired", `Decision request ${request.id} has expired.`) };
      }
      if (!codesMatch(request.codeHash, input.code)) {
        request.failedAttempts += 1;
        const voided = request.failedAttempts >= this.limits.maxDecisionCodeAttempts;
        if (voided) request.state = "voided";
        this.audit(record, "decision-code-rejected", `${request.id}: wrong code (attempt ${request.failedAttempts})${voided ? "; request voided" : ""}.`);
        return {
          ok: false,
          error: new WorkflowError("invalid-code", voided ? `Wrong code. Decision request ${request.id} is now void.` : "Wrong confirmation code."),
        };
      }
      let contentHash: string;
      try {
        contentHash = this.checkDecision(record, request.subject, request.action);
      } catch (error) {
        if (!(error instanceof WorkflowError)) throw error;
        request.state = "voided";
        this.audit(record, "decision-voided", `${request.id}: no longer possible (${error.code}).`);
        return { ok: false, error };
      }
      const decision: EditorialDecision = {
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
      request.state = "confirmed";
      record.decisions.push(decision);
      this.apply(record, decision);
      this.audit(record, "decision-recorded", `${decision.id}: ${actor.data.name} chose ${decision.action} for ${decision.subject.kind} ${decision.subject.id}.`);
      return { ok: true, decision };
    });
    if (!outcome.ok) throw outcome.error;
    return outcome.decision;
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
