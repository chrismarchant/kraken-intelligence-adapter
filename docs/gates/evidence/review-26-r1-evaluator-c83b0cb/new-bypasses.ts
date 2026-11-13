// Ways round the rules found in this review that section 5 does not list by name.
import { show, rules } from "./lib.ts";
show("allowed picture for o in a spelled-out run", ["boss"], "Ask the b ● s s today.");
show("allowed picture for o, P4", ["no"], "Say n ● today.");
show("number % shape", ["x"], "Sixty % of teams.");
show("all-caps hashtag, short term inside", ["ROI"], "Body.", { hashtags: ["#HIGHROINOW"] });
show("stand-in inside a capitalised hashtag", ["AI"], "Body.", { hashtags: ["#My4ITool"] });
show("two runs needing different repeat readings", ["free tip"], "fr€€ t!!p");
show("stroke and one needing different letters", ["illegal"], "1||ega|");
show("single word needing both repeat readings", ["seeing"], "$€€!!ng");
console.log("L14 medal/calendar/flag allowed:", JSON.stringify(rules([], "We came 🥇 this year 📅 🏁")));
console.log("hashtag clock time not counted:", JSON.stringify(rules([], "Body.", { hashtags: ["#12PM"] })));
console.log("spelled shape with accent:", JSON.stringify(rules([], "Hálf of teams agree.")));
console.log("spelled shape with stand-in:", JSON.stringify(rules([], "Fifty perc€nt of teams.")));
console.log("PM as a role:", JSON.stringify(rules([], "We placed 12 PM roles.")));
console.log("identifier with a large number:", JSON.stringify(rules([], "Trusted by SOC 5000 customers.")));
show("stroke as both i and l, no digit", ["illegal"], "That is |||ega|.");
show("stroke as both i and l, no digit (2)", ["lie"], "No |ie here.");
show("stroke i and l: 'lil'", ["lil"], "A ||| one.");
