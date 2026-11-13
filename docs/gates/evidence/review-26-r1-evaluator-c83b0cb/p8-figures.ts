// P8: figures in digits, the stated exclusions, hashtags ("every digit counts"), other numerals, spelled quantities.
import { screen } from "./lib.ts";
const refs = [{ id: "ref-1", title: "Survey", summary: "62% of 1,053 teams reconcile by hand; 4.8/5 rating." }];
const sh = (label: string, body: string, o: any = {}) => {
  const f = screen([], body, o, refs).filter((x: any) => x.rule === "unlisted-statistic").map((x: any) => x.detail.slice(0, 70));
  console.log(`${f.length ? "FLAGGED" : "passed "} ${JSON.stringify(body)} ${JSON.stringify(o.hashtags ?? [])} :: ${f.join(" | ")}  (${label})`);
};
console.log("--- (a) digits ---");
sh("plain", "We saved 37 hours.");
sh("backed", "62% of teams reconcile by hand.", { claims: [{ text: "62% of teams reconcile by hand", needsEvidence: true, evidenceRef: "ref-1" }] });
sh("backed with comma variants", "1053 teams.", { claims: [{ text: "1,053 teams", needsEvidence: true, evidenceRef: "ref-1" }] });
sh("cited ref lacks figure", "We saved 37 hours.", { claims: [{ text: "We saved 37 hours", needsEvidence: true, evidenceRef: "ref-1" }] });
sh("clock am", "Join at 9am."); sh("clock 24h", "Starts 16:30."); sh("ratio 1:25", "A 1:25 ratio.");
sh("12 PM as project managers", "We placed 12 PM roles this year.");
sh("B2B", "B2B teams."); sh("Q3", "In Q3 we shipped."); sh("24/7", "24/7 support.");
sh("SOC 2", "We are SOC 2 audited."); sh("SOC 5000 customers", "Trusted by SOC 5000 customers.");
sh("iso lower", "iso 9001 certified.");
sh("year in 2026 we", "In 2026 we grew."); sh("year 1950. (L13)", "Hours fell in 1950."); sh("by 1950 inside", "Cut hours by 1950.");
sh("By 2027 opening", "By 2027 the market changes."); sh("span forward", "From 2019 to 2024 we grew."); sh("span backward", "From 2024 to 2019 we grew.");
console.log("--- (a) hashtags: every digit counts ---");
sh("hashtag digits", "Body.", { hashtags: ["#Top10"] });
sh("hashtag clock 9am", "Body.", { hashtags: ["#9am"] });
sh("hashtag clock 10pm", "Body.", { hashtags: ["#10pm"] });
sh("hashtag 12pm", "Body.", { hashtags: ["#12PM"] });
sh("hashtag B2B", "Body.", { hashtags: ["#B2B"] });
sh("hashtag 2026", "Body.", { hashtags: ["#2026"] });
console.log("--- (b) other numerals ---");
sh("arabic-indic", "We saved ٣٧ hours.");
sh("devanagari", "We saved ३ hours.");
sh("superscript (non-canonical)", "x² growth");
console.log("--- (c) spelled shapes ---");
for (const b of ["sixty-two percent of teams", "Sixty Two Per Cent", "three in four managers", "nine out of ten managers", "nine out of every ten", "three times faster", "three-fold rise", "threefold rise (L1)",
  "twice as fast", "double the output", "twice the output", "half of teams", "a third of teams", "two-thirds of teams", "three quarters of teams", "halved costs", "doubled output", "tripled",
  "two million records", "hundreds of teams", "a dozen teams", "half their time", "a fifth of teams", "one hundred and twenty percent",
  "sixty % of teams", "fifty perc€nt of teams", "fifty pércent", "hálf of teams", "dóubled output", "tw1ce as fast", "sixty-two pct",
  "Nine of ten clients renewed (L1)", "Forty clients renewed (L1)", "Cut costs in half (L1)", "a couple of teams", "a score of teams"]) sh("c", b);
