// Negative tests for confinement on this repository's side: things that must not be possible.
// The matrix that places each of these is docs/security/CONFINEMENT-TEST-MATRIX.md.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { DEFAULT_LIMITS } from "../../src/limits.ts";
import { loadHttpOptions } from "../../src/mcp/http.ts";
import { createRuntime, loadRuntimeConfig } from "../../src/mcp/runtime.ts";
import { createKicServer } from "../../src/mcp/server.ts";
import { loadConfig as loadShimConfig } from "../../src/shim/server.ts";
import { WorkflowError } from "../../src/workflow/service.ts";
import { makeService, syntheticBrief, expectedFor, EDITOR } from "./support.ts";

const run = promisify(execFile);
const REPO = resolve(".");
const OPERATOR = resolve("src/cli/operator.ts");
const mode = (path: string) => statSync(path).mode & 0o777;

async function operator(args: string[], env: Record<string, string>): Promise<{ code: number; out: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [OPERATOR, ...args], { cwd: REPO, env: { PATH: process.env.PATH ?? "", ...env }, maxBuffer: 16 * 1024 * 1024 });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, out: `${failed.stdout ?? ""}${failed.stderr ?? ""}` };
  }
}

/** Every property name in a JSON schema, at any depth. */
function propertyNames(schema: unknown, found = new Set<string>()): Set<string> {
  if (schema === null || typeof schema !== "object") return found;
  const node = schema as Record<string, unknown>;
  if (node.properties && typeof node.properties === "object") {
    for (const [name, child] of Object.entries(node.properties)) {
      found.add(name);
      propertyNames(child, found);
    }
  }
  for (const key of ["items", "anyOf", "oneOf", "allOf", "additionalProperties"]) {
    const child = node[key];
    if (Array.isArray(child)) for (const item of child) propertyNames(item, found);
    else propertyNames(child, found);
  }
  return found;
}

test("no tool lets its caller name a file, a host, a model, a key or an allowance", async () => {
  const harness = makeService();
  const server = createKicServer({ service: harness.agentService, exportRoot: mkdtempSync(join(tmpdir(), "kic-conf-")), requestedBy: "test-agent", clock: harness.clock });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 12);
  const seen = new Set<string>();
  for (const tool of tools) {
    // The brief is the client's document and is validated against its own strict schema; it is not a tool option.
    const schema = tool.name === "kic_create_campaign" ? { properties: { brief: {} } } : tool.inputSchema;
    for (const name of propertyNames(schema)) {
      seen.add(name);
      assert.doesNotMatch(name, /path|dir|file|url|uri|host|endpoint|base|model|provider|token|key|secret|credential|max|limit|budget|allowance|effort|timeout|actor|signature|code$/i, `${tool.name} accepts "${name}"`);
    }
  }
  // The whole of what a caller can say, so that a new argument is a deliberate change to this test.
  assert.deepEqual([...seen].sort(), ["action", "allowPartial", "brief", "campaignId", "count", "draftId", "proposedRationale", "revisionInstruction", "slots", "subjectId", "subjectKind", "variants"]);
});

test("nothing the agent can read ever contains the operator's key or a confirmation code", async () => {
  const harness = makeService();
  const exportRoot = mkdtempSync(join(tmpdir(), "kic-conf-export-"));
  const server = createKicServer({ service: harness.agentService, exportRoot, requestedBy: "test-agent", clock: harness.clock });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const said: string[] = [];
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    said.push(JSON.stringify(result));
    return result as { structuredContent?: Record<string, any> };
  };
  const editorConfirms = async (campaignId: string, requestId: string) =>
    harness.service.confirmDecision({ campaignId, requestId, code: harness.operator.codeFor(requestId), actor: EDITOR, rationale: "Read and agreed.", expected: await expectedFor(harness.service, campaignId, requestId) });

  const campaignId = (await call("kic_create_campaign", { brief: syntheticBrief() })).structuredContent!.campaignId as string;
  await call("kic_interpret_brief", { campaignId });
  const narratives = (await call("kic_generate_narratives", { campaignId, count: 2 })).structuredContent!.narratives as Array<{ id: string }>;
  const selection = (await call("kic_request_decision", { campaignId, subjectKind: "narrative", subjectId: narratives[0]!.id, action: "select", proposedRationale: "Best fit." })).structuredContent!;
  await editorConfirms(campaignId, selection.requestId as string);
  await call("kic_plan_programme", { campaignId });
  await call("kic_generate_drafts", { campaignId, variants: 2 });
  const evaluations = (await call("kic_evaluate_drafts", { campaignId })).structuredContent!.evaluations as Array<{ ranking: string[] }>;
  for (const evaluation of evaluations) {
    const request = (await call("kic_request_decision", { campaignId, subjectKind: "draft", subjectId: evaluation.ranking[0]!, action: "approve", proposedRationale: "Top." })).structuredContent!;
    await editorConfirms(campaignId, request.requestId as string);
  }
  // A wrong guess at a code, an unknown tool and a malformed call: their errors are the agent's to read too.
  await assert.rejects(harness.agentService.confirmDecision({ campaignId, requestId: "req-nope", code: "000000", actor: EDITOR, rationale: "x", expected: { digest: "0".repeat(64) } }));
  await call("kic_get_campaign", { campaignId: "../../etc/passwd" });
  await call("kic_get_campaign", { campaignId });
  await call("kic_compare_drafts", { campaignId });
  await call("kic_assemble_programme", { campaignId });

  // Everything the agent could have seen: every tool result, the stored record, every exported file.
  const record = JSON.stringify(await harness.service.getCampaign(campaignId));
  const exported: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else exported.push(readFileSync(join(dir, entry.name), "utf8"));
    }
  };
  walk(exportRoot);
  assert.ok(exported.length >= 3, "the preview was exported");
  const readable = [...said, record, ...exported].join("\n");

  const keyBody = harness.keys.privateKeyPem.split("\n").filter((line) => line && !line.startsWith("-----")).join("");
  assert.ok(keyBody.length > 40);
  assert.ok(!readable.includes(keyBody) && !readable.includes(keyBody.slice(8, 40)), "the private key is nowhere in it");
  assert.doesNotMatch(readable, /PRIVATE KEY/);
  assert.ok(harness.operator.notices.length >= 5);
  for (const notice of harness.operator.notices) assert.ok(!readable.includes(notice.code), `confirmation code of ${notice.requestId} is nowhere in it`);
});

test("an agent-facing server never signs, even if the operator's key is put in its environment", async () => {
  const base = mkdtempSync(join(tmpdir(), "kic-conf-env-"));
  const keyFile = join(base, "editor-home", "operator-key.pem");
  mkdirSync(join(base, "editor-home"), { recursive: true });
  const env = {
    KIC_DATA_DIR: join(base, "instance", "data"),
    KIC_OPERATOR_DIR: join(base, "operator-channel"),
    KIC_DECISION_PUBLIC_KEY_FILE: `${keyFile}.pub`,
    KIC_OPERATOR_KEY_FILE: keyFile, // a misconfiguration: the private key within the server's reach
    KIC_MODEL_MODE: "fixture",
    KIC_FIXTURE_DIR: resolve("fixtures/llm/synthetic-harbourline"),
  };
  assert.equal((await operator(["init", "--key", keyFile], env)).code, 0);
  const { service, operator: channel } = createRuntime(loadRuntimeConfig(env, REPO));
  const campaign = await service.createCampaign(syntheticBrief());
  await service.interpretBrief(campaign.id);
  const narratives = await service.generateNarratives(campaign.id, 3);
  const request = await service.requestDecision({ campaignId: campaign.id, subject: { kind: "narrative", id: narratives[0]!.id }, action: "select", proposedRationale: "Best.", requestedBy: "agent" });
  const notice = (await channel.pending()).find((n) => n.requestId === request.requestId)!;
  const digest = (await service.describeRequest(campaign.id, request.requestId)).digest;
  // With the right code and the right digest, the server still cannot record the decision: it was built without a signer.
  await assert.rejects(
    service.confirmDecision({ campaignId: campaign.id, requestId: request.requestId, code: notice.code, actor: EDITOR, rationale: "Self-approved.", expected: { digest } }),
    (error: unknown) => error instanceof WorkflowError && error.code === "cannot-record-decisions",
  );
  assert.equal((await service.getCampaign(campaign.id)).decisions.length, 0);
  assert.throws(() => service.signRelease("anything"), (error: unknown) => error instanceof WorkflowError && error.code === "cannot-release");
});

test("files that carry authority or secrets are private to their owner", async () => {
  const base = mkdtempSync(join(tmpdir(), "kic-conf-modes-"));
  const keyFile = join(base, "editor-home", "operator-key.pem");
  mkdirSync(join(base, "editor-home"), { recursive: true });
  const env = {
    KIC_DATA_DIR: join(base, "instance", "data"),
    KIC_OPERATOR_DIR: join(base, "operator-channel"),
    KIC_DECISION_PUBLIC_KEY_FILE: `${keyFile}.pub`,
    KIC_OPERATOR_KEY_FILE: keyFile,
    KIC_MODEL_MODE: "fixture",
    KIC_FIXTURE_DIR: resolve("fixtures/llm/synthetic-harbourline"),
  };
  assert.equal((await operator(["init", "--key", keyFile], env)).code, 0);
  assert.equal(mode(keyFile), 0o600, "the private key");
  assert.equal(mode(`${keyFile}.ledger.json`), 0o600, "the operator's ledger");

  const config = loadRuntimeConfig(env, REPO);
  const { service } = createRuntime(config);
  const campaign = await service.createCampaign(syntheticBrief());
  await service.interpretBrief(campaign.id); // a model step, so the spend account is written
  const narratives = await service.generateNarratives(campaign.id, 3);
  const request = await service.requestDecision({ campaignId: campaign.id, subject: { kind: "narrative", id: narratives[0]!.id }, action: "select", proposedRationale: "Best.", requestedBy: "agent" });
  assert.equal(mode(join(env.KIC_DATA_DIR, "campaigns", `${campaign.id}.json`)), 0o600, "the campaign record");
  assert.equal(mode(config.spendFile), 0o600, "the instance's spend account");
  assert.equal(mode(env.KIC_OPERATOR_DIR), 0o700, "the operator channel");
  assert.equal(mode(join(env.KIC_OPERATOR_DIR, `${request.requestId}.json`)), 0o600, "a notice carrying a confirmation code");
});

test("the network-facing parts listen on loopback unless told otherwise, and never without a token off it", () => {
  assert.equal(loadHttpOptions({ KIC_MCP_TOKEN: "t".repeat(32) }).host, "127.0.0.1");
  assert.throws(() => loadHttpOptions({ KIC_MCP_HOST: "0.0.0.0", KIC_MCP_ALLOW_UNAUTHENTICATED: "1" }), /loopback/);
  assert.throws(() => loadHttpOptions({}), /KIC_MCP_TOKEN/);
  assert.equal(loadShimConfig({}).host, "127.0.0.1");
  assert.throws(() => loadShimConfig({ SHIM_HOST: "0.0.0.0", MISTRAL_API_KEY: "placeholder-not-a-key" }), /SHIM_CLIENT_TOKEN|client token/i);
  // The limits a deployment relies on exist and are finite.
  for (const name of ["maxModelCalls", "maxCompletionTokens", "maxInstanceModelCalls", "maxInstanceCompletionTokens", "maxCampaigns"] as const) {
    assert.ok(Number.isFinite(DEFAULT_LIMITS[name]) && DEFAULT_LIMITS[name] > 0, name);
  }
});
