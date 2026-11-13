import { test } from "node:test";
import assert from "node:assert/strict";
import { createSseNormalizer, normalizeChatCompletion } from "../../src/shim/normalize.ts";
import { fixture, parseSse, streamText } from "./helpers.ts";

const NORMAL_TEXT: string = (JSON.parse(fixture("nonstream-plain.json")).choices[0].message.content as any[]).find((b) => b.type === "text").text;
const THINK_TEXT: string = (JSON.parse(fixture("nonstream-plain.json")).choices[0].message.content as any[]).find((b) => b.type === "thinking").thinking[0].text;

test("non-stream plain: blocks flattened to the text string, reasoning dropped by default", () => {
  const body = JSON.parse(fixture("nonstream-plain.json"));
  const out = normalizeChatCompletion(body) as any;
  assert.equal(typeof out.choices[0].message.content, "string");
  assert.equal(out.choices[0].message.content, NORMAL_TEXT);
  assert.equal("reasoning_content" in out.choices[0].message, false);
  assert.deepEqual(out.usage, body.usage);
  assert.equal(out.id, body.id);
  assert.equal(out.choices[0].finish_reason, "stop");
  assert.ok(Array.isArray(body.choices[0].message.content), "input not mutated");
});

test("non-stream: reasoning exposed only when asked", () => {
  const body = JSON.parse(fixture("nonstream-plain.json"));
  const out = normalizeChatCompletion(body, { exposeReasoning: true }) as any;
  assert.equal(out.choices[0].message.content, NORMAL_TEXT);
  assert.equal(out.choices[0].message.reasoning_content, THINK_TEXT);
});

test("non-stream tool call: tool_calls preserved, thinking-only content becomes empty string", () => {
  const body = JSON.parse(fixture("nonstream-tool.json"));
  const out = normalizeChatCompletion(body) as any;
  assert.equal(out.choices[0].message.content, "");
  assert.deepEqual(out.choices[0].message.tool_calls, body.choices[0].message.tool_calls);
  assert.equal(out.choices[0].finish_reason, "tool_calls");
});

test("string and null content pass through; unknown block types are ignored; no throw on junk", () => {
  const s = { choices: [{ message: { role: "assistant", content: "hello" } }] };
  assert.deepEqual(normalizeChatCompletion(s), s);
  const n = { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "x" }] } }] };
  assert.deepEqual(normalizeChatCompletion(n), n);
  const u = {
    choices: [{ message: { content: [{ type: "image_url", image_url: "x" }, { type: "text", text: "a" }, { type: "weird", z: 1 }, { type: "text", text: "b" }, 7, null] } }],
  };
  assert.equal((normalizeChatCompletion(u) as any).choices[0].message.content, "ab");
  for (const junk of [null, undefined, 1, "x", [], {}, { choices: "no" }, { choices: [null, 3] }]) {
    assert.doesNotThrow(() => normalizeChatCompletion(junk));
  }
});

async function runNormalizer(bytes: Uint8Array, slice: number, opts = {}): Promise<string> {
  const ts = createSseNormalizer(opts);
  const w = ts.writable.getWriter();
  const reader = ts.readable.getReader();
  const parts: Uint8Array[] = [];
  const done = (async () => {
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      parts.push(r.value);
    }
  })();
  for (let i = 0; i < bytes.length; i += slice) await w.write(bytes.subarray(i, i + slice));
  await w.close();
  await done;
  return Buffer.concat(parts).toString("utf8");
}

for (const slice of [1, 3, 7, 64, 100000]) {
  test(`stream plain: identical result at ${slice}-byte slices (splits UTF-8 and data: lines)`, async () => {
    const raw = fixture("stream-plain.sse");
    const out = await runNormalizer(Buffer.from(raw, "utf8"), slice);
    const chunks = parseSse(out);
    for (const c of chunks) {
      const d = c.json?.choices?.[0]?.delta;
      if (d && "content" in d) assert.equal(typeof d.content, "string");
    }
    assert.match(streamText(chunks), /caf\u00e9/);
    assert.equal(out.endsWith("data: [DONE]\n\n"), true);
    assert.equal(out.includes('"thinking"'), false);
    const last = chunks.filter((c) => c.json).at(-1)!.json!;
    assert.equal(last.choices[0].finish_reason, "stop");
    assert.equal(typeof last.usage.total_tokens, "number");
    // Same output regardless of slicing.
    assert.equal(out, await runNormalizer(Buffer.from(raw, "utf8"), 100000));
  });
}

test("stream tool call: tool_calls delta and usage chunk preserved", async () => {
  const raw = fixture("stream-tool.sse");
  const out = await runNormalizer(Buffer.from(raw, "utf8"), 11);
  const chunks = parseSse(out);
  const tc = chunks.find((c) => c.json?.choices?.[0]?.delta?.tool_calls);
  assert.ok(tc);
  assert.equal(tc.json!.choices[0].delta.tool_calls[0].function.name, "record_hook");
  assert.equal(tc.json!.choices[0].finish_reason, "tool_calls");
  assert.equal(typeof tc.json!.usage.total_tokens, "number");
  for (const c of chunks) {
    const d = c.json?.choices?.[0]?.delta;
    if (d && "content" in d) assert.equal(typeof d.content, "string");
  }
});

test("stream: comments, unknown events, non-JSON data and [DONE] pass through unchanged; CRLF ok", async () => {
  const input =
    ": keep-alive\n\n" +
    "event: ping\ndata: {\"x\":1}\n\n" +
    "data: not json\n\n" +
    "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":[{\"type\":\"text\",\"text\":\"hi\"},{\"type\":\"nope\"}]}}]}\r\n\r\n" +
    "data: [DONE]\n\n";
  const out = await runNormalizer(Buffer.from(input), 5);
  assert.ok(out.startsWith(": keep-alive\n\nevent: ping\ndata: {\"x\":1}\n\ndata: not json\n\n"));
  assert.ok(out.includes('"content":"hi"'));
  assert.ok(out.endsWith("data: [DONE]\n\n"));
});

test("stream: reasoning exposed when asked; unterminated final event flushed", async () => {
  const input = 'data: {"choices":[{"delta":{"content":[{"type":"thinking","thinking":[{"type":"text","text":"why"}],"closed":true},{"type":"text","text":"ok"}]}}]}';
  const out = await runNormalizer(Buffer.from(input), 4, { exposeReasoning: true });
  const j = parseSse(out)[0]!.json!;
  assert.equal(j.choices[0].delta.content, "ok");
  assert.equal(j.choices[0].delta.reasoning_content, "why");
});
