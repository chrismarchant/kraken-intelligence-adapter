// Regression tests for the findings of the sixth independent review (commit b8e0170).
import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyDecisionLog } from "../../src/workflow/signing.ts";
import { WorkflowError, settledByLog } from "../../src/workflow/service.ts";
import { makeService } from "./support.ts";

const code = (value: string) => (error: unknown) => error instanceof WorkflowError && error.code === value;

test("an approval the editor replaced cannot be brought back by rewriting status fields or by spoiling the later one", async () => {
  const setup = async () => {
    const made = makeService();
    const id = await made.evaluated();
    const [first, second] = (await made.service.getCampaign(id)).drafts.filter((d) => d.slot === 1);
    await made.decide(id, { kind: "draft", id: first!.id }, "approve");
    await made.decide(id, { kind: "draft", id: second!.id }, "approve"); // the editor's latest choice for post 1
    const slotOne = async () => made.assemble(await made.service.getCampaign(id), true).posts[0]!;
    assert.equal((await slotOne()).approvedDraft?.id, second!.id);
    return { ...made, id, first: first!, second: second!, slotOne };
  };

  // Status fields flipped: the replaced draft marked approved again, the chosen one marked a candidate.
  const flipped = await setup();
  await flipped.store.update(flipped.id, (record) => {
    record.drafts.find((d) => d.id === flipped.first.id)!.status = "approved";
    record.drafts.find((d) => d.id === flipped.second.id)!.status = "candidate";
  });
  assert.equal(verifyDecisionLog(await flipped.service.getCampaign(flipped.id), flipped.keys.verifier).ok, true, "the log itself is untouched");
  assert.equal((await flipped.slotOne()).approvedDraft?.id, flipped.second.id, "the editor's latest choice still holds the post");
  const commands = flipped.assemble(await flipped.service.getCampaign(flipped.id), true).provisionalCommands;
  assert.deepEqual(commands.map((c) => c.content.draftId), [flipped.second.id]);

  // The later approval spoiled by editing its draft: the post becomes undecided; the earlier approval does not return.
  const spoiled = await setup();
  await spoiled.store.update(spoiled.id, (record) => {
    record.drafts.find((d) => d.id === spoiled.second.id)!.body += "\n\nEdited after approval.";
    record.drafts.find((d) => d.id === spoiled.first.id)!.status = "approved";
  });
  await assert.rejects(async () => spoiled.assemble(await spoiled.service.getCampaign(spoiled.id), true), code("nothing-approved"));

  // The later draft deleted outright: the same.
  const deleted = await setup();
  await deleted.store.update(deleted.id, (record) => {
    record.drafts = record.drafts.filter((d) => d.id !== deleted.second.id);
    record.drafts.find((d) => d.id === deleted.first.id)!.status = "approved";
  });
  await assert.rejects(async () => deleted.assemble(await deleted.service.getCampaign(deleted.id), true), code("nothing-approved"));

  // A rejection of the draft that holds a post empties the post, whatever its status is rewritten to.
  const rejected = await setup();
  await rejected.decide(rejected.id, { kind: "draft", id: rejected.second.id }, "reject");
  await rejected.store.update(rejected.id, (record) => {
    record.drafts.find((d) => d.id === rejected.second.id)!.status = "approved";
    record.drafts.find((d) => d.id === rejected.first.id)!.status = "approved";
  });
  await assert.rejects(async () => rejected.assemble(await rejected.service.getCampaign(rejected.id), true), code("nothing-approved"));
  // And a draft the log says was rejected cannot be put up for approval again by resetting its status.
  await rejected.store.update(rejected.id, (record) => {
    record.drafts.find((d) => d.id === rejected.second.id)!.status = "candidate";
  });
  await assert.rejects(
    rejected.service.requestDecision({ campaignId: rejected.id, subject: { kind: "draft", id: rejected.second.id }, action: "approve", proposedRationale: "Again.", requestedBy: "agent" }),
    code("draft-rejected"),
  );
});

test("the narrative a programme is planned on is the editor's latest selection, whatever the status fields say", async () => {
  const { service, store, decide, keys } = makeService();
  const campaign = await service.createCampaign((await import("./support.ts")).syntheticBrief());
  const [one, two] = await service.generateNarratives(campaign.id, 2);
  await decide(campaign.id, { kind: "narrative", id: one!.id }, "select");
  await decide(campaign.id, { kind: "narrative", id: two!.id }, "select"); // the editor changed their mind
  await store.update(campaign.id, (record) => {
    record.narratives.find((n) => n.id === one!.id)!.status = "selected";
    record.narratives.find((n) => n.id === two!.id)!.status = "candidate";
  });
  assert.equal(settledByLog(await service.getCampaign(campaign.id), keys.verifier).selection?.subject.id, two!.id);
  const plan = await service.planProgramme(campaign.id);
  assert.equal(plan.narrativeId, two!.id);

  // If the latest selection is spoiled, nothing is planned: the earlier selection does not return.
  const again = makeService();
  const second = await again.service.createCampaign((await import("./support.ts")).syntheticBrief());
  const [a, b] = await again.service.generateNarratives(second.id, 2);
  await again.decide(second.id, { kind: "narrative", id: a!.id }, "select");
  await again.decide(second.id, { kind: "narrative", id: b!.id }, "select");
  await again.store.update(second.id, (record) => {
    record.narratives.find((n) => n.id === b!.id)!.coreMessage += " Changed.";
    record.narratives.find((n) => n.id === a!.id)!.status = "selected";
  });
  await assert.rejects(again.service.planProgramme(second.id), (error: unknown) => error instanceof WorkflowError);
});

test("every decision about a draft carries its post number inside the signature", async () => {
  const { service, store, evaluated, decide, keys } = makeService();
  const id = await evaluated();
  const draft = (await service.getCampaign(id)).drafts.find((d) => d.slot === 2)!;
  const decision = await decide(id, { kind: "draft", id: draft.id }, "approve");
  assert.equal(decision.subjectSlot, 2);
  const narrative = (await service.getCampaign(id)).decisions[0]!;
  assert.equal(narrative.subjectSlot, null);
  // Re-pointing an approval at another post breaks its signature.
  await store.update(id, (record) => {
    record.decisions.at(-1)!.subjectSlot = 3;
  });
  assert.equal(verifyDecisionLog(await service.getCampaign(id), keys.verifier).ok, false);
});

test("a signature has one spelling: a re-encoded one is not accepted", async () => {
  const { service, store, evaluated, decide, keys } = makeService();
  const id = await evaluated();
  const draft = (await service.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  await decide(id, { kind: "draft", id: draft.id }, "approve");
  assert.equal(verifyDecisionLog(await service.getCampaign(id), keys.verifier).ok, true);
  for (const respell of [(v: string) => v.replace(/=+$/, ""), (v: string) => `${v}\n`, (v: string) => v.replace(/\+/g, "-").replace(/\//g, "_"), (v: string) => ` ${v}`]) {
    const made = makeService();
    const cid = await made.evaluated();
    const d = (await made.service.getCampaign(cid)).drafts.find((x) => x.slot === 1)!;
    await made.decide(cid, { kind: "draft", id: d.id }, "approve");
    const original = (await made.service.getCampaign(cid)).decisions.at(-1)!.signature!.value;
    const changed = respell(original);
    if (changed === original) continue;
    await made.store.update(cid, (record) => {
      record.decisions.at(-1)!.signature!.value = changed;
    });
    const check = verifyDecisionLog(await made.service.getCampaign(cid), made.keys.verifier);
    assert.equal(check.ok, false, JSON.stringify(changed.slice(-6)));
    if (!check.ok) assert.match(check.reason, /signature/);
  }
  void store;
});
