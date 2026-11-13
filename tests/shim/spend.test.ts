// The shim in key-injection mode: the holder of the client token spends the provider key, so
// what a request may ask for, how many run at once and the total spent are limited.
// (Approval-path security review, commit 177a8c4, finding F4.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chatBody, fixture, sendJson, startMock, startShim } from "./helpers.ts";
import { FileSpendLedger } from "../../src/workflow/spend.ts";

// Fake credentials built by concatenation; none is a real secret.
const TOKEN = "client-" + "x".repeat(32);
const KEY = "provider-" + "k".repeat(20);
const OWN = "callers-own-" + "0".repeat(12); // a stand-in for a caller's own key in pass-through mode
const injection = { apiKey: KEY, clientToken: TOKEN };
const post = (base: string, body: string, token = TOKEN): Promise<Response> =>
  fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body });
const settled = (): Promise<unknown> => new Promise((r) => setTimeout(r, 60));
const withoutUsage = (): string => {
  const reply = JSON.parse(fixture("nonstream-plain.json")) as Record<string, unknown>;
  delete reply["usage"];
  return JSON.stringify(reply);
};

test("key injection: a request may not ask for several answers or more tokens than the shim allows", async () => {
  const mock = await startMock((_req, res) => sendJson(res, fixture("nonstream-plain.json")));
  const shim = await startShim(mock.url, { ...injection, maxTokensPerRequest: 4000 });
  try {
    for (const extra of [{ n: 128 }, { n: 2 }, { max_tokens: 100_000_000 }, { max_tokens: 4001 }, { max_completion_tokens: 9000 }, { max_tokens: 0 }, { max_tokens: "lots" }, { max_tokens: 10.5 }]) {
      const refused = await post(shim.url, chatBody(extra));
      assert.equal(refused.status, 400, JSON.stringify(extra));
    }
    assert.equal(mock.requests.length, 0, "nothing reached the provider");

    // A request that names no limit is given the shim's; one within the limit goes as written.
    assert.equal((await post(shim.url, chatBody())).status, 200);
    assert.equal(JSON.parse(mock.requests[0]!.body).max_tokens, 4000);
    assert.equal((await post(shim.url, chatBody({ max_tokens: 1500, n: 1 }))).status, 200);
    assert.deepEqual(JSON.parse(mock.requests[1]!.body), JSON.parse(chatBody({ max_tokens: 1500, n: 1 })));
    // The other spelling of the limit is not passed on: what reaches the provider is `max_tokens`, at the figure reserved.
    assert.equal((await post(shim.url, chatBody({ max_completion_tokens: 7 }))).status, 200);
    const third = JSON.parse(mock.requests[2]!.body) as Record<string, unknown>;
    assert.equal(third["max_tokens"], 7);
    assert.equal("max_completion_tokens" in third, false);
    // A body that repeats a key is sent on as it was read here, once, with the value that was checked.
    const repeated = '{"model":"mistral-large-4","messages":[{"role":"user","content":"hi"}],"max_tokens":9000,"max_tokens":50}';
    assert.equal((await post(shim.url, repeated)).status, 200);
    assert.equal((mock.requests[3]!.body.match(/"max_tokens"/g) ?? []).length, 1);
    assert.equal(JSON.parse(mock.requests[3]!.body).max_tokens, 50);
    assert.equal(mock.requests[1]!.headers.authorization, `Bearer ${KEY}`);
  } finally {
    await shim.close();
    await mock.close();
  }
});

test("pass-through mode: the caller spends its own key, and the shim does not limit it", async () => {
  const mock = await startMock((_req, res) => sendJson(res, fixture("nonstream-plain.json")));
  const shim = await startShim(mock.url);
  try {
    const body = chatBody({ n: 3, max_tokens: 500_000 });
    const response = await fetch(`${shim.url}/v1/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${OWN}`, "content-type": "application/json" }, body });
    assert.equal(response.status, 200);
    assert.equal(mock.requests[0]!.body, body);
  } finally {
    await shim.close();
    await mock.close();
  }
});

test("key injection: the total spent through the shim has a ceiling that survives a restart", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "kic-shim-spend-")), "spend.state");
  const mock = await startMock((_req, res) => sendJson(res, fixture("nonstream-plain.json"))); // reports 229 completion tokens
  const spend = { file, maxRequests: 3, maxCompletionTokens: 5000 };
  let shim = await startShim(mock.url, { ...injection, spend, maxTokensPerRequest: 2000 });
  try {
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await post(shim.url, chatBody({ max_tokens: 2000 }))).status, 200);
      await settled(); // each is charged what the provider reported, so the next still fits
    }
    assert.deepEqual(await new FileSpendLedger(file).totals(), { campaigns: 1, calls: 3, tokens: 3 * 229 });
    const fourth = await post(shim.url, chatBody({ max_tokens: 2000 }));
    assert.equal(fourth.status, 429);
    assert.match(await fourth.text(), /spend ceiling/);
    assert.equal(mock.requests.length, 3, "the refused request never reached the provider");

    // A new process on the same account is still at the ceiling.
    await shim.close();
    shim = await startShim(mock.url, { ...injection, spend, maxTokensPerRequest: 2000 });
    assert.equal((await post(shim.url, chatBody({ max_tokens: 10 }))).status, 429);
    assert.equal(mock.requests.length, 3);
  } finally {
    await shim.close();
    await mock.close();
  }
});

test("key injection: an answer that does not say what it cost is charged at what was asked for; a provider refusal costs no tokens", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "kic-shim-spend-")), "spend.state");
  let mode: "silent" | "refuse" = "silent";
  const mock = await startMock((_req, res) => (mode === "silent" ? sendJson(res, withoutUsage()) : sendJson(res, '{"message":"bad request"}', 422)));
  const shim = await startShim(mock.url, { ...injection, spend: { file, maxRequests: 100, maxCompletionTokens: 2500 }, maxTokensPerRequest: 1000 });
  try {
    assert.equal((await post(shim.url, chatBody({ max_tokens: 1000 }))).status, 200);
    await settled();
    assert.equal((await new FileSpendLedger(file).totals()).tokens, 1000);
    mode = "refuse";
    assert.equal((await post(shim.url, chatBody({ max_tokens: 1000 }))).status, 422);
    await settled();
    assert.deepEqual(await new FileSpendLedger(file).totals(), { campaigns: 1, calls: 2, tokens: 1000 });
    mode = "silent";
    assert.equal((await post(shim.url, chatBody({ max_tokens: 1000 }))).status, 200);
    await settled();
    // 2000 charged of 2500: a request that may use 1000 no longer fits.
    assert.equal((await post(shim.url, chatBody({ max_tokens: 1000 }))).status, 429);
    assert.equal((await post(shim.url, chatBody({ max_tokens: 400 }))).status, 200);
  } finally {
    await shim.close();
    await mock.close();
  }
});

test("key injection: only so many requests run at once", async () => {
  const waiting: Array<() => void> = [];
  const mock = await startMock((_req, res) => {
    waiting.push(() => sendJson(res, fixture("nonstream-plain.json")));
  });
  const shim = await startShim(mock.url, { ...injection, maxConcurrent: 2 });
  try {
    const first = post(shim.url, chatBody({ max_tokens: 100 }));
    const second = post(shim.url, chatBody({ max_tokens: 100 }));
    while (waiting.length < 2) await new Promise((r) => setTimeout(r, 5));
    const third = await post(shim.url, chatBody({ max_tokens: 100 }));
    assert.equal(third.status, 429);
    assert.equal(mock.requests.length, 2);
    for (const release of waiting) release();
    assert.deepEqual([(await first).status, (await second).status], [200, 200]);
    await settled();
    // Once they have finished there is room again.
    const again = post(shim.url, chatBody({ max_tokens: 100 }));
    while (waiting.length < 3) await new Promise((r) => setTimeout(r, 5));
    waiting[2]!();
    assert.equal((await again).status, 200);
  } finally {
    await shim.close();
    await mock.close();
  }
});

test("an idle timeout is set once for a connection, however many requests it carries, and a chat request takes no query upstream", async () => {
  // (Review of 55a66f2, F1 and F3.) Before: one more listener for every request, held with its request, without a token.
  const http = await import("node:http");
  const { createShimServer } = await import("../../src/shim/server.ts");
  const mock = await startMock((_req, res) => sendJson(res, fixture("nonstream-plain.json")));
  const server = createShimServer({ host: "127.0.0.1", port: 0, upstream: mock.url, allowedModels: ["mistral-large-4"], maxBodyBytes: 1024 * 1024, upstreamTimeoutMs: 5000, exposeReasoning: false, log: () => undefined, ...injection });
  const sockets: import("node:net").Socket[] = [];
  server.on("connection", (socket) => sockets.push(socket));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as import("node:net").AddressInfo).port;
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const get = (path: string, headers: Record<string, string> = {}) =>
    new Promise<number>((resolve, reject) => {
      const r = http.request({ host: "127.0.0.1", port, path, method: "GET", agent, headers }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      });
      r.on("error", reject);
      r.end();
    });
  try {
    for (let i = 0; i < 60; i += 1) assert.equal(await get("/not-a-route"), 404); // no token needed to get this far
    assert.equal(sockets.length, 1, "all sixty went over one connection");
    assert.ok(sockets[0]!.listenerCount("timeout") <= 2, `${sockets[0]!.listenerCount("timeout")} timeout listeners on one connection`);

    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions?max_tokens=999999&model=other`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: chatBody({ max_tokens: 10 }) });
    assert.equal(response.status, 200);
    assert.equal(mock.requests[0]!.url, "/v1/chat/completions");
  } finally {
    agent.destroy();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await mock.close();
  }
});
