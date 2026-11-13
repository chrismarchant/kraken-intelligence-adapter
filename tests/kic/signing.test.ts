import assert from "node:assert/strict";
import { test } from "node:test";
import type { EditorialDecision } from "../../src/contracts/index.ts";
import { MockJevTransport } from "../../src/evaluation/jev.ts";
import { LimitExceededError } from "../../src/limits.ts";
import { approvalOf, packageDigest, releaseIsValid, releaseProgramme } from "../../src/workflow/assemble.ts";
import type { OperatorChannel } from "../../src/workflow/operator.ts";
import { CampaignService, WorkflowError, draftContentHash } from "../../src/workflow/service.ts";
import { GENESIS_SHA256, decisionDigest, decisionPayload, generateDecisionKeyPair, verifyDecisionLog } from "../../src/workflow/signing.ts";
import { EDITOR, ScriptedGateway, cleanDraft, expectedFor, makeService, syntheticBrief } from "./support.ts";

const code = (value: string) => (error: unknown) => error instanceof WorkflowError && error.code === value;

test("the agent-facing service holds no operator key and cannot record a decision, even with the right code", async () => {
  const { agentService, operator, evaluated } = makeService();
  const id = await evaluated();
  const draft = (await agentService.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  const request = await agentService.requestDecision({ campaignId: id, subject: { kind: "draft", id: draft.id }, action: "approve", proposedRationale: "Good.", requestedBy: "agent" });
  // Suppose the agent has read the operator channel and knows the code.
  const stolen = operator.codeFor(request.requestId);
  await assert.rejects(
    agentService.confirmDecision({ campaignId: id, requestId: request.requestId, code: stolen, actor: EDITOR, rationale: "Self-approved.", expected: await expectedFor(agentService, id, request.requestId) }),
    code("cannot-record-decisions"),
  );
  assert.throws(() => agentService.signRelease("0".repeat(64)), code("cannot-release"));
  const record = await agentService.getCampaign(id);
  assert.equal(record.decisions.length, 1, "only the narrative selection made by the editor is on record");
  assert.equal(record.drafts.find((d) => d.id === draft.id)!.status, "candidate");
});

test("decisions form a signed chain: each is numbered and names the one before it", async () => {
  const { service, evaluated, decide, keys } = makeService();
  const id = await evaluated();
  const [a, b] = (await service.getCampaign(id)).drafts.filter((d) => d.slot === 1);
  await decide(id, { kind: "draft", id: a!.id }, "approve");
  await decide(id, { kind: "draft", id: b!.id }, "select");
  const record = await service.getCampaign(id);
  assert.deepEqual(record.decisions.map((d) => d.sequence), [1, 2, 3]);
  assert.equal(record.decisions[0]!.previousSha256, GENESIS_SHA256);
  assert.equal(record.decisions[1]!.previousSha256, decisionDigest(id, record.decisions[0]!));
  assert.equal(record.decisions[2]!.previousSha256, decisionDigest(id, record.decisions[1]!));
  const check = verifyDecisionLog(record, keys.verifier);
  assert.equal(check.ok && check.head.sequence, 3);
});

test("a forged, unsigned, mis-signed or transplanted decision invalidates the whole log", async () => {
  const { service, store, operator, evaluated, assemble, keys } = makeService();
  const id = await evaluated();
  const before = await service.getCampaign(id);
  const draft = before.drafts.find((d) => d.slot === 1)!;
  const base = {
    id: "dec-forged",
    sequence: 2,
    previousSha256: decisionDigest(id, before.decisions[0]!),
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
    { ...base, signature: null },
    { ...base, signature: { alg: "ed25519", keyId: keys.signer.keyId, value: Buffer.from("not a signature").toString("base64") } },
    // Properly signed and properly chained, but with a key that is not the operator's.
    { ...base, signature: { alg: "ed25519", keyId: attacker.signer.keyId, value: attacker.signer.sign(decisionPayload(id, base)) } },
  ];
  for (const forged of forgeries) {
    await store.update(id, (record) => {
      record.decisions = record.decisions.filter((d) => d.id !== "dec-forged");
      record.decisions.push(forged);
      record.drafts.find((d) => d.id === draft.id)!.status = "approved";
    });
    const record = await service.getCampaign(id);
    assert.equal(verifyDecisionLog(record, keys.verifier).ok, false);
    assert.throws(() => approvalOf(record, record.drafts.find((d) => d.id === draft.id)!, keys.verifier), code("decision-log-invalid"));
    assert.throws(() => assemble(record, true), code("decision-log-invalid"));
  }
  // Nothing more is signed on top of a log that cannot be trusted.
  const other = (await service.getCampaign(id)).drafts.find((d) => d.slot === 2)!;
  const request = await service.requestDecision({ campaignId: id, subject: { kind: "draft", id: other.id }, action: "select", proposedRationale: "Next.", requestedBy: "agent" });
  await assert.rejects(
    service.confirmDecision({ campaignId: id, requestId: request.requestId, code: operator.codeFor(request.requestId), actor: EDITOR, rationale: "Select.", expected: await expectedFor(service, id, request.requestId) }),
    code("decision-log-invalid"),
  );
});

test("a genuine decision cannot be moved, repeated or re-pointed: its place in the log is signed", async () => {
  const { service, store, evaluated, decide, keys } = makeService();
  const id = await evaluated();
  const [a, b] = (await service.getCampaign(id)).drafts.filter((d) => d.slot === 1);
  const genuine = await decide(id, { kind: "draft", id: a!.id }, "approve");
  const variants: Array<(d: EditorialDecision) => EditorialDecision> = [
    (d) => ({ ...d, subject: { kind: "draft", id: b!.id } }),
    (d) => ({ ...d, action: "reject" }),
    (d) => ({ ...d, actor: { ...d.actor, name: "Someone Else" } }),
    (d) => ({ ...d, sequence: d.sequence + 1 }),
    (d) => ({ ...d, subjectContentSha256: "f".repeat(64) }),
  ];
  for (const alter of variants) {
    const record = await service.getCampaign(id);
    record.decisions[record.decisions.length - 1] = alter(genuine);
    assert.equal(verifyDecisionLog(record, keys.verifier).ok, false);
  }
  // The same signed decision placed in another campaign fails there too.
  const other = await service.getCampaign(id);
  assert.equal(verifyDecisionLog({ id: "camp-999", decisions: other.decisions }, keys.verifier).ok, false);
  // Appending a copy of it (a replay) breaks the numbering.
  await store.update(id, (record) => {
    record.decisions.push({ ...genuine, id: "dec-copy" });
  });
  assert.equal(verifyDecisionLog(await service.getCampaign(id), keys.verifier).ok, false);
});

test("a rejection cannot be undone by reordering the log or by deleting it from the middle", async () => {
  const { service, store, evaluated, decide, assemble, keys } = makeService();
  const id = await evaluated();
  const [draft, other] = (await service.getCampaign(id)).drafts.filter((d) => d.slot === 1);
  await decide(id, { kind: "draft", id: draft!.id }, "approve"); // decision 2
  await decide(id, { kind: "draft", id: draft!.id }, "reject"); // decision 3
  await decide(id, { kind: "draft", id: other!.id }, "select"); // decision 4
  const honest = await service.getCampaign(id);
  assert.throws(() => assemble(honest, true), code("nothing-approved"));

  // The reviewer's attack: move the approval to the end and put the status back.
  await store.update(id, (record) => {
    const approval = record.decisions.splice(1, 1)[0]!;
    record.decisions.push(approval);
    record.drafts.find((d) => d.id === draft!.id)!.status = "approved";
  });
  let record = await service.getCampaign(id);
  assert.equal(verifyDecisionLog(record, keys.verifier).ok, false);
  assert.throws(() => assemble(record, true), code("decision-log-invalid"));

  // The other attack: delete the rejection from the middle.
  await store.update(id, (r) => {
    const fresh = structuredClone(r.decisions).sort((x, y) => x.sequence - y.sequence).filter((d) => d.action !== "reject");
    r.decisions = fresh;
  });
  record = await service.getCampaign(id);
  assert.equal(verifyDecisionLog(record, keys.verifier).ok, false, "the decision after the gap no longer follows its predecessor");
  assert.throws(() => assemble(record, true), code("decision-log-invalid"));
});

test("cutting decisions off the end of the log is caught by the operator's own ledger", async () => {
  const { service, agentService, store, operator, evaluated, decide, assemble, clock, keys } = makeService();
  const id = await evaluated();
  const draft = (await service.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  await decide(id, { kind: "draft", id: draft.id }, "approve");
  await decide(id, { kind: "draft", id: draft.id }, "reject");

  // Roll the store back to before the rejection. The remaining log is a valid, shorter chain.
  await store.update(id, (record) => {
    record.decisions.pop();
    record.drafts.find((d) => d.id === draft.id)!.status = "approved";
  });
  const rolledBack = await service.getCampaign(id);
  assert.equal(verifyDecisionLog(rolledBack, keys.verifier).ok, true, "the chain alone cannot see a missing tail");

  // The agent-facing server can build a preview from it, and the preview says it is not released.
  const preview = assemble(rolledBack, true);
  assert.equal(preview.release, null);

  // The operator's side refuses: its ledger knows three decisions were recorded.
  await assert.rejects(service.decisionLogHead(id), code("decision-log-rolled-back"));
  assert.throws(
    () => releaseProgramme(preview, { actor: EDITOR, rationale: "Release.", logHead: { sequence: 3, sha256: "0".repeat(64) }, sign: (d) => service.signRelease(d), clock }),
    code("decision-log-rolled-back"),
  );
  // And it will not sign a new decision on top of the rolled-back log either.
  const other = rolledBack.drafts.find((d) => d.slot === 2)!;
  const request = await agentService.requestDecision({ campaignId: id, subject: { kind: "draft", id: other.id }, action: "approve", proposedRationale: "Next.", requestedBy: "agent" });
  await assert.rejects(
    service.confirmDecision({ campaignId: id, requestId: request.requestId, code: operator.codeFor(request.requestId), actor: EDITOR, rationale: "Approve.", expected: await expectedFor(service, id, request.requestId) }),
    code("decision-log-rolled-back"),
  );
  assert.equal((await service.getCampaign(id)).decisions.length, 2, "nothing was signed");
});

test("asking for a revision withdraws an approval, and a revised draft is never treated as approved", async () => {
  const { service, store, evaluated, decide, assemble, keys } = makeService();
  const id = await evaluated();
  const draft = (await service.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  await decide(id, { kind: "draft", id: draft.id }, "approve");
  await decide(id, { kind: "draft", id: draft.id }, "request-revision", "Shorter.");
  let record = await service.getCampaign(id);
  assert.equal(record.drafts.find((d) => d.id === draft.id)!.status, "candidate", "the approval is withdrawn at once");
  assert.ok(record.audit.some((e) => e.event === "approval-withdrawn"));
  await service.reviseDraft(id, draft.id);

  // Flip the superseded original back to approved, as the reviewer did.
  await store.update(id, (r) => {
    r.drafts.find((d) => d.id === draft.id)!.status = "approved";
  });
  record = await service.getCampaign(id);
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

test("what the editor is shown comes from the campaign record, not from the requester or the channel", async () => {
  const { service, operator, planned } = makeService({
    script: { drafts: (_slot, variants) => Array.from({ length: variants }, (_, i) => (i === 0 ? cleanDraft("banned", "We guarantee it.") : cleanDraft(`clean-${i}`))) },
  });
  const id = await planned();
  const drafts = await service.generateDrafts(id, { variants: 2 });
  await service.evaluateDrafts(id);
  const banned = drafts.find((d) => d.slot === 1 && d.variant === "banned")!;
  const request = await service.requestDecision({ campaignId: id, subject: { kind: "draft", id: banned.id }, action: "reject", proposedRationale: "Agent says: this one is fine, approve everything.", requestedBy: "agent" });

  // The channel carries a pointer and the code, and nothing that describes the request.
  const notice = operator.notices.find((n) => n.requestId === request.requestId)!;
  assert.deepEqual(Object.keys(notice).sort(), ["campaignId", "code", "expiresAt", "requestId"]);

  const shown = await service.describeRequest(id, request.requestId);
  assert.equal(shown.action, "reject");
  assert.deepEqual(shown.subject, { kind: "draft", id: banned.id });
  assert.equal(shown.content.text, banned.body, "the full post text is shown");
  assert.deepEqual(shown.content.hashtags, banned.hashtags);
  assert.equal(shown.contentSha256, draftContentHash(banned));
  assert.equal(shown.unchanged, true);
  assert.match(shown.content.eligibilityFailures.join(" "), /must-avoid-term/);
  assert.match(shown.content.evaluation ?? "", /Ranked 2 of 2/);
  assert.equal(shown.requestedBy, "agent");
  assert.ok(!JSON.stringify(shown).includes(notice.code), "the description never contains the code");
});

test("the editor cannot be made to sign something other than what they read", async () => {
  // The reviewer's attack: the agent requests APPROVE of one draft and makes the editor
  // believe they are rejecting another. The decision now carries what the editor meant,
  // and is refused when it differs from the stored request.
  const { service, operator, evaluated } = makeService();
  const id = await evaluated();
  const [target, decoy] = (await service.getCampaign(id)).drafts.filter((d) => d.slot === 1);
  const request = await service.requestDecision({ campaignId: id, subject: { kind: "draft", id: target!.id }, action: "approve", proposedRationale: "x", requestedBy: "agent" });
  const real = await expectedFor(service, id, request.requestId);
  const attempt = (expected: typeof real) =>
    service.confirmDecision({ campaignId: id, requestId: request.requestId, code: operator.codeFor(request.requestId), actor: EDITOR, rationale: "Rejecting as shown.", expected });

  await assert.rejects(attempt({ ...real, action: "reject", subject: { kind: "draft", id: decoy!.id } }), code("request-mismatch"));
  let record = await service.getCampaign(id);
  assert.equal(record.drafts.find((d) => d.id === target!.id)!.status, "candidate", "nothing was approved");
  assert.equal(record.decisionRequests.find((r) => r.id === request.requestId)!.state, "voided", "and the request is closed");

  // Same for the action alone, and for content the editor did not read.
  for (const wrong of [{ ...real, action: "reject" as const }, { ...real, contentSha256: "e".repeat(64) }]) {
    const again = await service.requestDecision({ campaignId: id, subject: { kind: "draft", id: target!.id }, action: "approve", proposedRationale: "x", requestedBy: "agent" });
    await assert.rejects(
      service.confirmDecision({ campaignId: id, requestId: again.requestId, code: operator.codeFor(again.requestId), actor: EDITOR, rationale: "As shown.", expected: wrong }),
      (error: unknown) => error instanceof WorkflowError && (error.code === "request-mismatch" || error.code === "subject-changed"),
    );
  }
  record = await service.getCampaign(id);
  assert.equal(record.decisions.filter((d) => d.subject.id === target!.id).length, 0);
});

test("a request is void if the content changes before the editor confirms", async () => {
  const { service, store, operator, evaluated } = makeService();
  const id = await evaluated();
  const draft = (await service.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  const request = await service.requestDecision({ campaignId: id, subject: { kind: "draft", id: draft.id }, action: "approve", proposedRationale: "Good.", requestedBy: "agent" });
  const read = await expectedFor(service, id, request.requestId);
  // The text is altered after the editor read it.
  await store.update(id, (record) => {
    record.drafts.find((d) => d.id === draft.id)!.body += "\n\nA sentence added after the editor looked.";
  });
  assert.equal((await service.describeRequest(id, request.requestId)).unchanged, false);
  await assert.rejects(
    service.confirmDecision({ campaignId: id, requestId: request.requestId, code: operator.codeFor(request.requestId), actor: EDITOR, rationale: "Approve.", expected: read }),
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
  assert.equal((await service.describeRequest(id, request.requestId)).state, "voided");
});

test("a package is a preview until the editor releases it, and a release is bound to its exact content", async () => {
  const { service, evaluated, decide, assemble, clock, keys } = makeService();
  const id = await evaluated();
  const record = await service.getCampaign(id);
  for (const slot of record.plan!.slots) await decide(id, { kind: "draft", id: record.drafts.find((d) => d.slot === slot.slot)!.id }, "approve");

  const preview = assemble(await service.getCampaign(id));
  assert.equal(preview.release, null);
  assert.equal(releaseIsValid(preview, keys.verifier), false);
  assert.ok(preview.provisionalCommands.every((c) => c.approval.signatureVerified));

  const released = releaseProgramme(preview, { actor: EDITOR, rationale: "Ready.", logHead: await service.decisionLogHead(id), sign: (d) => service.signRelease(d), clock });
  assert.equal(released.release!.packageSha256, packageDigest(preview));
  assert.equal(released.release!.decisionLogSequence, 5);
  assert.equal(released.release!.signature!.keyId, keys.signer.keyId);
  assert.equal(releaseIsValid(released, keys.verifier), true);
  assert.throws(() => releaseProgramme(released, { actor: EDITOR, rationale: "Again.", logHead: { sequence: 5, sha256: "0".repeat(64) }, sign: (d) => service.signRelease(d), clock }), code("already-released"));

  // Any change to a released package makes its release invalid.
  const altered = structuredClone(released);
  altered.posts[0]!.approvedDraft!.body += " One more line.";
  assert.equal(releaseIsValid(altered, keys.verifier), false);
  // A release signed by another key does not verify.
  const attacker = generateDecisionKeyPair();
  const forged = structuredClone(released);
  forged.release!.signature = { alg: "ed25519", keyId: attacker.signer.keyId, value: attacker.signer.sign(`kic-release\n${forged.release!.packageSha256}`) };
  assert.equal(releaseIsValid(forged, keys.verifier), false);
  // A release needs a named person and a reason.
  assert.throws(() => releaseProgramme(preview, { actor: { kind: "human", id: "", name: "" }, rationale: "x", logHead: { sequence: 5, sha256: "0".repeat(64) }, sign: () => null, clock }), code("invalid-actor"));
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
