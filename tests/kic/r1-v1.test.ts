import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { allowedInDraft, characterProblems } from "../../src/evaluation/characters.ts";
import { quoted } from "../../src/evaluation/quote.ts";
import { analyseDraft } from "../../src/evaluation/signals.ts";
import { DEFAULT_LIMITS } from "../../src/limits.ts";

function makeBrief() {
  const brief = JSON.parse(
    readFileSync(new URL("../../fixtures/campaigns/synthetic-harbourline.brief.json", import.meta.url), "utf8"),
  );
  brief.constraints.mustAvoid = [];
  return brief;
}

const slot = { callToAction: "Tell me" };

function makeDraft(body: string, o: { hook?: string; callToAction?: string; hashtags?: string[]; claims?: any[] } = {}) {
  return {
    hook: o.hook ?? "Hook",
    body,
    callToAction: o.callToAction ?? "Tell me",
    hashtags: o.hashtags ?? [],
    claims: o.claims ?? [],
  };
}

function run(body: string, o: Parameters<typeof makeDraft>[1] = {}) {
  return analyseDraft(makeBrief(), slot, makeDraft(body, o), DEFAULT_LIMITS);
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/;

test("quoted reproduces allowed text as it is and notes the cut", () => {
  assert.equal(quoted("We reached 1,053 teams", 40), `"We reached 1,053 teams"`);
  assert.equal(quoted("\u0410\u0406", 40), `"<U+0410><U+0406>"`);
  assert.equal(quoted("abcdef", 3), `"abc" (first 3 of 6 characters)`);
  assert.equal(quoted("", 5), `""`);
});

test("quoted goes by whole characters and names the rest by code point", () => {
  const text = "x".repeat(199) + "\u{1F680}" + " more";
  const q = quoted(text, 200);
  assert.ok(q.endsWith(`\u{1F680}" (first 200 of 205 characters)`));
  assert.ok(!LONE_SURROGATE.test(q));
  assert.equal(quoted("\u{1F1EC}\u{1F1E7}", 40), `"<U+1F1EC><U+1F1E7>"`);
  assert.equal(quoted("\uD83D", 40), `"<U+D83D>"`);
  assert.equal(quoted("a\nb", 40), `"a<U+000A>b"`);
});

test("allowedInDraft agrees with characterProblems", () => {
  const points: number[] = [];
  for (let cp = 0x20; cp <= 0x2fff; cp++) points.push(cp);
  points.push(0x1f680, 0x1f1ec, 0x1f600);
  for (const cp of points) {
    const c = String.fromCodePoint(cp);
    assert.equal(allowedInDraft(c), characterProblems(c).outside.length === 0, `U+${cp.toString(16).toUpperCase()}`);
  }
});

test("unsupported-claim names look-alikes and flags by code point", () => {
  const result = run("Some body.", {
    claims: [{ text: "We are \u0410\u0406 \u{1F1EC}\u{1F1E7} leaders", needsEvidence: true, evidenceRef: null }],
  });
  const failure = result.failures.find((f) => f.rule === "unsupported-claim");
  assert.ok(failure);
  assert.ok(failure.detail.includes("<U+0410><U+0406>"));
  assert.ok(failure.detail.includes("<U+1F1EC><U+1F1E7>"));
  for (const c of ["\u0410", "\u0406", "\u{1F1EC}", "\u{1F1E7}"]) assert.ok(!failure.detail.includes(c));
});

test("unlisted-statistic names digits of another script by code point", () => {
  const result = run("We saved \u0663\u0667 hours.");
  const failure = result.failures.find((f) => f.rule === "unlisted-statistic");
  assert.ok(failure);
  assert.ok(failure.detail.includes(`"<U+0663><U+0667>"`));
  assert.ok(!failure.detail.includes("\u0663"));
  assert.ok(!failure.detail.includes("\u0667"));
});

test("unlisted-statistic quotes a figure as written", () => {
  const digits = run("We reached 1,053 teams.");
  assert.ok(digits.failures.find((f) => f.rule === "unlisted-statistic")?.detail.includes(`"1,053"`));
  const words = run("SIXTY PERCENT of teams.");
  assert.ok(words.failures.find((f) => f.rule === "unlisted-statistic")?.detail.includes(`"SIXTY PERCENT"`));
});

test("a long claim is cut by whole characters with the cut noted", () => {
  const result = run("Some body.", {
    claims: [{ text: "x".repeat(199) + "\u{1F680}" + " more", needsEvidence: true, evidenceRef: null }],
  });
  const failure = result.failures.find((f) => f.rule === "unsupported-claim");
  assert.ok(failure);
  assert.ok(!LONE_SURROGATE.test(failure.detail));
  assert.ok(failure.detail.includes("(first 200 of 205 characters)"));
});

test("unknown-evidence-reference names the look-alike letter", () => {
  const result = run("Some body.", { claims: [{ text: "c", needsEvidence: true, evidenceRef: "r\u0435f-1" }] });
  const failure = result.failures.find((f) => f.rule === "unknown-evidence-reference");
  assert.ok(failure);
  assert.ok(failure.detail.includes(`"r<U+0435>f-1"`));
  assert.ok(!failure.detail.includes("\u0435"));
});

test("no failure detail or evidence item reproduces a character a draft may not contain", () => {
  const result = run("We saved \u0663\u0667 hours and reached 1,053 teams. SIXTY PERCENT grew.", {
    claims: [
      { text: "We are \u0410\u0406 leaders", needsEvidence: true, evidenceRef: null },
      { text: "x".repeat(199) + "\u{1F680}" + " more", needsEvidence: true, evidenceRef: null },
      { text: "c", needsEvidence: true, evidenceRef: "r\u0435f-1" },
    ],
  });
  const items = [...result.failures.map((f) => f.detail), ...result.signals.flatMap((s) => s.evidence)];
  for (const item of items) {
    for (const c of [...item]) {
      assert.ok(allowedInDraft(c), `U+${(c.codePointAt(0) as number).toString(16).toUpperCase()} in ${JSON.stringify(item)}`);
    }
  }
  for (const failure of result.failures) assert.ok(failure.detail.length <= 400);
  for (const signal of result.signals) for (const item of signal.evidence) assert.ok(item.length <= 200);
});

test("analyseDraft does not change the draft", () => {
  const draft = makeDraft("We reached 1,053 teams and saved \u0663\u0667 hours.", {
    claims: [{ text: "We are \u0410 leaders", needsEvidence: true, evidenceRef: null }],
  });
  const before = structuredClone(draft);
  analyseDraft(makeBrief(), slot, draft, DEFAULT_LIMITS);
  assert.deepStrictEqual(draft, before);
});
