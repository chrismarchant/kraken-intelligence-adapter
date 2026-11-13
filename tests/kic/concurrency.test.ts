import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LimitExceededError } from "../../src/limits.ts";
import { FileCampaignStore, MemoryCampaignStore } from "../../src/store/store.ts";
import type { CampaignStore } from "../../src/store/store.ts";
import { mapLimitSettled } from "../../src/util/runtime.ts";
import { WorkflowError } from "../../src/workflow/service.ts";
import { EDITOR, makeService, syntheticBrief } from "./support.ts";

const limit = (name: string) => (error: unknown) => error instanceof LimitExceededError && error.limit === name;
const stores: Array<[string, () => CampaignStore]> = [
  ["memory store", () => new MemoryCampaignStore()],
  ["file store", () => new FileCampaignStore(mkdtempSync(join(tmpdir(), "kic-race-")))],
];

for (const [name, makeStore] of stores) {
  test(`${name}: a human decision is never lost to a write made at the same moment`, async () => {
    // The reviewer's scenario: a draft is approved; the editor confirms a rejection while the
    // agent fires other writes. Every write must survive, and the rejection must stand.
    for (let round = 0; round < 10; round++) {
      const { service, operator, evaluated, decide, assemble } = makeService({ store: makeStore() });
      const id = await evaluated();
      const [target, other] = (await service.getCampaign(id)).drafts.filter((d) => d.slot === 1);
      await decide(id, { kind: "draft", id: target!.id }, "approve");
      const rejection = await service.requestDecision({ campaignId: id, subject: { kind: "draft", id: target!.id }, action: "reject", proposedRationale: "Withdraw.", requestedBy: "agent" });

      const results = await Promise.allSettled([
        service.confirmDecision({ campaignId: id, requestId: rejection.requestId, code: operator.codeFor(rejection.requestId), actor: EDITOR, rationale: "Not this one." }),
        ...Array.from({ length: 6 }, (_, i) =>
          service.requestDecision({ campaignId: id, subject: { kind: "draft", id: other!.id }, action: "select", proposedRationale: `Noise ${i}.`, requestedBy: "agent" }),
        ),
        service.evaluateDrafts(id, { slots: [2] }),
      ]);
      assert.deepEqual(results.map((r) => r.status), Array(8).fill("fulfilled"));

      const record = await service.getCampaign(id);
      assert.equal(record.drafts.find((d) => d.id === target!.id)!.status, "rejected", "the rejection stands");
      assert.equal(record.decisions.filter((d) => d.action === "reject" && d.subject.id === target!.id).length, 1, "the rejection is on record");
      assert.equal(record.decisionRequests.find((r) => r.id === rejection.requestId)!.state, "confirmed");
      assert.equal(record.decisionRequests.filter((r) => r.proposedRationale.startsWith("Noise")).length, 6, "no concurrent write was lost");
      assert.throws(() => assemble(record, true), (error: unknown) => error instanceof WorkflowError && error.code === "nothing-approved");
    }
  });
}

test("file store: many writers at once neither corrupt the file nor lose an update, across two store instances", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kic-file-race-"));
  const first = new FileCampaignStore(dir);
  // A second instance on the same directory stands in for another process (the operator's tool).
  const second = new FileCampaignStore(dir);
  const { service } = makeService({ store: first });
  const { id } = await service.createCampaign(syntheticBrief());

  const writers = 60;
  await Promise.all(
    Array.from({ length: writers }, (_, i) =>
      (i % 2 === 0 ? first : second).update(id, (record) => {
        record.audit.push({ at: "2026-01-05T09:00:00.000Z", event: "race", detail: `writer ${i}` });
      }),
    ),
  );
  const record = await second.get(id);
  assert.equal(record.audit.filter((e) => e.event === "race").length, writers, "every update was applied");
  assert.equal(record.revision, writers);
  assert.equal(new Set(record.audit.filter((e) => e.event === "race").map((e) => e.detail)).size, writers);
  assert.deepEqual(readdirSync(dir).filter((n) => !n.endsWith(".json")), [], "no temporary or lock files are left behind");
});

test("file store: a lock left by a dead process is cleared, and a live one is waited for then reported", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kic-lock-"));
  const store = new FileCampaignStore(dir, { lockTimeoutMs: 150, staleLockMs: 60_000 });
  const { service } = makeService({ store });
  const { id } = await service.createCampaign(syntheticBrief());
  const { writeFileSync, utimesSync } = await import("node:fs");
  const lock = join(dir, `${id}.json.lock`);

  writeFileSync(lock, "999999 live\n");
  await assert.rejects(store.update(id, () => undefined), /locked by another writer/);

  const old = new Date(Date.now() - 120_000);
  utimesSync(lock, old, old);
  await store.update(id, (record) => {
    record.audit.push({ at: "2026-01-05T09:00:00.000Z", event: "after-stale-lock", detail: "ok" });
  });
  assert.ok((await store.get(id)).audit.some((e) => e.event === "after-stale-lock"));
});

test("steps started together cannot spend the same remaining budget", async () => {
  const { service, gateway, planned } = makeService({ limits: { maxModelCalls: 5 }, script: { delayMs: 10 } });
  const id = await planned(); // 2 calls used; 3 remain
  // Three draft steps of two calls each, started at once: only one can be afforded.
  const results = await Promise.allSettled([
    service.generateDrafts(id, { slots: [1, 2], variants: 2 }),
    service.generateDrafts(id, { slots: [3, 4], variants: 2 }),
    service.generateDrafts(id, { slots: [1, 3], variants: 2 }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  for (const r of results) if (r.status === "rejected") assert.ok(limit("maxModelCalls")(r.reason));
  const record = await service.getCampaign(id);
  assert.equal(gateway.calls.filter((c) => c.startsWith("linkedin-draft")).length, 2, "the model was called only for the step that was affordable");
  assert.equal(record.budget.modelCalls, 4);
  assert.ok(record.budget.modelCalls <= 5);
  assert.equal(record.drafts.length, 4);
});

test("two runs of the same step cannot push a campaign past a count limit; the loser's cost is still recorded", async () => {
  const { service, gateway } = makeService({ script: { delayMs: 10 } });
  const campaign = await service.createCampaign(syntheticBrief());
  // The limit is five narratives. Two requests for three each both pass the first check.
  const results = await Promise.allSettled([service.generateNarratives(campaign.id, 3), service.generateNarratives(campaign.id, 3)]);
  assert.deepEqual(results.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
  const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
  assert.ok(limit("maxNarratives")(rejected.reason));
  const record = await service.getCampaign(campaign.id);
  assert.equal(record.narratives.length, 3);
  assert.equal(gateway.calls.length, 2);
  assert.equal(record.budget.modelCalls, 2, "both calls are charged");
  assert.equal(record.budget.usage.completionTokens, 800, "the discarded result's tokens are on the books");
  assert.ok(record.audit.some((e) => e.event === "step-discarded"));
});

test("two revisions of one draft cannot both be stored", async () => {
  const { service, evaluated, decide } = makeService({ script: { delayMs: 10 } });
  const id = await evaluated();
  const draft = (await service.getCampaign(id)).drafts.find((d) => d.slot === 2)!;
  await decide(id, { kind: "draft", id: draft.id }, "request-revision", "Tighten it.");
  const results = await Promise.allSettled([service.reviseDraft(id, draft.id), service.reviseDraft(id, draft.id)]);
  assert.deepEqual(results.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
  const record = await service.getCampaign(id);
  assert.equal(record.drafts.filter((d) => d.revisionOf === draft.id).length, 1);
  assert.equal(record.drafts.find((d) => d.id === draft.id)!.status, "superseded");
});

test("a failed step is charged, so it cannot be repeated without limit", async () => {
  const { service, gateway } = makeService({ limits: { maxModelCalls: 3 }, script: { failPurpose: /^campaign-brief$/ } });
  const campaign = await service.createCampaign(syntheticBrief());
  for (let attempt = 1; attempt <= 3; attempt++) {
    await assert.rejects(service.interpretBrief(campaign.id), /scripted failure/);
    const record = await service.getCampaign(campaign.id);
    assert.equal(record.budget.modelCalls, attempt, "each failed attempt is counted");
    assert.equal(record.budget.usage.completionTokens, attempt * 400, "and so are the tokens it used");
    assert.equal(record.budget.providerRequests, attempt * 3, "and the requests it sent");
    assert.equal(record.interpretation, null, "nothing from a failed step is stored");
  }
  await assert.rejects(service.interpretBrief(campaign.id), limit("maxModelCalls"));
  assert.equal(gateway.calls.length, 3, "the fourth attempt never reached the model");
});

test("after one call in a fan-out fails, no further call is started and none is left running", async () => {
  const { service, gateway, planned } = makeService({ limits: { maxConcurrency: 2 }, script: { failPurpose: /slot-1$/, delayMs: 15 } });
  const id = await planned();
  await assert.rejects(service.generateDrafts(id, { variants: 2 }), /scripted failure/);
  const draftCalls = gateway.calls.filter((c) => c.startsWith("linkedin-draft"));
  assert.deepEqual(draftCalls, ["linkedin-draft.slot-1", "linkedin-draft.slot-2"], "slots 3 and 4 were never requested");
  assert.deepEqual(gateway.cancelled, ["linkedin-draft.slot-2"], "the call in flight was cancelled");
  const record = await service.getCampaign(id);
  assert.equal(record.drafts.length, 0, "nothing partial is stored");
  assert.equal(record.budget.modelCalls, 2 + 2, "the two calls that were sent are charged; the two never sent are not");
  assert.ok(record.audit.some((e) => e.event === "step-failed"));
});

test("a model call that overruns its time limit is cancelled, charged and reported", async () => {
  const { service, gateway } = makeService({ limits: { modelCallTimeoutMs: 40 }, script: { hang: true } });
  const campaign = await service.createCampaign(syntheticBrief());
  await assert.rejects(service.interpretBrief(campaign.id), limit("modelCallTimeoutMs"));
  assert.deepEqual(gateway.cancelled, ["campaign-brief"], "the request itself was cancelled, not just abandoned");
  const record = await service.getCampaign(campaign.id);
  assert.equal(record.budget.modelCalls, 1);
  assert.equal(record.interpretation, null);
});

test("the token allowance is checked against what a step may use, before it starts", async () => {
  const { service, gateway } = makeService({ limits: { maxCompletionTokens: 9000 } });
  const campaign = await service.createCampaign(syntheticBrief());
  await service.interpretBrief(campaign.id); // may use 8000; uses 400
  // Narratives may use 10000 more: 400 + 10000 exceeds 9000, so the step is refused unstarted.
  await assert.rejects(service.generateNarratives(campaign.id, 2), limit("maxCompletionTokens"));
  assert.deepEqual(gateway.calls, ["campaign-brief"]);
});

test("bounded fan-out reports every outcome and stops dispatching after a failure", async () => {
  const started: number[] = [];
  let failures = 0;
  const outcomes = await mapLimitSettled(
    [1, 2, 3, 4, 5, 6],
    2,
    async (n) => {
      started.push(n);
      await new Promise((r) => setTimeout(r, n === 1 ? 5 : 20));
      if (n === 1) throw new Error("first fails");
      return n;
    },
    () => {
      failures += 1;
    },
  );
  assert.deepEqual(started, [1, 2]);
  assert.deepEqual(outcomes.map((o) => o.status), ["rejected", "fulfilled", "skipped", "skipped", "skipped", "skipped"]);
  assert.equal(failures, 1);
});
