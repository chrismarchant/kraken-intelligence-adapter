import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CreatorRankingError, rankCreators } from "../../src/creators/ranking.ts";

const NOW = new Date("2026-11-13T00:00:00.000Z");
const load = () => JSON.parse(readFileSync("fixtures/creators/synthetic-creators.json", "utf8")) as { set: any; policy: any; assessments: any[] };
const rank = (change?: (f: ReturnType<typeof load>) => void) => {
  const fixture = load();
  change?.(fixture);
  return rankCreators({ set: fixture.set, assessments: fixture.assessments, policy: fixture.policy, now: NOW });
};
const by = (ranking: ReturnType<typeof rank>, id: string) => ranking.results.find((r) => r.creatorId === id)!;

test("the creator fixtures are synthetic and say so", () => {
  const fixture = load();
  assert.equal(fixture.set.synthetic, true);
  for (const candidate of fixture.set.candidates) {
    assert.match(candidate.displayName, /\(fictional\)/);
    assert.equal(candidate.synthetic, true);
    assert.ok(candidate.evidence.every((e: { synthetic: boolean }) => e.synthetic));
  }
  assert.equal(rank().synthetic, true);
});

test("a creator who fails a mandatory constraint never ranks above an eligible one, whatever they score", () => {
  const ranking = rank();
  const birch = by(ranking, "creator-birch");
  const alder = by(ranking, "creator-alder");
  assert.ok(birch.weightedTotal > alder.weightedTotal, "the conflicted creator has the highest score");
  assert.equal(birch.eligible, false);
  assert.deepEqual(birch.ineligibility.map((r) => r.rule).sort(), ["blocking-concern", "over-budget"]);
  assert.deepEqual(ranking.results.map((r) => [r.creatorId, r.eligible]), [
    ["creator-alder", true],
    ["creator-cedar", true],
    ["creator-birch", false],
    ["creator-dune", false],
  ]);
  assert.deepEqual(by(ranking, "creator-dune").ineligibility.map((r) => r.rule), ["insufficient-evidence"]);
});

test("the score is the stated weighted sum and every dimension shows its weight, reason and evidence", () => {
  const alder = by(rank(), "creator-alder");
  // (0.9×3 + 0.7×2 + 0.8×2 + 0.7×2 + 0.8×1) / 10
  assert.equal(alder.weightedTotal, 0.79);
  assert.equal(alder.dimensions.length, 5);
  assert.ok(Math.abs(alder.dimensions.reduce((sum, d) => sum + d.weight, 0) - 1) < 1e-9);
  for (const d of alder.dimensions) {
    assert.ok(d.rationale.length > 0);
    assert.ok(d.evidenceIds.length > 0);
  }
  // Doubling every weight changes nothing: weights are relative.
  const doubled = by(rank((f) => { for (const k of Object.keys(f.policy.weights)) f.policy.weights[k] *= 2; }), "creator-alder");
  assert.equal(doubled.weightedTotal, 0.79);
});

test("confidence falls when evidence is thin, stale or from a single source", () => {
  const ranking = rank();
  const alder = by(ranking, "creator-alder").evidenceConfidence;
  const cedar = by(ranking, "creator-cedar").evidenceConfidence;
  const dune = by(ranking, "creator-dune").evidenceConfidence;
  assert.equal(alder, 1, "four fresh items from three sources, every dimension backed");
  assert.equal(cedar, 0.45, "three fresh items, all from one source");
  assert.equal(dune, 0, "only stale evidence");
  assert.ok(alder > cedar && cedar > dune);
});

test("policy changes eligibility, not scores", () => {
  const strict = rank();
  const relaxed = rank((f) => {
    f.policy.sponsorshipPlanned = false;
    f.policy.maxFeePerPost = null;
  });
  assert.deepEqual(by(relaxed, "creator-birch").ineligibility.map((r) => r.rule), ["blocking-concern"], "the conflict still rules the creator out");
  assert.equal(by(relaxed, "creator-birch").weightedTotal, by(strict, "creator-birch").weightedTotal);

  const refused = rank((f) => { f.set.candidates[0].sponsorshipConsent = "refused"; });
  assert.deepEqual(by(refused, "creator-alder").ineligibility.map((r) => r.rule), ["sponsorship-refused"]);
  const spanish = rank((f) => { f.policy.requiredLanguage = "es"; });
  assert.deepEqual(spanish.results.filter((r) => r.eligible).map((r) => r.creatorId), ["creator-cedar"]);
  const gone = rank((f) => { f.set.candidates[0].availability = "unavailable"; });
  assert.equal(by(gone, "creator-alder").eligible, false);
});

test("a missing or unsupported judgement is an error, never a guess", () => {
  assert.throws(() => rank((f) => { f.assessments = f.assessments.filter((a) => !(a.creatorId === "creator-cedar" && a.dimension === "engagement_quality")); }), CreatorRankingError);
  assert.throws(() => rank((f) => { f.assessments.push({ ...f.assessments[0] }); }), /exactly one assessment/);
  assert.throws(() => rank((f) => { f.assessments[0].evidenceIds = ["ev-birch-1"]; }), /which the candidate does not have/);
  assert.throws(() => rank((f) => { delete f.policy.weights.icp_relevance; }));
  assert.throws(() => rank((f) => { f.assessments[0].score = 1.4; }));
  assert.throws(() => rank((f) => { f.set.candidates.push({ ...f.set.candidates[0] }); }), /appears twice/);
  assert.throws(() => rank((f) => { f.set.candidates[0].contactEmail = "x"; }), "a candidate cannot carry contact details");
});

test("the ranking is deterministic and states what it is not", () => {
  assert.deepEqual(rank(), rank());
  const caveats = rank().caveats.join(" ");
  assert.match(caveats, /does not establish who their audience is/);
  assert.match(caveats, /commissions, contacts and pays no one/);
});
