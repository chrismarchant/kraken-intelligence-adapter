// EC-6.6: one revision per signed instruction; the revision is a new, unevaluated draft.
const T = "/tmp/claude-0/-home-user/7f983aaa-ebce-54b6-b1bf-d0a292850218/scratchpad/review26/tree";
const { makeService } = await import(`${T}/tests/kic/support.ts`);
const { service, evaluated, decide } = makeService();
const id = await evaluated();
const original = (await service.getCampaign(id)).drafts.find((d: any) => d.slot === 1);
await decide(id, { kind: "draft", id: original.id }, "request-revision", "Tighten it.");
const r1 = await service.reviseDraft(id, original.id);
let second = "allowed";
try { await service.reviseDraft(id, original.id); } catch (e: any) { second = `refused (${e.code ?? e.message})`; }
console.log("second revision on the same instruction:", second);
const ev = (await service.getCampaign(id)).evaluations.some((e: any) => e.candidates.some((c: any) => c.draftId === r1.id));
console.log("revised draft has an evaluation before re-evaluating:", ev);
