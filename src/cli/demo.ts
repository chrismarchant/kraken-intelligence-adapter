import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { FallbackGateway, FixtureGateway, RecordingGateway } from "../gateway/fixture.ts";
import type { ModelGateway } from "../gateway/gateway.ts";
import { MistralGateway } from "../gateway/mistral.ts";
import { runSyntheticCampaign } from "./scenario.ts";

/**
 * Run the synthetic campaign scenario from the command line.
 *
 *   node src/cli/demo.ts                       replay recorded model output (offline, deterministic)
 *   NODE_USE_ENV_PROXY=1 node src/cli/demo.ts --mode live [--record]
 *                                              call the model; --record rewrites the fixtures
 *   NODE_USE_ENV_PROXY=1 node src/cli/demo.ts --mode fill
 *                                              replay, calling the model only for steps with no recording
 */
const { values } = parseArgs({
  options: {
    mode: { type: "string", default: "fixture" },
    record: { type: "boolean", default: false },
    brief: { type: "string", default: "fixtures/campaigns/synthetic-harbourline.brief.json" },
    fixtures: { type: "string", default: "fixtures/llm/synthetic-harbourline" },
    out: { type: "string", default: "out" },
    variants: { type: "string", default: "2" },
    narratives: { type: "string", default: "3" },
    effort: { type: "string", default: "low" },
  },
});

let gateway: ModelGateway;
if (values.mode === "live") {
  if (values.effort !== "low" && values.effort !== "medium" && values.effort !== "high") {
    throw new Error('--effort must be "low", "medium" or "high".');
  }
  const live = new MistralGateway({ reasoningEffort: values.effort });
  gateway = values.record ? new RecordingGateway(live, resolve(values.fixtures)) : live;
} else if (values.mode === "fill") {
  if (values.effort !== "low" && values.effort !== "medium" && values.effort !== "high") {
    throw new Error('--effort must be "low", "medium" or "high".');
  }
  gateway = new FallbackGateway(
    new FixtureGateway(resolve(values.fixtures)),
    new RecordingGateway(new MistralGateway({ reasoningEffort: values.effort }), resolve(values.fixtures)),
  );
} else if (values.mode === "fixture") {
  gateway = new FixtureGateway(resolve(values.fixtures));
} else {
  throw new Error(`Unknown mode "${values.mode}". Use "fixture", "fill" or "live".`);
}

// Each run exports into its own directory, so an earlier run is never overwritten.
const exportRoot = join(resolve(values.out), new Date().toISOString().replace(/[:.]/g, "-"));
console.log(`Synthetic campaign scenario — model output: ${values.mode}${values.record ? " (recording)" : ""}`);
const started = Date.now();
const result = await runSyntheticCampaign({
  gateway,
  briefPath: resolve(values.brief),
  exportRoot,
  variants: Number(values.variants),
  narratives: Number(values.narratives),
  log: (line) => console.log(line),
});
const comparisonPath = join(result.export.directory, "comparison.md");
await writeFile(comparisonPath, result.comparison);
console.log(`\nExported in ${Math.round((Date.now() - started) / 1000)} s:`);
console.log(`  ${result.export.packagePath}`);
console.log(`  ${result.export.summaryPath}`);
console.log(`  ${result.export.commandsPath}`);
console.log(`  ${comparisonPath}`);
console.log(`  package sha256 ${result.export.packageSha256}`);
if (gateway instanceof FallbackGateway && gateway.missed.length) {
  console.log(`\nNewly recorded from a live call: ${gateway.missed.join(", ")}`);
}
console.log("\nEditorial decisions in this run were made by a scripted test actor. No UI is involved and nothing was published.");
