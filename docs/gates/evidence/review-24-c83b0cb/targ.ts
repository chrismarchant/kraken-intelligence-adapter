import { V } from "./lib.ts";
const vs = ["e30451c", "c83b0cb", "c83b0cb-both"];
const SYMS = ["", "@","$","€","£","¥","¢","|","!","+","×","°","•","¡","†","‡","§","©","®", "1", "4", "0", "."];
const TERMS: [string, string[]][] = [
  ["free", ["free","fr€€","fr33","f®€3"]], ["AI", ["AI","4|","@!","41","@1"]], ["best", ["best","b3$+","8€57"]], ["lol", ["lol","|0|","101","l°l"]],
  ["scam", ["scam","$c@m","5¢4m"]], ["it", ["it","!+","17","|7"]], ["ROI", ["ROI","®0|","R01"]], ["cure", ["cure","¢ur3","cu®€"]], ["lose", ["lose","l0$3","1°5€"]],
];
const JOINTS = ["-", "/", "–", "—"];
const OTHERS = ["trial", "2026", "B"];
let total = 0; const bad: Record<string, string[]> = {};
function check(text: string, term: string) {
  total++;
  if (!V.e30451c.termFinder(text)(term)) return;
  const r = vs.map((v) => (V[v].termFinder(text)(term) ? 1 : 0));
  if (r[1] === 0 || r[2] === 0) (bad[r.join("")] ??= []).push(`${term}\t${JSON.stringify(text)}`);
}
const part = Number(process.argv[2]); const TT = TERMS.filter((_, i) => i % 3 === part);
for (const [term, forms] of TT) for (const f of forms) {
  for (const p of SYMS) for (const s of SYMS) {
    check(`Our ${p}${f}${s} now`, term);
    for (const j of JOINTS) for (const o of OTHERS) for (const [a, b] of [["", ""], [s, ""], ["", s], [s, s]]) {
      check(`Our ${p}${f}${a}${j}${b}${o} now`, term);
      check(`Our ${o}${a}${j}${b}${f}${s} now`, term);
    }
  }
}
console.log("total", total);
for (const [k, v] of Object.entries(bad)) { console.log(k, v.length); console.log(v.slice(0, 15).join("\n")); }
