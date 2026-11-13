import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LimitExceededError } from "../../src/limits.ts";
import { FileCampaignStore, RecordNotFoundError, RevisionConflictError } from "../../src/store/store.ts";
import { mapLimit } from "../../src/util/runtime.ts";
import { WorkflowError } from "../../src/workflow/service.ts";
import { makeService, syntheticBrief } from "./support.ts";

const limit = (name: string) => (error: unknown) => error instanceof LimitExceededError && error.limit === name;
const code = (value: string) => (error: unknown) => error instanceof WorkflowError && error.code === value;

test("an invalid brief is refused and nothing is stored", async () => {
  const { service } = makeService();
  await assert.rejects(service.createCampaign({ ...syntheticBrief(), objectives: [] }), code("invalid-brief"));
  const duplicate = syntheticBrief();
  duplicate.references[1]!.id = duplicate.references[0]!.id;
  await assert.rejects(service.createCampaign(duplicate), code("invalid-brief"));
  assert.deepEqual(await service.listCampaigns(), []);
});

test("the number of posts, narratives and variants is bounded", async () => {
  const { service, planned } = makeService();
  const tooMany = syntheticBrief();
  tooMany.cadence = { postsPerWeek: 7, weeks: 4 };
  await assert.rejects(service.createCampaign(tooMany), limit("maxSlots"));

  const campaign = await service.createCampaign(syntheticBrief());
  await assert.rejects(service.generateNarratives(campaign.id, 1), code("invalid-count"));
  await service.generateNarratives(campaign.id, 3);
  await assert.rejects(service.generateNarratives(campaign.id, 3), limit("maxNarratives"));

  const id = await planned();
  await assert.rejects(service.generateDrafts(id, { variants: 1 }), code("invalid-count"));
  await assert.rejects(service.generateDrafts(id, { variants: 5 }), limit("maxVariantsPerSlot"));
  await service.generateDrafts(id, { variants: 3 });
  await assert.rejects(service.generateDrafts(id, { slots: [1], variants: 2 }), limit("maxVariantsPerSlot"));
  await assert.rejects(service.generateDrafts(id), code("nothing-to-draft"));
});

test("a model that returns the wrong number of items fails the step and stores nothing", async () => {
  const { service } = makeService({ script: { narrativeCount: 2 } });
  const campaign = await service.createCampaign(syntheticBrief());
  await assert.rejects(service.generateNarratives(campaign.id, 3), code("model-count-mismatch"));
  assert.equal((await service.getCampaign(campaign.id)).narratives.length, 0);
});

test("model calls are counted and the campaign budget is enforced before a step runs", async () => {
  const { service, gateway, planned } = makeService({ limits: { maxModelCalls: 5 } });
  const id = await planned(); // narratives + plan = 2 calls
  assert.equal((await service.getCampaign(id)).budget.modelCalls, 2);
  // Drafting four slots needs four calls; only three remain.
  const before = gateway.calls.length;
  await assert.rejects(service.generateDrafts(id, { variants: 2 }), limit("maxModelCalls"));
  assert.equal(gateway.calls.length, before, "no call is made once the budget would be exceeded");
  await service.generateDrafts(id, { slots: [1, 2, 3], variants: 2 });
  const record = await service.getCampaign(id);
  assert.equal(record.budget.modelCalls, 5);
  assert.equal(record.budget.usage.completionTokens, 5 * 400);
  await assert.rejects(service.generateDrafts(id, { slots: [4], variants: 2 }), limit("maxModelCalls"));
});

test("fan-out never runs more calls at once than the concurrency limit", async () => {
  let inFlight = 0;
  let peak = 0;
  const results = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
    return n * 2;
  });
  assert.deepEqual(results, [2, 4, 6, 8, 10, 12, 14]);
  assert.equal(peak, 3);
});

test("the file store keeps one file per campaign, survives a restart and detects conflicting writes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kic-store-"));
  const { service } = makeService();
  const created = await service.createCampaign(syntheticBrief());

  const store = new FileCampaignStore(dir);
  await store.create(created);
  await assert.rejects(store.create(created), /already exists/);

  // A second store on the same directory stands in for a restarted process.
  const reopened = new FileCampaignStore(dir);
  assert.deepEqual(await reopened.list(), [created.id]);
  const first = await reopened.get(created.id);
  const second = await reopened.get(created.id);
  first.revision += 1;
  await reopened.put(first);
  second.revision += 1;
  await assert.rejects(reopened.put(second), RevisionConflictError);

  await assert.rejects(reopened.get("camp-999"), RecordNotFoundError);
  await assert.rejects(reopened.get("../../etc/passwd"), /lowercase id/);
});
