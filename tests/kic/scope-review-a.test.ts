// Regression tests for scope-completing review A of commit 2537386
// (docs/review/2026-11-13-scope-review-a-2537386.md). Each test is named for the finding it closes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { PostDraft, ProgrammeSlot } from "../../src/contracts/index.ts";
import { ProvisionalPublishCommand } from "../../src/contracts/command.ts";
import { GenerationMeta } from "../../src/contracts/common.ts";
import { MAX_POSTS_IN_A_PLAN, ProgrammePlan } from "../../src/contracts/content.ts";
import { rankCreators } from "../../src/creators/ranking.ts";
import { DEFAULT_CRITERIA } from "../../src/evaluation/criteria.ts";
import { buildJevRequest } from "../../src/evaluation/jev.ts";
import { analyseDraft } from "../../src/evaluation/signals.ts";
import { DEFAULT_LIMITS } from "../../src/limits.ts";
import { canonicalText } from "../../src/util/runtime.ts";
import { clip } from "../../src/workflow/service.ts";
import { cleanDraft, syntheticBrief } from "./support.ts";

const slot: ProgrammeSlot = {
  slot: 1,
  week: 1,
  orderInWeek: 1,
  theme: "The weekly report",
  intent: "problem-framing",
  sequencingRationale: "Opens the programme.",
  callToAction: "What did you last check by hand before sending a report?",
  evidenceRequirements: [],
};
const generation = {
  provider: "scripted",
  model: "scripted-model",
  skill: "linkedin-draft",
  skillVersion: "0.1.0",
  promptVersion: "test",
  source: "fixture" as const,
  generatedAt: "2026-01-05T09:00:00.000Z",
  usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 },
};
function draft(id: string, extra = "", overrides: Partial<PostDraft> = {}): PostDraft {
  return { id, slot: 1, narrativeId: "nar-001", status: "candidate", revisionOf: null, revisionPass: 0, generation, ...cleanDraft(id, extra), ...overrides };
}
/** The rules a draft fails, under a brief that rules out the given terms. */
function rulesWith(mustAvoid: string[], text: string, overrides: Partial<PostDraft> = {}): string[] {
  const brief = syntheticBrief();
  brief.constraints.mustAvoid = mustAvoid;
  return analyseDraft(brief, slot, draft("d", text, overrides), DEFAULT_LIMITS).failures.map((f) => f.rule).sort();
}

test("F1: a ruled-out term written wholly in Greek or Cyrillic look-alike letters is found", () => {
  // Latin, to show the term is ruled out at all.
  assert.deepEqual(rulesWith(["AI"], "Our AI-powered tool helps."), ["must-avoid-term"]);
  // Greek capital alpha and iota; Cyrillic capital a and Ukrainian i; Greek rho, omicron, iota.
  for (const disguised of ["Our \u0391\u0399-powered tool helps.", "Our \u0410\u0406-powered tool helps."]) {
    const rules = rulesWith(["AI"], disguised);
    assert.ok(rules.includes("must-avoid-term"), disguised);
    assert.ok(rules.includes("suspicious-characters"), disguised);
  }
  // Greek rho, omicron, iota: the reviewer's third example. To the eye it reads "POI", since a
  // capital rho looks like P, so it is not the ruled-out term; it is refused as a word in another script.
  assert.deepEqual(rulesWith(["ROI"], "Better \u03A1\u039F\u0399 for the team."), ["suspicious-characters"]);
  // In a post written in Latin letters, a word in another script is refused even where it
  // resembles no ruled-out term: other scripts have look-alikes that are not folded.
  assert.deepEqual(rulesWith(["AI"], "Our \u13AA\u13C6 tool helps."), ["suspicious-characters"]);
});

test("F2: a figure written in the digits of another script is refused", () => {
  for (const figure of ["\u0664\u0660", "\u06F4\u06F0", "\u096A\u0966", "\u0E54\u0E50"]) {
    assert.deepEqual(rulesWith([], `${figure}% of operations teams reconcile by hand.`), ["unlisted-statistic"], figure);
  }
  // The same figure in ordinary digits is refused for the same reason, so nothing was gained.
  assert.deepEqual(rulesWith([], "40% of operations teams reconcile by hand."), ["unlisted-statistic"]);
});

test("F3: a ruled-out term with a letter outside a to z matches its own spelling", () => {
  assert.deepEqual(rulesWith(["na\u00EFve"], "This na\u00EFve approach fails."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["K\u00FCndigung"], "Keine K\u00FCndigung bitte."), ["must-avoid-term"]);
  // With or without its accent in the text.
  assert.deepEqual(rulesWith(["na\u00EFve"], "This naive approach fails."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["caf\u00E9"], "Meet us at the cafe."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["caf\u00E9"], "The cafeteria is closed."), []);
});

test("F4: a long word, hashtag or address no longer stops a campaign from being evaluated", () => {
  const brief = syntheticBrief();
  const tagged = draft("tagged", "", { hashtags: ["#OperationsTeamsReconcileInventoryByHandWeekly"] });
  const phrased = draft("phrased", "This is an end-to-end-state-of-the-art-inventory-reconciliation flow.");
  for (const candidate of [tagged, phrased]) {
    const request = buildJevRequest(brief, slot, [candidate], DEFAULT_CRITERIA);
    assert.ok(JSON.stringify(request).includes("[long-token]"), candidate.id);
  }
  // A reference in the brief, which cannot be changed once the campaign exists.
  brief.references[0]!.summary = `${brief.references[0]!.summary} See research.example.org/reports/2025/warehouse-data-quality-benchmark`;
  assert.doesNotThrow(() => buildJevRequest(brief, slot, [draft("plain")], DEFAULT_CRITERIA));
  // Eligibility does not depend on what the evaluator was shown: it is computed on the real text.
  assert.deepEqual(analyseDraft(syntheticBrief(), slot, tagged, DEFAULT_LIMITS).failures, []);
});

test("F5: text that is clipped stays in canonical form and within its length", () => {
  const long = `${"A claim that runs on. ".repeat(30)}`;
  const clipped = clip(canonicalText(long), 400);
  assert.ok(clipped.length <= 400);
  assert.ok(clipped.endsWith("..."));
  assert.equal(canonicalText(clipped), clipped);
  // So a draft carrying a clipped claim is not refused for it.
  const rules = rulesWith([], "", { claims: [{ text: clipped, needsEvidence: false, evidenceRef: null }] });
  assert.deepEqual(rules, []);
});

test("F6: a ranking is synthetic if its set, any candidate or any evidence says so", () => {
  const fixture = () => JSON.parse(readFileSync("fixtures/creators/synthetic-creators.json", "utf8")) as { set: any; assessments: unknown; policy: any };
  const now = new Date("2026-11-13T00:00:00.000Z");
  const relabelled = fixture();
  relabelled.set.synthetic = false;
  const ranking = rankCreators({ ...relabelled, now });
  assert.equal(ranking.synthetic, true, "the set cannot relabel what its candidates and evidence say of themselves");
  assert.ok(ranking.results.every((r) => r.synthetic === true));
  // Only where nothing at any level is synthetic is the ranking not.
  const real = fixture();
  real.set.synthetic = false;
  for (const candidate of real.set.candidates) {
    candidate.synthetic = false;
    for (const item of candidate.evidence) item.synthetic = false;
  }
  assert.equal(rankCreators({ ...real, now }).synthetic, false);
});

test("F7: a ruled-out word broken by any mark between its letters is found", () => {
  for (const broken of ["guar\u2010antee", "guar\u2013antee", "guar\u2014antee", "guar\u2027antee", "guar/antee", "guar:antee", "guar'antee"]) {
    assert.ok(rulesWith(["guarantee"], `We ${broken} results.`).includes("must-avoid-term"), broken);
  }
});

test("F8: a ratio or an amount is not excused as a time of day", () => {
  assert.deepEqual(rulesWith([], "Our ratio went from 1:10 to 1:25 reps."), ["unlisted-statistic", "unlisted-statistic", "unlisted-statistic"]);
  assert.deepEqual(rulesWith([], "Each manager now covers 1:30 reps."), ["unlisted-statistic", "unlisted-statistic"]);
  assert.deepEqual(rulesWith([], "We cut 40 pm of work."), ["unlisted-statistic"]);
  // Times of day are still not figures.
  for (const time of ["The report goes out at 4pm on Friday.", "It runs at 9:30 each day.", "The cut-off is 16:30.", "Stand-up is at 09:15.", "We close at 11:45 pm.", "The call is 3:00 GMT."]) {
    assert.deepEqual(rulesWith([], time), [], time);
  }
});

test("F9: a short ruled-out term does not catch longer words, and doubled letters before an ending are matched", () => {
  assert.deepEqual(rulesWith(["AI"], "Teams need first aid kits."), []);
  assert.deepEqual(rulesWith(["AI"], "Several AIs were compared."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["scam"], "Nobody was scammed."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["scam"], "Scamming is rare."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["guarantee"], "Results are guaranteed."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["scam"], "The scampi was good."), []);
});

test("F12: the outer contracts bound length and count and refuse control characters", () => {
  const command = {
    schema: "kic.provisional-publish-command/v0",
    status: "NON-EXECUTABLE",
    authoritative: false,
    executable: false,
    notice: "NON-EXECUTABLE. Provisional fixture produced by KIC for contract convergence only. It is not a Kraken command, carries no authority and must not be sent to any publishing system.",
    commandId: "cmd-001",
    programmeId: "prog-001",
    channel: "linkedin",
    kind: "organic-post",
    sequence: { slot: 1, week: 1, orderInWeek: 1 },
    content: { draftId: "draft-001", body: "A post.", hashtags: ["#Ops"], bodySha256: "0".repeat(64) },
    approval: { decisionId: "dec-001", approvedBy: { kind: "human", id: "ed", name: "Ed" }, approvedAt: "2026-01-05T09:00:00.000Z", signatureVerified: true },
    translation: { target: "kraken", contract: null, note: "No Kraken contract is accepted for KIC." },
  };
  assert.equal(ProvisionalPublishCommand.safeParse(command).success, true);
  const withContent = (content: object) => ProvisionalPublishCommand.safeParse({ ...command, content: { ...command.content, ...content } }).success;
  assert.equal(withContent({ body: `\u001b[2J${"x".repeat(100)}` }), false, "an escape sequence in the body");
  assert.equal(withContent({ body: "x".repeat(100_000) }), false, "an over-long body");
  assert.equal(withContent({ hashtags: Array.from({ length: 10_000 }, () => "#a") }), false, "ten thousand hashtags");
  assert.equal(withContent({ hashtags: ["#bell\u0007"] }), false, "a control character in a hashtag");
  assert.equal(ProvisionalPublishCommand.safeParse({ ...command, translation: { ...command.translation, note: "\u001b]0;title\u0007" } }).success, false);
  assert.equal(ProvisionalPublishCommand.safeParse({ ...command, sequence: { slot: 10_000, week: 1, orderInWeek: 1 } }).success, false);
  // Whatever else is changed, the three guard fields accept one value each.
  assert.equal(ProvisionalPublishCommand.safeParse({ ...command, executable: true }).success, false);
  assert.equal(ProvisionalPublishCommand.safeParse({ ...command, status: "EXECUTABLE" }).success, false);

  const meta = { ...generation };
  assert.equal(GenerationMeta.safeParse(meta).success, true);
  assert.equal(GenerationMeta.safeParse({ ...meta, model: "m".repeat(5000) }).success, false);
  assert.equal(GenerationMeta.safeParse({ ...meta, provider: "p\u001b[0m" }).success, false);

  const planSlot = (n: number) => ({ ...slot, slot: n });
  const plan = (count: number) => ({
    narrativeId: "nar-001",
    campaignObjective: "Objective.",
    coreNarrative: "Narrative.",
    supportingThemes: ["Theme"],
    intendedAudience: "Audience.",
    slots: Array.from({ length: count }, (_, i) => planSlot(i + 1)),
    generation,
  });
  assert.equal(ProgrammePlan.safeParse(plan(3)).success, true);
  assert.equal(ProgrammePlan.safeParse(plan(MAX_POSTS_IN_A_PLAN + 1)).success, false);
});

test("F13: evidence dated in the future does not count and rules the candidate out; fees are compared in one currency", () => {
  const fixture = () => JSON.parse(readFileSync("fixtures/creators/synthetic-creators.json", "utf8")) as { set: any; assessments: unknown; policy: any };
  const now = new Date("2026-11-13T00:00:00.000Z");
  const baseline = rankCreators({ ...fixture(), now });
  const eligible = baseline.results.find((r) => r.eligible);
  assert.ok(eligible, "the fixture has an eligible creator to work with");

  const future = fixture();
  const candidate = future.set.candidates.find((c: any) => c.id === eligible.creatorId);
  for (const item of candidate.evidence) item.observedAt = "2099-01-01T00:00:00.000Z";
  const result = rankCreators({ ...future, now }).results.find((r) => r.creatorId === eligible.creatorId)!;
  assert.equal(result.eligible, false);
  assert.ok(result.ineligibility.some((reason) => reason.rule === "evidence-dated-in-future"));
  assert.equal(result.evidenceConfidence, 0);

  const otherCurrency = fixture();
  otherCurrency.policy.feeCurrency = "USD";
  const mismatched = rankCreators({ ...otherCurrency, now }).results;
  assert.ok(mismatched.some((r) => r.ineligibility.some((reason) => reason.rule === "fee-currency-mismatch")));
  // A limit must say what currency it is in.
  const unnamed = fixture();
  unnamed.policy.feeCurrency = null;
  assert.throws(() => rankCreators({ ...unnamed, now }));
});
