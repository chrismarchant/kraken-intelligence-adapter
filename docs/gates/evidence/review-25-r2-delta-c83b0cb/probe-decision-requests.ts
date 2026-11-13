// Probe: requestDecision after the delta. Offline; uses the suite's test support (throwaway keys,
// memory operator channel, scripted gateway). Usage: node probe-decision-requests.ts <root>
// Each scenario prints one JSON line; "ok": false marks a guarantee that did not hold.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = process.argv[2]!;
const S = await import(`${root}/tests/kic/support.ts`);
const { CampaignRecord } = await import(`${root}/src/contracts/programme.ts`);
const { FileCampaignStore, MemoryCampaignStore } = await import(`${root}/src/store/store.ts`);
const { CampaignService } = await import(`${root}/src/workflow/service.ts`);
const { verifyDecisionLog } = await import(`${root}/src/workflow/signing.ts`);

const out = (name: string, ok: boolean, detail: unknown) => console.log(JSON.stringify({ name, ok, detail }));
const valid = (r: unknown) => CampaignRecord.safeParse(r).success;
const code = (e: any) => e?.code ?? e?.limit ?? String(e?.message ?? e).slice(0, 80);

for (const storeName of ["memory", "file"]) {
  const mkStore = () => (storeName === "file" ? new FileCampaignStore(mkdtempSync(join(tmpdir(), "kic-probe-"))) : new MemoryCampaignStore());

  // 1. A confirmed request is never replaced or removed; a declined one is replaced; record stays valid.
  {
    const m = S.makeService({ store: mkStore() });
    const id = await m.evaluated();
    const drafts = (await m.service.getCampaign(id)).drafts;
    const d0 = drafts.find((d: any) => d.slot === 1)!;
    const conf = await m.decide(id, { kind: "draft", id: d0.id }, "select");
    const confirmedReq = conf.requestId;
    // ask select again on the same draft: allowed? (checkDecision decides) - whatever happens, the confirmed request must stay
    const again = await m.service.requestDecision({ campaignId: id, subject: { kind: "draft", id: d0.id }, action: "select", proposedRationale: "Again.", requestedBy: "agent" }).then((v: any) => v.requestId, code);
    let r = await m.service.getCampaign(id);
    const keptConfirmed = r.decisionRequests.some((q: any) => q.id === confirmedReq && q.state === "confirmed");
    // decline path: ask reject on d0, editor declines, ask again -> replaced
    const rq = await m.service.requestDecision({ campaignId: id, subject: { kind: "draft", id: d0.id }, action: "reject", proposedRationale: "Withdraw?", requestedBy: "agent" });
    await m.service.declineDecision({ campaignId: id, requestId: rq.requestId, code: m.operator.codeFor(rq.requestId) });
    const rq2 = await m.service.requestDecision({ campaignId: id, subject: { kind: "draft", id: d0.id }, action: "reject", proposedRationale: "Withdraw again.", requestedBy: "agent" });
    r = await m.service.getCampaign(id);
    const line = r.audit.filter((e: any) => e.event === "decision-requested" && e.detail.startsWith(`${rq2.requestId}:`))[0]?.detail;
    const orphan = r.audit.filter((e: any) => e.detail.startsWith(`${rq.requestId}:`)).map((e: any) => e.event);
    const log = verifyDecisionLog(r, m.keys.verifier).ok;
    // late confirm of the declined (replaced) request
    const late = await m.service.confirmDecision({ campaignId: id, requestId: rq.requestId, code: m.operator.codeFor(rq.requestId), actor: S.EDITOR, rationale: "Late.", expected: await S.expectedFor(m.service, id, rq2.requestId) }).then(() => "RECORDED", code);
    out(`${storeName}/1 confirmed kept, declined replaced`, keptConfirmed && valid(r) && log && late === "unknown-request", { again, keptConfirmed, line, orphanLinesForReplacedRequest: orphan, valid: valid(r), log, late });
  }

  // 2. Revision binding: a confirmed request-revision is not removable; one revision per instruction; a waiting
  //    request-revision with an attacker's instruction locks out an honest one until expiry or decline.
  {
    const m = S.makeService({ store: mkStore() });
    const id = await m.evaluated();
    const d0 = (await m.service.getCampaign(id)).drafts.find((d: any) => d.slot === 1)!;
    const attacker = await m.service.requestDecision({ campaignId: id, subject: { kind: "draft", id: d0.id }, action: "request-revision", proposedRationale: "x", revisionInstruction: "Attacker instruction.", requestedBy: "agent" });
    const honest = await m.service.requestDecision({ campaignId: id, subject: { kind: "draft", id: d0.id }, action: "request-revision", proposedRationale: "y", revisionInstruction: "Honest instruction.", requestedBy: "agent" }).then(() => "accepted", code);
    // editor declines the attacker's; the honest one can then be asked and confirmed
    await m.service.declineDecision({ campaignId: id, requestId: attacker.requestId, code: m.operator.codeFor(attacker.requestId) });
    const dec = await m.decide(id, { kind: "draft", id: d0.id }, "request-revision", "Honest instruction.");
    const rev1 = await m.service.reviseDraft(id, d0.id).then((x: any) => x.id ?? "ok", code);
    const rev2 = await m.service.reviseDraft(id, d0.id).then((x: any) => x.id ?? "ok", code);
    const ask3 = await m.service.requestDecision({ campaignId: id, subject: { kind: "draft", id: d0.id }, action: "request-revision", proposedRationale: "z", revisionInstruction: "Another.", requestedBy: "agent" }).then(() => "accepted", code);
    const r = await m.service.getCampaign(id);
    const stillThere = r.decisionRequests.find((q: any) => q.id === dec.requestId)?.state;
    const revisions = r.drafts.filter((d: any) => d.revisionOf === d0.id).length;
    out(`${storeName}/2 revision binding and lock-out`, honest === "decision-pending" && stillThere === "confirmed" && revisions === 1 && rev2 !== "ok", { honestWhileAttackerWaits: honest, rev1, rev2, ask3, confirmedRequestState: stillThere, revisions, valid: valid(r) });
  }

  // 3. Growth: 300 rounds of asking for one decision with the channel down, flapping, and past expiry.
  {
    const m = S.makeService({ store: mkStore() });
    const id = await m.evaluated();
    const d0 = (await m.service.getCampaign(id)).drafts[0]!;
    const ask = () => m.service.requestDecision({ campaignId: id, subject: { kind: "draft", id: d0.id }, action: "reject", proposedRationale: "Proposed.", requestedBy: "agent" }).then(() => "ok", code);
    const deliver = m.operator.deliver.bind(m.operator);
    const before = await m.service.getCampaign(id);
    const sizes: number[] = [];
    const outcomes: Record<string, number> = {};
    for (let i = 0; i < 300; i++) {
      const mode = i % 3; // 0: down, 1: up, 2: up then expire
      m.operator.deliver = mode === 0 ? async () => { throw new Error("down"); } : deliver;
      const o = await ask();
      outcomes[o] = (outcomes[o] ?? 0) + 1;
      if (mode === 2) m.clock.advance(31 * 60_000);
      const r = await m.service.getCampaign(id);
      sizes.push(r.audit.length + r.decisionRequests.length);
    }
    const r = await m.service.getCampaign(id);
    const growth = Math.max(...sizes.slice(30)) - Math.min(...sizes.slice(30));
    out(`${storeName}/3 bounded growth`, growth <= 3 && valid(r), { outcomes, auditBefore: before.audit.length, auditAfter: r.audit.length, requestsAfter: r.decisionRequests.length, noticesSent: m.operator.notices.length, sizeRangeAfterWarmup: growth, valid: valid(r) });
  }

  // 4. Identical requests at the same moment: exactly one stands, one line.
  {
    const m = S.makeService({ store: mkStore() });
    const id = await m.evaluated();
    const d0 = (await m.service.getCampaign(id)).drafts[0]!;
    const res = await Promise.allSettled(Array.from({ length: 12 }, () => m.service.requestDecision({ campaignId: id, subject: { kind: "draft", id: d0.id }, action: "reject", proposedRationale: "Same.", requestedBy: "agent" })));
    const r = await m.service.getCampaign(id);
    const okN = res.filter((x) => x.status === "fulfilled").length;
    const errs = [...new Set(res.filter((x) => x.status === "rejected").map((x: any) => code(x.reason)))];
    const lines = r.audit.filter((e: any) => e.event === "decision-requested" && e.detail.includes(`reject draft ${d0.id}`)).length;
    out(`${storeName}/4 identical concurrent`, okN === 1 && lines === 1 && valid(r), { fulfilled: okN, errors: errs, lines, requests: r.decisionRequests.filter((q: any) => q.action === "reject").length });
  }
}

// 5. Two service instances on one directory (file store), concurrent identical asks + delivery failure racing a replacement.
{
  const dir = mkdtempSync(join(tmpdir(), "kic-probe-multi-"));
  const m = S.makeService({ store: new FileCampaignStore(dir) });
  const id = await m.evaluated();
  const d0 = (await m.service.getCampaign(id)).drafts[0]!;
  const mk = () => new CampaignService({ store: new FileCampaignStore(dir), gateway: m.gateway, evaluator: { kind: "mock", live: false } as any, operator: m.operator, clock: m.clock, limits: m.limits, verifier: m.keys.verifier, signer: null });
  const a = mk(), b = mk();
  const ask = (svc: any, why: string) => svc.requestDecision({ campaignId: id, subject: { kind: "draft", id: d0.id }, action: "reject", proposedRationale: why, requestedBy: "agent" });
  const res = await Promise.allSettled([...Array.from({ length: 6 }, (_, i) => ask(i % 2 ? a : b, `x${i}`))]);
  let r = await m.service.getCampaign(id);
  const okN = res.filter((x) => x.status === "fulfilled").length;
  // race: delivery for the standing request hangs, expires, B replaces it while A's delivery then fails
  m.clock.advance(31 * 60_000);
  const deliver = m.operator.deliver.bind(m.operator);
  let fail: (e: Error) => void = () => undefined;
  let hung = false;
  m.operator.deliver = (n: any) => { if (hung) return deliver(n); hung = true; return new Promise<void>((_, rej) => (fail = rej)); };
  const hanging = ask(a, "hang"); hanging.catch(() => undefined);
  while (!hung) await new Promise((s) => setTimeout(s, 5));
  m.clock.advance(31 * 60_000);
  const replacement = await ask(b, "replace");
  fail(new Error("down"));
  const hangOutcome = await hanging.then(() => "ok", code);
  r = await m.service.getCampaign(id);
  const rejects = r.decisionRequests.filter((q: any) => q.action === "reject");
  const lines = r.audit.filter((e: any) => (e.event === "decision-requested" || e.event === "decision-undelivered") && e.detail.includes(d0.id) || e.event === "decision-undelivered").map((e: any) => `${e.event}:${e.detail.slice(0, 60)}`);
  const ok = hangOutcome === "operator-unreachable" && okN === 1 && rejects.length === 1 && rejects[0].id === replacement.requestId && rejects[0].state === "pending" && valid(r);
  out("file/5 two instances, one directory", ok, { concurrentFulfilled: okN, hangOutcome, rejects: rejects.map((q: any) => `${q.id}:${q.state}`), lines, valid: valid(r) });
}

// 6. What the decision-pending refusal says: the standing request's id and expiry, nothing else (no code, no rationale).
{
  const m = S.makeService();
  const id = await m.evaluated();
  const d0 = (await m.service.getCampaign(id)).drafts[0]!;
  const first = await m.service.requestDecision({ campaignId: id, subject: { kind: "draft", id: d0.id }, action: "request-revision", proposedRationale: "SECRET-RATIONALE", revisionInstruction: "SECRET-INSTRUCTION", requestedBy: "agent" });
  const msg = await m.service.requestDecision({ campaignId: id, subject: { kind: "draft", id: d0.id }, action: "request-revision", proposedRationale: "b", revisionInstruction: "c", requestedBy: "agent" }).then(() => "", (e: any) => e.message);
  const codeValue = m.operator.codeFor(first.requestId);
  const leaks = ["SECRET-RATIONALE", "SECRET-INSTRUCTION", codeValue].filter((s) => msg.includes(s));
  out("memory/6 decision-pending text", leaks.length === 0, { msg, leaks: leaks.length });
}
