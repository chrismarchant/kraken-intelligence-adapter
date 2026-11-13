import { V } from "./lib.ts";
const vs = ["e30451c", "184f687", "c83b0cb", "c83b0cb-both", "c83b0cb-nodisg", "c83b0cb-noapos"];
const BASES = ["we'll","she'll","he'll","i'll","it'll","we're","they're","we'd","she'd","he'd","i'd","it's","let's","what's","can't","won't","don't","isn't","i've","we've","i'm","he's","she's","who'll","shouldn't"];
const SUB: Record<string,string[]> = { a:["@","4"], s:["$","5"], i:["!","1","|"], t:["+","7"], o:["0"], e:["3","€"], l:["|","1","£"], c:["¢"], d:[], n:[], w:[], h:[], r:["®"], m:[], v:[], u:[] };
const APOS = ["'", "’", "‘", "`", "′"];
const res: Record<string, string[]> = {};
let n = 0;
for (const b of BASES) {
  const term = b.replace("'", "");
  const terms = [term, b.split("'")[0]!];
  // all single-letter substitutions and none, all apostrophes
  const variants = new Set<string>([b]);
  [...b].forEach((ch, i) => (SUB[ch] ?? []).forEach((s) => { variants.add(b.slice(0, i) + s + b.slice(i + 1)); [...b].forEach((ch2, j) => { if (j > i) (SUB[ch2] ?? []).forEach((s2) => variants.add(b.slice(0, i) + s + b.slice(i + 1, j) + s2 + b.slice(j + 1))); }); }));
  for (const v of variants) for (const a of APOS) for (const [pre, post] of [["", ""], ["", "-free"], ["$", ""], ["", "!"]]) for (const t of terms) {
    const text = `Yes ${pre}${v.replace("'", a)}${post} now`;
    n++;
    const r = vs.map((x) => (V[x].termFinder(text)(t) ? 1 : 0));
    if (r[0] === 1 && r[2] === 0) (res[r.join("")] ??= []).push(`${t}\t${text}`);
  }
}
console.log("checked", n);
for (const [k, v] of Object.entries(res)) { console.log(k, v.length); console.log([...new Set(v)].slice(0, 12).join("\n")); }
