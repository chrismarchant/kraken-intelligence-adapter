import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createHttpServer, loadHttpOptions } from "../../src/mcp/http.ts";
import { createKicServer } from "../../src/mcp/server.ts";
import { makeService, syntheticBrief } from "./support.ts";

type ToolResult = { isError?: boolean; structuredContent?: Record<string, any>; content: Array<{ type: string; text: string }> };

async function connect() {
  const harness = makeService();
  const exportRoot = mkdtempSync(join(tmpdir(), "kic-mcp-export-"));
  const server = createKicServer({ service: harness.service, exportRoot, requestedBy: "test-agent", clock: harness.clock });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as ToolResult;
  return { ...harness, client, call, exportRoot };
}

test("the server exposes the campaign tools and no tool that publishes, schedules, sends or spends", async () => {
  const { client } = await connect();
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "kic_assemble_programme",
    "kic_compare_drafts",
    "kic_confirm_decision",
    "kic_create_campaign",
    "kic_evaluate_drafts",
    "kic_generate_drafts",
    "kic_generate_narratives",
    "kic_get_campaign",
    "kic_interpret_brief",
    "kic_list_skills",
    "kic_plan_programme",
    "kic_request_decision",
    "kic_revise_draft",
  ]);
  for (const tool of tools) {
    assert.doesNotMatch(tool.name, /publish|schedul|send|post_to|spend|pay|outreach|message|advert/i);
    assert.ok(tool.description && tool.description.length > 20, `${tool.name} is described`);
    assert.ok(tool.inputSchema, `${tool.name} has a typed input`);
  }
  assert.match(client.getInstructions() ?? "", /cannot publish/);
});

test("a campaign can be prepared end to end through the tools, with the person supplying the code", async () => {
  const { call, operator } = await connect();
  const created = await call("kic_create_campaign", { brief: syntheticBrief() });
  assert.equal(created.isError, undefined);
  const campaignId = created.structuredContent!.campaignId as string;

  assert.equal((await call("kic_interpret_brief", { campaignId })).structuredContent!.interpretation.keyMessages.length, 1);
  const narratives = (await call("kic_generate_narratives", { campaignId, count: 2 })).structuredContent!.narratives as Array<{ id: string }>;
  assert.equal(narratives.length, 2);

  // The agent cannot plan until a person has chosen.
  const early = await call("kic_plan_programme", { campaignId });
  assert.equal(early.isError, true);
  assert.equal(early.structuredContent!.error.code, "no-narrative-selected");

  // The agent asks; the reply carries no code.
  const asked = await call("kic_request_decision", { campaignId, subjectKind: "narrative", subjectId: narratives[0]!.id, action: "select", proposedRationale: "Best fit." });
  const requestId = asked.structuredContent!.requestId as string;
  const code = operator.codeFor(requestId);
  assert.ok(!JSON.stringify(asked).includes(code));
  assert.ok(!JSON.stringify(await call("kic_get_campaign", { campaignId })).includes(code));

  // A guessed code fails; the person's code succeeds.
  const guessed = await call("kic_confirm_decision", { campaignId, requestId, code: "0".repeat(32), actorId: "agent", actorName: "Agent", rationale: "Self-approval." });
  assert.equal(guessed.structuredContent!.error.code, "invalid-code");
  const confirmed = await call("kic_confirm_decision", { campaignId, requestId, code, actorId: "editor-1", actorName: "Test Editor", rationale: "Chosen by me." });
  assert.equal(confirmed.structuredContent!.decision.actor.kind, "human");

  assert.equal((await call("kic_plan_programme", { campaignId })).structuredContent!.plan.slots.length, 4);
  const drafts = (await call("kic_generate_drafts", { campaignId, variants: 2 })).structuredContent!.drafts as Array<{ id: string; slot: number }>;
  assert.equal(drafts.length, 8);
  assert.equal((await call("kic_evaluate_drafts", { campaignId })).structuredContent!.evaluations.length, 4);
  const comparison = await call("kic_compare_drafts", { campaignId, slots: [1] });
  assert.match(comparison.content[0]!.text, /\| Rank \| Draft \|/);

  // Nothing approved yet: assembly is refused.
  assert.equal((await call("kic_assemble_programme", { campaignId })).structuredContent!.error.code, "nothing-approved");

  const target = drafts.find((d) => d.slot === 1)!;
  const approval = await call("kic_request_decision", { campaignId, subjectKind: "draft", subjectId: target.id, action: "approve", proposedRationale: "Top ranked." });
  const approvalId = approval.structuredContent!.requestId as string;
  await call("kic_confirm_decision", { campaignId, requestId: approvalId, code: operator.codeFor(approvalId), actorId: "editor-1", actorName: "Test Editor", rationale: "Reads well." });

  assert.equal((await call("kic_assemble_programme", { campaignId })).structuredContent!.error.code, "slots-pending");
  const assembled = await call("kic_assemble_programme", { campaignId, allowPartial: true });
  assert.equal(assembled.isError, undefined);
  assert.equal(assembled.structuredContent!.approvalState, "partial");
  assert.deepEqual(assembled.structuredContent!.approvedPosts, [1]);
  assert.deepEqual(assembled.structuredContent!.provisionalCommands, [
    { commandId: "cmd-prog-camp-001-01", status: "NON-EXECUTABLE", executable: false, authoritative: false },
  ]);
});

test("tool errors carry a code and a message, never a stack or internal detail", async () => {
  const { call } = await connect();
  const missing = await call("kic_get_campaign", { campaignId: "camp-404" });
  assert.equal(missing.isError, true);
  assert.equal(missing.structuredContent!.error.code, "not-found");
  const invalid = await call("kic_create_campaign", { brief: { nonsense: true } });
  assert.equal(invalid.structuredContent!.error.code, "invalid-brief");
  for (const result of [missing, invalid]) assert.doesNotMatch(JSON.stringify(result), /\s+at .*\.ts:\d+|node:internal/);
});

test("the skills catalogue is served with schemas, permissions and failure behaviour", async () => {
  const { call } = await connect();
  const skills = (await call("kic_list_skills")).structuredContent!.skills as Array<Record<string, any>>;
  const implemented = skills.filter((s) => s.status === "implemented").map((s) => s.name).sort();
  assert.deepEqual(implemented, ["campaign-brief", "linkedin-draft", "narrative-fanout", "post-evaluate", "programme-assemble", "programme-plan"]);
  for (const skill of skills) {
    for (const field of ["purpose", "version", "inputSchema", "outputSchema", "requiredTools", "permissions", "validation", "failureBehaviour", "fixtures"]) {
      assert.ok(field in skill, `${skill.name} declares ${field}`);
    }
    assert.ok(!JSON.stringify(skill.permissions).match(/publish|credential/i));
  }
});

const servers: Array<{ close: () => void }> = [];
after(() => servers.forEach((s) => s.close()));

test("over HTTP the endpoint needs its bearer token and serves the same tools", async () => {
  const harness = makeService();
  const token = "t".repeat(32);
  const deps = { service: harness.service, exportRoot: mkdtempSync(join(tmpdir(), "kic-http-export-")), clock: harness.clock };
  const http = createHttpServer(deps, { host: "127.0.0.1", port: 0, token, maxBodyBytes: 4096 });
  servers.push(http);
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } } };
  const post = (headers: Record<string, string>, body: string) =>
    fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body });

  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/anything-else`)).status, 404);
  assert.equal((await post({}, JSON.stringify(init))).status, 401);
  assert.equal((await post({ authorization: "Bearer wrong" }, JSON.stringify(init))).status, 401);
  assert.equal((await post({ authorization: `Bearer ${token}` }, "{not json")).status, 400);
  assert.equal((await post({ authorization: `Bearer ${token}` }, JSON.stringify({ pad: "x".repeat(5000) }))).status, 413);
  assert.equal((await fetch(`${base}/mcp`, { headers: { authorization: `Bearer ${token}` } })).status, 405);

  const client = new Client({ name: "http-test", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 13);
  const created = (await client.callTool({ name: "kic_create_campaign", arguments: { brief: syntheticBrief() } })) as ToolResult;
  assert.equal(created.structuredContent!.campaignId, "camp-001");
  // Stateless transport, durable store: a second request sees the campaign the first one made.
  const fetched = (await client.callTool({ name: "kic_get_campaign", arguments: { campaignId: "camp-001" } })) as ToolResult;
  assert.equal(fetched.structuredContent!.synthetic, true);
  await client.close();
});

test("the HTTP endpoint refuses to start unauthenticated off loopback or with a weak token", () => {
  assert.throws(() => loadHttpOptions({}), /KIC_MCP_TOKEN/);
  assert.throws(() => loadHttpOptions({ KIC_MCP_TOKEN: "short" }), /at least 24/);
  assert.throws(() => loadHttpOptions({ KIC_MCP_ALLOW_UNAUTHENTICATED: "1", KIC_MCP_HOST: "0.0.0.0" }), /loopback/);
  assert.equal(loadHttpOptions({ KIC_MCP_ALLOW_UNAUTHENTICATED: "1" }).token, null);
  assert.equal(loadHttpOptions({ KIC_MCP_TOKEN: "x".repeat(24), KIC_MCP_HOST: "0.0.0.0" }).host, "0.0.0.0");
});
