// P4 spelled-out letters, P5 I/l, P6 hashtags, P7 literal terms: at their stated boundaries.
import { show } from "./lib.ts";
console.log("--- P4 ---");
show("spaces", ["AI"], "Our A I tool");
show("dots", ["ROI"], "Great R. O. I. today");
show("lower", ["scam"], "it is a s c a m");
show("along run", ["scam"], "a s c a m");
show("dots no spaces", ["ROI"], "R.O.I.");
show("spaced dots", ["scam"], "s . c . a . m");
show("hyphen letters", ["scam"], "S-C-A-M");
show("slash letters", ["scam"], "s/c/a/m");
show("letters with symbols", ["scam"], "s c @ m");
show("multiword spaced", ["free trial"], "f r e e t r i a l");
show("ending on spelled run", ["scam"], "s c a m s");
console.log("--- P5 ---");
show("seII", ["sell"], "We seII it");
show("Al", ["AI"], "Al tools");
show("ROl", ["ROI"], "Great ROl");
show("heIp", ["help"], "We heIp");
show("PAlD", ["paid"], "PAlD post");
show("I after small in hashtag", ["sell"], "x", { hashtags: ["#seIIfast"] });
console.log("--- P6 ---");
for (const [t, h] of [
  ["free", "#FreeTrial"], ["free", "#free_trial"], ["AI", "#AI2026"], ["AI", "#2026AI"], ["free", "#myfreetrial"],
  ["AI", "#bestAI"], ["AI", "#AIpowered"], ["AI", "#MyAITool"], ["ROI", "#BestROIever"], ["AI", "#myAItool"],
  ["AI", "#my_aitool"], ["AI", "#myaitool"], ["AI", "#GoAI2026"], ["free", "#Fr33Trial"], ["AI", "#My4ITool"], ["AI", "#My@ITool"],
  ["scam", "#scammed"], ["free trial", "#FreeTrials"], ["AI", "#AI_"], ["AI", "#ToolsAi"], ["AI", "#TOOLSAI"], ["AI", "#TOOLS_AI_NOW"],
  ["ROI", "#HIGHROINOW"], ["us", "#ContactUs"], ["10x", "#10xGrowth"], ["AI", "#A_I"],
] as Array<[string, string]>) show("P6", [t], "Body text.", { hashtags: [h] });
console.log("--- P7 ---");
show("C++", ["C++"], "We code in C++ daily.");
show("c++ lower", ["C++"], "We code in c++ daily.");
show("$$$", ["$$$"], "Make $$$ fast");
show("$$$ in hashtag", ["$$$"], "Body", { hashtags: ["#$$$"] });
show("C++ spaced (L9)", ["C++"], "We code in C ++ daily.");
show("C++ in hashtag", ["C++"], "Body", { hashtags: ["#C++"] });
show("C#", ["C#"], "We code in C# daily.");
show("C# word boundary", ["C#"], "ABC# daily");
show("100%", ["100%"], "100% sure");
show("A+", ["A+"], "Rated A+ by all");
show("literal with fullwidth", ["C++"], "We code in C＋＋ daily.");
