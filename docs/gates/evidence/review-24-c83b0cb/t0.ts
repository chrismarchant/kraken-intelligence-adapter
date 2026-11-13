import { body, tag, e2e } from "./lib.ts";
const cases: [string, string][] = [
 ["Get it $fr€€-trial today", "free"], ["Our $4|-powered checks", "AI"], ["Our 4 | tool", "AI"], ["| 0 |", "lol"],
 ["we'|| do it", "well"], ["she'|| go", "shell"], ["it's-free", "it"], ["he`ll", "hell"], ["Room 101", "lol"], ["$101-x", "lol"],
];
for (const [t, term] of cases) console.log(JSON.stringify(t), term, ["e30451c","184f687","c83b0cb"].map(c => body(c,t,term) ? 1 : 0).join(""), ["e30451c","c83b0cb"].map(c=>e2e(c,[term],t).includes("must-avoid-term")?1:0).join(""));
