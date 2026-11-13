// P2: every letter the allow-list admits (in canonical form) must fold to plain ASCII letters; list those that do not.
const T = "/tmp/claude-0/-home-user/7f983aaa-ebce-54b6-b1bf-d0a292850218/scratchpad/review26/tree";
const { isAllowedLetter } = await import(`${T}/src/evaluation/characters.ts`);
const { fold } = await import(`${T}/src/evaluation/terms.ts`);
const { canonicalText } = await import(`${T}/src/util/runtime.ts`);
const odd: string[] = [];
let allowed = 0;
for (let cp = 0; cp < 0x2000; cp++) {
  const c = String.fromCodePoint(cp);
  if (!isAllowedLetter(c)) continue;
  if (canonicalText(c) !== c) continue; // refused anyway as non-canonical
  allowed++;
  for (const asSeen of [false, true]) {
    const f = fold(c, asSeen);
    if (!/^[A-Za-z]+$/.test(f)) odd.push(`U+${cp.toString(16).toUpperCase()} ${c} -> ${JSON.stringify(f)} asSeen=${asSeen}`);
  }
}
console.log(`allowed canonical letters: ${allowed}; not folded to ASCII: ${odd.length}`);
for (const o of odd) console.log(o);
