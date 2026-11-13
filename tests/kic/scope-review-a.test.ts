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
    // Refused twice over: as a figure not in the digits 0 to 9, and as characters a post may not use.
    assert.deepEqual(rulesWith([], `${figure}% of operations teams reconcile by hand.`), ["suspicious-characters", "unlisted-statistic"], figure);
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

// ------------------------------------------------------------------------------------------
// The review of the remediation (docs/review/2026-11-13-review-a2-1d8bafe.md).

test("N1: a letter outside the ordinary Latin alphabet is refused, whichever block it comes from", () => {
  // The reviewer's eight: letters from the extended Latin blocks that pass for plain ones.
  const cases: Array<[string, string]> = [
    ["AI", "Our A\uA7AE tool helps."],
    ["scam", "Not a \uA731cam at all."],
    ["fraud", "No \uA730raud here."],
    ["equity", "Build e\uA7AFuity fast."],
    ["AI", "Our A\uA7FE tool helps."],
    ["jab", "A quick \u0237ab at it."],
    ["ROI", "Better R\uA74AI for the team."],
    ["AI", "Our A\u01C0 tool helps."],
  ];
  for (const [term, text] of cases) assert.ok(rulesWith([term], text).includes("suspicious-characters"), text);
  // Other scripts, as before, and letters used as numerals.
  for (const text of ["Our \u13AA\u13C6 tool helps.", "Our \uA4EE\uA4F2 tool helps.", "\u56DB\u5341% of operations teams reconcile by hand.", "Thanks to \u0418\u0432\u0430\u043D."]) {
    assert.ok(rulesWith([], text).includes("suspicious-characters"), text);
  }
  // The letters European languages use are ordinary.
  for (const text of ["Caf\u00E9 cr\u00E8me in Z\u00FCrich.", "Stra\u00DFe, \u00C5rhus, \u0141\u00F3d\u017A, Besan\u00E7on, Ti\u1EBFng Vi\u1EC7t."]) {
    assert.deepEqual(rulesWith([], text), [], text);
  }
});

test("N1: the extra letters of European alphabets are read as the plain letters they stand for", () => {
  assert.deepEqual(rulesWith(["Strasse"], "Meet on the Stra\u00DFe."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["Stra\u00DFe"], "Meet on the Strasse."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["oeuvre"], "A whole \u0153uvre."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["lock"], "A \u0142ock on the door."), ["must-avoid-term"]);
});

test("N2: what the rest of a draft contains does not change the rule for any part of it", () => {
  // The reviewer's tipping: twelve claims of Greek text, which are not published.
  const greek = "\u03B1\u03B2\u03B3\u03B4\u03B5 ".repeat(60).trim();
  const claims = Array.from({ length: 12 }, () => ({ text: greek, needsEvidence: false, evidenceRef: null }));
  for (const [term, text] of [["alert", "Set an \u13AA\u13DE\u13AC\u13A1\u13A2 today."], ["AI", "Our \uA4EE\uA4F2 tool helps."]] as const) {
    assert.ok(rulesWith([term], text, { claims }).includes("suspicious-characters"), text);
  }
  assert.ok(rulesWith([], "\u56DB\u5341% of operations teams reconcile by hand.", { claims }).includes("suspicious-characters"));
});

test("F7 remainder: a blank that is not an ordinary space, and a private-use character, are refused", () => {
  assert.deepEqual(rulesWith(["guarantee"], "We guar\u1680antee results."), ["suspicious-characters"]);
  assert.deepEqual(rulesWith(["guarantee"], "We guar\uE000antee results."), ["suspicious-characters"]);
});

test("N4: a term of three letters catches its inflections; one of two letters does not catch other words", () => {
  assert.deepEqual(rulesWith(["fix"], "It fixes everything."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["fix"], "It is fixed."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["tax"], "Nobody is taxed."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["buy"], "Buying is easy."), ["must-avoid-term"]);
  // Over-matching the same change brought back, found by the next review: these are other words.
  const others: Array<[string, string]> = [["US", "Teams used spreadsheets."], ["US", "We are using a ledger."], ["fun", "The fund closed."], ["win", "Wind turbines turn."], ["car", "Use the card."], ["fee", "Read the feed."], ["ban", "The band played."], ["kin", "A kind word."], ["pro", "Ship it to prod."], ["be", "Being clear helps."]];
  for (const [term, text] of others) assert.deepEqual(rulesWith([term], text), [], text);
  // And the inflections English does write are still caught.
  assert.deepEqual(rulesWith(["ban"], "It was banned."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["win"], "Winning matters."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["US"], "Two USs."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["market"], "It was marketed widely."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["AI"], "Teams need first aid kits."), []);
  assert.deepEqual(rulesWith(["AI"], "He said it plainly."), []);
});

test("N5: the apostrophe of a contraction or a possessive does not join two words into a ruled-out one", () => {
  const honest: Array<[string, string]> = [["well", "We'll send the report."], ["ill", "I'll check."], ["hell", "He'll call."], ["shell", "She'll call."], ["cant", "We can't wait."], ["its", "It's ready."], ["were", "We're ready."]];
  for (const [term, text] of honest) assert.deepEqual(rulesWith([term], text), [], text);
  // With the typographic apostrophe too.
  assert.deepEqual(rulesWith(["well"], "We\u2019ll send the report."), []);
  // An apostrophe put inside a word to break it up is still removed, and a possessive still matches.
  assert.deepEqual(rulesWith(["guarantee"], "We guar'antee results."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["scam"], "The scam's cost is high."), ["must-avoid-term"]);
});

test("a ruled-out word written with keyboard symbols in place of letters is found", () => {
  assert.deepEqual(rulesWith(["guarantee"], "We gu@rantee results."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["results"], "Great re$ults ahead."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["AI"], "Our A| tool helps."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["all"], "For a|l teams."), ["must-avoid-term"]);
  // A digit in place of a letter is read as the letter, and is a figure as well.
  assert.deepEqual(rulesWith(["AI"], "Our A1 tool helps."), ["must-avoid-term", "unlisted-statistic"]);
  assert.ok(rulesWith(["scam"], "Not a 5cam.").includes("must-avoid-term"));
  // At the start of a word, and with other signs a post may use.
  assert.deepEqual(rulesWith(["scam"], "Not a $cam."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["scam"], "Not a s\u00A2am."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["example"], "For e\u00D7ample."), ["must-avoid-term"]);
  // Ordinary punctuation is not read as letters.
  assert.deepEqual(rulesWith(["hi"], "Oh! Is that so?"), []);
});

test("N6: text is clipped between characters, never through one, and stays canonical", () => {
  const coder = "\u{1F469}\u200D\u{1F4BB}"; // a woman technologist: two emoji joined by a zero-width joiner
  for (let pad = 380; pad <= 400; pad++) {
    const clipped = clip(canonicalText(`${"a".repeat(pad)} ${coder}${coder} and then a good deal more text to push it over the limit.`), 400);
    assert.ok(clipped.length <= 400, `pad ${pad}`);
    assert.equal(canonicalText(clipped), clipped, `pad ${pad}`);
    assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(clipped), `no half character, pad ${pad}`);
    assert.ok(!clipped.includes("\u200D..."), `no joiner left at the end, pad ${pad}`);
    assert.deepEqual(rulesWith([], "", { claims: [{ text: clipped, needsEvidence: false, evidenceRef: null }] }), [], `pad ${pad}`);
  }
});

test("F12 remainder: a released package's provenance and the lists in an evaluation are bounded", async () => {
  const { ProgrammePackage } = await import("../../src/contracts/programme.ts");
  const { Evaluation } = await import("../../src/contracts/evaluation.ts");
  const provenance = (ProgrammePackage.shape.provenance as any);
  const good = { generator: "kraken-intelligence-companion", generatorVersion: "0.1.0", models: ["m"], evaluators: ["e"], budget: (await import("./support.ts")).makeService().limits && { modelCalls: 0, completionTokens: 0, promptTokens: 0, reasoningTokens: 0 }, notes: ["n"] };
  // The budget's own shape is not the point here; only the provenance fields are checked.
  const check = (over: object) => provenance.pick({ generatorVersion: true, models: true, evaluators: true, notes: true }).safeParse({ generatorVersion: good.generatorVersion, models: good.models, evaluators: good.evaluators, notes: good.notes, ...over }).success;
  assert.equal(check({}), true);
  assert.equal(check({ generatorVersion: "v".repeat(5000) }), false);
  assert.equal(check({ notes: ["\u001b[2J"] }), false);
  assert.equal(check({ models: Array.from({ length: 1000 }, () => "m") }), false);
  assert.equal(Evaluation.shape.candidates.safeParse(Array.from({ length: 1000 }, () => ({}))).success, false);
});

test("N12: a blocking concern with a long description rules the creator out; it does not stop the ranking", () => {
  const fixture = JSON.parse(readFileSync("fixtures/creators/synthetic-creators.json", "utf8")) as { set: any; assessments: unknown; policy: any };
  const candidate = fixture.set.candidates[0];
  candidate.blockingConcerns = [{ kind: "legal", detail: "x".repeat(395), evidenceId: candidate.evidence[0].id }];
  const ranking = rankCreators({ ...fixture, now: new Date("2026-11-13T00:00:00.000Z") });
  const result = ranking.results.find((r) => r.creatorId === candidate.id)!;
  assert.equal(result.eligible, false);
  assert.ok(result.ineligibility.some((reason) => reason.rule === "blocking-concern"));
});

// ------------------------------------------------------------------------------------------
// The review of the second remediation (docs/review/2026-11-13-review-a3-a1affd2.md).

test("1: a character that is not a letter but is drawn as one is refused", () => {
  const cases: Array<[string, string]> = [
    ["AI", "Our \u{1F170}\u{1F178}-powered tool."], // squared letters
    ["AI", "Our \u{1F150}\u{1F158}-powered tool."], // circled letters
    ["scam", "Not a \u{1F182}\u{1F172}\u{1F170}\u{1F17C}."],
    ["scam", "Not a \u{1F1F8} \u{1F1E8} \u{1F1E6} \u{1F1F2}."], // regional indicators, one at a time
    ["fraud", "It is not fr\u237Aud."], // APL alpha
    ["AI", "Our A\u2373-powered tool."],
    ["AI", "Our A\u2129 tool."],
    ["free", "fr\u212E\u212E"],
    ["boost", "bo\u25CBst"],
    ["union", "\u222Anion"],
    ["AI", "\u2200I"],
    ["scam", "sca\u036B"], // a combining small m
    ["AI", "Our A\u2139 tool."], // the information sign
  ];
  for (const [term, text] of cases) assert.ok(rulesWith([term], text).includes("suspicious-characters"), text);
  // Two letters that are allowed and are drawn like other letters: read both ways.
  assert.deepEqual(rulesWith(["spam"], "No s\u00FEam."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["best"], "The \u00DFest."), ["must-avoid-term"]);
  // What a post may use is not refused: letters of European languages, everyday marks, emoji set apart.
  const fine = [
    "Caf\u00E9 \u2013 cr\u00E8me \u2014 \u201Cquoted\u201D, it\u2019s \u20AC5 \u2192 done \u2713 \u2022 next",
    "Bucure\u0219ti, Timi\u0219oara, Constan\u021Ba, Ph\u01A1, Th\u01B0, n\u01D0 h\u01CEo, STRA\u1E9EE.",
    "Launch day \u{1F680} is here \u{1F469}\u200D\u{1F4BB} \u2764\uFE0F \u{1F1EC}\u{1F1E7} \u{1F44D}\u{1F3FD}",
  ];
  for (const text of fine) assert.deepEqual(rulesWith([], text).filter((rule) => rule === "suspicious-characters"), [], text);
});

test("1: an emoji is written apart from words", () => {
  assert.deepEqual(rulesWith(["boost"], "b\u2B55\u2B55st your reach."), ["suspicious-characters"]);
  assert.deepEqual(rulesWith([], "Launch day\u{1F680}"), ["suspicious-characters"]);
  assert.deepEqual(rulesWith([], "\u{1F680}Launch day"), ["suspicious-characters"]);
  assert.deepEqual(rulesWith([], "Launch day \u{1F680}!"), []);
  assert.deepEqual(rulesWith([], "\u{1F680} Launch day \u{1F680}\u{1F680}"), []);
});

test("2: a lower-case L beside a capital is read as a capital I, a capital I among small letters as an L, and spaced letters are joined", () => {
  assert.deepEqual(rulesWith(["AI"], "Our Al-powered tool."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["ROI"], "Better ROl this year."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["sell"], "We seII more."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["AI"], "Our A I tool."), ["must-avoid-term"]);
  assert.deepEqual(rulesWith(["ROI"], "Better R O I."), ["must-avoid-term"]);
  // What is not that word stays allowed.
  assert.deepEqual(rulesWith(["AI"], "Smith et al. found it."), []);
  assert.deepEqual(rulesWith(["AI"], "All of it. Also this. Almost."), []);
});

test("3: an apostrophe put before an ending does not shield a ruled-out word", () => {
  const shielded: Array<[string, string]> = [["guaranteed", "Results guarantee'd."], ["guaranteed", "Results guarantee\u2019d."], ["fraud", "No frau'd here."], ["scam", "No sca'm here."], ["boost", "We boos't nothing."], ["boss", "The bos's view."]];
  for (const [term, text] of shielded) assert.deepEqual(rulesWith([term], text), ["must-avoid-term"], text);
  // The contractions English has are still read as they are.
  for (const [term, text] of [["well", "We'll send it."], ["were", "We're ready."], ["cant", "We can't wait."], ["its", "It's ready."], ["wed", "We'd like that."], ["id", "I'd say so."]] as const) {
    assert.deepEqual(rulesWith([term], text), [], text);
  }
});

test("4: whatever the brief and the drafts hold, the evaluation fits its own contract", async () => {
  const { CandidateEvaluation } = await import("../../src/contracts/evaluation.ts");
  const { evaluateSlot } = await import("../../src/evaluation/evaluator.ts");
  const { MockJevTransport } = await import("../../src/evaluation/jev.ts");
  const { fixedClock, sequentialIds } = await import("../../src/util/runtime.ts");
  const brief = syntheticBrief();
  const point = `Reconciling by hand ${"takes time and care ".repeat(11)}every week`.slice(0, 213);
  brief.constraints.mustInclude = [point];
  brief.constraints.mustAvoid = [`${"very ".repeat(74)}long term`];
  const longClaim = { text: `A claim ${"that goes on ".repeat(20)}`.slice(0, 300), needsEvidence: true, evidenceRef: "r".repeat(80) };
  const drafts = [
    draft("covers", `${point}. ${"very ".repeat(74)}long term.`),
    draft("figure", `We saw ${"9".repeat(500)} of them.`),
    draft("claim", "", { claims: [longClaim] }),
  ];
  for (const candidate of drafts) {
    const analysis = analyseDraft(brief, slot, candidate, DEFAULT_LIMITS);
    for (const signal of analysis.signals) for (const item of signal.evidence) assert.ok(item.length <= 200, candidate.id);
    for (const failure of analysis.failures) assert.ok(failure.detail.length <= 400, candidate.id);
  }
  const evaluation = await evaluateSlot({ brief, slot, drafts }, { transport: new MockJevTransport(DEFAULT_LIMITS), limits: DEFAULT_LIMITS, clock: fixedClock(), ids: sequentialIds() });
  for (const candidate of evaluation.candidates) assert.equal(CandidateEvaluation.safeParse(candidate).success, true, candidate.draftId);
  assert.equal(evaluation.candidates.find((c) => c.draftId === "figure")!.eligibility.eligible, false);
});

test("9: text that one pass of canonical form does not settle is clipped whole, not to one character", () => {
  // A zero-width space between a letter and an accent: the first pass removes the space, the second joins the two.
  const unsettled = `e\u200B\u0301${" and more".repeat(700)}`;
  const clipped = clip(unsettled, 6000);
  assert.ok(clipped.length > 5900 && clipped.length <= 6000, `length ${clipped.length}`);
  assert.equal(canonicalText(clipped), clipped);
  assert.ok(clipped.startsWith("\u00E9 and more"));
  const started = Date.now();
  clip(`${"a\u200B\u0301".repeat(3000)}`, 400);
  assert.ok(Date.now() - started < 500);
});
