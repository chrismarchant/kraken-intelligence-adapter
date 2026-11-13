// Regression tests for scope-completing review B of commit 2537386
// (docs/review/2026-11-13-scope-review-b-2537386.md). Each test is named for the finding it closes.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { connect as connectSocket } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FixtureGateway, FixtureMissingError } from "../../src/gateway/fixture.ts";
import { ModelCallError } from "../../src/gateway/gateway.ts";
import { MistralGateway, readCompletion } from "../../src/gateway/mistral.ts";
import { DEFAULT_LIMITS } from "../../src/limits.ts";
import { createHttpServer, loadHttpOptions } from "../../src/mcp/http.ts";
import { createKicServer } from "../../src/mcp/server.ts";
import { PROCESS_INSTANCE, acquireOwnedLock, clearDeadLock, lockTestHooks, ownerAlive, startTimeOf } from "../../src/store/lock.ts";
import type { OwnedLock } from "../../src/store/lock.ts";
import { FileCampaignStore } from "../../src/store/store.ts";
import { WorkflowError } from "../../src/workflow/service.ts";
import { FileSpendLedger } from "../../src/workflow/spend.ts";
import { makeService } from "./support.ts";

const scratch = (name: string) => mkdtempSync(join(tmpdir(), `kic-scope-b-${name}-`));
/** The id of a process that has exited and been collected: nothing owns it now. */
const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid as number;
const deadOwner = (token: string) => `${deadPid()} 0000000000000000 - ${token}\n`;

// ---------------------------------------------------------------------------------- F1

test("F1: a post is evaluated once in a call, and evaluating again does not make the record grow", async () => {
  const { service, evaluated } = makeService();
  const id = await evaluated();
  const before = (await service.getCampaign(id)).evaluations.length;

  await assert.rejects(service.evaluateDrafts(id, { slots: [1, 1] }), (error: unknown) => error instanceof WorkflowError && error.code === "duplicate-slot");
  await assert.rejects(service.evaluateDrafts(id, { slots: Array.from({ length: 500 }, () => 1) }), (error: unknown) => error instanceof WorkflowError && error.code === "duplicate-slot");

  for (let round = 0; round < 25; round++) await service.evaluateDrafts(id);
  for (let round = 0; round < 25; round++) await service.evaluateDrafts(id, { slots: [1] });
  const record = await service.getCampaign(id);
  assert.equal(record.evaluations.length, before, "the same drafts evaluated again replace their earlier evaluation");
  // Each post still has its evaluation, and each draft is still covered by one.
  for (const draft of record.drafts) assert.ok(record.evaluations.some((e) => e.candidates.some((c) => c.draftId === draft.id)), draft.id);
});

test("F1, F9: the tools refuse an over-long list of posts and a malformed campaign id as arguments", async () => {
  const harness = makeService();
  const server = createKicServer({ service: harness.agentService, exportRoot: scratch("export"), requestedBy: "test-agent", clock: harness.clock });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  /** The text a call fails with, whether the failure comes back as a result or is thrown. */
  const failureOf = async (name: string, args: Record<string, unknown>): Promise<string> => {
    try {
      const result = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Array<{ text: string }> };
      assert.equal(result.isError, true, `${name} must fail`);
      return result.content.map((c) => c.text).join(" ");
    } catch (error) {
      return (error as Error).message;
    }
  };
  const id = await harness.evaluated();
  const tooMany = await failureOf("kic_evaluate_drafts", { campaignId: id, slots: Array.from({ length: 5000 }, () => 1) });
  assert.doesNotMatch(tooMany, /internal-error/);
  assert.equal((await harness.service.getCampaign(id)).evaluations.length, (await harness.service.getCampaign(id)).plan!.slots.length);

  for (const bad of ["CAMP-1", "../x", "/etc/passwd", "a".repeat(200), "camp\u0000"]) {
    const text = await failureOf("kic_get_campaign", { campaignId: bad });
    assert.doesNotMatch(text, /internal-error/, bad);
  }
});

// ---------------------------------------------------------------------------- F2, F3

test("F2: a process that judged a lock dead, and was then overtaken, does not remove the live lock that replaced it", async () => {
  const lock = join(scratch("lock"), "state.lock");
  writeFileSync(lock, deadOwner("aaaaaaaaaaaaaaaaaaaaaaaa"));
  let live: OwnedLock | null = null;
  // The reviewer's order of events. A first process reads the lock and judges it dead. Before it
  // does anything more, a second process removes the dead lock and takes the lock for itself.
  lockTestHooks.afterJudgedDead = async () => {
    lockTestHooks.afterJudgedDead = null;
    live = await acquireOwnedLock(lock, { timeoutMs: 2000 });
  };
  try {
    await clearDeadLock(lock, 30_000);
  } finally {
    lockTestHooks.afterJudgedDead = null;
  }
  assert.ok(live, "the second process took the lock");
  assert.equal(await (live as OwnedLock).held(), true, "and still holds it: the first process removed nothing");
  // A third process cannot take it while it is held.
  assert.equal(await acquireOwnedLock(lock, { timeoutMs: 100 }), null);
  await (live as OwnedLock).release();
  assert.ok(await acquireOwnedLock(lock, { timeoutMs: 100 }), "once released, the lock can be taken");
  // Nothing is left behind by the takeover.
  assert.deepEqual(readdirSync(join(lock, "..")).filter((name) => name.includes(".break.") || name.endsWith(".new")), []);
});

test("F2: the right to remove a dead lock is held by one process; it passes on only when its holder is gone", async () => {
  const dir = scratch("right");
  const lock = join(dir, "state.lock");
  const content = deadOwner("bbbbbbbbbbbbbbbbbbbbbbbb");
  const right = (n: number) => `${lock}.break.${createHash("sha256").update(content).digest("hex").slice(0, 24)}.${n}`;

  // Held by a live process (this one): others wait, and the lock stays.
  writeFileSync(lock, content);
  writeFileSync(right(1), `${process.pid} ${PROCESS_INSTANCE} ${startTimeOf(process.pid) ?? "-"} remover\n`);
  assert.equal(await clearDeadLock(lock, 30_000), false);
  assert.equal(readFileSync(lock, "utf8"), content);
  assert.equal(await acquireOwnedLock(lock, { timeoutMs: 100 }), null);

  // Held by a process that died before finishing: the next in line removes the lock.
  writeFileSync(right(1), deadOwner("remover"));
  assert.equal(await clearDeadLock(lock, 30_000), true);
  assert.equal(existsSync(lock), false);
  assert.deepEqual(readdirSync(dir), [], "the files that named the dead lock are cleared with it");
});

test("F2: many writers recovering from a dead writer's lock at once lose no update, again and again", async () => {
  const dir = scratch("store");
  const first = makeService({ store: new FileCampaignStore(dir) });
  const campaign = await first.service.createCampaign((await import("./support.ts")).syntheticBrief());
  const stores = Array.from({ length: 6 }, () => new FileCampaignStore(dir));
  let expected = (await stores[0]!.get(campaign.id)).audit.length;
  for (let round = 0; round < 12; round++) {
    writeFileSync(join(dir, `${campaign.id}.json.lock`), deadOwner(`round${round}`.padEnd(24, "0")));
    await Promise.all(
      stores.map((store, index) =>
        store.update(campaign.id, (record) => {
          record.audit.push({ at: "2026-01-05T09:00:00.000Z", event: "test", detail: `round ${round} writer ${index}` });
        }),
      ),
    );
    expected += stores.length;
    assert.equal((await stores[0]!.get(campaign.id)).audit.length, expected, `round ${round}`);
  }
});

test("F3: reservations made while a dead holder's lock on the spend account is cleared are all counted", async () => {
  const file = join(scratch("spend"), "spend.state");
  const ledgers = Array.from({ length: 5 }, () => new FileSpendLedger(file));
  const limits = { ...DEFAULT_LIMITS };
  let calls = 0;
  for (let round = 0; round < 10; round++) {
    writeFileSync(`${file}.lock`, deadOwner(`spend${round}`.padEnd(24, "0")));
    await Promise.all(ledgers.map((ledger, index) => ledger.reserve(`camp-${round}-${index}`, 1, 100, limits)));
    calls += ledgers.length;
    assert.deepEqual(await ledgers[0]!.totals(), { campaigns: calls, calls, tokens: calls * 100 }, `round ${round}`);
  }
});

// ---------------------------------------------------------------------------------- F4

test("F4: a lock whose owner has exited but not been collected by its parent is a dead owner's lock", async (t) => {
  if (!existsSync("/proc/self/stat")) return t.skip("needs /proc");
  // A shell starts a short-lived child and then becomes a process that never collects it.
  const parent = spawn("sh", ["-c", "sleep 0.05 & echo $!; exec sleep 20"], { stdio: ["ignore", "pipe", "ignore"] });
  try {
    const pid = await new Promise<number>((resolve) => parent.stdout.once("data", (chunk: Buffer) => resolve(Number(chunk.toString().trim()))));
    const state = () => {
      const text = readFileSync(`/proc/${pid}/stat`, "utf8");
      return text.slice(text.lastIndexOf(")") + 2).split(" ")[0];
    };
    for (let waited = 0; waited < 3000 && state() !== "Z"; waited += 20) await new Promise((r) => setTimeout(r, 20));
    assert.equal(state(), "Z", "the child is a zombie: it has an id and a start time, and will never run again");
    const started = startTimeOf(pid) ?? "-";
    assert.equal(ownerAlive(pid, "0000000000000000", started), false);

    const lock = join(scratch("zombie"), "state.lock");
    writeFileSync(lock, `${pid} 0000000000000000 ${started} cccccccccccccccccccccccc\n`);
    const taken = await acquireOwnedLock(lock, { timeoutMs: 1000 });
    assert.ok(taken, "the lock is taken over, not waited on for as long as the zombie exists");
    await taken.release();
  } finally {
    parent.kill("SIGKILL");
  }
});

// ---------------------------------------------------------------------------------- F5

const servers: Array<{ close: () => void; closeAllConnections?: () => void }> = [];
after(() => servers.forEach((s) => (s.closeAllConnections?.(), s.close())));

test("F5: the HTTP transport bounds connections, work in progress, and the time a client may take to send", async () => {
  const harness = makeService();
  const token = "t".repeat(32);
  const deps = { service: harness.agentService, exportRoot: scratch("http-export"), clock: harness.clock };
  const base = loadHttpOptions({ KIC_MCP_TOKEN: token, KIC_MCP_PORT: "0" });

  const defaults = createHttpServer(deps, base);
  assert.equal(defaults.maxConnections, 64);
  assert.equal(defaults.headersTimeout, 10_000);
  assert.equal(defaults.requestTimeout, 30_000);

  const http = createHttpServer(deps, { ...base, maxConnections: 2, maxInFlight: 0 });
  servers.push(http);
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const port = (http.address() as AddressInfo).port;

  // With no work allowed in progress, a request with a valid token is told to come back.
  const busy = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}`, connection: "close" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } } }),
  });
  assert.equal(busy.status, 503);
  await busy.arrayBuffer();
  // The same request without a token is refused before it can count as work.
  const anonymous = await fetch(`http://127.0.0.1:${port}/mcp`, { method: "POST", headers: { "content-type": "application/json", connection: "close" }, body: "{}" });
  assert.equal(anonymous.status, 401);
  await anonymous.arrayBuffer();

  // Two clients hold connections open without sending a request. A third is turned away at once.
  const open = (): Promise<import("node:net").Socket> => new Promise((resolve, reject) => {
    const socket = connectSocket(port, "127.0.0.1", () => resolve(socket));
    socket.on("error", reject);
  });
  const held = [await open(), await open()];
  for (const socket of held) socket.write("POST /mcp HTTP/1.1\r\nHost: 127.0.0.1");
  await new Promise((r) => setTimeout(r, 50));
  const third = await open();
  const closed = await Promise.race([
    new Promise<boolean>((resolve) => third.once("close", () => resolve(true))),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000)),
  ]);
  assert.equal(closed, true, "a connection over the limit is closed by the server");
  for (const socket of held) socket.destroy();
});

// ------------------------------------------------------------------------------ F6, F7, F8

const Answer = z.strictObject({ theme: z.string(), score: z.number() });
const request = { purpose: "test-step", system: "sys", user: "user", schema: Answer, schemaName: "answer", maxTokens: 1000 };
const stream = (pieces: Iterable<Uint8Array>): Response =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const piece of pieces) controller.enqueue(piece);
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );

test("F6: what the gateway reads from the provider is bounded, and a long line is not read over and over", async () => {
  const encoder = new TextEncoder();
  // One line with no end, in 64 KiB pieces: refused once it passes the limit for a line.
  const piece = encoder.encode("x".repeat(64 * 1024));
  const started = Date.now();
  await assert.rejects(readCompletion(stream(Array.from({ length: 64 }, () => piece))), /line too large/);
  assert.ok(Date.now() - started < 2000, `took ${Date.now() - started} ms`);

  // An honest answer far larger than any real one, delivered in small pieces, is read quickly.
  const content = "word ".repeat(100_000);
  const events = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: ${JSON.stringify({ choices: [{ finish_reason: "stop", delta: {} }] })}\n\ndata: [DONE]\n\n`;
  const bytes = encoder.encode(events);
  const small: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += 97) small.push(bytes.slice(i, i + 97));
  const began = Date.now();
  const read = await readCompletion(stream(small));
  assert.equal(read.choices?.[0]?.message?.content, content);
  assert.ok(Date.now() - began < 3000, `took ${Date.now() - began} ms`);

  // An answer made of many events is refused once its text passes the limit for an answer.
  const block = `data: ${JSON.stringify({ choices: [{ delta: { content: "y".repeat(200_000) } }] })}\n\n`;
  await assert.rejects(readCompletion(stream(Array.from({ length: 12 }, () => encoder.encode(block)))), /answer too large/);

  // A response that is not a stream is read with a limit as well.
  const huge = new Response(stream(Array.from({ length: 600 }, () => piece)).body, { status: 200, headers: { "content-type": "application/json" } });
  await assert.rejects(readCompletion(huge), /too large/);
});

test("F7: usage figures the provider reports are checked before they are counted", async () => {
  const reply = (usage: unknown) => () =>
    new Response(JSON.stringify({ model: "mistral-large-4", choices: [{ finish_reason: "stop", message: { content: '{"theme":"t","score":1}' } }], usage }), { status: 200, headers: { "content-type": "application/json" } });
  const run = async (usage: unknown) => {
    const replies = [reply(usage)];
    const gateway = new MistralGateway({ fetch: (async () => replies.shift()!()) as typeof fetch, backoffMs: 1, apiKey: "placeholder" });
    return (await gateway.generateJson(request)).usage;
  };
  // A string, a fraction and a negative: none reaches the record as it was sent.
  assert.deepEqual(await run({ prompt_tokens: "5", completion_tokens: 10.5, completion_tokens_details: { reasoning_tokens: -1 } }), { promptTokens: 0, completionTokens: 11, reasoningTokens: 0 });
  // A completion figure that is not a number is charged at the request's whole allowance.
  assert.deepEqual(await run({ prompt_tokens: 7, completion_tokens: "many" }), { promptTokens: 7, completionTokens: 1000, reasoningTokens: 0 });
  assert.deepEqual(await run({ prompt_tokens: 7, completion_tokens: -3 }), { promptTokens: 7, completionTokens: 1000, reasoningTokens: 0 });
  // Reasoning is never counted as more than the completion it is part of.
  assert.deepEqual(await run({ prompt_tokens: 1, completion_tokens: 20, completion_tokens_details: { reasoning_tokens: 500 } }), { promptTokens: 1, completionTokens: 20, reasoningTokens: 20 });
});

test("F8: a call cancelled while it waits to retry stops at once and sends nothing more", async () => {
  let sent = 0;
  const failing = (async () => {
    sent += 1;
    return new Response("{}", { status: 503, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const gateway = new MistralGateway({ fetch: failing, backoffMs: 5000, apiKey: "placeholder" });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 60);
  const started = Date.now();
  await assert.rejects(gateway.generateJson({ ...request, signal: controller.signal }), (error: unknown) => error instanceof ModelCallError && /cancelled/.test(error.message));
  assert.ok(Date.now() - started < 1500, `took ${Date.now() - started} ms`);
  assert.equal(sent, 1, "no request is sent after the call is cancelled");
});

// ---------------------------------------------------------------------------------- F9

test("F9: a record replaced by a link is not followed, and messages name files, not the server's directories", async () => {
  const dir = scratch("link");
  const { service } = makeService({ store: new FileCampaignStore(dir) });
  const campaign = await service.createCampaign((await import("./support.ts")).syntheticBrief());
  const record = join(dir, `${campaign.id}.json`);
  const elsewhere = join(scratch("elsewhere"), "other.json");
  renameSync(record, elsewhere);
  symlinkSync(elsewhere, record);
  await assert.rejects(new FileCampaignStore(dir).get(campaign.id), /not stored as an ordinary file/);

  const fixtures = scratch("fixtures");
  const error = await new FixtureGateway(fixtures).generateJson(request).then(() => null, (e: unknown) => e);
  assert.ok(error instanceof FixtureMissingError);
  assert.ok(!error.message.includes(fixtures), "the message does not give the directory");
});
