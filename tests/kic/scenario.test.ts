import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runSyntheticCampaign, SYNTHETIC_EDITOR } from "../../src/cli/scenario.ts";
import { ProgrammePackage, ProvisionalPublishCommand } from "../../src/contracts/index.ts";
import { FixtureGateway } from "../../src/gateway/fixture.ts";
import { decisionIsAuthentic, generateDecisionKeyPair } from "../../src/workflow/signing.ts";
import { BRIEF_PATH } from "./support.ts";

const FIXTURES = "fixtures/llm/synthetic-harbourline";
// One operator key for the whole file, so that two replays sign identically.
const keys = generateDecisionKeyPair();
const run = () =>
  runSyntheticCampaign({ gateway: new FixtureGateway(FIXTURES), briefPath: BRIEF_PATH, exportRoot: mkdtempSync(join(tmpdir(), "kic-export-")), keys });

test("the synthetic campaign runs end to end from recorded Mistral output", async () => {
  const { record, package: pkg, export: exported, comparison } = await run();

  // Brief and coordinated programme.
  assert.equal(record.brief.synthetic, true);
  assert.ok(record.interpretation);
  assert.equal(record.narratives.length, 3, "three narrative alternatives");
  assert.equal(record.narratives.filter((n) => n.status === "selected").length, 1);
  assert.equal(record.narratives.filter((n) => n.status === "rejected").length, 1);
  assert.equal(record.plan!.slots.length, 4);
  assert.deepEqual(record.plan!.slots.map((s) => [s.week, s.orderInWeek]), [[1, 1], [1, 2], [2, 1], [2, 2]]);

  // Alternatives were written by the recorded model for every post.
  for (const slot of record.plan!.slots) {
    const original = record.drafts.filter((d) => d.slot === slot.slot && d.revisionOf === null);
    assert.equal(original.length, 2, `two alternatives for post ${slot.slot}`);
    assert.notEqual(original[0]!.body, original[1]!.body);
  }
  const models = new Set(record.drafts.map((d) => `${d.generation.provider}/${d.generation.model}`));
  assert.deepEqual([...models], ["mistral/mistral-large-4"]);
  assert.ok(record.drafts.every((d) => d.generation.source === "fixture"), "this test replays; it makes no live call");

  // Comparative evaluation with evidence, confidence and stated limits.
  assert.ok(record.plan!.slots.every((s) => record.evaluations.some((e) => e.slot === s.slot)));
  for (const evaluation of record.evaluations) {
    assert.equal(evaluation.evaluator.kind, "mock-jev");
    assert.equal(evaluation.evaluator.live, false);
    assert.ok(evaluation.limitations.length >= 3);
    assert.ok(evaluation.candidates.every((c) => c.signals.length === evaluation.criteria.length));
  }
  assert.match(comparison, /\| Rank \| Draft \|/);
  assert.match(comparison, /Limits of this comparison/);

  // Editorial selection, rejection, revision and approval, all by the labelled test actor.
  const actions = record.decisions.map((d) => d.action);
  for (const action of ["select", "reject", "request-revision", "approve"]) assert.ok(actions.includes(action as never), `${action} was exercised`);
  assert.ok(record.decisions.every((d) => d.actor.id === SYNTHETIC_EDITOR.id && d.actor.kind === "human"));
  assert.ok(record.decisions.every((d) => decisionIsAuthentic(record.id, d, keys.verifier)), "every decision carries a valid operator signature");
  assert.match(pkg.provenance.notes.join(" "), new RegExp(`signature from operator key ${keys.verifier.keyId}`));
  assert.equal(record.drafts.filter((d) => d.revisionPass === 1).length, 1);
  assert.equal(record.drafts.filter((d) => d.status === "superseded").length, 1);

  // Exportable programme package.
  ProgrammePackage.parse(pkg);
  assert.equal(pkg.approvalState, "complete");
  assert.equal(pkg.synthetic, true);
  assert.equal(pkg.posts.filter((p) => p.state === "approved").length, 4);
  assert.equal(pkg.provisionalCommands.length, 4);
  for (const command of pkg.provisionalCommands) {
    ProvisionalPublishCommand.parse(command);
    assert.equal(command.status, "NON-EXECUTABLE");
    assert.equal(command.executable, false);
    assert.equal(command.authoritative, false);
  }
  for (const path of [exported.packagePath, exported.summaryPath, exported.commandsPath]) assert.ok(existsSync(path), `${path} was written`);
  assert.match(exported.commandsPath, /NON-EXECUTABLE/);
  const summary = readFileSync(exported.summaryPath, "utf8");
  assert.match(summary, /SYNTHETIC TEST DATA/);
  assert.match(summary, /NON-EXECUTABLE/);
  ProgrammePackage.parse(JSON.parse(readFileSync(exported.packagePath, "utf8")));

  // Bounded execution: the whole run is a known, small number of model steps.
  assert.equal(record.budget.modelCalls, 8);
  assert.equal(record.budget.providerRequests, 0, "a replay sends nothing to the provider");
  assert.equal(statSync(exported.packagePath).mode & 0o777, 0o600, "exports are private to their owner");
});

test("every approved post in the recorded run satisfies the brief's mandatory constraints", async () => {
  const { package: pkg } = await run();
  const banned = pkg.brief.constraints.mustAvoid.map((t) => t.toLowerCase());
  const references = new Set(pkg.brief.references.map((r) => r.id));
  for (const post of pkg.posts) {
    const draft = post.approvedDraft!;
    assert.ok(draft.body.length <= 3000);
    for (const term of banned) assert.ok(!draft.body.toLowerCase().includes(term), `post ${post.slot.slot} avoids "${term}"`);
    for (const claim of draft.claims.filter((c) => c.needsEvidence)) {
      assert.ok(claim.evidenceRef && references.has(claim.evidenceRef), `post ${post.slot.slot}: "${claim.text}" cites a brief reference`);
    }
  }
});

test("replaying the recorded run twice yields an identical package", async () => {
  const [a, b] = await Promise.all([run(), run()]);
  assert.equal(a.export.packageSha256, b.export.packageSha256);
  assert.deepEqual(a.package, b.package);
});
