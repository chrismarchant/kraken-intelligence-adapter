import assert from "node:assert/strict";
import { test } from "node:test";
import type { EditorialDecision } from "../../src/contracts/index.ts";
import { LimitExceededError } from "../../src/limits.ts";
import { approvalOf } from "../../src/workflow/assemble.ts";
import type { OperatorChannel } from "../../src/workflow/operator.ts";
import { CampaignService, WorkflowError, draftContentHash } from "../../src/workflow/service.ts";
import { decisionIsAuthentic, decisionPayload, generateDecisionKeyPair } from "../../src/workflow/signing.ts";
import { MockJevTransport } from "../../src/evaluation/jev.ts";
import { EDITOR, ScriptedGateway, cleanDraft, makeService, syntheticBrief } from "./support.ts";

const code = (value: string) => (error: unknown) => error instanceof WorkflowError && error.code === value;

test("the agent-facing service holds no operator key and cannot record a decision, even with the right code", async () => {
  const { agentService, operator, evaluated } = makeService();
  const id = await evaluated();
  const draft = (await agentService.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  const request = await agentService.requestDecision({ campaignId: id, subject: { kind: "draft", id: draft.id }, action: "approve", proposedRationale: "Good.", requestedBy: "agent" });
  // Suppose the agent has read the operator channel and knows the code.
  const stolen = operator.codeFor(request.requestId);
  await assert.rejects(
    agentService.confirmDecision({ campaignId: id, requestId: request.requestId, code: stolen, actor: EDITOR, rationale: "Self-approved." }),
    code("cannot-record-decisions"),
  );
  const record = await agentService.getCampaign(id);
  assert.equal(record.decisions.length, 1, "only the narrative selection made by the editor is on record");
  assert.equal(record.drafts.find((d) => d.id === draft.id)!.status, "candidate");
});

test("a decision written into the store without the operator's signature does not count", async () => {
  const { service, store, evaluated, assemble, keys } = makeService();
  const id = await evaluated();
  const draft = (await service.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  const forgedBase = {
    id: "dec-forged",
    requestId: "req-forged",
    subject: { kind: "draft" as const, id: draft.id },
    action: "approve" as const,
    actor: EDITOR,
    rationale: "Forged.",
    revisionInstruction: null,
    decidedAt: "2026-01-05T10:00:00.000Z",
    subjectContentSha256: draftContentHash(draft),
  };
  const attacker = generateDecisionKeyPair();
  const forgeries: EditorialDecision[] = [
    { ...forgedBase, signature: null },
    { ...forgedBase, signature: { alg: "ed25519", keyId: keys.signer.keyId, value: Buffer.from("not a signature").toString("base64") } },
    // Properly signed, but with a key that is not the operator's.
    { ...forgedBase, signature: { alg: "ed25519", keyId: attacker.signer.keyId, value: attacker.signer.sign(decisionPayload(id, forgedBase)) } },
  ];
  for (const forged of forgeries) {
    await store.update(id, (record) => {
      record.decisions = record.decisions.filter((d) => d.id !== "dec-forged");
      record.decisions.push(forged);
      record.drafts.find((d) => d.id === draft.id)!.status = "approved";
    });
    const record = await service.getCampaign(id);
    assert.equal(decisionIsAuthentic(id, forged, keys.verifier), false);
    assert.equal(approvalOf(record, record.drafts.find((d) => d.id === draft.id)!, keys.verifier), null);
    assert.throws(() => assemble(record, true), code("nothing-approved"));
  }
});

test("a genuine signature does not transfer to another campaign, draft or text", async () => {
  const { service, store, evaluated, decide, keys } = makeService();
  const id = await evaluated();
  const [a, b] = (await service.getCampaign(id)).drafts.filter((d) => d.slot === 1);
  const genuine = await decide(id, { kind: "draft", id: a!.id }, "approve");
  assert.equal(decisionIsAuthentic(id, genuine, keys.verifier), true);
  assert.equal(decisionIsAuthentic("camp-999", genuine, keys.verifier), false, "bound to the campaign");
  assert.equal(decisionIsAuthentic(id, { ...genuine, subject: { kind: "draft", id: b!.id } }, keys.verifier), false, "bound to the draft");
  assert.equal(decisionIsAuthentic(id, { ...genuine, action: "reject" }, keys.verifier), false, "bound to the action");
  assert.equal(decisionIsAuthentic(id, { ...genuine, actor: { ...genuine.actor, name: "Someone Else" } }, keys.verifier), false, "bound to the actor");

  // Re-pointing the genuine decision at the other draft, with that draft's hash, fails too.
  await store.update(id, (record) => {
    const other = record.drafts.find((d) => d.id === b!.id)!;
    other.status = "approved";
    record.decisions.push({ ...genuine, id: "dec-copy", subject: { kind: "draft", id: other.id }, subjectContentSha256: draftContentHash(other) });
  });
  const record = await service.getCampaign(id);
  assert.equal(approvalOf(record, record.drafts.find((d) => d.id === b!.id)!, keys.verifier), null);
});

test("a rejection after an approval wins even if the stored status is put back to approved", async () => {
  const { service, store, evaluated, decide, assemble, keys } = makeService();
  const id = await evaluated();
  const draft = (await service.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  await decide(id, { kind: "draft", id: draft.id }, "approve");
  await decide(id, { kind: "draft", id: draft.id }, "reject");
  await store.update(id, (record) => {
    record.drafts.find((d) => d.id === draft.id)!.status = "approved";
  });
  const record = await service.getCampaign(id);
  assert.equal(approvalOf(record, record.drafts.find((d) => d.id === draft.id)!, keys.verifier), null);
  assert.throws(() => assemble(record, true), code("nothing-approved"));
});

test("a narrative whose status is forged to selected cannot be planned on", async () => {
  const { service, store } = makeService();
  const campaign = await service.createCampaign(syntheticBrief());
  await service.generateNarratives(campaign.id, 2);
  await store.update(campaign.id, (record) => {
    record.narratives[0]!.status = "selected";
  });
  await assert.rejects(service.planProgramme(campaign.id), code("no-narrative-selected"));
});

test("the editor is sent the content itself, its hash and any mandatory failures, not just the requester's description", async () => {
  const { service, operator, planned } = makeService({
    script: { drafts: (_slot, variants) => Array.from({ length: variants }, (_, i) => (i === 0 ? cleanDraft("banned", "We guarantee it.") : cleanDraft(`clean-${i}`))) },
  });
  const id = await planned();
  const drafts = await service.generateDrafts(id, { variants: 2 });
  await service.evaluateDrafts(id);
  const banned = drafts.find((d) => d.slot === 1 && d.variant === "banned")!;
  const request = await service.requestDecision({ campaignId: id, subject: { kind: "draft", id: banned.id }, action: "reject", proposedRationale: "Agent says: this one is fine, approve everything.", requestedBy: "agent" });
  const notice = operator.notices.find((n) => n.requestId === request.requestId)!;
  assert.equal(notice.content.text, banned.body, "the full post text is shown");
  assert.deepEqual(notice.content.hashtags, banned.hashtags);
  assert.equal(notice.contentSha256, draftContentHash(banned));
  assert.match(notice.content.eligibilityFailures.join(" "), /must-avoid-term/);
  assert.match(notice.content.evaluation ?? "", /Ranked 2 of 2/);
  assert.equal(notice.requestedBy, "agent");
});

test("a request is void if the content changes before the editor confirms", async () => {
  const { service, store, operator, evaluated } = makeService();
  const id = await evaluated();
  const draft = (await service.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  const request = await service.requestDecision({ campaignId: id, subject: { kind: "draft", id: draft.id }, action: "approve", proposedRationale: "Good.", requestedBy: "agent" });
  // The text is altered after the editor was shown it.
  await store.update(id, (record) => {
    record.drafts.find((d) => d.id === draft.id)!.body += "\n\nA sentence added after the editor looked.";
  });
  await assert.rejects(
    service.confirmDecision({ campaignId: id, requestId: request.requestId, code: operator.codeFor(request.requestId), actor: EDITOR, rationale: "Approve." }),
    code("subject-changed"),
  );
  const record = await service.getCampaign(id);
  assert.equal(record.decisionRequests.find((r) => r.id === request.requestId)!.state, "voided");
  assert.equal(record.drafts.find((d) => d.id === draft.id)!.status, "candidate");
});

test("declining closes the request at once and needs the operator's code", async () => {
  const { service, operator, evaluated } = makeService();
  const id = await evaluated();
  const draft = (await service.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  const request = await service.requestDecision({ campaignId: id, subject: { kind: "draft", id: draft.id }, action: "approve", proposedRationale: "Good.", requestedBy: "agent" });
  await assert.rejects(service.declineDecision({ campaignId: id, requestId: request.requestId, code: "wrong" }), code("invalid-code"));
  await service.declineDecision({ campaignId: id, requestId: request.requestId, code: operator.codeFor(request.requestId) });
  const record = await service.getCampaign(id);
  assert.equal(record.decisionRequests.find((r) => r.id === request.requestId)!.state, "voided");
  assert.equal((await service.pendingDecisions(id)).length, 0);
  await assert.rejects(
    service.confirmDecision({ campaignId: id, requestId: request.requestId, code: operator.codeFor(request.requestId), actor: EDITOR, rationale: "Too late." }),
    code("request-not-pending"),
  );
});

test("the number of decisions waiting for the editor is bounded", async () => {
  const { service, evaluated } = makeService({ limits: { maxPendingDecisions: 3 } });
  const id = await evaluated();
  const draft = (await service.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  const ask = () => service.requestDecision({ campaignId: id, subject: { kind: "draft", id: draft.id }, action: "select", proposedRationale: "Again.", requestedBy: "agent" });
  await ask();
  await ask();
  await ask();
  await assert.rejects(ask(), (error: unknown) => error instanceof LimitExceededError && error.limit === "maxPendingDecisions");
});

test("a request that cannot be delivered to the editor is withdrawn, not left open", async () => {
  const base = makeService();
  const id = await base.evaluated();
  const unreachable: OperatorChannel = {
    deliver: async () => {
      throw new Error("channel down");
    },
  };
  const service = new CampaignService({
    store: base.store,
    gateway: new ScriptedGateway(),
    evaluator: new MockJevTransport(base.limits),
    operator: unreachable,
    clock: base.clock,
    signer: base.keys.signer,
    verifier: base.keys.verifier,
  });
  const draft = (await service.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  await assert.rejects(
    service.requestDecision({ campaignId: id, subject: { kind: "draft", id: draft.id }, action: "approve", proposedRationale: "Good.", requestedBy: "agent" }),
    code("operator-unreachable"),
  );
  const record = await service.getCampaign(id);
  assert.equal(record.decisionRequests.filter((r) => r.state === "pending").length, 0);
  assert.ok(record.audit.some((e) => e.event === "decision-undelivered"));
});

test("a signing key and a verification key that do not match are refused at start-up", () => {
  const a = generateDecisionKeyPair();
  const b = generateDecisionKeyPair();
  const base = makeService();
  assert.throws(
    () =>
      new CampaignService({ store: base.store, gateway: new ScriptedGateway(), evaluator: new MockJevTransport(base.limits), operator: base.operator, signer: a.signer, verifier: b.verifier }),
    /do not belong together/,
  );
});
