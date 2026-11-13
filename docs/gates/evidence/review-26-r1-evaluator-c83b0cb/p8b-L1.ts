// L1, L13 reproductions without digits in the text.
import { rules } from "./lib.ts";
for (const b of ["Nine of ten clients renewed.", "Forty clients renewed.", "Revenue grew fourfold.", "Cut costs in half.", "Hours fell in 1950.", "We are far faster than rivals.", "Sixty % of teams agree.", "Fifty perc€nt of teams.", "Hálf of teams.", "We placed 12 PM roles.", "Trusted by SOC 5000 customers."])
  console.log(JSON.stringify(b), "->", JSON.stringify(rules([], b)));
