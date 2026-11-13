// Regression tests for review finding F8: shim must not be an open, unauthenticated key-injecting proxy.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { chatBody, fixture, sendJson, startMock, startShim } from "./helpers.ts";
import { loadConfig } from "../../src/shim/server.ts";

// Fake credentials built by concatenation; none is a real secret.
const TOKEN = "client-" + "x".repeat(32);
const KEY = "provider-" + "k".repeat(20);
const OTHER = "wrong-" + "y".repeat(32);

const okMock = (): ReturnType<typeof startMock> => startMock((_req, res) => sendJson(res, fixture("nonstream-plain.json")));
const req = (base: string, path: string, method: string, headers: Record<string, string> = {}, body?: string): Promise<Response> => {
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = body;
  return fetch(base + path, init);
};
const bearer = (t: string): Record<string, string> => ({ authorization: `Bearer ${t}` });
const settle = (): Promise<unknown> => new Promise((r) => setTimeout(r, 25));

/** Raw request so Host/Origin can be set (fetch forbids overriding Host). */
function raw(base: string, path: string, headers: Record<string, string>, method = "GET"): Promise<number> {
  return new Promise((resolve, reject) => {
    const u = new URL(base);
    const r = http.request({ host: u.hostname, port: u.port, path, method, headers }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode ?? 0)); });
    r.on("error", reject);
    r.end();
  });
}

for (const mode of ["key injection", "pass-through"] as const) {
  test(`F8 ${mode}: batch, files, fine-tune and model delete are not forwarded`, async () => {
    const mock = await okMock();
    const shim = await startShim(mock.url, mode === "key injection" ? { apiKey: KEY, clientToken: TOKEN } : {});
    const h = mode === "key injection" ? bearer(TOKEN) : bearer("any");
    try {
      assert.equal((await req(shim.url, "/v1/batch/jobs", "POST", h, "{}")).status, 404);
      assert.equal((await req(shim.url, "/v1/files", "POST", h, "{}")).status, 404);
      assert.equal((await req(shim.url, "/v1/files", "GET", h)).status, 404);
      assert.equal((await req(shim.url, "/v1/models/ft:x", "DELETE", h)).status, 405);
      assert.equal((await req(shim.url, "/v1/fine_tuning/jobs", "POST", h, "{}")).status, 404);
      assert.equal((await req(shim.url, "/v1/models/..%2Ffiles", "GET", h)).status, 404);
      assert.equal((await req(shim.url, "/v1/models/" + "a".repeat(129), "GET", h)).status, 404);
      assert.equal((await req(shim.url, "/v1/models/a/b", "GET", h)).status, 404);
      for (const m of ["PUT", "PATCH", "DELETE"]) assert.equal((await req(shim.url, "/v1/chat/completions", m, h, "{}")).status, 405);
      assert.equal(mock.requests.length, 0, "upstream must have received nothing");
    } finally { await shim.close(); await mock.close(); }
  });
}

test("F8: wrong method on a known path is 405 with Allow; GET /v1/models/<id> is forwarded", async () => {
  const mock = await okMock();
  const shim = await startShim(mock.url);
  try {
    const a = await req(shim.url, "/v1/chat/completions", "GET");
    assert.equal(a.status, 405);
    assert.equal(a.headers.get("allow"), "POST");
    const b = await req(shim.url, "/v1/models", "POST", {}, "{}");
    assert.equal(b.status, 405);
    assert.equal(b.headers.get("allow"), "GET");
    assert.equal(mock.requests.length, 0);
    assert.equal((await req(shim.url, "/v1/models/mistral-large-4", "GET")).status, 200);
    assert.equal((await req(shim.url, "/v1/models/ft:abc.1_2-3", "GET")).status, 200);
    assert.deepEqual(mock.requests.map((r) => r.url), ["/v1/models/mistral-large-4", "/v1/models/ft:abc.1_2-3"]);
  } finally { await shim.close(); await mock.close(); }
});

test("F8: missing or wrong client token gets 401 and upstream is untouched", async () => {
  const mock = await okMock();
  const shim = await startShim(mock.url, { apiKey: KEY, clientToken: TOKEN });
  try {
    const hdr = { "content-type": "application/json" };
    assert.equal((await req(shim.url, "/v1/chat/completions", "POST", hdr, chatBody())).status, 401);
    assert.equal((await req(shim.url, "/v1/chat/completions", "POST", { ...hdr, ...bearer(OTHER) }, chatBody())).status, 401);
    assert.equal((await req(shim.url, "/v1/chat/completions", "POST", { ...hdr, ...bearer(TOKEN.slice(0, -1)) }, chatBody())).status, 401);
    assert.equal((await req(shim.url, "/v1/chat/completions", "POST", { ...hdr, authorization: `Basic ${TOKEN}` }, chatBody())).status, 401);
    assert.equal((await req(shim.url, "/v1/models", "GET")).status, 401);
    assert.equal((await req(shim.url, "/v1/batch/jobs", "POST", hdr, "{}")).status, 401);
    assert.equal(mock.requests.length, 0);
    await settle();
    assert.match(shim.logs[0]!, / auth=missing /);
    assert.match(shim.logs[1]!, / auth=bad /);
    assert.equal((await req(shim.url, "/healthz", "GET")).status, 200, "healthz needs no token");
  } finally { await shim.close(); await mock.close(); }
});

test("F8: correct token is forwarded upstream as the injected key; the client token never reaches upstream or logs", async () => {
  const mock = await okMock();
  const shim = await startShim(mock.url, { apiKey: KEY, clientToken: TOKEN });
  try {
    const r = await req(shim.url, "/v1/chat/completions", "POST", { "content-type": "application/json", ...bearer(TOKEN) }, chatBody());
    assert.equal(r.status, 200);
    assert.equal((await req(shim.url, "/v1/models", "GET", bearer(TOKEN))).status, 200);
    assert.equal(mock.requests.length, 2);
    for (const rec of mock.requests) {
      assert.equal(rec.headers["authorization"], `Bearer ${KEY}`);
      assert.equal(JSON.stringify(rec).includes(TOKEN), false);
    }
    await req(shim.url, "/v1/chat/completions", "POST", bearer(OTHER), "{}");
    await settle();
    const all = shim.logs.join("\n");
    assert.match(shim.logs[0]!, / auth=ok /);
    for (const secret of [TOKEN, KEY, OTHER]) assert.equal(all.includes(secret), false);
    assert.equal(/bearer/i.test(all), false);
  } finally { await shim.close(); await mock.close(); }
});

test("F8: pass-through mode on loopback still forwards the client's own Authorization header", async () => {
  const mock = await okMock();
  const shim = await startShim(mock.url);
  try {
    await req(shim.url, "/v1/chat/completions", "POST", { "content-type": "application/json", ...bearer("client-own") }, chatBody());
    assert.equal(mock.requests[0]!.headers["authorization"], "Bearer client-own");
    await settle();
    assert.match(shim.logs[0]!, / auth=none /);
  } finally { await shim.close(); await mock.close(); }
});

test("F8: foreign Host header is 403; allowed names (loopback, SHIM_HOST, SHIM_ALLOWED_HOSTS) pass; nothing forwarded when refused", async () => {
  const mock = await okMock();
  const shim = await startShim(mock.url, { allowedHosts: ["shim.internal"] });
  try {
    assert.equal(await raw(shim.url, "/v1/models", { host: "evil.example" }), 403);
    assert.equal(await raw(shim.url, "/v1/models", { host: "evil.example:8787" }), 403);
    assert.equal(await raw(shim.url, "/healthz", { host: "evil.example" }), 403);
    assert.equal(await raw(shim.url, "/v1/models", { host: "127.0.0.1.evil.example" }), 403);
    assert.equal(mock.requests.length, 0);
    assert.equal(await raw(shim.url, "/v1/models", { host: "localhost:8787" }), 200);
    assert.equal(await raw(shim.url, "/v1/models", { host: "[::1]:8787" }), 200);
    assert.equal(await raw(shim.url, "/v1/models", { host: "SHIM.internal" }), 200);
  } finally { await shim.close(); await mock.close(); }
});

test("F8: any Origin header is 403 and nothing is forwarded", async () => {
  const mock = await okMock();
  const shim = await startShim(mock.url);
  try {
    assert.equal(await raw(shim.url, "/v1/models", { origin: "http://localhost:3000" }), 403);
    assert.equal(await raw(shim.url, "/healthz", { origin: "null" }), 403);
    assert.equal(mock.requests.length, 0);
  } finally { await shim.close(); await mock.close(); }
});

test("F8: createShimServer refuses unsafe auth combinations too", async () => {
  const mock = await okMock();
  try {
    await assert.rejects(startShim(mock.url, { apiKey: KEY }), /SHIM_CLIENT_TOKEN is required/);
    await assert.rejects(startShim(mock.url, { clientToken: TOKEN }), /MISTRAL_API_KEY/);
    await assert.rejects(startShim(mock.url, { host: "0.0.0.0" }), /loopback/);
  } finally { await mock.close(); }
});

test("F8: startup refusals and acceptances in loadConfig", () => {
  const throwsWith = (env: Record<string, string>, re: RegExp): void => assert.throws(() => loadConfig(env), re);
  throwsWith({ MISTRAL_API_KEY: KEY }, /SHIM_CLIENT_TOKEN is required/);
  throwsWith({ SHIM_HOST: "0.0.0.0" }, /SHIM_CLIENT_TOKEN is required/);
  throwsWith({ SHIM_HOST: "192.0.2.10", MISTRAL_API_KEY: KEY }, /SHIM_CLIENT_TOKEN is required/);
  throwsWith({ SHIM_CLIENT_TOKEN: TOKEN }, /Set MISTRAL_API_KEY as well/);
  throwsWith({ SHIM_CLIENT_TOKEN: "short", MISTRAL_API_KEY: KEY }, /at least 24/);
  throwsWith({ SHIM_CLIENT_TOKEN: "a".repeat(23), MISTRAL_API_KEY: KEY }, /at least 24/);
  for (const [k, v] of [["SHIM_PORT", "abc"], ["SHIM_PORT", "70000"], ["SHIM_PORT", "-1"], ["SHIM_PORT", "80.5"], ["SHIM_MAX_BODY_BYTES", "lots"], ["SHIM_MAX_BODY_BYTES", "0"], ["SHIM_MAX_BODY_BYTES", "1e3"], ["SHIM_UPSTREAM_TIMEOUT_MS", "NaN"], ["SHIM_UPSTREAM_TIMEOUT_MS", "0"]] as const) {
    throwsWith({ [k]: v }, new RegExp(k));
  }
  throwsWith({ SHIM_UPSTREAM: "http://api.example.com" }, /https/);
  throwsWith({ SHIM_UPSTREAM: "ftp://127.0.0.1" }, /https/);
  throwsWith({ SHIM_UPSTREAM: "not a url" }, /valid URL/);
  throwsWith({ SHIM_UPSTREAM: "https://user:pw@api.example.com" }, /credentials/);
  // Error text never echoes secret values.
  try { loadConfig({ SHIM_CLIENT_TOKEN: "short", MISTRAL_API_KEY: KEY }); } catch (e) { assert.equal((e as Error).message.includes(KEY), false); }

  const d = loadConfig({});
  assert.equal(d.port, 8787);
  assert.equal(d.apiKey, undefined);
  assert.equal(d.clientToken, undefined);
  assert.equal(loadConfig({ SHIM_PORT: "0" }).port, 0);
  assert.equal(loadConfig({ SHIM_UPSTREAM: "http://127.0.0.1:9999/" }).upstream, "http://127.0.0.1:9999");
  assert.equal(loadConfig({ SHIM_UPSTREAM: "http://localhost:9" }).upstream, "http://localhost:9");
  const inj = loadConfig({ MISTRAL_API_KEY: KEY, SHIM_CLIENT_TOKEN: TOKEN, SHIM_HOST: "10.0.0.5", SHIM_ALLOWED_HOSTS: "Shim.Internal, other" });
  assert.deepEqual(inj.allowedHosts, ["shim.internal", "other"]);
  assert.equal(inj.host, "10.0.0.5");
});
