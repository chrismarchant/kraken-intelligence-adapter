import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { connect as connectSocket } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createHttpServer, loadHttpOptions } from "../../src/mcp/http.ts";
import { createKicServer } from "../../src/mcp/server.ts";
import { makeService, syntheticBrief, expectedFor } from "./support.ts";

type ToolResult = { isError?: boolean; structuredContent?: Record<string, any>; content: Array<{ type: string; text: string }> };

async function connect() {
  const harness = makeService();
  const exportRoot = mkdtempSync(join(tmpdir(), "kic-mcp-export-"));
  // The server is given the agent-facing service: it holds the operator's public key only.
  const server = createKicServer({ service: harness.agentService, exportRoot, requestedBy: "test-agent", clock: harness.clock });
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
    assert.doesNotMatch(tool.name, /confirm|approve|decide|sign/i, "no tool records a decision");
    assert.ok(tool.description && tool.description.length > 20, `${tool.name} is described`);
    assert.ok(tool.inputSchema, `${tool.name} has a typed input`);
  }
  assert.match(client.getInstructions() ?? "", /cannot publish/);
});

test("a campaign can be prepared end to end through the tools; only the editor's own tool records decisions", async () => {
  const { call, client, operator, service: operatorService } = await connect();
  // What the editor does with their own tool: read the notice, then confirm with the operator key.
  const editorConfirms = async (campaignId: string, requestId: string, rationale: string) =>
    operatorService.confirmDecision({
      campaignId,
      requestId,
      code: operator.codeFor(requestId),
      actor: { kind: "human", id: "editor-1", name: "Test Editor" },
      rationale,
      expected: await expectedFor(operatorService, campaignId, requestId),
    });

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

  // The agent asks; the reply carries no code, and neither does anything else it can read.
  const asked = await call("kic_request_decision", { campaignId, subjectKind: "narrative", subjectId: narratives[0]!.id, action: "select", proposedRationale: "Best fit." });
  const requestId = asked.structuredContent!.requestId as string;
  const code = operator.codeFor(requestId);
  assert.ok(!JSON.stringify(asked).includes(code));
  assert.ok(!JSON.stringify(await call("kic_get_campaign", { campaignId })).includes(code));

  // There is no tool with which the agent could confirm, even knowing the code.
  const attempt = await client
    .callTool({ name: "kic_confirm_decision", arguments: { campaignId, requestId, code, actorId: "agent", actorName: "Agent", rationale: "Self-approval." } })
    .then((r) => r as ToolResult, (error: Error) => ({ isError: true, content: [{ type: "text", text: error.message }] }) as ToolResult);
  assert.equal(attempt.isError, true);
  assert.match(JSON.stringify(attempt), /not found|unknown tool/i);
  assert.equal((await call("kic_plan_programme", { campaignId })).structuredContent!.error.code, "no-narrative-selected");

  const decision = await editorConfirms(campaignId, requestId, "Chosen by me.");
  assert.equal(decision.actor.kind, "human");
  const seen = (await call("kic_get_campaign", { campaignId })).structuredContent!.decisions as Array<{ signed: boolean; by: string }>;
  assert.deepEqual(seen.map((d) => [d.by, d.signed]), [["Test Editor", true]], "the agent can see that the decision was made and signed");

  assert.equal((await call("kic_plan_programme", { campaignId })).structuredContent!.plan.slots.length, 4);
  const drafted = (await call("kic_generate_drafts", { campaignId, variants: 2 })).structuredContent!;
  const drafts = drafted.drafts as Array<{ id: string; slot: number }>;
  assert.deepEqual(drafted.slotsWithoutDrafts, [], "the tool says which posts still need drafts");
  assert.equal(drafts.length, 8);
  assert.equal((await call("kic_evaluate_drafts", { campaignId })).structuredContent!.evaluations.length, 4);
  const comparison = await call("kic_compare_drafts", { campaignId, slots: [1] });
  assert.match(comparison.content[0]!.text, /\| Rank \| Draft \|/);

  // Nothing approved yet: assembly is refused.
  assert.equal((await call("kic_assemble_programme", { campaignId })).structuredContent!.error.code, "nothing-approved");

  const target = drafts.find((d) => d.slot === 1)!;
  const approval = await call("kic_request_decision", { campaignId, subjectKind: "draft", subjectId: target.id, action: "approve", proposedRationale: "Top ranked." });
  await editorConfirms(campaignId, approval.structuredContent!.requestId as string, "Reads well.");

  assert.equal((await call("kic_assemble_programme", { campaignId })).structuredContent!.error.code, "slots-pending");
  const assembled = await call("kic_assemble_programme", { campaignId, allowPartial: true });
  assert.equal(assembled.isError, undefined);
  assert.equal(assembled.structuredContent!.approvalState, "partial");
  assert.equal(assembled.structuredContent!.released, false, "the agent-facing server produces a preview, never a release");
  assert.equal(assembled.structuredContent!.decisionsVerified, true);
  assert.equal(assembled.structuredContent!.export.released, false);
  assert.match(assembled.structuredContent!.export.directory, /-preview$/);
  assert.deepEqual(assembled.structuredContent!.approvedPosts, [1]);
  assert.deepEqual(assembled.structuredContent!.provisionalCommands, [
    { commandId: "cmd-prog-camp-001-01", status: "NON-EXECUTABLE", executable: false, authoritative: false },
  ]);
  // The same package cannot silently overwrite an earlier export.
  assert.equal((await call("kic_assemble_programme", { campaignId, allowPartial: true })).isError, undefined, "a later assembly exports to its own directory");
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
  // Every tool a skill names is one the server really offers.
  const { tools } = await (await connect()).client.listTools();
  const offered = new Set(tools.map((t) => t.name));
  for (const skill of skills) for (const tool of skill.requiredTools as string[]) assert.ok(offered.has(tool), `${skill.name} names ${tool}`);
});

const servers: Array<{ close: () => void }> = [];
after(() => servers.forEach((s) => s.close()));

test("over HTTP the endpoint needs its bearer token, an expected Host and no foreign Origin, and serves the same tools", async () => {
  const harness = makeService();
  const token = "t".repeat(32);
  const deps = { service: harness.agentService, exportRoot: mkdtempSync(join(tmpdir(), "kic-http-export-")), clock: harness.clock };
  const options = loadHttpOptions({ KIC_MCP_TOKEN: token, KIC_MCP_PORT: "0", KIC_MCP_MAX_BODY_BYTES: "4096", KIC_MCP_ALLOWED_ORIGINS: "https://workspace.example" });
  const http = createHttpServer(deps, options);
  servers.push(http);
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const port = (http.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } } };
  const post = (headers: Record<string, string>, body: string) =>
    fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body });
  const auth = { authorization: `Bearer ${token}` };

  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/anything-else`)).status, 404);
  assert.equal((await post({}, JSON.stringify(init))).status, 401);
  assert.equal((await post({ authorization: "Bearer wrong" }, JSON.stringify(init))).status, 401);
  assert.equal((await post({ authorization: `Bearer ${token}x` }, JSON.stringify(init))).status, 401);
  assert.equal((await post(auth, "{not json")).status, 400);
  assert.equal((await post(auth, JSON.stringify({ pad: "x".repeat(5000) }))).status, 413);
  assert.equal((await fetch(`${base}/mcp`, { headers: auth })).status, 405);

  // DNS rebinding: a request addressed to a name this server does not answer to is refused,
  // with or without a valid token. fetch will not set Host, so a raw request is used.
  const raw = (host: string, extra = "") =>
    new Promise<number>((resolve, reject) => {
      const socket = connectSocket(port, "127.0.0.1", () => {
        const body = JSON.stringify(init);
        socket.write(
          `POST /mcp HTTP/1.1\r\nHost: ${host}\r\nAuthorization: Bearer ${token}\r\nContent-Type: application/json\r\n` +
            `Accept: application/json, text/event-stream\r\n${extra}Content-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
        );
      });
      let data = "";
      socket.on("data", (chunk) => (data += chunk.toString()));
      socket.on("end", () => resolve(Number(data.slice(9, 12))));
      socket.on("error", reject);
    });
  assert.equal(await raw("evil.example"), 403);
  assert.equal(await raw(`evil.example:${port}`), 403);
  assert.equal(await raw(`127.0.0.1:${port}`), 200);
  assert.equal(await raw(`localhost:${port}`), 200);
  assert.equal(await raw(`127.0.0.1:${port}`, "Origin: https://evil.example\r\n"), 403, "a browser page on another site is refused");
  assert.equal(await raw(`127.0.0.1:${port}`, "Origin: https://workspace.example\r\n"), 200, "an origin that was explicitly allowed passes");

  const client = new Client({ name: "http-test", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: auth } }));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 12);
  const created = (await client.callTool({ name: "kic_create_campaign", arguments: { brief: syntheticBrief() } })) as ToolResult;
  assert.equal(created.structuredContent!.campaignId, "camp-001");
  // Stateless transport, durable store: a second request sees the campaign the first one made.
  const fetched = (await client.callTool({ name: "kic_get_campaign", arguments: { campaignId: "camp-001" } })) as ToolResult;
  assert.equal(fetched.structuredContent!.synthetic, true);
  await client.close();
});

test("the HTTP endpoint refuses to start unauthenticated off loopback, with a weak token, or with a meaningless limit", () => {
  assert.throws(() => loadHttpOptions({}), /KIC_MCP_TOKEN/);
  assert.throws(() => loadHttpOptions({ KIC_MCP_TOKEN: "short" }), /at least 24/);
  assert.throws(() => loadHttpOptions({ KIC_MCP_ALLOW_UNAUTHENTICATED: "1", KIC_MCP_HOST: "0.0.0.0" }), /loopback/);
  assert.equal(loadHttpOptions({ KIC_MCP_ALLOW_UNAUTHENTICATED: "1" }).token, null);
  assert.equal(loadHttpOptions({ KIC_MCP_TOKEN: "x".repeat(24), KIC_MCP_HOST: "0.0.0.0" }).host, "0.0.0.0");
  // A limit that is not a number must be an error, never a silently disabled limit.
  for (const bad of ["abc", "1e6", "-5", "0", "NaN"]) {
    assert.throws(() => loadHttpOptions({ KIC_MCP_TOKEN: "x".repeat(24), KIC_MCP_MAX_BODY_BYTES: bad }), /positive whole number/, bad);
  }
  assert.throws(() => loadHttpOptions({ KIC_MCP_TOKEN: "x".repeat(24), KIC_MCP_PORT: "http" }), /port number/);
  assert.equal(loadHttpOptions({ KIC_MCP_TOKEN: "x".repeat(24) }).maxBodyBytes, 1_048_576);
  assert.deepEqual(loadHttpOptions({ KIC_MCP_TOKEN: "x".repeat(24), KIC_MCP_ALLOWED_HOSTS: "kic.internal" }).allowedHosts.includes("kic.internal"), true);
});
