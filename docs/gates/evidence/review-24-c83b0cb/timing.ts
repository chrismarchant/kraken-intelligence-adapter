import { S } from "./lib.ts";
const R = "/tmp/claude-0/-home-user/7f983aaa-ebce-54b6-b1bf-d0a292850218/scratchpad/review24";
const vers = (process.argv[2] ?? "e30451c,184f687,c83b0cb").split(",");
const support: any = {}, lim: any = {};
for (const c of vers) { support[c] = await import(`${R}/${c}/tests/kic/support.ts`); lim[c] = await import(`${R}/${c}/src/limits.ts`); }
const slot = { callToAction: "x" };
const termsets: Record<string, string[]> = {
  long: Array.from({ length: 40 }, (_, i) => `term${i} ${"word ".repeat(70)}`.trim()),
  short: ["AI","ROI","free","best","scam","lose","lol","sell","it","so","at","to","ab","os","ds","us","win","fee","cheap","bet","bot","lie","hell","well","sale","cure","risk-free","can't lose","no risk","guarantee","10x","B2B","hi","on","off","test","one","day","hour","covid"],
};
const prose = "Our ops team reconciles 48-hour reports for 50-60 people in room B/101, 24/7. ";
const shapes: Record<string, string> = {
  "I ": "I ".repeat(4000), aIII: `a${"I".repeat(7999)}`, III: "I".repeat(8000), "l I ": "l I ".repeat(2000), "a!@$|1 ": "a!@$|1 ".repeat(1100), "a ": "a ".repeat(4000), "A.I. ": "A.I. ".repeat(1600),
  "a...b": `a${".".repeat(7998)}b`, "a)))b": `a${")".repeat(7998)}b`, "!!!a": `${"!".repeat(7999)}a`, "a!!!": `a${"!".repeat(7999)}`, "1...": `1${".".repeat(7999)}`, "---": "-".repeat(8000), "a-": "a-".repeat(4000), "1 ": "1 ".repeat(4000),
  prose: prose.repeat(110), "$fr€€-x ": "$fr€€-trial ".repeat(600), "a-b-c-": "a-b-c-d-e-f-g-".repeat(570), "a/1/": "a/1/".repeat(2000), "1-": "1-".repeat(4000), "$-$ ": "$-$ ".repeat(2000),
  "|-": "|-".repeat(4000), "x-!": "x-!".repeat(2666), "we'll-": "we'll-".repeat(1333), "word-": "word-".repeat(1600), "aaaa": "a".repeat(8000), "$a-$": `$${"a-".repeat(3999)}$`, "€-": "€-".repeat(4000), "1 | ": "1 | ".repeat(2000), "4 . ": "4 . ".repeat(2000),
  "!-!": "!-".repeat(4000), "(a)-": "(a)-".repeat(2000), "$a$-": "$a$-".repeat(2000), "a/": "a/".repeat(4000),
};
const sizes = process.argv[3] ? process.argv[3].split(",").map(Number) : [8000];
const only = process.argv[4] ? process.argv[4].split("|") : null;
for (const size of sizes) for (const [ts, terms] of Object.entries(termsets)) for (const [name, b] of Object.entries(shapes)) {
  if (only && !only.includes(name)) continue;
  const row: (string | number)[] = [size, ts, JSON.stringify(name)];
  for (const c of vers) {
    const cwd = process.cwd(); process.chdir(`${R}/${c}`); const brief = support[c].syntheticBrief(); process.chdir(cwd);
    brief.constraints.mustAvoid = terms;
    const d = { ...support[c].cleanDraft("d", ""), body: b.trim().slice(0, size) };
    const t0 = performance.now(); S[c].analyseDraft(brief, slot, d, { ...lim[c].DEFAULT_LIMITS, linkedinMaxChars: 100000 }); row.push(Math.round(performance.now() - t0));
  }
  console.log(row.join("\t"));
}
