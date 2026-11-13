// Reproduce section 5 limitations L2..L12 (each should pass screening, i.e. term missed).
import { show } from "./lib.ts";
show("L2", ["free"], "It is FREEEE today."); show("L2", ["scam"], "Total scammm.");
show("L3", ["scam"], "Total sc*m."); show("L3", ["free"], "It is fr_e.");
show("L4", ["guarantee"], "We guar-\nantee it.");
show("L5", ["guarantee"], "We 9uarantee it.");
show("L6", ["best"], "Our 8357 offer."); show("L6", ["AI"], "Version 4.1 tools"); show("L6", ["lol"], "Room 101 is here.");
show("L7", ["hell"], "What the he'|| is this"); show("L7", ["well"], "We do it w3'll."); show("L7", ["it"], "Get it's-free now.");
show("L8", ["fee"], "No feees."); show("L8", ["use"], "We used it.");
show("L9", ["C++"], "In C ++ we trust."); show("L9", ["can't"], "You can't_lose.");
show("L10", ["scam"], "A scarn."); show("L10", ["win"], "We vvin.");
show("L12", ["AI"], "Body.", { hashtags: ["#my_aitool"] });
show("L15", ["free"], "It costs nothing.");
show("L11 attempt", ["win big"], "w!n b!g!"); show("L11 attempt2", ["hi there"], "h! there!");
show("new: all-caps tag", ["ROI"], "Body.", { hashtags: ["#HIGHROINOW"] });
