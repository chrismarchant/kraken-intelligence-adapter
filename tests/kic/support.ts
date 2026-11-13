import { readFileSync } from "node:fs";
import type { CampaignBrief, DecisionAction, DecisionSubject, HumanActor } from "../../src/contracts/index.ts";
import { MockJevTransport } from "../../src/evaluation/jev.ts";
import type { GenerateRequest, GenerateResult, ModelGateway } from "../../src/gateway/gateway.ts";
import { ModelOutputError } from "../../src/gateway/gateway.ts";
import type { Limits } from "../../src/limits.ts";
import { DEFAULT_LIMITS } from "../../src/limits.ts";
import { MemoryCampaignStore } from "../../src/store/store.ts";
import type { Clock } from "../../src/util/runtime.ts";
import { sequentialIds } from "../../src/util/runtime.ts";
import type { CampaignRecord } from "../../src/contracts/index.ts";
import type { CampaignStore } from "../../src/store/store.ts";
import { assembleProgramme } from "../../src/workflow/assemble.ts";
import { MemoryOperatorChannel } from "../../src/workflow/operator.ts";
import { CampaignService } from "../../src/workflow/service.ts";
import { MemoryOperatorLedger, generateDecisionKeyPair } from "../../src/workflow/signing.ts";

export const BRIEF_PATH = "fixtures/campaigns/synthetic-harbourline.brief.json";

export function syntheticBrief(): CampaignBrief {
  return JSON.parse(readFileSync(BRIEF_PATH, "utf8")) as CampaignBrief;
}

export const EDITOR: HumanActor = { kind: "human", id: "test-editor", name: "Test Editor (test actor)" };

/**
 * What the editor read before deciding: the action, subject and content hash of a request,
 * taken from the campaign record as the operator tool takes them.
 */
export async function expectedFor(service: CampaignService, campaignId: string, requestId: string) {
  const shown = await service.describeRequest(campaignId, requestId);
  return { action: shown.action, subject: shown.subject, contentSha256: shown.contentSha256 };
}

export interface DraftSpec {
  variant: string;
  approach: string;
  hook: string;
  body: string;
  callToAction: string;
  hashtags: string[];
  claims: Array<{ text: string; needsEvidence: boolean; evidenceRef: string | null }>;
}

const CTA = "What did you last check by hand before sending a report?";

export function cleanDraft(label: string, extra = ""): DraftSpec {
  // Digits in a label become letters in the post text: any number in a post must be backed by a
  // cited reference, and these scripted drafts are meant to be clean.
  const word = label.replace(/\d/g, (d) => "abcdefghij"[Number(d)] as string);
  const hook = `How much of your week goes on checking ${word} numbers?`;
  return {
    variant: label,
    approach: `Scripted ${label} approach`,
    hook,
    body: [
      hook,
      "Operations teams in logistics and warehousing know the weekly report routine. The inventory figures are there, but someone reconciles them by hand first.",
      "That is a data quality problem, and it sits in operations. It costs hours of manual reconciliation and it delays decisions.",
      extra,
      CTA,
    ]
      .filter(Boolean)
      .join("\n\n"),
    callToAction: CTA,
    hashtags: ["#Operations", "#DataQuality"],
    claims: [],
  };
}

export interface ScriptOptions {
  /** Produce the drafts for a slot. Defaults to clean drafts. */
  drafts?: (slot: number, variants: number) => DraftSpec[];
  revision?: (purpose: string) => DraftSpec;
  /** Force a wrong number of narratives, to test count checks. */
  narrativeCount?: number;
  /** Make calls whose purpose matches fail with rejected output, after "spending" tokens. */
  failPurpose?: RegExp;
  /** Delay before every answer, so that calls overlap. */
  delayMs?: number;
  /** Never answer; wait until the call is cancelled. For timeout tests. */
  hang?: boolean;
}

const usage = { promptTokens: 100, completionTokens: 400, reasoningTokens: 300 };

/** A stand-in model that answers each step from a script. Offline and deterministic. */
export class ScriptedGateway implements ModelGateway {
  readonly calls: string[] = [];
  /** Calls that were cancelled through their abort signal. */
  readonly cancelled: string[] = [];
  /** The most calls that were in flight at one moment. */
  peak = 0;
  private inFlight = 0;
  private readonly options: ScriptOptions;

  constructor(options: ScriptOptions = {}) {
    this.options = options;
  }

  async generateJson<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
    this.calls.push(request.purpose);
    this.inFlight += 1;
    this.peak = Math.max(this.peak, this.inFlight);
    try {
      // A scripted failure happens at once, so that it lands while other calls are in flight.
      if (this.options.failPurpose?.test(request.purpose)) {
        throw new ModelOutputError(request.purpose, "scripted failure", { usage, providerRequests: 3 });
      }
      if (this.options.hang || this.options.delayMs) {
        await new Promise<void>((resolve, reject) => {
          const timer = this.options.hang ? null : setTimeout(resolve, this.options.delayMs);
          request.signal?.addEventListener("abort", () => {
            if (timer) clearTimeout(timer);
            this.cancelled.push(request.purpose);
            reject(new Error("cancelled"));
          });
        });
      }
      return this.answer(request);
    } finally {
      this.inFlight -= 1;
    }
  }

  private answer<T>(request: GenerateRequest<T>): GenerateResult<T> {
    const asked = (pattern: RegExp) => Number(pattern.exec(request.user)?.[1] ?? "0");
    let value: unknown;
    if (request.purpose === "campaign-brief") {
      value = { objectiveSummary: "Objective.", audienceSummary: "Audience.", keyMessages: ["One"], risks: ["Risk"], openQuestions: ["Question?"] };
    } else if (request.purpose === "narrative-fanout") {
      const count = this.options.narrativeCount ?? asked(/exactly (\d+) alternative campaign narratives/);
      value = {
        narratives: Array.from({ length: count }, (_, i) => ({
          title: `Narrative ${i + 1}`,
          angle: `Angle ${i + 1}`,
          coreMessage: `Core message ${i + 1}`,
          supportingThemes: ["Theme A", "Theme B", "Theme C"],
          audienceFit: "Fits operations leaders.",
          evidenceRequirements: ["ref-survey"],
          risks: ["None"],
        })),
      };
    } else if (request.purpose === "programme-plan") {
      const count = asked(/exactly (\d+) LinkedIn posts/);
      value = {
        campaignObjective: "Objective.",
        coreNarrative: "Core narrative.",
        supportingThemes: ["Theme A"],
        intendedAudience: "Operations leaders.",
        slots: Array.from({ length: count }, (_, i) => ({
          theme: `Theme for post ${i + 1}`,
          intent: i === count - 1 ? "invitation" : "problem-framing",
          sequencingRationale: "Builds on the previous post.",
          callToAction: CTA,
          evidenceRequirements: [],
        })),
      };
    } else if (request.purpose.startsWith("linkedin-draft.slot-")) {
      const slot = Number(request.purpose.split("-").pop());
      const variants = asked(/exactly (\d+) alternative drafts/);
      value = { variants: this.options.drafts?.(slot, variants) ?? Array.from({ length: variants }, (_, i) => cleanDraft(`variant-${i + 1}`)) };
    } else if (request.purpose.startsWith("linkedin-revise.")) {
      value = this.options.revision?.(request.purpose) ?? cleanDraft("revised");
    } else {
      throw new Error(`ScriptedGateway has no script for "${request.purpose}".`);
    }
    return { value: request.schema.parse(value), provider: "scripted", model: "scripted-model", source: "fixture", usage, providerRequests: 1, latencyMs: 0 };
  }
}

/** A clock tests can move. Each reading advances one second unless frozen. */
export class TestClock implements Clock {
  private t = Date.parse("2026-01-05T09:00:00.000Z");

  now(): Date {
    const d = new Date(this.t);
    this.t += 1000;
    return d;
  }

  advance(ms: number): void {
    this.t += ms;
  }
}

export function makeService(options: { script?: ScriptOptions; limits?: Partial<Limits>; store?: CampaignStore } = {}) {
  const gateway = new ScriptedGateway(options.script);
  const operator = new MemoryOperatorChannel();
  const store = options.store ?? new MemoryCampaignStore();
  const clock = new TestClock();
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const ids = sequentialIds();
  // The operator's key pair. `service` holds both halves, as the operator's tool does.
  // `agentService` holds only the public half, as the agent-facing server does.
  const keys = generateDecisionKeyPair();
  // The operator's own record of each decision log, kept outside the store.
  const ledger = new MemoryOperatorLedger();
  const shared = { store, gateway, evaluator: new MockJevTransport(limits), operator, clock, ids, limits };
  const service = new CampaignService({ ...shared, signer: keys.signer, verifier: keys.verifier, ledger });
  const agentService = new CampaignService({ ...shared, signer: null, verifier: keys.verifier });
  const assemble = (record: CampaignRecord, allowPartial = false) => assembleProgramme(record, { allowPartial, clock, limits, verifier: keys.verifier });

  /** Request a decision and confirm it as the editor would, with the code from the operator channel. */
  const decide = async (campaignId: string, subject: DecisionSubject, action: DecisionAction, instruction?: string) => {
    const request = await service.requestDecision({
      campaignId,
      subject,
      action,
      proposedRationale: "Proposed by the test.",
      revisionInstruction: instruction ?? null,
      requestedBy: "test",
    });
    return service.confirmDecision({
      campaignId,
      requestId: request.requestId,
      code: operator.codeFor(request.requestId),
      actor: EDITOR,
      rationale: "Decided by the test editor.",
      expected: await expectedFor(service, campaignId, request.requestId),
    });
  };

  /** Take a campaign as far as planned, with the first narrative selected by the editor. */
  const planned = async () => {
    const campaign = await service.createCampaign(syntheticBrief());
    const narratives = await service.generateNarratives(campaign.id, 2);
    await decide(campaign.id, { kind: "narrative", id: narratives[0]!.id }, "select");
    await service.planProgramme(campaign.id);
    return campaign.id;
  };

  /** Take a campaign as far as evaluated drafts. */
  const evaluated = async (variants = 2) => {
    const id = await planned();
    await service.generateDrafts(id, { variants });
    await service.evaluateDrafts(id);
    return id;
  };

  return { service, agentService, keys, ledger, assemble, gateway, operator, store, clock, limits, decide, planned, evaluated };
}
