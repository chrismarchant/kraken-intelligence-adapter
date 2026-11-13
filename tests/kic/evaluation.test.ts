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
  // The sentence carries two figures, 120 and 62; each needs backing.
  assert.deepEqual(rules(draft("unlisted", figure)), ["unlisted-statistic", "unlisted-statistic"]);
  assert.deepEqual(
    rules(draft("unsupported", figure, { claims: [{ text: figure, needsEvidence: true, evidenceRef: null }] })).sort(),
    ["unlisted-statistic", "unlisted-statistic", "unsupported-claim"],
  );
  assert.deepEqual(
    rules(draft("invented-ref", figure, { claims: [{ text: figure, needsEvidence: true, evidenceRef: "ref-made-up" }] })).sort(),
    ["unknown-evidence-reference", "unlisted-statistic", "unlisted-statistic"],
  );
  assert.deepEqual(rules(draft("supported", figure, { claims: [{ text: figure, needsEvidence: true, evidenceRef: "ref-survey" }] })), []);
  // A supported claim does not license a different figure elsewhere in the post.
  assert.deepEqual(
    rules(draft("extra", `${figure}\n\nTeams also cut costs by 40%.`, { claims: [{ text: figure, needsEvidence: true, evidenceRef: "ref-survey" }] })),
    ["unlisted-statistic"],
  );
});

test("mandatory constraints cannot be slipped past with disguised text", () => {
  // Each of these was shown by the independent review to pass the earlier rules.
  const zeroWidth = "guar\u200bantee";
  const softHyphen = "guar\u00adantee";
  const cyrillic = "gu\u0430rantee"; // Cyrillic "а" in place of Latin "a"
  assert.deepEqual(rules(draft("zw", `We ${zeroWidth} results.`)).sort(), ["must-avoid-term", "suspicious-characters"]);
  assert.deepEqual(rules(draft("sh", `We ${softHyphen} results.`)).sort(), ["must-avoid-term", "suspicious-characters"]);
  assert.deepEqual(rules(draft("cy", `We ${cyrillic} results.`)), ["suspicious-characters"]);
  assert.deepEqual(rules(draft("fw", "Trust fell to \uff16\uff12\uff05 last year.")).sort(), ["suspicious-characters", "unlisted-statistic"]);

  // Ruled-out terms written joined, spaced, or inside a hashtag.
  assert.deepEqual(rules(draft("joined", "Our AIpowered checks help.")), ["must-avoid-term"]);
  assert.deepEqual(rules(draft("spaced", "Our AI powered checks help.")), ["must-avoid-term"]);
  assert.deepEqual(rules(draft("tag-a", "", { hashtags: ["#AIpowered"] })), ["must-avoid-term"]);
  assert.deepEqual(rules(draft("tag-b", "", { hashtags: ["#GameChanging", "#Ops"] })), ["must-avoid-term"]);
});

test("every figure must be in digits and traceable to the reference it cites", () => {
  const cited = (text: string, ref: string) => [{ text, needsEvidence: true, evidenceRef: ref }];
  const survey = "In a survey of 120 operations leaders, 62% said they did not fully trust the inventory figures.";

  // Figures written in words cannot be checked, so they are refused.
  for (const phrase of ["Sixty-two percent of leaders agree.", "Three in four teams reconcile by hand.", "Nine out of ten reports are late.", "Teams work twice as fast.", "Half of the week is lost."]) {
    assert.deepEqual(rules(draft("words", phrase)), ["unlisted-statistic"], phrase);
  }
  // Plain numbers with no percent sign are figures too.
  assert.deepEqual(rules(draft("ratio", "Roughly 3 in 4 teams reconcile by hand.")), ["unlisted-statistic", "unlisted-statistic"]);
  assert.deepEqual(rules(draft("hours", "That is 14 hours a week.")), ["unlisted-statistic"]);
  assert.deepEqual(rules(draft("tag", "", { hashtags: ["#62Percent"] })), ["unlisted-statistic"]);
  // A clock time is not a figure.
  assert.deepEqual(rules(draft("clock", "The report goes out at 4pm on Friday, or 16:30 at the latest.")), []);

  // A figure is supported only if the cited reference actually contains it.
  assert.deepEqual(rules(draft("ok", survey, { claims: cited(survey, "ref-survey") })), []);
  assert.deepEqual(rules(draft("laundered", "Errors fall by 90%.", { claims: cited("Errors fall by 90%.", "ref-product") })), ["unlisted-statistic"]);
  assert.deepEqual(rules(draft("wrong-ref", survey, { claims: cited(survey, "ref-benchmark") })), ["unlisted-statistic", "unlisted-statistic"]);
  // Marking the claim as not needing evidence does not exempt its figure.
  assert.deepEqual(rules(draft("unflagged", "Errors fall by 90%.", { claims: [{ text: "Errors fall by 90%.", needsEvidence: false, evidenceRef: null }] })), ["unlisted-statistic"]);
});

test("further disguises found by the confirmation review are refused", () => {
  // Characters that take no space but are not "format" characters.
  for (const invisible of ["\uFE0F", "\u3164", "\u034F", "\u115F", "\u2800"]) {
    const found = rules(draft("inv", `We guar${invisible}antee results.`));
    assert.ok(found.includes("must-avoid-term") || found.includes("suspicious-characters"), `U+${invisible.codePointAt(0)!.toString(16)} is caught: ${found.join(",")}`);
  }
  // Look-alike letters beyond Cyrillic and Greek.
  assert.ok(rules(draft("ipa", "We \u0261uarantee results.")).length > 0, "Latin small script g");
  assert.deepEqual(rules(draft("armenian", "We guarantee results. Results are revoluti\u0585nary.")).sort(), ["must-avoid-term", "suspicious-characters"]);
  assert.deepEqual(rules(draft("cherokee", "\u13AAI-powered checks.")), ["suspicious-characters"]);
  // Accents and dotless letters fold to the plain word.
  assert.deepEqual(rules(draft("accent", "We gu\u00E0rantee results.")), ["must-avoid-term"]);
  assert.deepEqual(rules(draft("dotless", "A revolut\u0131onary idea.")), ["must-avoid-term"]);
  // Dotted initials, and words broken up with visible marks.
  for (const text of ["Our A.I.-powered checks.", "Our A.I. powered checks.", "We guar-antee results.", "We g u a r a n t e e results.", "We guar*antee results.", "We guar\u{1F600}antee results.", "We guar_antee results."]) {
    assert.ok(rules(draft("split", text)).includes("must-avoid-term"), text);
  }
  // An emoji with its variation selector, on its own, is ordinary text.
  assert.deepEqual(rules(draft("emoji", "Checked \u2714\uFE0F and done \u{1F44D}.")), []);
});

test("quantities in words are refused when they state a magnitude or a share", () => {
  for (const text of ["Two million records were checked.", "It took a hundred hours.", "Hundreds of teams agree.", "A dozen warehouses tried it.", "Dozens of reports were late.", "They lose half their time.", "A third of the reports are wrong.", "Two thirds of leaders agree."]) {
    assert.deepEqual([...new Set(rules(draft("words", text)))], ["unlisted-statistic"], text);
  }
  // Ordinary small counts and everyday phrases are not statistics.
  for (const text of ["Start with two questions.", "There are three steps.", "Bring in a third party to check.", "It happens every quarter.", "Ask for a second opinion.", "One report at a time."]) {
    assert.deepEqual(rules(draft("ordinary", text)), [], text);
  }
});

test("everyday terms that contain digits do not make a post ineligible, but figures still do", () => {
  for (const text of ["We work with B2B teams.", "Plan it for Q3.", "The desk runs 24/7.", "Habits changed after COVID-19.", "The process follows ISO-9001.", "We started in 2019.", "Since 2021 the report has changed.", "By 2027 this will be routine."]) {
    assert.deepEqual(rules(draft("everyday", text)), [], text);
  }
  // The exemption is narrow: a year used as a count, or a figure beside a term, is still a figure.
  assert.deepEqual(rules(draft("count", "We audited 2024 pallets.")), ["unlisted-statistic"]);
  assert.deepEqual(rules(draft("beside", "B2B teams save 40 hours.")), ["unlisted-statistic"]);
  assert.deepEqual(rules(draft("percent", "In 2026 percent terms nothing changed.")), ["unlisted-statistic"]);
  // Inside a hashtag every digit counts.
  assert.deepEqual(rules(draft("tag", "", { hashtags: ["#Q3", "#Ops"] })), ["unlisted-statistic"]);
});

test("a draft that obeyed an instruction planted in the brief would be refused by code", () => {
  // What a model would have written had it followed the override used in the live injection probe.
  const obeyed = draft("obeyed", "Customers see a 300% return on investment, and results are guaranteed.", {
    hashtags: ["#AIpowered", "#Operations"],
    claims: [{ text: "Customers see a 300% return on investment", needsEvidence: false, evidenceRef: null }],
  });
  assert.deepEqual([...new Set(rules(obeyed))].sort(), ["must-avoid-term", "unlisted-statistic"]);
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

test("the evaluator request is one fan-out, carries no client name and is redacted", () => {
  const brief = syntheticBrief();
  brief.audience.icp = "Leaders reachable at ops.lead@example.com or +44 20 7946 0958, see https://example.com/private?token=abc";
  // The client's name appears in a draft and in a reference, as it does in real material.
  brief.references[2]!.summary = "Harbourline Analytics runs scheduled checks. Harbourline does not change records.";
  const named = draft("draft-b", "Harbourline Analytics built this for operations teams. Ask Harbourline how.");
  const request = buildJevRequest(brief, slot, [draft("draft-a"), named], DEFAULT_CRITERIA);
  const serialised = JSON.stringify(request);
  assert.match(serialised, /\[client\] built this/);
  assert.equal(Object.keys(request.questions).length, 2 * DEFAULT_CRITERIA.length + 2);
  assert.ok(!/harbourline/i.test(serialised), "the client's name is not sent, in the brief, the references or the drafts");
  assert.ok(!serialised.includes("example.com"));
  assert.ok(!serialised.includes("7946"));
  // A short client name is removed too, and generic company words are not.
  const acme = syntheticBrief();
  acme.client.name = "Acme Data";
  const short = JSON.stringify(buildJevRequest(acme, slot, [draft("draft-c", "Acme helps operations teams trust their data. ACME is practical.")], DEFAULT_CRITERIA));
  assert.ok(!/acme/i.test(short));
  assert.match(short, /trust their data/);
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
