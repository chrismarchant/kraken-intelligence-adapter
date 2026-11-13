import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { createJevTransport } from "../evaluation/jev.ts";
import { FixtureGateway } from "../gateway/fixture.ts";
import type { ModelGateway } from "../gateway/gateway.ts";
import { MistralGateway } from "../gateway/mistral.ts";
import { DEFAULT_LIMITS } from "../limits.ts";
import { FileCampaignStore } from "../store/store.ts";
import { FileOperatorChannel } from "../workflow/operator.ts";
import { CampaignService } from "../workflow/service.ts";
import type { DecisionSigner, DecisionVerifier } from "../workflow/signing.ts";
import { signerFromPrivateKeyPem, verifierFromPublicKeyPem } from "../workflow/signing.ts";

export interface RuntimeConfig {
  dataDir: string;
  operatorDir: string;
  exportDir: string;
  modelMode: "live" | "fixture";
  fixtureDir: string;
  evaluator: string;
  reasoningEffort: "low" | "medium" | "high" | undefined;
  /** Path of the operator's public key, or null when unsigned decisions were explicitly allowed. */
  decisionPublicKeyFile: string | null;
}

function inside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !resolve(parent, rel).startsWith(".."));
}

/**
 * Configuration for one instance, from its own environment. There is no shared or central
 * configuration: each client instance has its own data directory, model key, operator
 * channel and operator key.
 */
export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): RuntimeConfig {
  const dataDir = resolve(cwd, env.KIC_DATA_DIR ?? "data");
  const modelMode = env.KIC_MODEL_MODE ?? "live";
  if (modelMode !== "live" && modelMode !== "fixture") throw new Error('KIC_MODEL_MODE must be "live" or "fixture".');
  const effort = env.KIC_REASONING_EFFORT;
  if (effort !== undefined && effort !== "low" && effort !== "medium" && effort !== "high") {
    throw new Error('KIC_REASONING_EFFORT must be "low", "medium" or "high".');
  }

  // The operator channel carries what the editor needs to confirm a decision. It has no
  // default, and it may not sit inside the data directory or the working directory, which
  // an agent runtime with file tools would normally be able to read.
  if (!env.KIC_OPERATOR_DIR) throw new Error("Set KIC_OPERATOR_DIR to a directory the agent runtime cannot read.");
  const operatorDir = resolve(cwd, env.KIC_OPERATOR_DIR);
  if (inside(dataDir, operatorDir) || inside(cwd, operatorDir)) {
    throw new Error("KIC_OPERATOR_DIR must be outside the data directory and the working directory.");
  }

  let decisionPublicKeyFile: string | null = null;
  if (env.KIC_DECISION_PUBLIC_KEY_FILE) decisionPublicKeyFile = resolve(cwd, env.KIC_DECISION_PUBLIC_KEY_FILE);
  else if (env.KIC_ALLOW_UNSIGNED_DECISIONS !== "1") {
    throw new Error("Set KIC_DECISION_PUBLIC_KEY_FILE to the operator's public key (or KIC_ALLOW_UNSIGNED_DECISIONS=1 for development only).");
  }

  return {
    dataDir,
    operatorDir,
    exportDir: resolve(cwd, env.KIC_EXPORT_DIR ?? `${dataDir}/exports`),
    modelMode,
    fixtureDir: resolve(cwd, env.KIC_FIXTURE_DIR ?? "fixtures/llm/synthetic-harbourline"),
    evaluator: env.KIC_EVALUATOR ?? "mock-jev",
    reasoningEffort: effort,
    decisionPublicKeyFile,
  };
}

function build(config: RuntimeConfig, keys: { signer: DecisionSigner | null; verifier: DecisionVerifier | null }) {
  const gateway: ModelGateway =
    config.modelMode === "fixture" ? new FixtureGateway(config.fixtureDir) : new MistralGateway({ reasoningEffort: config.reasoningEffort });
  const operator = new FileOperatorChannel(config.operatorDir);
  const service = new CampaignService({
    store: new FileCampaignStore(`${config.dataDir}/campaigns`),
    gateway,
    // Throws if anything other than the mock is asked for. There is no live JEV path.
    evaluator: createJevTransport(config.evaluator, DEFAULT_LIMITS),
    operator,
    signer: keys.signer,
    verifier: keys.verifier,
  });
  return { service, operator, config };
}

/**
 * The agent-facing runtime. It holds the operator's public key only: it can check decisions
 * but can never record one.
 */
export function createRuntime(config: RuntimeConfig = loadRuntimeConfig()) {
  const verifier = config.decisionPublicKeyFile ? verifierFromPublicKeyPem(readFileSync(config.decisionPublicKeyFile, "utf8")) : null;
  return build(config, { signer: null, verifier });
}

/** The operator's runtime. It holds the private key and is the only place decisions are recorded. */
export function createOperatorRuntime(privateKeyFile: string, config: RuntimeConfig = loadRuntimeConfig()) {
  const pem = readFileSync(privateKeyFile, "utf8");
  const signer = signerFromPrivateKeyPem(pem);
  // The public half is derived from the private key, so the two cannot disagree.
  const verifier = verifierFromPublicKeyPem(pem);
  if (config.decisionPublicKeyFile) {
    const configured = verifierFromPublicKeyPem(readFileSync(config.decisionPublicKeyFile, "utf8"));
    if (configured.keyId !== signer.keyId) throw new Error("The operator key does not match the public key this instance is configured with.");
  }
  return build(config, { signer, verifier });
}
