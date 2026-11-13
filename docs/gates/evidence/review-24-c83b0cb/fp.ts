import { V, e2e } from "./lib.ts";
const TERMS = ["AI","ROI","free","best","scam","lose","lol","sell","it","so","at","to","ab","os","ds","us","win","fee","cheap","bet","bot","lie","hell","well","sale","cure","risk-free","can't lose","no risk","guarantee","10x","B2B","hi","on","off","test","one","day","hour","covid"];
const fixed = ["A 48-hour sprint for 50-60 people.", "Room B/101 is booked.", "Support runs 24/7 now.", "Targets for Q3/2026 are set.", "COVID-19 changed operations.", "We ran an A/B test.", "Book a 1-on-1 call.", "Take $5-off this week.", "Call +1-555-0100 today.", "Revenue rose 17% to 4.8/5 stars.", "It is a 3-to-1 ratio.", "A 2-for-1 deal.", "Version 2.0-beta ships.", "The 9-to-5 grind.", "Win 1-0 at home.", "A 0-60 time of 4.1s.", "Our 100+ clients.", "Page 4/10.", "A 3D-printed part.", "Q4-2026 plan.", "H1/H2 results.", "The 80/20 rule.", "A 5-star review.", "In 2026-27 we grow.", "The 360-degree view.", "A 10-minute read.", "Over 1,053 users.", "Step 1/3: export.", "A B2B-focused team.", "Our 4-person team.", "It's a 50/50 call.", "Between 9-17h daily.", "Model X-1 is out.", "Use COVID-19-safe rooms.", "Team-of-1 founders.", "Read p.101-104.", "A 401(k) plan.", "Call 1-800-555-0199.", "Tier-1 support.", "Built for 1-to-many.", "R&D-led growth.", "A €5-off voucher.", "A £10/month plan.", "From 9:00-17:30.", "A 7-day trial.", "Our 1st-party data."];
let seed = 7; const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
const subj = ["Our team", "The ops lead", "Finance", "Each analyst", "The warehouse", "Two managers", "Q3 reporting", "The 24/7 desk", "A B2B buyer", "Our 4-person crew"];
const verb = ["reconciles", "checks", "exports", "reviews", "ships", "cuts", "logs", "tracks", "audits", "plans"];
const obj = ["48-hour reports", "the A/B results", "1,200 SKUs", "stock in room B/101", "the 80/20 list", "Q3/2026 targets", "invoices by hand", "COVID-19 backlogs", "1-on-1 notes", "the 7-day trial data", "about 40% of orders", "every 2nd shipment", "pallets 1-50", "50-60 lines", "the $5-off coupons", "3-4 times a week", "its iOS apps", "the PhD's data", "a 9-5 shift", "v2.1-rc builds"];
const tail = ["", " today.", " before Monday.", " in 2026.", " at 9:30.", " with care.", " — mostly."];
const sentences = [...fixed]; for (let i = 0; i < 4000; i++) sentences.push(`${pick(subj)} ${pick(verb)} ${pick(obj)}${pick(tail)}`);
const newFP: string[] = []; let fpE = 0, fpC = 0;
for (const s of new Set(sentences)) {
  const fe = V.e30451c.termFinder(s), fc = V["c83b0cb"].termFinder(s), f1 = V["184f687"].termFinder(s);
  for (const t of TERMS) { const a = fe(t), c = fc(t); if (a) fpE++; if (c) fpC++; if (c && !a) newFP.push(`${t}\t${s}\t184:${f1(t)?1:0}`); }
}
console.log("sentences", new Set(sentences).size, "hits e30451c", fpE, "hits c83", fpC);
console.log("new at c83:", [...new Set(newFP)].join("\n"));
// hashtags
const TAGS = ["#SaaSOfPR","#PhDStudents","#iOSApps","#FreshAir","#FocusGroup","#Q3Results","#B2BSales","#24x7Support","#COVID19","#ABTesting","#OneOnOne","#Ops2026","#DataQuality","#AItools","#Operations","#USMarket","#NYCTech","#CFOInsights","#ROIdriven","#HRTech","#SMBs","#OKRs","#KPIsMatter","#Web3","#5G","#IoTData","#ESGReporting","#DEIatWork","#UXDesign","#APIFirst","#GDPRReady","#CXOs","#QAteam","#SEOtips","#B2C","#DTCbrands","#TeamOf1","#Day1","#Top10","#101Tips"];
const tagFP: string[] = [];
for (const tg of TAGS) for (const t of TERMS) { const a = V.e30451c.hashtagFinder([tg])(t), c = V["c83b0cb"].hashtagFinder([tg])(t), b = V["184f687"].hashtagFinder([tg])(t); if (c && !a) tagFP.push(`${t}\t${tg}\t184:${b?1:0}`); }
console.log("new tag FPs:\n" + tagFP.join("\n"));
// e2e on fixed
const e2eNew = fixed.filter((s) => e2e("c83b0cb", TERMS, s).includes("must-avoid-term") && !e2e("e30451c", TERMS, s).includes("must-avoid-term"));
console.log("e2e new refusals on fixed:", e2eNew);
