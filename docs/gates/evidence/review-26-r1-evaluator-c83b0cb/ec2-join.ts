// EC-2 suspicious-characters is defined per part ("any part ... is not in canonical form"); the code tests the parts joined by newlines.
import { rules } from "./lib.ts";
const T = "/tmp/claude-0/-home-user/7f983aaa-ebce-54b6-b1bf-d0a292850218/scratchpad/review26/tree";
const { canonicalText } = await import(`${T}/src/util/runtime.ts`);
console.log("hook 'Hook ' canonical on its own:", canonicalText("Hook ") === "Hook ", "-> rules", JSON.stringify(rules([], "Clean body.", { hook: "Hook " })));
console.log("last claim 'c ' canonical on its own:", canonicalText("c ") === "c ", "-> rules", JSON.stringify(rules([], "Clean body.", { claims: [{ text: "c ", needsEvidence: false, evidenceRef: null }] })));
