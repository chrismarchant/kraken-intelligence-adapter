// Sanity: clean fixture text passes screening with no failures.
import { screen } from "./lib.ts";
console.log(screen([], "Operations teams reconcile the weekly report by hand. What do you check?"));
console.log(screen(["AI"], "Our AI tool."));
