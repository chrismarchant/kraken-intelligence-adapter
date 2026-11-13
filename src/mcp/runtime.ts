import { resolve } from "node:path";
import { createJevTransport } from "../evaluation/jev.ts";
import { FixtureGateway } from "../gateway/fixture.ts";
import type { ModelGateway } from "../gateway/gateway.ts";
import { MistralGateway } from "../gateway/mistral.ts";
import { DEFAULT_LIMITS } from "../limits.ts";
import { FileCampaignStore } from "../store/store.ts";
import { FileOperatorChannel } from "../workflow/operator.ts";
import { CampaignService } from "../workflow/service.ts";

export interface RuntimeConfig {
  dataDir: string;
  operatorDir: string;
  exportDir: string;
  modelMode: "live" | "fixture";
  fixtureDir: string;
  evaluator: string;
  reasoningEffort: "low" | "medium" | "high" | undefined;
}

/**
 * Configuration for one instance, from its own environment. There is no shared or central
 * configuration: each client instance has its own data directory, model key and operator channel.
 */
export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const dataDir = resolve(env.KIC_DATA_DIR ?? "data");
  const modelMode = env.KIC_MODEL_MODE ?? "live";
  if (modelMode !== "live" && modelMode !== "fixture") throw new Error('KIC_MODEL_MODE must be "live" or "fixture".');
  const effort = env.KIC_REASONING_EFFORT;
  if (effort !== undefined && effort !== "low" && effort !== "medium" && effort !== "high") {
    throw new Error('KIC_REASONING_EFFORT must be "low", "medium" or "high".');
  }
  return {
    dataDir,
    // Must be somewhere the agent runtime cannot read, or the human-confirmation control is void.
    operatorDir: resolve(env.KIC_OPERATOR_DIR ?? `${dataDir}/operator`),
    exportDir: resolve(env.KIC_EXPORT_DIR ?? `${dataDir}/exports`),
    modelMode,
    fixtureDir: resolve(env.KIC_FIXTURE_DIR ?? "fixtures/llm/synthetic-harbourline"),
    evaluator: env.KIC_EVALUATOR ?? "mock-jev",
    reasoningEffort: effort,
  };
}

export function createRuntime(config: RuntimeConfig = loadRuntimeConfig()): {
  service: CampaignService;
  operator: FileOperatorChannel;
  config: RuntimeConfig;
} {
  const gateway: ModelGateway =
    config.modelMode === "fixture" ? new FixtureGateway(config.fixtureDir) : new MistralGateway({ reasoningEffort: config.reasoningEffort });
  const operator = new FileOperatorChannel(config.operatorDir);
  const service = new CampaignService({
    store: new FileCampaignStore(`${config.dataDir}/campaigns`),
    gateway,
    // Throws if anything other than the mock is asked for. There is no live JEV path.
    evaluator: createJevTransport(config.evaluator, DEFAULT_LIMITS),
    operator,
  });
  return { service, operator, config };
}
