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

test("F5, N3: connections that show no token cannot shut out a caller that has one", async () => {
  const harness = makeService();
  const token = "t".repeat(32);
  const deps = { service: harness.agentService, exportRoot: scratch("http-export"), clock: harness.clock };
  const base = loadHttpOptions({ KIC_MCP_TOKEN: token, KIC_MCP_PORT: "0" });

  const defaults = createHttpServer(deps, base);
  assert.equal(defaults.headersTimeout, 5_000);
  assert.equal(defaults.requestTimeout, 30_000);

  const start = async (over: object) => {
    const http = createHttpServer(deps, { ...base, ...over });
    servers.push(http);
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    return (http.address() as AddressInfo).port;
  };
  const initialize = (port: number, withToken = true) =>
    fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", connection: "close", ...(withToken ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } } }),
    });
  const open = (port: number): Promise<import("node:net").Socket> =>
    new Promise((resolve, reject) => {
      const socket = connectSocket(port, "127.0.0.1", () => resolve(socket));
      socket.on("error", () => undefined);
      socket.once("error", reject);
    });

  // With no work allowed in progress, a request with a valid token is told to come back, and
  // the same request without a token is refused before it can count as work.
  const idle = await start({ maxInFlight: 0 });
  const busy = await initialize(idle);
  assert.equal(busy.status, 503);
  await busy.arrayBuffer();
  const anonymous = await initialize(idle, false);
  assert.equal(anonymous.status, 401);
  await anonymous.arrayBuffer();

  // The reviewer's attack, at the default limit: more silent connections than the server holds,
  // some sending nothing, some half a request. A caller with a token is served all the same.
  const port = await start({});
  const silent: Array<import("node:net").Socket> = [];
  for (let i = 0; i < 300; i++) {
    const socket = await open(port);
    if (i % 2 === 0) socket.write("POST /mcp HTTP/1.1\r\nHost: 127.0.0.1");
    silent.push(socket);
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const served = await initialize(port);
    assert.equal(served.status, 200, `attempt ${attempt}`);
    await served.arrayBuffer();
  }
  // And while the attacker keeps reconnecting.
  let attacking = true;
  const attacker = (async () => {
    while (attacking) {
      const socket = await open(port).catch(() => null);
      if (socket) silent.push(socket);
      await new Promise((r) => setTimeout(r, 2));
    }
  })();
  for (let attempt = 0; attempt < 10; attempt++) {
    const served = await initialize(port);
    assert.equal(served.status, 200, `under attack, attempt ${attempt}`);
    await served.arrayBuffer();
    await new Promise((r) => setTimeout(r, 20));
  }
  attacking = false;
  await attacker;
  // The server holds no more than its limit: the oldest silent connections were closed to make room.
  assert.ok(silent.filter((socket) => !socket.destroyed).length <= 256);
  for (const socket of silent) socket.destroy();
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

// ------------------------------------------------------------------------------------------
// The review of the remediation (docs/review/2026-11-13-review-b2-1d8bafe.md).

test("N1: a lock path that cannot be read makes a caller wait and give up, not spin", async () => {
  const dir = scratch("unreadable");
  const lock = join(dir, "state.lock");
  (await import("node:fs")).mkdirSync(lock); // a directory where the lock file should be
  const started = Date.now();
  const cpu = process.cpuUsage();
  assert.equal(await acquireOwnedLock(lock, { timeoutMs: 300 }), null);
  const waited = Date.now() - started;
  const used = process.cpuUsage(cpu);
  assert.ok(waited >= 250 && waited < 2000, `gave up after ${waited} ms`);
  assert.ok((used.user + used.system) / 1000 < waited / 2, "it waited; it did not spin");

  // A dangling link, and a file that carries the right to remove a lock, behave the same.
  const dangling = join(dir, "dangling.lock");
  symlinkSync(join(dir, "nowhere"), dangling);
  assert.equal(await acquireOwnedLock(dangling, { timeoutMs: 200 }), null);

  const other = join(dir, "other.lock");
  const content = deadOwner("dddddddddddddddddddddddd");
  writeFileSync(other, content);
  (await import("node:fs")).mkdirSync(`${other}.break.${createHash("sha256").update(content).digest("hex").slice(0, 24)}.1`);
  assert.equal(await acquireOwnedLock(other, { timeoutMs: 200 }), null);
});

test("N2: clearing up after a removed lock leaves alone a file another process is still writing", async () => {
  const dir = scratch("tidy");
  const lock = join(dir, "state.lock");
  const content = deadOwner("eeeeeeeeeeeeeeeeeeeeeeee");
  const generation = createHash("sha256").update(content).digest("hex").slice(0, 24);
  writeFileSync(lock, content);
  // What another claimant has on disk between writing its claim and linking it into place.
  const inProgress = `${lock}.break.${generation}.1.0123456789abcdef.new`;
  writeFileSync(inProgress, "another claimant's file\n");
  assert.equal(await clearDeadLock(lock, 30_000), true);
  assert.equal(existsSync(lock), false, "the dead lock was removed");
  assert.equal(existsSync(inProgress), true, "the other claimant's file was not");
  assert.deepEqual(readdirSync(dir), [inProgress.slice(dir.length + 1)]);
});

test("N4: the export tool names its files within the export directory, however that directory is reached", async () => {
  const baseDir = scratch("export-link");
  const fs = await import("node:fs");
  fs.mkdirSync(join(baseDir, "srv-real", "exports"), { recursive: true });
  symlinkSync(join(baseDir, "srv-real"), join(baseDir, "srv"));
  const harness = makeService();
  const server = createKicServer({ service: harness.agentService, exportRoot: join(baseDir, "srv", "exports"), requestedBy: "test-agent", clock: harness.clock });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const id = await harness.evaluated();
  const record = await harness.service.getCampaign(id);
  await harness.decide(id, { kind: "draft", id: record.drafts[0]!.id }, "approve");
  const result = (await client.callTool({ name: "kic_assemble_programme", arguments: { campaignId: id, allowPartial: true } })) as { isError?: boolean; structuredContent?: any };
  assert.equal(result.isError, undefined);
  const exported = result.structuredContent.export as Record<string, string>;
  for (const key of ["directory", "packagePath", "summaryPath", "commandsPath"]) {
    const value = exported[key]!;
    assert.ok(!value.startsWith("/") && !value.includes("..") && !value.includes("srv"), `${key}: ${value}`);
  }
  assert.match(exported["directory"]!, /^prog-[^/]+\/[^/]+-preview$/);
  assert.ok(exported["packagePath"]!.startsWith(`${exported["directory"]}/`));
  assert.ok(existsSync(join(baseDir, "srv-real", "exports", exported["packagePath"]!)), "the path is right within the export directory");
});

test("N5: an absurd usage figure is counted as the most a request could have used", async () => {
  const reply = (usage: unknown) =>
    new Response(JSON.stringify({ model: "mistral-large-4", choices: [{ finish_reason: "stop", message: { content: '{"theme":"t","score":1}' } }], usage }), { status: 200, headers: { "content-type": "application/json" } });
  const run = async (usage: unknown) => (await new MistralGateway({ fetch: (async () => reply(usage)) as typeof fetch, backoffMs: 1, apiKey: "placeholder" }).generateJson(request)).usage;
  // The request's allowance is 1,000 tokens.
  // No answer is counted as more than the whole call may use: three times its allowance.
  assert.deepEqual(await run({ prompt_tokens: 1e17, completion_tokens: 1e17, completion_tokens_details: { reasoning_tokens: 1e17 } }), { promptTokens: 2_000_000, completionTokens: 3000, reasoningTokens: 3000 });
  assert.deepEqual(await run({ prompt_tokens: 12, completion_tokens: 9007199254740000 }), { promptTokens: 12, completionTokens: 3000, reasoningTokens: 0 });
  for (const absurd of [1e300, Number.MAX_VALUE, 2 ** 53 + 2]) assert.equal((await run({ prompt_tokens: absurd, completion_tokens: absurd })).completionTokens, 3000);
  // An ordinary figure above the allowance is still counted in full.
  assert.deepEqual(await run({ prompt_tokens: 12, completion_tokens: 1500 }), { promptTokens: 12, completionTokens: 1500, reasoningTokens: 0 });
});

test("N6: evaluating again what has not changed changes nothing in the record", async () => {
  const { service, evaluated } = makeService();
  const id = await evaluated();
  const before = await service.getCampaign(id);
  for (let round = 0; round < 50; round++) await service.evaluateDrafts(id);
  const again = await service.evaluateDrafts(id, { slots: [1] });
  const after = await service.getCampaign(id);
  assert.equal(after.revision, before.revision, "nothing was written");
  assert.equal(after.audit.length, before.audit.length, "no audit entry was added");
  assert.deepEqual(after.evaluations, before.evaluations);
  assert.deepEqual(again, before.evaluations.filter((e) => e.slot === 1), "the caller is given the evaluation that is stored");
});

// ------------------------------------------------------------------------------------------
// The review of the second remediation (docs/review/2026-11-13-review-b3-a1affd2.md).

test("1: when a post's drafts go back to an earlier set, the evaluation of that set becomes the latest again", async () => {
  const { service, evaluated, decide } = makeService();
  const id = await evaluated();
  const first = (await service.getCampaign(id)).drafts.filter((d) => d.slot === 1).map((d) => d.id).sort();
  // Two more drafts for the post, evaluated with the first two, then rejected by the editor.
  const more = await service.generateDrafts(id, { slots: [1], variants: 2 });
  const added = more.filter((d) => d.slot === 1 && !first.includes(d.id)).map((d) => d.id);
  assert.equal(added.length, 2);
  await service.evaluateDrafts(id, { slots: [1] });
  for (const draftId of added) await decide(id, { kind: "draft", id: draftId }, "reject");
  const [again] = await service.evaluateDrafts(id, { slots: [1] });
  assert.deepEqual(again!.candidates.map((c) => c.draftId).sort(), first, "the caller is given an evaluation of the drafts that are left");
  const record = await service.getCampaign(id);
  const shown = [...record.evaluations].reverse().find((e) => e.slot === 1)!;
  assert.deepEqual(shown.candidates.map((c) => c.draftId).sort(), first, "and it is the latest stored, which is the one the editor is shown");
  assert.ok(!shown.ranking.some((draftId) => added.includes(draftId)), "rejected drafts are not ranked");
  // Asking once more changes nothing.
  const revision = record.revision;
  await service.evaluateDrafts(id, { slots: [1] });
  assert.equal((await service.getCampaign(id)).revision, revision);
});

test("2: a named pipe at the lock's path, or in place of a record, does not hold a caller for ever", { timeout: 20_000 }, async (t) => {
  const made = spawnSync("mkfifo", [join(scratch("probe"), "p")]);
  if (made.status !== 0) return t.skip("needs mkfifo");
  const dir = scratch("pipe");
  const lock = join(dir, "state.lock");
  spawnSync("mkfifo", [lock]);
  const started = Date.now();
  assert.equal(await acquireOwnedLock(lock, { timeoutMs: 300 }), null);
  assert.ok(Date.now() - started < 2000, `gave up after ${Date.now() - started} ms`);

  const storeDir = scratch("pipe-store");
  const { service } = makeService({ store: new FileCampaignStore(storeDir) });
  const campaign = await service.createCampaign((await import("./support.ts")).syntheticBrief());
  const record = join(storeDir, `${campaign.id}.json`);
  renameSync(record, `${record}.aside`);
  spawnSync("mkfifo", [record]);
  const reading = Date.now();
  await assert.rejects(new FileCampaignStore(storeDir).get(campaign.id), /not stored as an ordinary file/);
  assert.ok(Date.now() - reading < 2000);
});

test("4: asking again for a decision that came to nothing replaces the old request; it does not add one", async () => {
  const { service, evaluated, clock, operator } = makeService();
  const id = await evaluated();
  const draftId = (await service.getCampaign(id)).drafts[0]!.id;
  const ask = (action: "approve" | "reject" = "approve") =>
    service.requestDecision({ campaignId: id, subject: { kind: "draft", id: draftId }, action, proposedRationale: "Proposed by the test.", revisionInstruction: null, requestedBy: "test" });
  await ask();
  const before = await service.getCampaign(id);

  // The editor is away: the request expires and the agent asks again, sixty times over.
  for (let i = 0; i < 60; i++) {
    clock.advance(31 * 60_000);
    await ask();
  }
  let record = await service.getCampaign(id);
  assert.equal(record.decisionRequests.length, before.decisionRequests.length, "one request for the decision, however often it was asked for");
  assert.equal(record.audit.length, before.audit.length, "and no more lines in the audit trail");
  // The request that stands is the last one made, and it can still be confirmed.
  const standing = record.decisionRequests.filter((r) => r.state === "pending" && r.subject.id === draftId);
  assert.equal(standing.length, 1);

  // The operator channel is down: every attempt is refused, and nothing piles up.
  const deliver = operator.deliver.bind(operator);
  operator.deliver = async () => {
    throw new Error("channel down");
  };
  clock.advance(31 * 60_000);
  for (let i = 0; i < 40; i++) await assert.rejects(ask("reject"), /could not be delivered/);
  record = await service.getCampaign(id);
  assert.equal(record.decisionRequests.filter((r) => r.action === "reject").length, 1);
  assert.ok(record.audit.length <= before.audit.length + 2, `audit grew by ${record.audit.length - before.audit.length}`);
  // The channel comes back: the decision can be asked for, and is not refused for having been asked for too often.
  operator.deliver = deliver;
  const made = await ask("reject");
  assert.equal(made.state, "pending");
  assert.equal((await service.getCampaign(id)).decisionRequests.filter((r) => r.action === "reject").length, 1);
});

test("4: a campaign still holds only so many requests", async () => {
  const { service, evaluated } = makeService({ limits: { maxDecisionRequests: 4 } });
  const id = await evaluated();
  const record = await service.getCampaign(id);
  const asked: string[] = [];
  let refusedBy = "";
  for (const draft of record.drafts) {
    for (const action of ["approve", "reject"] as const) {
      if (refusedBy !== "") continue;
      await service
        .requestDecision({ campaignId: id, subject: { kind: "draft", id: draft.id }, action, proposedRationale: "Proposed by the test.", revisionInstruction: null, requestedBy: "test" })
        .then(() => asked.push(`${action} ${draft.id}`), (error: Error) => (refusedBy = error.message));
    }
  }
  assert.equal(asked.length + record.decisionRequests.length, 4);
  assert.match(refusedBy, /holds 4 decision requests; the limit is 4/);
});

test("6: a right to remove a lock that names no holder is honoured only until it is old", async () => {
  const dir = scratch("empty-right");
  const lock = join(dir, "state.lock");
  const content = deadOwner("ffffffffffffffffffffffff");
  const right = `${lock}.break.${createHash("sha256").update(content).digest("hex").slice(0, 24)}.1`;
  writeFileSync(lock, content);
  writeFileSync(right, "");
  // Fresh: it may be a remover still writing its name. The caller waits.
  assert.equal(await acquireOwnedLock(lock, { timeoutMs: 150, ownerlessAfterMs: 60_000 }), null);
  // Old: nobody is writing it. The next in line removes the dead lock.
  const taken = await acquireOwnedLock(lock, { timeoutMs: 1000, ownerlessAfterMs: 1 });
  assert.ok(taken);
  await taken.release();
  for (const value of ["0 x - remover\n", "garbage\n"]) {
    writeFileSync(lock, content);
    writeFileSync(right, value);
    const again = await acquireOwnedLock(lock, { timeoutMs: 1000, ownerlessAfterMs: 1 });
    assert.ok(again, JSON.stringify(value));
    await again.release();
  }
});

test("7: only so many previews of a programme are kept; the oldest go, and a release is never removed", async () => {
  const { exportProgramme } = await import("../../src/workflow/assemble.ts");
  const harness = makeService();
  const id = await harness.evaluated();
  const record = await harness.service.getCampaign(id);
  await harness.decide(id, { kind: "draft", id: record.drafts[0]!.id }, "approve");
  const root = scratch("previews");
  const fs = await import("node:fs");
  const directories: string[] = [];
  for (let i = 0; i < 8; i++) {
    harness.clock.advance(1000);
    const pkg = harness.assemble(await harness.service.getCampaign(id), true);
    directories.push((await exportProgramme(pkg, root, { maxExports: 3 })).directory);
  }
  const programmeDir = join(directories[0]!, "..");
  // Something that is not a preview sits beside them and is left alone.
  fs.mkdirSync(join(programmeDir, "20260101T000000000Z-000000000000-released"));
  harness.clock.advance(1000);
  await exportProgramme(harness.assemble(await harness.service.getCampaign(id), true), root, { maxExports: 3 });
  const kept = readdirSync(programmeDir).sort();
  assert.equal(kept.filter((name) => name.endsWith("-preview")).length, 3);
  assert.ok(kept.includes("20260101T000000000Z-000000000000-released"));
  assert.ok(!existsSync(directories[0]!), "the oldest preview was removed");
  assert.ok(existsSync(directories[7]!), "a recent one was kept");
});

// ------------------------------------------------------------------------------------------
// The delta review of these follow-ups (docs/review/2026-11-13-review-b4-1f159a2.md).

test("b4-1, b4-2: every read of a lock file is safe against a named pipe put there, whenever it is put there", { timeout: 20_000 }, async (t) => {
  const made = spawnSync("mkfifo", [join(scratch("probe2"), "p")]);
  if (made.status !== 0) return t.skip("needs mkfifo");
  // The holder's own check: a pipe put in place of a lock that is held. The holder finds it no
  // longer has the lock and writes nothing; it does not wait on the pipe.
  const dir = scratch("held-pipe");
  const store = new FileCampaignStore(dir, { lockTimeoutMs: 400 });
  const { service } = makeService({ store });
  const campaign = await service.createCampaign((await import("./support.ts")).syntheticBrief());
  const lock = join(dir, `${campaign.id}.json.lock`);
  const before = (await store.get(campaign.id)).revision;
  const started = Date.now();
  await assert.rejects(
    store.update(campaign.id, (record) => {
      (async () => undefined)();
      // Done from inside the update, while the lock is held.
      spawnSync("rm", ["-f", lock]);
      spawnSync("mkfifo", [lock]);
      record.audit.push({ at: "2026-01-05T09:00:00.000Z", event: "test", detail: "must not be written" });
    }),
  );
  assert.ok(Date.now() - started < 10_000, `returned after ${Date.now() - started} ms`);
  spawnSync("rm", ["-f", lock]);
  assert.equal((await store.get(campaign.id)).revision, before, "the displaced holder wrote nothing");

  // A pipe and a file swapped back and forth at a lock's path while it is being read.
  const racing = join(scratch("race"), "state.lock");
  const swapper = spawn("sh", ["-c", `while :; do rm -f "$0"; mkfifo "$0"; rm -f "$0"; printf '1 0 - x\n' > "$0"; done`, racing], { stdio: "ignore" });
  try {
    const began = Date.now();
    let calls = 0;
    while (Date.now() - began < 1500) {
      await clearDeadLock(racing, 60_000);
      calls += 1;
    }
    assert.ok(calls > 20, `${calls} calls returned; none waited on the pipe`);
  } finally {
    swapper.kill("SIGKILL");
  }
});

test("b4-4: however many answers a call has, it is never counted as more than the call may use", async () => {
  const answer = (content: string, finish: string, usage: unknown) => () =>
    new Response(JSON.stringify({ model: "mistral-large-4", choices: [{ finish_reason: finish, message: { content } }], usage }), { status: 200, headers: { "content-type": "application/json" } });
  const absurd = { prompt_tokens: 1, completion_tokens: 1e12 };
  const run = async (replies: Array<() => Response>) => {
    const gateway = new MistralGateway({ fetch: (async () => replies.shift()!()) as typeof fetch, backoffMs: 1, apiKey: "placeholder" });
    return gateway.generateJson(request).then((result) => result.usage.completionTokens, (error: ModelCallError) => error.cost.usage.completionTokens);
  };
  const good = '{"theme":"t","score":1}';
  // The request's allowance is 1,000, so the call may use 3,000.
  assert.equal(await run([answer("", "length", absurd), answer(good, "stop", absurd)]), 3000);
  assert.equal(await run([answer("not json", "stop", absurd), answer(good, "stop", absurd)]), 3000);
  assert.equal(await run([answer("not json", "stop", absurd), answer("not json", "stop", absurd)]), 3000);
  // Truthful figures are counted as they are.
  assert.equal(await run([answer("", "length", { prompt_tokens: 1, completion_tokens: 1000 }), answer(good, "stop", { prompt_tokens: 1, completion_tokens: 700 })]), 1700);
});

test("b4-5: the server keeps only as many previews as its limit says", async () => {
  const harness = makeService({ limits: { maxPreviewExports: 2 } });
  const exportRoot = scratch("server-previews");
  const server = createKicServer({ service: harness.agentService, exportRoot, requestedBy: "test-agent", clock: harness.clock });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const id = await harness.evaluated();
  const record = await harness.service.getCampaign(id);
  await harness.decide(id, { kind: "draft", id: record.drafts[0]!.id }, "approve");
  for (let i = 0; i < 5; i++) {
    const result = (await client.callTool({ name: "kic_assemble_programme", arguments: { campaignId: id, allowPartial: true } })) as { isError?: boolean };
    assert.equal(result.isError, undefined);
  }
  const programmes = readdirSync(exportRoot);
  assert.equal(programmes.length, 1);
  assert.equal(readdirSync(join(exportRoot, programmes[0]!)).length, 2);
});
