// EC-4.1/4.2/4.3, EC-6.2/6.3/6.5, EC-7.5 through the real service (offline, test helpers, throwaway keys).
// Run with cwd = the worktree (support.ts reads the fixture brief by a relative path).
import assert from "node:assert/strict";
const T = "/tmp/claude-0/-home-user/7f983aaa-ebce-54b6-b1bf-d0a292850218/scratchpad/review26/tree";
const { makeService, cleanDraft } = await import(`${T}/tests/kic/support.ts`);
const { draftContentHash } = await import(`${T}/src/workflow/service.ts`);
const { assembleProgramme } = await import(`${T}/src/workflow/assemble.ts`);
const { comparisonMarkdown } = await import(`${T}/src/workflow/comparison.ts`);
const out = (k: string, v: unknown) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);

// Drafts carrying what redaction rewrites (an email, a URL, a long token, the client's name) and
// one with a ruled-out word ("guarantee" is in the fixture brief's mustAvoid? we check below).
const tricky = (label: string) => {
  const d = cleanDraft(label, "Write to ops.lead@example.com or see https://example.com/x. Token-like: " + "A".repeat(45) + ". Harbourline team.");
  return d;
};
const ctx = makeService({ script: { drafts: (_s: number, n: number) => Array.from({ length: n }, (_, i) => (i === 0 ? tricky(`t${i}`) : cleanDraft(`banned${i}`, "We guarantee results."))) } });
const { service, planned, operator, decide, keys, store, limits, clock } = ctx;
const id = await planned();
const brief = (await service.getCampaign(id)).brief;
out("brief mustAvoid", brief.constraints.mustAvoid);
out("client name", brief.client.name.length > 0 ? "(present)" : "(none)");
await service.generateDrafts(id, { variants: 2, slots: [1] });
const before = JSON.stringify((await service.getCampaign(id)).drafts);
// EC-6.3: approval before evaluation refused
const d1 = (await service.getCampaign(id)).drafts.filter((d: any) => d.slot === 1);
await assert.rejects(service.requestDecision({ campaignId: id, subject: { kind: "draft", id: d1[0].id }, action: "approve", proposedRationale: "x", requestedBy: "probe" }), (e: any) => e.code === "not-evaluated");
out("EC-6.3 unevaluated approve refused", true);
await service.evaluateDrafts(id, { slots: [1] });
await service.evaluateDrafts(id, { slots: [1] });
const after = JSON.stringify((await service.getCampaign(id)).drafts);
out("EC-4.1 drafts byte-identical after two evaluations", before === after);
const rec = await service.getCampaign(id);
const ev = rec.evaluations.at(-1);
for (const c of ev.candidates) out(`candidate ${c.draftId} eligible`, `${c.eligibility.eligible} ${c.eligibility.failures.map((f: any) => f.rule)}`);
const clean = rec.drafts.find((d: any) => d.slot === 1 && ev.candidates.find((c: any) => c.draftId === d.id).eligibility.eligible);
const banned = rec.drafts.find((d: any) => d.slot === 1 && !ev.candidates.find((c: any) => c.draftId === d.id).eligibility.eligible);
// EC-4.2: what the editor is shown is the stored text
if (clean) {
  const req = await service.requestDecision({ campaignId: id, subject: { kind: "draft", id: clean.id }, action: "approve", proposedRationale: "x", requestedBy: "probe" });
  const desc = await service.describeRequest(id, req.requestId);
  out("EC-4.2 shown text === stored body", desc.content.text === clean.body);
  out("EC-4.2 shown hashtags === stored", JSON.stringify(desc.content.hashtags) === JSON.stringify(clean.hashtags));
  out("EC-4.2 covers.draft.body === stored body (digest input)", desc.covers.draft.body === clean.body);
  out("EC-4.2 contentSha256 === draftContentHash(stored)", desc.contentSha256 === draftContentHash(rec, clean));
  out("EC-4.3 stored body still contains the email (redaction did not touch it)", clean.body.includes("ops.lead@example.com"));
  out("EC-5 evaluation line shown to editor", desc.content.evaluation);
  // decline to keep things tidy
  await service.declineDecision({ campaignId: id, requestId: req.requestId, code: operator.codeFor(req.requestId) });
}
// EC-6.2 request refused for an ineligible draft
if (banned) {
  await assert.rejects(service.requestDecision({ campaignId: id, subject: { kind: "draft", id: banned.id }, action: "approve", proposedRationale: "x", requestedBy: "probe" }), (e: any) => e.code === "ineligible");
  out("EC-6.2 request refused for ineligible", true);
  // EC-6.5: tamper the stored evaluation to say eligible; approval still refused
  await store.update(id, (r: any) => { for (const e of r.evaluations) for (const c of e.candidates) { c.eligibility = { eligible: true, failures: [] }; } });
  await assert.rejects(service.requestDecision({ campaignId: id, subject: { kind: "draft", id: banned.id }, action: "approve", proposedRationale: "x", requestedBy: "probe" }), (e: any) => e.code === "ineligible");
  out("EC-6.5 tampered stored evaluation does not make it approvable", true);
  const md = comparisonMarkdown(await service.getCampaign(id), [1]);
  out("comparison doc shows tampered stored eligibility as 'yes' for the banned draft", md.includes(`\`${banned.id}\``) && !md.includes("**NO**"));
}
// EC-6.2 at confirm: request with a large limit in one process, confirm in a process with a small one
{
  const c2 = makeService({ script: { drafts: (_s: number, n: number) => Array.from({ length: n }, (_, i) => cleanDraft(`v${i}`)) }, limits: { linkedinMaxChars: 3000 } });
  const id2 = await c2.evaluated();
  const r2 = await c2.service.getCampaign(id2);
  const d = r2.drafts[0];
  const req = await c2.service.requestDecision({ campaignId: id2, subject: { kind: "draft", id: d.id }, action: "approve", proposedRationale: "x", requestedBy: "probe" });
  // Same store and keys, smaller limit (stands in for an operator process configured differently).
  const { CampaignService } = await import(`${T}/src/workflow/service.ts`);
  const { MockJevTransport } = await import(`${T}/src/evaluation/jev.ts`);
  const small = { ...c2.limits, linkedinMaxChars: 50 };
  const op = new CampaignService({ store: c2.store, gateway: c2.gateway, evaluator: new MockJevTransport(small), operator: c2.operator, clock: c2.clock, ids: { next: (p: string) => `${p}-x${Math.random().toString(36).slice(2, 6)}` }, limits: small, signer: c2.keys.signer, verifier: c2.keys.verifier, ledger: c2.ledger });
  const desc = await op.describeRequest(id2, req.requestId);
  await assert.rejects(op.confirmDecision({ campaignId: id2, requestId: req.requestId, code: c2.operator.codeFor(req.requestId), actor: { kind: "human", id: "e", name: "E" }, rationale: "ok", expected: { digest: desc.digest } }), (e: any) => e.code === "ineligible");
  out("EC-6.2 confirm refused when the draft is ineligible at confirmation", true);
  // assembly: approve under the large limit, assemble under the small one
  await c2.decide(id2, { kind: "draft", id: d.id }, "approve");
  assert.throws(() => assembleProgramme(c2.store ? (globalThis as any).__x ?? null : null, {} as any), () => true);
  const rec2 = await c2.service.getCampaign(id2);
  assert.throws(() => assembleProgramme(rec2, { allowPartial: true, clock: c2.clock, limits: small, verifier: c2.keys.verifier }), (e: any) => e.code === "ineligible");
  out("EC-6.2 assembly refused for an approved draft that is ineligible at assembly", true);
}
// EC-7.5: scoring that returns no score stores no evaluation
{
  const c3 = makeService();
  const id3 = await c3.planned();
  await c3.service.generateDrafts(id3, { variants: 2, slots: [1] });
  (c3.service as any).evaluator = { live: false, kind: "mock-jev", version: "x", description: "x", systemone: async () => ({ model: "x", answers: {} }) };
  await assert.rejects(c3.service.evaluateDrafts(id3, { slots: [1] }));
  out("EC-7.5 no evaluation stored after a scoring failure", (await c3.service.getCampaign(id3)).evaluations.length === 0);
  const dd = (await c3.service.getCampaign(id3)).drafts[0];
  await assert.rejects(c3.service.requestDecision({ campaignId: id3, subject: { kind: "draft", id: dd.id }, action: "approve", proposedRationale: "x", requestedBy: "p" }), (e: any) => e.code === "not-evaluated");
  out("EC-7.5 that draft cannot be approved", true);
  // A transport that throws
  (c3.service as any).evaluator = { live: false, kind: "mock-jev", version: "x", description: "x", systemone: async () => { throw new Error("down"); } };
  await assert.rejects(c3.service.evaluateDrafts(id3, { slots: [1] }));
  out("EC-7.5 transport error: evaluations stored", (await c3.service.getCampaign(id3)).evaluations.length);
}
