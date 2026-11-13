import { V } from "./lib.ts";
let seed = Number(process.argv[2] ?? 1);
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
const TERMS = ["free","best","AI","ROI","scam","lose","guarantee","lol","sell","it","so","at","win","fee","cheap","no risk","AI-powered","bot","os","ds","10x","sale","hell"];
const SUB: Record<string,string[]> = { a:["@","4"], s:["$","5"], i:["!","1","|"], t:["+","7"], o:["0"], e:["3","€"], b:["8"], c:["¢"], l:["1","|"], x:["×"], r:["®"] };
const WORDS = ["My","Tool","Ops","Data","2026","Best","Team","Q3","B2B","Sales","Pro","Day","x","Now","Of","PR","PhD"];
const vs = ["e30451c", "184f687", "c83b0cb", "c83b0cb-both"];
const N = Number(process.argv[3] ?? 20000);
const counts: Record<string, number> = {}; const losses: string[] = [];
for (let i = 0; i < N; i++) {
  const term = pick(TERMS); const p = rnd();
  let w = [...term.replace(/[ -]/g, rnd() < 0.5 ? "" : "_")].map((c) => { const l = c.toLowerCase(); if (SUB[l] && rnd() < p) return pick(SUB[l]!); return rnd() < 0.5 ? c.toUpperCase() : c.toLowerCase(); }).join("");
  const parts = [w]; const k = Math.floor(rnd() * 3);
  for (let j = 0; j < k; j++) rnd() < 0.5 ? parts.unshift(pick(WORDS)) : parts.push(pick(WORDS));
  const tag = "#" + parts.join(rnd() < 0.2 ? "_" : "");
  const r = vs.map((v) => (V[v].hashtagFinder([tag])(term) ? 1 : 0));
  counts[r.join("")] = (counts[r.join("")] ?? 0) + 1;
  if (r[0] === 1 && (r[2] === 0 || r[3] === 0)) losses.push(`${r.join("")}\t${term}\t${tag}`);
}
console.log(counts); console.log("losses", losses.length); console.log([...new Set(losses)].join("\n"));
