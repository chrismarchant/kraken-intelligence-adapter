import { test } from "node:test";
import assert from "node:assert/strict";
import { chatBody, fixture, parseSse, sendJson, sendSse, startMock, startShim, streamText } from "./helpers.ts";

const post = (base: string, body: string, headers: Record<string, string> = {}): Promise<Response> =>
  fetch(base + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer client-secret-123", ...headers }, body });

test("non-stream plain and tool call are normalised; body forwarded verbatim", async () => {
  const mock = await startMock((req, res) => sendJson(res, fixture(req.url === "/v1/chat/completions" ? "nonstream-plain.json" : "nonstream-tool.json")));
  const shim = await startShim(mock.url);
  try {
    const body = chatBody({ max_tokens: 5, tools: [{ type: "function", function: { name: "x", parameters: {} } }] });
    const r = await post(shim.url, body);
    assert.equal(r.status, 200);
    const j = (await r.json()) as any;
    assert.equal(typeof j.choices[0].message.content, "string");
    assert.ok(j.choices[0].message.content.length > 0);
    assert.equal(mock.requests[0]!.body, body);
    assert.equal(mock.requests[0]!.url, "/v1/chat/completions");
  } finally { await shim.close(); await mock.close(); }

  const mock2 = await startMock((_req, res) => sendJson(res, fixture("nonstream-tool.json")));
  const shim2 = await startShim(mock2.url);
  try {
    const j = (await (await post(shim2.url, chatBody())).json()) as any;
    assert.equal(j.choices[0].message.content, "");
    assert.equal(j.choices[0].message.tool_calls[0].function.name, "record_hook");
    assert.equal(j.choices[0].finish_reason, "tool_calls");
    assert.ok(j.usage.total_tokens > 0);
  } finally { await shim2.close(); await mock2.close(); }
});

for (const [name, file] of [["plain", "stream-plain.sse"], ["tool call", "stream-tool.sse"]] as const) {
  test(`stream ${name}: normalised through the proxy with awkward network slicing`, async () => {
    const mock = await startMock((_req, res) => { void sendSse(res, fixture(file), 13); });
    const shim = await startShim(mock.url);
    try {
      const r = await post(shim.url, chatBody({ stream: true, stream_options: { include_usage: true } }));
      assert.equal(r.status, 200);
      assert.match(r.headers.get("content-type") ?? "", /text\/event-stream/);
      const text = await r.text();
      const chunks = parseSse(text);
      assert.equal(text.includes('"thinking"'), false);
      for (const c of chunks) {
        const d = c.json?.choices?.[0]?.delta;
        if (d && "content" in d) assert.equal(typeof d.content, "string");
      }
      assert.ok(text.trimEnd().endsWith("data: [DONE]"));
      const last = chunks.filter((c) => c.json).at(-1)!.json!;
      assert.ok(last.usage.total_tokens > 0);
      if (name === "plain") assert.match(streamText(chunks), /café/);
      else assert.equal(chunks.find((c) => c.json?.choices?.[0]?.delta?.tool_calls)!.json!.choices[0].delta.tool_calls[0].function.name, "record_hook");
      await new Promise((r2) => setTimeout(r2, 20));
      assert.match(shim.logs[0]!, /^POST \/v1\/chat\/completions 200 \d+ms model=mistral-large-4 tokens=\d+\/\d+\/\d+$/);
    } finally { await shim.close(); await mock.close(); }
  });
}

test("string content passes through byte-identical", async () => {
  const orig = JSON.stringify({ id: "a", choices: [{ index: 0, message: { role: "assistant", content: "plain" }, finish_reason: "stop" }] });
  const mock = await startMock((_req, res) => sendJson(res, orig));
  const shim = await startShim(mock.url);
  try {
    assert.equal(await (await post(shim.url, chatBody())).text(), orig);
  } finally { await shim.close(); await mock.close(); }
});

test("unknown block type is ignored", async () => {
  const up = JSON.stringify({ choices: [{ message: { role: "assistant", content: [{ type: "reference", reference_ids: [1] }, { type: "text", text: "ok" }] } }] });
  const mock = await startMock((_req, res) => sendJson(res, up));
  const shim = await startShim(mock.url);
  try {
    assert.equal(((await (await post(shim.url, chatBody())).json()) as any).choices[0].message.content, "ok");
  } finally { await shim.close(); await mock.close(); }
});

test("reasoning exposed via config", async () => {
  const mock = await startMock((_req, res) => sendJson(res, fixture("nonstream-plain.json")));
  const shim = await startShim(mock.url, { exposeReasoning: true });
  try {
    const j = (await (await post(shim.url, chatBody())).json()) as any;
    assert.equal(typeof j.choices[0].message.reasoning_content, "string");
    assert.ok(j.choices[0].message.reasoning_content.length > 0);
  } finally { await shim.close(); await mock.close(); }
});

test("allowlist rejects other models before contacting upstream", async () => {
  const mock = await startMock((_req, res) => sendJson(res, "{}"));
  const shim = await startShim(mock.url, { allowedModels: ["mistral-large-4"] });
  try {
    const bad = await post(shim.url, chatBody({ model: "other-model" }));
    assert.equal(bad.status, 400);
    assert.equal(mock.requests.length, 0);
    const none = await post(shim.url, JSON.stringify({ messages: [] }));
    assert.equal(none.status, 400);
    const ok = await post(shim.url, chatBody());
    assert.equal(ok.status, 200);
  } finally { await shim.close(); await mock.close(); }
});

test("body limit returns 413 and never reaches upstream", async () => {
  const mock = await startMock((_req, res) => sendJson(res, "{}"));
  const shim = await startShim(mock.url, { maxBodyBytes: 200 });
  try {
    const r = await post(shim.url, chatBody({ pad: "x".repeat(1000) }));
    assert.equal(r.status, 413);
    assert.equal(mock.requests.length, 0);
  } finally { await shim.close(); await mock.close(); }
});

test("upstream 4xx/5xx passed through with status and body", async () => {
  const errBody = '{"message":"Unauthorized","request_id":"r1"}';
  const mock = await startMock((_req, res) => sendJson(res, errBody, 401));
  const shim = await startShim(mock.url);
  try {
    const r = await post(shim.url, chatBody());
    assert.equal(r.status, 401);
    assert.equal(await r.text(), errBody);
  } finally { await shim.close(); await mock.close(); }
  const mock2 = await startMock((_req, res) => sendJson(res, '{"e":1}', 503));
  const shim2 = await startShim(mock2.url);
  try {
    const r = await post(shim2.url, chatBody({ stream: true }));
    assert.equal(r.status, 503);
    assert.equal(await r.text(), '{"e":1}');
  } finally { await shim2.close(); await mock2.close(); }
});

test("upstream redirect is refused (502) and not followed", async () => {
  const target = await startMock((_req, res) => sendJson(res, "{}"));
  const mock = await startMock((_req, res) => { res.writeHead(302, { location: target.url + "/v1/chat/completions" }); res.end(); });
  const shim = await startShim(mock.url);
  try {
    const r = await post(shim.url, chatBody());
    assert.equal(r.status, 502);
    assert.equal(target.requests.length, 0);
  } finally { await shim.close(); await mock.close(); await target.close(); }
});

test("upstream timeout returns 504", async () => {
  const mock = await startMock(() => { /* never respond */ });
  const shim = await startShim(mock.url, { upstreamTimeoutMs: 150 });
  try {
    const r = await post(shim.url, chatBody());
    assert.equal(r.status, 504);
  } finally { await shim.close(); await mock.close(); }
});

test("client disconnect aborts the upstream request", async () => {
  let upstreamClosed: () => void = () => {};
  const closed = new Promise<void>((r) => { upstreamClosed = r; });
  const mock = await startMock((req, res) => { res.writeHead(200, { "content-type": "text/event-stream" }); res.write(": hi\n\n"); req.socket.on("close", () => upstreamClosed()); });
  const shim = await startShim(mock.url);
  try {
    const ac = new AbortController();
    const r = await fetch(shim.url + "/v1/chat/completions", { method: "POST", body: chatBody({ stream: true }), headers: { "content-type": "application/json" }, signal: ac.signal });
    await r.body!.getReader().read();
    ac.abort();
    await Promise.race([closed, new Promise((_, rej) => setTimeout(() => rej(new Error("upstream not aborted")), 2000))]);
  } finally { await shim.close(); await mock.close(); }
});

test("authorization: client header forwarded; MISTRAL_API_KEY (config.apiKey) overrides; never logged", async () => {
  const mock = await startMock((_req, res) => sendJson(res, fixture("nonstream-plain.json")));
  const shim = await startShim(mock.url);
  try {
    await post(shim.url, chatBody());
    assert.equal(mock.requests[0]!.headers["authorization"], "Bearer client-secret-123");
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(shim.logs.length, 1);
    assert.equal(shim.logs.join("\n").includes("client-secret-123"), false);
    assert.equal(/bearer/i.test(shim.logs.join("\n")), false);
  } finally { await shim.close(); }
  const shim2 = await startShim(mock.url, { apiKey: "env-key-999" });
  try {
    await post(shim2.url, chatBody());
    assert.equal(mock.requests[1]!.headers["authorization"], "Bearer env-key-999");
    await new Promise((r) => setTimeout(r, 20));
    const all = shim2.logs.join("\n");
    assert.equal(all.includes("env-key-999") || all.includes("client-secret-123"), false);
  } finally { await shim2.close(); await mock.close(); }
});

test("routing: healthz, non-/v1 404, /v1/models passthrough with method and query", async () => {
  const mock = await startMock((req, res) => sendJson(res, JSON.stringify({ url: req.url, method: req.method })));
  const shim = await startShim(mock.url);
  try {
    assert.equal((await fetch(shim.url + "/healthz")).status, 200);
    assert.equal((await fetch(shim.url + "/other")).status, 404);
    assert.equal((await fetch(shim.url + "/v1")).status, 404);
    assert.equal((await fetch(shim.url + "//evil.example/v1/models")).status, 404);
    assert.equal(mock.requests.length, 0);
    const r = await fetch(shim.url + "/v1/models?x=1", { headers: { authorization: "Bearer k" } });
    assert.deepEqual(await r.json(), { url: "/v1/models?x=1", method: "GET" });
    assert.equal(mock.requests[0]!.headers["authorization"], "Bearer k");
    const bad = await post(shim.url, "{not json");
    assert.equal(bad.status, 400);
  } finally { await shim.close(); await mock.close(); }
});
