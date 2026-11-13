// Shared helper for probes: builds a draft and brief and runs the evaluator's screening from the worktree.
import { readFileSync } from "node:fs";
const T = "/tmp/claude-0/-home-user/7f983aaa-ebce-54b6-b1bf-d0a292850218/scratchpad/review26/tree";
const { analyseDraft } = await import(`${T}/src/evaluation/signals.ts`);
const { DEFAULT_LIMITS } = await import(`${T}/src/limits.ts`);
export const TREE = T;
export function brief(mustAvoid: string[] = [], references?: any[]) {
  const b = JSON.parse(readFileSync(`${T}/fixtures/campaigns/synthetic-harbourline.brief.json`, "utf8"));
  b.constraints.mustAvoid = mustAvoid;
  if (references) b.references = references;
  return b;
}
export const slot = { slot: 1, week: 1, orderInWeek: 1, theme: "t", intent: "problem-framing", sequencingRationale: "x", callToAction: "Tell me", evidenceRequirements: [] };
export function draft(body: string, o: any = {}) {
  return { hook: o.hook ?? "Hook", body, callToAction: o.callToAction ?? "Tell me", hashtags: o.hashtags ?? [], claims: o.claims ?? [] };
}
export function screen(mustAvoid: string[], body: string, o: any = {}, refs?: any[]) {
  return analyseDraft(brief(mustAvoid, refs), slot, draft(body, o), DEFAULT_LIMITS).failures;
}
export function rules(mustAvoid: string[], body: string, o: any = {}, refs?: any[]) {
  return [...new Set(screen(mustAvoid, body, o, refs).map((f: any) => f.rule))].sort();
}
/** Print one line: label, whether must-avoid found, the rules. */
export function show(label: string, mustAvoid: string[], body: string, o: any = {}) {
  const r = rules(mustAvoid, body, o);
  console.log(`${r.includes("must-avoid-term") ? "FOUND  " : "missed "} ${JSON.stringify(mustAvoid)} in ${JSON.stringify(body)} ${JSON.stringify(o.hashtags ?? [])} -> [${r.join(",")}]  (${label})`);
  return r;
}
