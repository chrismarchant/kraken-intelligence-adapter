// EC-7.3: time per draft at the contract's largest sizes, on adversarial shapes not in the repository's timing test.
const T = "/tmp/claude-0/-home-user/7f983aaa-ebce-54b6-b1bf-d0a292850218/scratchpad/review26/tree";
const { analyseDraft } = await import(`${T}/src/evaluation/signals.ts`);
const { DEFAULT_LIMITS } = await import(`${T}/src/limits.ts`);
import { brief, slot, draft } from "./lib.ts";
const b = brief(Array.from({ length: 40 }, (_, i) => `t${String.fromCharCode(97 + (i % 26))}rm ${"word ".repeat(70)}`.trim().slice(0, 400)));
const b2 = brief(Array.from({ length: 40 }, (_, i) => ["AI", "free", "scam", "guarantee", "roi", "us", "so", "it", "C++", "$$$"][i % 10] + (i >= 10 ? ` x${i}` : "")));
const tags = Array.from({ length: 8 }, (_, i) => "#" + "Ab1_".repeat(15).slice(0, 60));
const shapes: Record<string, string> = {
  "one ": "one ".repeat(2000), "one-": "one-".repeat(2000), "hundred and ": "hundred and ".repeat(700),
  "twenty five ": "twenty five ".repeat(700), "1,": "1,".repeat(4000), "1.": "1.".repeat(4000), "in 2026 ": "in 2026 ".repeat(1000),
  "from 2019 to ": "from 2019 to ".repeat(600), "a I ": "a I ".repeat(2000), "I l ": "Il".repeat(4000), "€€": "€".repeat(8000),
  "w!n ": "w!n ".repeat(2000), "s c a m ": "s c a m ".repeat(1000), "$1€|": "$1€|".repeat(2000), "'s": "it's ".repeat(1600),
  "a'": "a'".repeat(4000), "-a": "-a".repeat(4000), "·": "a·".repeat(4000), "🚀 ": "🚀 ".repeat(2600),
  "random-ish": Array.from({ length: 8000 }, (_, i) => "aI1!$ €.-'l"[(i * 7919) % 11]).join(""),
};
let worst = 0;
for (const [name, body0] of Object.entries(shapes)) {
  const body = body0.trim().slice(0, 8000);
  for (const [bn, br] of [["long terms", b], ["short terms", b2]] as const) {
    const t0 = performance.now();
    const r = analyseDraft(br, slot, draft(body, { hashtags: tags }), { ...DEFAULT_LIMITS, linkedinMaxChars: 100000 });
    const ms = performance.now() - t0; worst = Math.max(worst, ms);
    console.log(`${ms.toFixed(0).padStart(6)} ms  ${JSON.stringify(name)} (${bn}) failures=${r.failures.length} maxDetail=${Math.max(0, ...r.failures.map((f: any) => f.detail.length))}`);
  }
}
// growth: one-word shape at sizes 1000..8000
for (const n of [1000, 2000, 4000, 8000]) { const body = "one ".repeat(n / 4).trim(); const t0 = performance.now(); analyseDraft(b2, slot, draft(body), DEFAULT_LIMITS); console.log(`growth "one " n=${n}: ${(performance.now() - t0).toFixed(0)} ms`); }
for (const n of [1000, 2000, 4000, 8000]) { const body = Array.from({ length: n }, (_, i) => "aI1!$ €.-'l"[(i * 7919) % 11]).join(""); const t0 = performance.now(); analyseDraft(b2, slot, draft(body), DEFAULT_LIMITS); console.log(`growth random n=${n}: ${(performance.now() - t0).toFixed(0)} ms`); }
console.log(`worst ${worst.toFixed(0)} ms (bound 1500)`);
