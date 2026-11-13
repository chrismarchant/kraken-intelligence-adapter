const R = "/tmp/claude-0/-home-user/7f983aaa-ebce-54b6-b1bf-d0a292850218/scratchpad/review24";
export const V: Record<string, any> = {};
for (const c of ["e30451c", "184f687", "c83b0cb"]) V[c] = await import(`${R}/${c}/src/evaluation/terms.ts`);
export const S: Record<string, any> = {};
for (const c of ["e30451c", "184f687", "c83b0cb"]) S[c] = await import(`${R}/${c}/src/evaluation/signals.ts`);
const support: Record<string, any> = {};
for (const c of ["e30451c", "184f687", "c83b0cb"]) support[c] = await import(`${R}/${c}/tests/kic/support.ts`);
const lim: Record<string, any> = {};
for (const c of ["e30451c", "184f687", "c83b0cb"]) lim[c] = await import(`${R}/${c}/src/limits.ts`);
const slot = { callToAction: "What did you last check by hand before sending a report?" };
export function e2e(c: string, terms: string[], body: string, hashtags?: string[]): string[] {
  const cwd = process.cwd(); process.chdir(`${R}/${c}`); const brief = support[c].syntheticBrief(); process.chdir(cwd);
  brief.constraints.mustAvoid = terms;
  const d = { ...support[c].cleanDraft("d", body), ...(hashtags ? { hashtags } : {}) };
  return S[c].analyseDraft(brief, slot, d, lim[c].DEFAULT_LIMITS).failures.map((f: any) => f.rule).sort();
}
export const body = (c: string, t: string, term: string) => V[c].termFinder(t)(term) as boolean;
export const tag = (c: string, tags: string[], term: string) => V[c].hashtagFinder(tags)(term) as boolean;
for (const c of ["c83b0cb-noplain", "c83b0cb-nodisg", "c83b0cb-noapos", "c83b0cb-both"]) V[c] = await import(`${R}/${c}/src/evaluation/terms.ts`);
