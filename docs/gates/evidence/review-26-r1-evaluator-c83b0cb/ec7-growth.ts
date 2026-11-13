// EC-7.3: does time grow faster than length? analyseDraft on repeated shapes at 1k..8k (contract max) and beyond, median of 5.
const T = "/tmp/claude-0/-home-user/7f983aaa-ebce-54b6-b1bf-d0a292850218/scratchpad/review26/tree";
const { analyseDraft } = await import(`${T}/src/evaluation/signals.ts`);
const { DEFAULT_LIMITS } = await import(`${T}/src/limits.ts`);
import { brief, slot, draft } from "./lib.ts";
const b = brief(["AI", "free", "scam"]);
const L = { ...DEFAULT_LIMITS, linkedinMaxChars: 1e6 };
for (const unit of ["one ", "a I ", "s c a m ", "w!n ", "hundred and "]) {
  const row: string[] = [];
  for (const n of [1000, 2000, 4000, 8000, 16000, 32000]) {
    const body = unit.repeat(Math.ceil(n / unit.length)).slice(0, n).trim();
    const times: number[] = [];
    for (let k = 0; k < 5; k++) { const t0 = performance.now(); analyseDraft(b, slot, draft(body), L); times.push(performance.now() - t0); }
    times.sort((x, y) => x - y); row.push(`${n}:${times[2]!.toFixed(0)}`);
  }
  console.log(JSON.stringify(unit), row.join("  "));
}
