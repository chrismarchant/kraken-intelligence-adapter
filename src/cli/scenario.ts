import { readFile } from "node:fs/promises";
import type { CampaignRecord, DecisionAction, DecisionSubject, HumanActor, ProgrammePackage } from "../contracts/index.ts";
import { createJevTransport } from "../evaluation/jev.ts";
import type { ModelGateway } from "../gateway/gateway.ts";
import { DEFAULT_LIMITS } from "../limits.ts";
import { MemoryCampaignStore } from "../store/store.ts";
import type { CampaignStore } from "../store/store.ts";
import { fixedClock, sequentialIds } from "../util/runtime.ts";
import type { ExportResult } from "../workflow/assemble.ts";
import { assembleProgramme, exportProgramme, releaseProgramme } from "../workflow/assemble.ts";
import { comparisonMarkdown } from "../workflow/comparison.ts";
import { MemoryOperatorChannel } from "../workflow/operator.ts";
import { CampaignService } from "../workflow/service.ts";
import type { DecisionKeyPair } from "../workflow/signing.ts";
import { MemoryOperatorLedger, generateDecisionKeyPair } from "../workflow/signing.ts";

/**
 * The scripted stand-in for the editor in the synthetic scenario. It is labelled as such in
 * every record it produces. It confirms decisions the same way a person would: with the
 * one-time code read from the operator channel.
 */
export const SYNTHETIC_EDITOR: HumanActor = {
  kind: "human",
  id: "synthetic-editor",
  name: "Synthetic Editor (scripted test actor, not a real person)",
};

export interface ScenarioOptions {
  gateway: ModelGateway;
  briefPath: string;
  exportRoot: string;
  store?: CampaignStore;
  narratives?: number;
  variants?: number;
  /** The operator key for this run. A fresh one is generated when none is given. */
  keys?: DecisionKeyPair;
  log?: (line: string) => void;
}

export interface ScenarioResult {
  record: CampaignRecord;
  package: ProgrammePackage;
  export: ExportResult;
  comparison: string;
  steps: string[];
}

/**
 * Run the whole campaign-preparation workflow on a synthetic brief:
 * brief → interpretation → narrative alternatives → selection → programme plan →
 * draft alternatives → comparative evaluation → rejection, revision and approval →
 * programme package with NON-EXECUTABLE provisional commands.
 */
export async function runSyntheticCampaign(options: ScenarioOptions): Promise<ScenarioResult> {
  const steps: string[] = [];
  const log = (line: string) => {
    steps.push(line);
    options.log?.(line);
  };
  const clock = fixedClock();
  const operator = new MemoryOperatorChannel();
  const store = options.store ?? new MemoryCampaignStore();
  // The scripted editor holds the operator key, as the operator's tool would.
  const keys = options.keys ?? generateDecisionKeyPair();
  const service = new CampaignService({
    signer: keys.signer,
    verifier: keys.verifier,
    ledger: new MemoryOperatorLedger(),
    store,
    gateway: options.gateway,
    evaluator: createJevTransport("mock-jev", DEFAULT_LIMITS),
    operator,
    clock,
    ids: sequentialIds(),
  });

  const decide = async (campaignId: string, subject: DecisionSubject, action: DecisionAction, rationale: string, revisionInstruction?: string) => {
    const request = await service.requestDecision({
      campaignId,
      subject,
      action,
      proposedRationale: rationale,
      revisionInstruction: revisionInstruction ?? null,
      requestedBy: "synthetic-scenario",
    });
    // The scripted editor does what the operator tool does: reads the request from the record,
    // then confirms exactly what it read.
    const shown = await service.describeRequest(campaignId, request.requestId);
    return service.confirmDecision({
      campaignId,
      requestId: request.requestId,
      code: operator.codeFor(request.requestId),
      actor: SYNTHETIC_EDITOR,
      rationale,
      expected: { digest: shown.digest },
    });
  };

  const brief: unknown = JSON.parse(await readFile(options.briefPath, "utf8"));
  const created = await service.createCampaign(brief);
  const id = created.id;
  log(`1. Brief accepted: campaign ${id} (${created.brief.client.name}).`);

  const interpretation = await service.interpretBrief(id);
  log(`   Interpretation: ${interpretation.keyMessages.length} key messages, ${interpretation.openQuestions.length} open questions.`);

  const narratives = await service.generateNarratives(id, options.narratives ?? 3);
  log(`2. ${narratives.length} narrative alternatives: ${narratives.map((n) => `${n.id} "${n.title}"`).join("; ")}.`);
  const chosen = narratives[0];
  const declined = narratives[narratives.length - 1];
  if (!chosen || !declined) throw new Error("The scenario needs at least two narratives.");
  await decide(id, { kind: "narrative", id: declined.id }, "reject", "Scripted: declined to show that rejection is recorded.");
  await decide(id, { kind: "narrative", id: chosen.id }, "select", "Scripted: first alternative selected for the test run.");
  log(`   Editor selected ${chosen.id} and rejected ${declined.id}.`);

  const plan = await service.planProgramme(id);
  log(`   Programme planned: ${plan.slots.length} posts over ${created.brief.cadence.weeks} weeks.`);

  const drafts = await service.generateDrafts(id, { variants: options.variants ?? 2 });
  log(`3. ${drafts.length} drafts written (${options.variants ?? 2} alternatives per post).`);

  let evaluations = await service.evaluateDrafts(id);
  log(`4. ${evaluations.length} slots evaluated by ${evaluations[0]?.evaluator.kind} (live: ${evaluations[0]?.evaluator.live}).`);

  // Step 5: the editor rejects, asks for a revision, and approves.
  const firstSlot = evaluations[0];
  if (firstSlot && firstSlot.ranking.length > 1) {
    const last = firstSlot.ranking[firstSlot.ranking.length - 1] as string;
    await decide(id, { kind: "draft", id: last }, "reject", "Scripted: lowest-ranked alternative for the first post declined.");
    log(`5. Editor rejected ${last}.`);
  }
  const secondSlot = evaluations[1];
  if (secondSlot) {
    const target = secondSlot.ranking[0] as string;
    await decide(
      id,
      { kind: "draft", id: target },
      "request-revision",
      "Scripted: revision requested to exercise the bounded revision pass.",
      "Make the opening line shorter and end with a question to the reader.",
    );
    const revised = await service.reviseDraft(id, target);
    await service.evaluateDrafts(id, { slots: [secondSlot.slot] });
    log(`   Editor asked for a revision of ${target}; revised as ${revised.id} and re-evaluated.`);
  }

  let record = await service.getCampaign(id);
  const approved: string[] = [];
  const pending: number[] = [];
  for (const slot of record.plan?.slots ?? []) {
    const evaluation = [...record.evaluations].reverse().find((e) => e.slot === slot.slot);
    const live = new Set(record.drafts.filter((d) => d.slot === slot.slot && d.status !== "rejected" && d.status !== "superseded").map((d) => d.id));
    const pick = evaluation?.ranking.find((draftId) => live.has(draftId) && evaluation.candidates.find((c) => c.draftId === draftId)?.eligibility.eligible);
    if (!pick) {
      pending.push(slot.slot);
      continue;
    }
    await decide(id, { kind: "draft", id: pick }, "approve", "Scripted: highest-ranked eligible alternative approved for the test run.");
    approved.push(pick);
  }
  log(`   Editor approved ${approved.length} drafts: ${approved.join(", ")}.${pending.length ? ` Slots ${pending.join(", ")} left pending: no eligible draft.` : ""}`);

  record = await service.getCampaign(id);
  evaluations = record.evaluations;
  const comparison = comparisonMarkdown(record);
  const preview = assembleProgramme(record, { allowPartial: pending.length > 0, clock, limits: service.limits, verifier: keys.verifier });
  // The editor releases the package: the decision log is checked against the operator's ledger, then the package is signed.
  const pkg = releaseProgramme(preview, {
    actor: SYNTHETIC_EDITOR,
    rationale: "Scripted: released for the test run.",
    logHead: await service.decisionLogHead(id),
    sign: (statement) => service.signRelease(statement),
    clock,
  });
  const exported = await exportProgramme(pkg, options.exportRoot);
  log(
    `6. Programme ${pkg.programmeId} assembled (${pkg.approvalState}) and released by the editor: ${pkg.provisionalCommands.length} provisional commands, all ${pkg.provisionalCommands[0]?.status}.`,
  );
  log(
    `   Model steps: ${record.budget.modelCalls}; provider requests: ${record.budget.providerRequests}; prompt tokens: ${record.budget.usage.promptTokens}; ` +
      `completion tokens: ${record.budget.usage.completionTokens} (reasoning ${record.budget.usage.reasoningTokens}).`,
  );
  return { record, package: pkg, export: exported, comparison, steps };
}
