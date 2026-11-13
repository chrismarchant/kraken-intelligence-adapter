import assert from "node:assert/strict";
import { test } from "node:test";
import type { PostDraft, ProgrammeSlot } from "../../src/contracts/index.ts";
import { DEFAULT_CRITERIA } from "../../src/evaluation/criteria.ts";
import { evaluateSlot } from "../../src/evaluation/evaluator.ts";
import { JevDisabledError, MockJevTransport, buildJevRequest, createJevTransport } from "../../src/evaluation/jev.ts";
import type { JevRequest, JevResponse, JevTransport } from "../../src/evaluation/jev.ts";
import { RedactionError, assertNoSecrets, redactDeep, redactText } from "../../src/evaluation/redaction.ts";
import { analyseDraft } from "../../src/evaluation/signals.ts";
import { DEFAULT_LIMITS } from "../../src/limits.ts";
import { fixedClock, sequentialIds } from "../../src/util/runtime.ts";
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

const deps = () => ({ transport: new MockJevTransport(DEFAULT_LIMITS), limits: DEFAULT_LIMITS, clock: fixedClock(), ids: sequentialIds() });
const rules = (d: PostDraft) => analyseDraft(syntheticBrief(), slot, d, DEFAULT_LIMITS).failures.map((f) => f.rule);

test("a clean draft has no eligibility failures", () => {
  assert.deepEqual(rules(draft("clean")), []);
});

test("mandatory constraints: must-avoid term, over-length, empty body", () => {
  assert.deepEqual(rules(draft("a", "This is a revolutionary approach.")), ["must-avoid-term"]);
  assert.deepEqual(rules(draft("b", "Our AI-powered checks help.")), ["must-avoid-term"]);
  assert.deepEqual(rules(draft("c", "x".repeat(3100))), ["over-length"]);
  // Inflections of a ruled-out word are caught too.
  assert.deepEqual(rules(draft("d", "Results are guaranteed.")), ["must-avoid-term"]);
  // A ruled-out word inside a different, longer word is not a match.
  assert.deepEqual(rules(draft("e", "An unrevolutionary routine, done every week.")), []);
});

test("mandatory constraints: claims and figures must cite a reference in the brief", () => {
  const figure = "In a survey of 120 operations leaders, 62% said they did not fully trust the inventory figures.";
  assert.deepEqual(rules(draft("unlisted", figure)), ["unlisted-statistic"]);
  assert.deepEqual(
    rules(draft("unsupported", figure, { claims: [{ text: figure, needsEvidence: true, evidenceRef: null }] })).sort(),
    ["unlisted-statistic", "unsupported-claim"],
  );
  assert.deepEqual(
    rules(draft("invented-ref", figure, { claims: [{ text: figure, needsEvidence: true, evidenceRef: "ref-made-up" }] })).sort(),
    ["unknown-evidence-reference", "unlisted-statistic"],
  );
  assert.deepEqual(rules(draft("supported", figure, { claims: [{ text: figure, needsEvidence: true, evidenceRef: "ref-survey" }] })), []);
  // A supported claim does not license a different figure elsewhere in the post.
  assert.deepEqual(
    rules(draft("extra", `${figure}\n\nTeams also cut costs by 40%.`, { claims: [{ text: figure, needsEvidence: true, evidenceRef: "ref-survey" }] })),
    ["unlisted-statistic"],
  );
});

test("the mock evaluator is deterministic and is labelled as not live and not JEV", async () => {
  const input = { brief: syntheticBrief(), slot, drafts: [draft("draft-a"), draft("draft-b", "Short extra line.")] };
  const one = await evaluateSlot(input, deps());
  const two = await evaluateSlot(input, deps());
  assert.deepEqual(one, two);
  assert.equal(one.evaluator.kind, "mock-jev");
  assert.equal(one.evaluator.live, false);
  assert.match(one.limitations.join(" "), /deterministic stand-in/);
  assert.equal(one.criteria.length, DEFAULT_CRITERIA.length);
  for (const candidate of one.candidates) {
    assert.equal(candidate.scores.length, DEFAULT_CRITERIA.length);
    assert.equal(candidate.signals.length, DEFAULT_CRITERIA.length, "every criterion has evidence shown");
    assert.ok(candidate.confidence > 0 && candidate.confidence <= 1);
  }
});

test("an ineligible draft ranks below every eligible one even when it scores higher", async () => {
  // The evaluator is forced to score the ineligible draft at the top of every scale.
  const biased: JevTransport = {
    live: false,
    kind: "mock-jev",
    version: "biased-test-double",
    description: "Scores the ineligible draft highest.",
    async systemone(request: JevRequest): Promise<JevResponse> {
      const answers: JevResponse["answers"] = {};
      for (const [name, question] of Object.entries(request.questions)) {
        if (question.type === "score") answers[name] = { score: name.startsWith("draft-bad") ? question.criteria.length - 1 : 1, confidence: 0.9 };
      }
      answers.preferred = { choice: "draft-bad", probabilities: { "draft-bad": 0.9, "draft-good": 0.1 }, confidence: 0.9 };
      answers.any_fit = { noul: 0.95 };
      return { model: "biased", answers };
    },
  };
  const evaluation = await evaluateSlot(
    { brief: syntheticBrief(), slot, drafts: [draft("draft-bad", "We guarantee it."), draft("draft-good")] },
    { ...deps(), transport: biased },
  );
  const bad = evaluation.candidates.find((c) => c.draftId === "draft-bad")!;
  const good = evaluation.candidates.find((c) => c.draftId === "draft-good")!;
  assert.ok(bad.weightedTotal > good.weightedTotal, "the ineligible draft does score higher");
  assert.equal(bad.eligibility.eligible, false);
  assert.deepEqual(evaluation.ranking, ["draft-good", "draft-bad"]);
  assert.equal(evaluation.preferred, null, "an ineligible preference is not recorded");
  assert.match(evaluation.limitations.join(" "), /failed a mandatory constraint/);
});

test("an evaluator that omits a score fails the evaluation instead of inventing one", async () => {
  const silent: JevTransport = {
    live: false,
    kind: "mock-jev",
    version: "silent-test-double",
    description: "Returns nothing.",
    systemone: async () => ({ model: "silent", answers: {} }),
  };
  await assert.rejects(evaluateSlot({ brief: syntheticBrief(), slot, drafts: [draft("draft-a")] }, { ...deps(), transport: silent }), /returned no score/);
});

test("the live JEV evaluator cannot be selected", () => {
  assert.throws(() => createJevTransport("jev", DEFAULT_LIMITS), JevDisabledError);
  assert.throws(() => createJevTransport("live", DEFAULT_LIMITS), /Unknown evaluator/);
  assert.equal(createJevTransport(undefined, DEFAULT_LIMITS).live, false);
  assert.equal(createJevTransport("mock-jev", DEFAULT_LIMITS).kind, "mock-jev");
});

test("the evaluator request is one fan-out, leaves out client identity and is redacted", () => {
  const brief = syntheticBrief();
  brief.audience.icp = "Leaders reachable at ops.lead@example.com or +44 20 7946 0958, see https://example.com/private?token=abc";
  const request = buildJevRequest(brief, slot, [draft("draft-a"), draft("draft-b")], DEFAULT_CRITERIA);
  const serialised = JSON.stringify(request);
  assert.equal(Object.keys(request.questions).length, 2 * DEFAULT_CRITERIA.length + 2);
  assert.ok(!serialised.includes("Harbourline"), "the client's name is not sent");
  assert.ok(!serialised.includes("example.com"));
  assert.ok(!serialised.includes("7946"));
  assert.match(serialised, /\[email\]/);
  assert.match(serialised, /\[phone\]/);
  assert.match(serialised, /\[url\]/);
});

test("redaction removes secret-shaped values and the request fails closed if one survives", () => {
  // Built at run time so that no credential-shaped literal sits in the repository.
  const key = ["sk", "live", "A1b2C3d4E5f6G7h8I9j0"].join("-");
  const bearer = `Bearer ${"x".repeat(12)}.${"y".repeat(12)}`;
  const redacted = redactText(`key ${key} and ${bearer} and password=hunter2hunter2`);
  assert.ok(!redacted.includes(key));
  assert.ok(!redacted.includes("hunter2"));
  assert.deepEqual(redactDeep({ a: [`mail me at a.b@example.org`], b: 3 }), { a: ["mail me at [email]"], b: 3 });

  assert.doesNotThrow(() => assertNoSecrets({ text: "An ordinary sentence about warehouse reports." }));
  assert.throws(() => assertNoSecrets({ nested: [{ value: "Q".repeat(48) }] }), RedactionError);
  try {
    assertNoSecrets({ nested: [{ value: "Q".repeat(48) }] });
  } catch (error) {
    assert.ok(!(error as Error).message.includes("QQQQ"), "the error names the path, not the value");
    assert.match((error as Error).message, /state\.nested\[0\]\.value/);
  }

  const brief = syntheticBrief();
  const leaky = draft("draft-leak", `Opaque blob ${"Z".repeat(50)} in the text.`);
  assert.throws(() => buildJevRequest(brief, slot, [leaky], DEFAULT_CRITERIA), RedactionError);
});
