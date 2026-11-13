import { V } from "./lib.ts";
let seed = Number(process.argv[2] ?? 1);
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
const TERMS = ["free","best","AI","ROI","scam","lose","guarantee","lol","sell","it","so","at","to","hell","well","cure","win","fee","cheap","risk-free","can't lose","AI-powered","best-in-class","no risk","money back","sale","bot","hi","ai tool","100% free","lie","toxic","bet","cash","os","ds","ab"];
const SUB: Record<string,string[]> = { a:["@","4"], s:["$","5","§"], i:["!","1","|","¡"], t:["+","7","†","‡"], o:["0","°","•"], e:["3","€","£"], b:["8"], c:["¢","©"], l:["£","1","|"], y:["¥"], x:["×"], r:["®"] };
const MARKS = ["@","$","€","£","¥","¢","|","!","+","×","°","•","¡","†","‡","§","©","®",".",",","?","\"","'","(",")","*","_","~","-",":",";","%","1","4","0","7","3","5","8","2","9","6"];
const JOINTS = ["-","/","–","—","--","/"];
const OTHER = ["trial","powered","tool","x","in","class","2026","24","7","B","off","now","day","101","x1","pro"];
function disguiseWord(w: string, p: number): string {
  let out = "";
  for (const ch of w) {
    const l = ch.toLowerCase();
    let c = ch;
    if (SUB[l] && rnd() < p) c = pick(SUB[l]!);
    else if (rnd() < 0.2) c = rnd() < 0.5 ? ch.toUpperCase() : ch.toLowerCase();
    out += c;
    if (rnd() < 0.04) out += c; // repeat
  }
  return out;
}
const edgeRun = () => { let s = ""; const n = rnd() < 0.5 ? 0 : 1 + Math.floor(rnd() * 3); for (let i = 0; i < n; i++) s += pick(MARKS); return s; };
export function make(): [string, string] {
  const term = pick(TERMS);
  const p = rnd();
  const shape = rnd();
  let words = term.split(" ").map((w) => w.split("-").map((x) => disguiseWord(x, p)).join(pick(["-", "-", " ", "", "–", "/"])));
  let core = words.join(pick([" ", " ", "-", "/", ""]));
  if (shape < 0.15) {
    // spaced out
    const sep = pick([" ", ". ", " . ", ".", " | ", "  "]);
    core = [...core.replace(/[ -]/g, "")].join(sep);
  }
  let w = edgeRun() + core + edgeRun();
  if (shape >= 0.15 && shape < 0.65) {
    // joined to another word with marks at the joint
    const other = pick(OTHER);
    const j = edgeRun().slice(0, 2) + pick(JOINTS) + edgeRun().slice(0, 2);
    w = rnd() < 0.5 ? edgeRun() + core + j + other + edgeRun() : edgeRun() + other + j + core + edgeRun();
    if (rnd() < 0.2) w = edgeRun() + pick(OTHER) + pick(JOINTS) + w;
  }
  const ctx = pick(["Our ", "Get it ", "Now ", "A ", "We ", "Reports ", "Do ", "Start your ", ""]);
  const tail = pick([" today.", " now", " here.", "", " for 40 people.", " 4 u", " x"]);
  return [ctx + w + tail, term];
}
if (import.meta.main) {
  const N = Number(process.argv[3] ?? 20000);
  const vs = ["e30451c", "184f687", "c83b0cb", "c83b0cb-noplain", "c83b0cb-nodisg", "c83b0cb-noapos", "c83b0cb-both"];
  const counts: Record<string, number> = {};
  const losses: string[] = [];
  for (let i = 0; i < N; i++) {
    const [t, term] = make();
    const r = vs.map((v) => (V[v].termFinder(t)(term) ? 1 : 0));
    const key = r.join("");
    counts[key] = (counts[key] ?? 0) + 1;
    if (r[0] === 1 && (r[2] === 0 || r[6] === 0)) losses.push(`${key}\t${term}\t${JSON.stringify(t)}`);
  }
  console.log(vs.join(" "));
  console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]));
  console.log("losses e->c83:", losses.length);
  console.log(losses.join("\n"));
}
