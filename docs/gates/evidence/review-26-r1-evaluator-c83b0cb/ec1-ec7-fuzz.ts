// EC-1.1 (same result every call, every process), EC-7.2 (no throw), EC-7.4 (bounds): seeded random drafts and briefs within the data contracts.
import { createHash } from "node:crypto";
const T = "/tmp/claude-0/-home-user/7f983aaa-ebce-54b6-b1bf-d0a292850218/scratchpad/review26/tree";
const { analyseDraft } = await import(`${T}/src/evaluation/signals.ts`);
const { DEFAULT_LIMITS } = await import(`${T}/src/limits.ts`);
const { PostBody, Hashtags, DraftClaim } = await import(`${T}/src/contracts/content.ts`);
const { ShortText } = await import(`${T}/src/contracts/common.ts`);
import { brief, slot } from "./lib.ts";
let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pool = [..."aAbcdeEfiIlLmnoOrsStuy0123456789 !@$|+.,-'’_*/()#%€£©®°•×\n", "é", "ß", "þ", "ð", "ı", "а", "α", "​", " ", "Ａ", "🚀", "\uD83D", "️", "́", "…", "™", "one ", "percent", "half of", "in 2026", "AI", "free", "scam", "can't", "he'll", "C++"];
const pick = () => pool[Math.floor(rnd() * pool.length)]!;
const str = (n: number) => Array.from({ length: n }, pick).join("");
let throws = 0, invalid = 0, n = 0, maxFailures = 0, maxDetail = 0, nondet = 0;
const h = createHash("sha256");
for (let i = 0; i < 3000; i++) {
  const terms = Array.from({ length: Math.floor(rnd() * 6) }, () => str(1 + Math.floor(rnd() * 4)).trim()).filter((t) => ShortText.safeParse(t).success);
  const b = brief(terms.length ? terms : ["AI"], [{ id: "ref-1", title: "T", summary: str(20) }]);
  const d = { hook: str(10).trim() || "h", body: str(1 + Math.floor(rnd() * 300)).trim() || "x", callToAction: "Tell me", hashtags: Array.from({ length: Math.floor(rnd() * 3) }, () => "#" + str(6).replace(/[^A-Za-z0-9_]/g, "") || "#a").filter((t) => /^#[A-Za-z0-9_]{1,60}$/.test(t)), claims: [{ text: str(15).trim() || "c", needsEvidence: rnd() > 0.5, evidenceRef: rnd() > 0.5 ? "ref-1" : null }].filter((c) => DraftClaim.safeParse(c).success) };
  if (!PostBody.safeParse(d.body).success || !Hashtags.safeParse(d.hashtags).success) { invalid++; continue; }
  n++;
  try {
    const a = analyseDraft(b, slot, d, DEFAULT_LIMITS); const a2 = analyseDraft(b, slot, d, DEFAULT_LIMITS);
    const s = JSON.stringify(a); if (s !== JSON.stringify(a2)) nondet++;
    h.update(s);
    maxFailures = Math.max(maxFailures, a.failures.length); maxDetail = Math.max(maxDetail, ...a.failures.map((f: any) => f.detail.length), 0);
  } catch (e) { throws++; if (throws < 4) console.log("THROW", (e as Error).message, JSON.stringify(d.body).slice(0, 80)); }
}
console.log(`valid drafts ${n} (skipped ${invalid} outside the data contracts); throws ${throws}; nondeterministic within process ${nondet}; maxFailures ${maxFailures}; maxDetail ${maxDetail}`);
console.log(`digest ${h.digest("hex")}`);
