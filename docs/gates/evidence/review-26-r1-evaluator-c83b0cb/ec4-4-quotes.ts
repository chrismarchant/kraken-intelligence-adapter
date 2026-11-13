// EC-4.4: findings quote the draft "as it is, cut to a stated length", and name a character outside the allowed list by code point, never reproducing it.
import { screen } from "./lib.ts";
const T = "/tmp/claude-0/-home-user/7f983aaa-ebce-54b6-b1bf-d0a292850218/scratchpad/review26/tree";
const { isAllowedLetter } = await import(`${T}/src/evaluation/characters.ts`);
const show = (label: string, f: any[]) => { for (const x of f) console.log(`[${label}] ${x.rule}: ${JSON.stringify(x.detail)}`); };
// 1. A claim with characters outside the list, quoted in the unsupported-claim reason.
show("claim quoted", screen([], "Body text.", { claims: [{ text: "We are АІ 🇬🇧 leaders", needsEvidence: true, evidenceRef: null }] }));
// 2. A numeral of another script reproduced in the unlisted-statistic reason.
show("other numeral", screen([], "We saved ٣٧ hours."));
// 3. A figure quoted without its separators ("1,053" is reported as "1053").
show("figure separators", screen([], "We reached 1,053 teams."));
// 4. A spelled quantity reported lower-cased.
show("spelled quantity", screen([], "SIXTY PERCENT of teams."));
// 5. A claim cut at 200 UTF-16 units splits a surrogate pair.
const long = "x".repeat(199) + "🚀 more";
const d = screen([], "Body.", { claims: [{ text: long, needsEvidence: true, evidenceRef: null }] })[0].detail as string;
console.log(`[surrogate] detail ends with lone high surrogate: ${/[\uD800-\uDBFF]"$/.test(d)} (${JSON.stringify(d.slice(-6))})`);
// 6. An unknown evidence reference quoted as given.
show("evidence ref", screen([], "Body.", { claims: [{ text: "c", needsEvidence: true, evidenceRef: "rеf-1" }] }));
