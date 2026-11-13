import assert from "node:assert/strict";
import { test } from "node:test";
import { approvalOf } from "../../src/workflow/assemble.ts";
import { WorkflowError } from "../../src/workflow/service.ts";
import { EDITOR, cleanDraft, makeService, syntheticBrief, expectedFor } from "./support.ts";

/** Assert that a promise rejects with a WorkflowError carrying the given code. */
async function refuses(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof WorkflowError, `expected WorkflowError, got ${String(error)}`);
    assert.equal(error.code, code);
    return true;
  });
}

test("a programme cannot be planned until a person has selected a narrative", async () => {
  const { service } = makeService();
  const campaign = await service.createCampaign(syntheticBrief());
  await service.generateNarratives(campaign.id, 2);
  await refuses(service.planProgramme(campaign.id), "no-narrative-selected");
});

test("requesting a decision changes nothing and never returns the confirmation code", async () => {
  const { service, operator } = makeService();
  const campaign = await service.createCampaign(syntheticBrief());
  const [first] = await service.generateNarratives(campaign.id, 2);
  const view = await service.requestDecision({
    campaignId: campaign.id,
    subject: { kind: "narrative", id: first!.id },
    action: "select",
    proposedRationale: "Strongest angle.",
    requestedBy: "agent",
  });
  const code = operator.codeFor(view.requestId);
  assert.ok(code.length >= 32, "the code is long and random");
  assert.ok(!JSON.stringify(view).includes(code), "the code is not in the view returned to the requester");

  const record = await service.getCampaign(campaign.id);
  assert.ok(!JSON.stringify(record).includes(code), "the code is not stored in the campaign record");
  assert.equal(record.narratives[0]!.status, "candidate", "nothing is selected until a person confirms");
  assert.equal(record.decisions.length, 0);
  await refuses(service.planProgramme(campaign.id), "no-narrative-selected");
});

test("a wrong code is refused, counted, and voids the request after the attempt limit", async () => {
  const { service, operator, limits } = makeService();
  const campaign = await service.createCampaign(syntheticBrief());
  const [first] = await service.generateNarratives(campaign.id, 2);
  const view = await service.requestDecision({
    campaignId: campaign.id,
    subject: { kind: "narrative", id: first!.id },
    action: "select",
    proposedRationale: "Strongest angle.",
    requestedBy: "agent",
  });
  const expected = await expectedFor(service, campaign.id, view.requestId);
  const confirm = (code: string) => service.confirmDecision({ campaignId: campaign.id, requestId: view.requestId, code, actor: EDITOR, rationale: "Chosen.", expected });

  for (let attempt = 1; attempt <= limits.maxDecisionCodeAttempts; attempt++) await refuses(confirm(`guess-${attempt}`), "invalid-code");
  const record = await service.getCampaign(campaign.id);
  const request = record.decisionRequests[0]!;
  assert.equal(request.failedAttempts, limits.maxDecisionCodeAttempts);
  assert.equal(request.state, "voided");
  assert.equal(record.decisions.length, 0);
  // Even the right code is useless once the request is void.
  await refuses(confirm(operator.codeFor(view.requestId)), "request-not-pending");
  assert.equal((await service.getCampaign(campaign.id)).narratives[0]!.status, "candidate");
});

test("a decision needs a named human actor and the editor's own reason", async () => {
  const { service, operator } = makeService();
  const campaign = await service.createCampaign(syntheticBrief());
  const [first] = await service.generateNarratives(campaign.id, 2);
  const view = await service.requestDecision({
    campaignId: campaign.id,
    subject: { kind: "narrative", id: first!.id },
    action: "select",
    proposedRationale: "Strongest angle.",
    requestedBy: "agent",
  });
  const code = operator.codeFor(view.requestId);
  const base = { campaignId: campaign.id, requestId: view.requestId, code, rationale: "Chosen.", expected: await expectedFor(service, campaign.id, view.requestId) };
  for (const actor of [
    { kind: "agent", id: "a1", name: "Agent" },
    { kind: "model", id: "m1", name: "Model" },
    { kind: "human", id: "", name: "Nobody" },
    { kind: "human", id: "e1", name: "" },
  ]) {
    await refuses(service.confirmDecision({ ...base, actor: actor as never }), "invalid-actor");
  }
  await refuses(service.confirmDecision({ ...base, actor: EDITOR, rationale: "   " }), "invalid-rationale");
  assert.equal((await service.getCampaign(campaign.id)).decisions.length, 0);
});

test("a decision request expires", async () => {
  const { service, operator, clock, limits } = makeService();
  const campaign = await service.createCampaign(syntheticBrief());
  const [first] = await service.generateNarratives(campaign.id, 2);
  const view = await service.requestDecision({
    campaignId: campaign.id,
    subject: { kind: "narrative", id: first!.id },
    action: "select",
    proposedRationale: "Strongest angle.",
    requestedBy: "agent",
  });
  clock.advance(limits.decisionRequestTtlMs + 60_000);
  await refuses(
    service.confirmDecision({ campaignId: campaign.id, requestId: view.requestId, code: operator.codeFor(view.requestId), actor: EDITOR, rationale: "Late.", expected: await expectedFor(service, campaign.id, view.requestId) }),
    "request-expired",
  );
  const record = await service.getCampaign(campaign.id);
  assert.equal(record.decisionRequests[0]!.state, "expired");
  assert.equal(record.decisions.length, 0);
});

test("a confirmed request cannot be replayed", async () => {
  const { service, operator } = makeService();
  const campaign = await service.createCampaign(syntheticBrief());
  const [first] = await service.generateNarratives(campaign.id, 2);
  const view = await service.requestDecision({
    campaignId: campaign.id,
    subject: { kind: "narrative", id: first!.id },
    action: "select",
    proposedRationale: "Strongest angle.",
    requestedBy: "agent",
  });
  const confirmation = {
    campaignId: campaign.id,
    requestId: view.requestId,
    code: operator.codeFor(view.requestId),
    actor: EDITOR,
    rationale: "Chosen.",
    expected: await expectedFor(service, campaign.id, view.requestId),
  };
  const decision = await service.confirmDecision(confirmation);
  assert.equal(decision.actor.kind, "human");
  await refuses(service.confirmDecision(confirmation), "request-not-pending");
  assert.equal((await service.getCampaign(campaign.id)).decisions.length, 1);
});

test("a draft cannot be approved before it has been evaluated", async () => {
  const { service, planned } = makeService();
  const id = await planned();
  const drafts = await service.generateDrafts(id, { variants: 2 });
  await refuses(
    service.requestDecision({ campaignId: id, subject: { kind: "draft", id: drafts[0]!.id }, action: "approve", proposedRationale: "Looks good.", requestedBy: "agent" }),
    "not-evaluated",
  );
});

test("a draft that fails a mandatory constraint cannot be approved, whatever it scores", async () => {
  const { service, planned } = makeService({
    script: {
      drafts: (_slot, variants) =>
        Array.from({ length: variants }, (_, i) =>
          i === 0 ? cleanDraft("banned", "We guarantee results for every warehouse.") : cleanDraft(`clean-${i}`),
        ),
    },
  });
  const id = await planned();
  const drafts = await service.generateDrafts(id, { variants: 2 });
  const [evaluation] = await service.evaluateDrafts(id, { slots: [1] });
  const banned = drafts.find((d) => d.slot === 1 && d.variant === "banned")!;
  const candidate = evaluation!.candidates.find((c) => c.draftId === banned.id)!;
  assert.equal(candidate.eligibility.eligible, false);
  assert.equal(candidate.eligibility.failures[0]!.rule, "must-avoid-term");
  assert.equal(evaluation!.ranking.at(-1), banned.id, "the ineligible draft ranks last");
  await refuses(
    service.requestDecision({ campaignId: id, subject: { kind: "draft", id: banned.id }, action: "approve", proposedRationale: "High score.", requestedBy: "agent" }),
    "ineligible",
  );
});

test("approval is recorded against the exact text, with the editor's name and reason", async () => {
  const { service, evaluated, decide, keys } = makeService();
  const id = await evaluated();
  const record = await service.getCampaign(id);
  const draft = record.drafts.find((d) => d.slot === 1)!;
  const decision = await decide(id, { kind: "draft", id: draft.id }, "approve");
  const after = await service.getCampaign(id);
  const approved = after.drafts.find((d) => d.id === draft.id)!;
  assert.equal(approved.status, "approved");
  assert.deepEqual(decision.actor, EDITOR);
  assert.equal(approvalOf(after, approved, keys.verifier)?.id, decision.id);
  assert.equal(decision.signature?.keyId, keys.signer.keyId, "the decision is signed with the operator key");
  assert.match(after.audit.at(-1)!.detail, /Test Editor/);
});

test("approving another draft for the same post withdraws the earlier approval", async () => {
  const { service, evaluated, decide } = makeService();
  const id = await evaluated();
  const [a, b] = (await service.getCampaign(id)).drafts.filter((d) => d.slot === 1);
  await decide(id, { kind: "draft", id: a!.id }, "approve");
  await decide(id, { kind: "draft", id: b!.id }, "approve");
  const after = await service.getCampaign(id);
  assert.equal(after.drafts.find((d) => d.id === a!.id)!.status, "candidate");
  assert.equal(after.drafts.find((d) => d.id === b!.id)!.status, "approved");
  assert.equal(after.drafts.filter((d) => d.slot === 1 && d.status === "approved").length, 1);
  assert.ok(after.audit.some((e) => e.event === "approval-withdrawn"));
});

test("a rejected draft cannot later be approved", async () => {
  const { service, evaluated, decide } = makeService();
  const id = await evaluated();
  const draft = (await service.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  await decide(id, { kind: "draft", id: draft.id }, "reject");
  await refuses(
    service.requestDecision({ campaignId: id, subject: { kind: "draft", id: draft.id }, action: "approve", proposedRationale: "Changed mind.", requestedBy: "agent" }),
    "draft-rejected",
  );
});

test("a pending approval is void if the draft is rejected before it is confirmed", async () => {
  const { service, operator, evaluated, decide } = makeService();
  const id = await evaluated();
  const draft = (await service.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  const pending = await service.requestDecision({ campaignId: id, subject: { kind: "draft", id: draft.id }, action: "approve", proposedRationale: "Good.", requestedBy: "agent" });
  await decide(id, { kind: "draft", id: draft.id }, "reject");
  await refuses(
    service.confirmDecision({ campaignId: id, requestId: pending.requestId, code: operator.codeFor(pending.requestId), actor: EDITOR, rationale: "Approve.", expected: await expectedFor(service, id, pending.requestId) }),
    "draft-rejected",
  );
  const after = await service.getCampaign(id);
  assert.equal(after.drafts.find((d) => d.id === draft.id)!.status, "rejected");
  assert.equal(after.decisionRequests.find((r) => r.id === pending.requestId)!.state, "voided");
});

test("a draft is revised only on an editor's confirmed request, and only a bounded number of times", async () => {
  const { service, evaluated, decide, limits } = makeService();
  const id = await evaluated();
  const original = (await service.getCampaign(id)).drafts.find((d) => d.slot === 2)!;
  await refuses(service.reviseDraft(id, original.id), "no-revision-requested");

  let current = original;
  for (let pass = 1; pass <= limits.maxRevisionPasses; pass++) {
    await decide(id, { kind: "draft", id: current.id }, "request-revision", `Tighten it, pass ${pass}.`);
    const revised = await service.reviseDraft(id, current.id);
    assert.equal(revised.revisionOf, current.id);
    assert.equal(revised.revisionPass, pass);
    assert.equal((await service.getCampaign(id)).drafts.find((d) => d.id === current.id)!.status, "superseded");
    current = revised;
  }
  await decide(id, { kind: "draft", id: current.id }, "request-revision", "Once more.");
  await assert.rejects(service.reviseDraft(id, current.id), /limit of 2 revision passes/);
  // A revision is new text: it must be evaluated again before it can be approved.
  await refuses(
    service.requestDecision({ campaignId: id, subject: { kind: "draft", id: current.id }, action: "approve", proposedRationale: "Fine.", requestedBy: "agent" }),
    "not-evaluated",
  );
});

test("nothing can be assembled until a person has approved something", async () => {
  const { service, evaluated, assemble } = makeService();
  const id = await evaluated();
  const record = await service.getCampaign(id);
  assert.throws(
    () => assemble(record),
    (error: unknown) => error instanceof WorkflowError && error.code === "nothing-approved",
  );
});

test("a programme with unapproved posts is refused unless a partial package is asked for", async () => {
  const { service, evaluated, decide, assemble } = makeService();
  const id = await evaluated();
  const first = (await service.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  await decide(id, { kind: "draft", id: first.id }, "approve");
  const record = await service.getCampaign(id);
  assert.throws(
    () => assemble(record),
    (error: unknown) => error instanceof WorkflowError && error.code === "slots-pending",
  );
  const partial = assemble(record, true);
  assert.equal(partial.approvalState, "partial");
  assert.equal(partial.provisionalCommands.length, 1, "commands exist only for approved posts");
  assert.deepEqual(partial.posts.map((p) => p.state), ["approved", "pending", "pending", "pending"]);
});

test("text changed after approval is not treated as approved", async () => {
  const { service, store, evaluated, decide, assemble, keys } = makeService();
  const id = await evaluated();
  const first = (await service.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  await decide(id, { kind: "draft", id: first.id }, "approve");

  // Tamper with the stored record directly, bypassing the service.
  await store.update(id, (tampered) => {
    tampered.drafts.find((d) => d.id === first.id)!.body += "\n\nAn extra paragraph nobody approved.";
  });

  const record = await service.getCampaign(id);
  assert.equal(approvalOf(record, record.drafts.find((d) => d.id === first.id)!, keys.verifier), null);
  assert.throws(
    () => assemble(record, true),
    (error: unknown) => error instanceof WorkflowError && error.code === "nothing-approved",
  );
});

test("a status flipped to approved without a decision is not treated as approved", async () => {
  const { service, store, evaluated, assemble } = makeService();
  const id = await evaluated();
  await store.update(id, (forged) => {
    for (const draft of forged.drafts) draft.status = "approved";
  });
  const record = await service.getCampaign(id);
  assert.throws(
    () => assemble(record, true),
    (error: unknown) => error instanceof WorkflowError && error.code === "nothing-approved",
  );
});

test("every provisional command in an assembled programme is non-executable and tied to its approval", async () => {
  const { service, evaluated, decide, assemble } = makeService();
  const id = await evaluated();
  const record = await service.getCampaign(id);
  for (const slot of record.plan!.slots) {
    await decide(id, { kind: "draft", id: record.drafts.find((d) => d.slot === slot.slot)!.id }, "approve");
  }
  const pkg = assemble(await service.getCampaign(id));
  assert.equal(pkg.approvalState, "complete");
  assert.equal(pkg.provisionalCommands.length, 4);
  for (const command of pkg.provisionalCommands) {
    assert.equal(command.status, "NON-EXECUTABLE");
    assert.equal(command.executable, false);
    assert.equal(command.authoritative, false);
    assert.equal(command.translation.contract, null);
    assert.deepEqual(command.approval.approvedBy, EDITOR);
    assert.ok(pkg.decisions.some((d) => d.id === command.approval.decisionId && d.action === "approve"));
  }
});
