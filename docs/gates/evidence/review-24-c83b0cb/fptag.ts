import { V, e2e } from "./lib.ts";
const TERMS = ["AI","ROI","free","best","scam","lose","lol","sell","it","so","at","to","ab","os","ds","us","win","fee","cheap","bet","bot","lie","hell","sale","cure","no risk","guarantee","10x","hi","test"];
let seed = 99; const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
const W = ["Data","Ops","Quality","Team","Growth","Supply","Chain","Report","Weekly","Q3","2026","B2B","PhD","iOS","SaaS","HR","CFO","Tech","Warehouse","Logistics","Insights","Of","And","For","PR","KPI","Stock","Fresh","Focus","Group","Lean","24x7","Day1","Top10","1on1","AB","Test","Win","Sell","Plan","Air","Cost","Hub","Smart"];
const out: Record<string, number> = {}; const lst: string[] = [];
for (let i = 0; i < 15000; i++) {
  const n = 1 + Math.floor(rnd() * 3); let tag = "#" + Array.from({ length: n }, () => pick(W)).join("");
  for (const t of TERMS) { const a = V.e30451c.hashtagFinder([tag])(t), c = V["c83b0cb"].hashtagFinder([tag])(t); if (c && !a) { lst.push(`${t}\t${tag}`); } }
}
const u = [...new Set(lst)]; console.log("new tag FP (unique)", u.length); console.log(u.join("\n"));
// e2e for numbers-joined sentences with terms not in the clean draft
const fixed = ["A 48-hour sprint for 50-60 people.", "Room B/101 is booked.", "Support runs 24/7 now.", "Targets for Q3/2026 are set.", "COVID-19 changed operations.", "We ran an A/B test.", "Book a 1-on-1 call.", "Take $5-off this week.", "Call +1-555-0100 today.", "A 401(k) plan.", "Tier-1 support.", "A €5-off voucher."];
const terms = ["AI","ROI","free","best","scam","lose","lol","sell","ab","os","ds","win","fee","bet","bot","lie","hell","sale","cure","hi","test","covid","off"];
const base = new Set(terms.filter((t) => e2e("c83b0cb", [t], "").includes("must-avoid-term") || e2e("e30451c", [t], "").includes("must-avoid-term")));
console.log("baseline-flagged terms (excluded):", [...base]);
for (const s of fixed) for (const t of terms) if (!base.has(t)) { const a = e2e("e30451c",[t],s).includes("must-avoid-term"), c = e2e("c83b0cb",[t],s).includes("must-avoid-term"); if (a !== c) console.log("e2e diff", t, s, a, c); }
