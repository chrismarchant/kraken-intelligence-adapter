import { S } from "./lib.ts";
const R = "/tmp/claude-0/-home-user/7f983aaa-ebce-54b6-b1bf-d0a292850218/scratchpad/review24";
const c = "c83b0cb";
const support = await import(`${R}/${c}/tests/kic/support.ts`); const lim = await import(`${R}/${c}/src/limits.ts`);
const cwd = process.cwd(); process.chdir(`${R}/${c}`); const brief = support.syntheticBrief(); process.chdir(cwd);
brief.constraints.mustAvoid = Array.from({ length: 40 }, (_, i) => `term${i} ${"word ".repeat(70)}`.trim());
const pats = ["I ", "a-", "a ", "x-!", "1 | ", "Our ops team reconciles 48-hour reports for 50-60 people in room B/101, 24/7. ", "$fr€€-trial ", "a/1/", "€-"];
for (const p of pats) {
  const row: (string | number)[] = [JSON.stringify(p.slice(0, 12))];
  for (const size of [4000, 8000, 16000, 32000]) {
    const body = p.repeat(Math.ceil(size / p.length)).slice(0, size).trim();
    let best = Infinity;
    for (let k = 0; k < 2; k++) { const t0 = performance.now(); S[c].analyseDraft(brief, { callToAction: "x" }, { ...support.cleanDraft("d", ""), body }, { ...lim.DEFAULT_LIMITS, linkedinMaxChars: 1e6 }); best = Math.min(best, performance.now() - t0); }
    row.push(Math.round(best));
  }
  console.log(row.join("\t"));
}
