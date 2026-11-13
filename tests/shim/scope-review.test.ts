// Regression tests for scope-completing review A of commit 2537386, findings F10 and F11
// (docs/review/2026-11-13-scope-review-a-2537386.md): the shim's normaliser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DROPPED_EVENT, MAX_SSE_EVENT_CHARS, createSseNormalizer, normalizeSseEvent } from "../../src/shim/normalize.ts";
import { chatBody, sendJson, startMock, startShim } from "./helpers.ts";

const THOUGHT = "SECRET-THOUGHT";
const thinking = { type: "thinking", thinking: [{ type: "text", text: THOUGHT }], closed: true };
const chunk = (content: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ choices: [{ index: 0, delta: { content, ...extra } }] });

async function run(pieces: Array<string | Uint8Array>, opts = {}): Promise<string> {
  const stream = createSseNormalizer(opts);
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const parts: Uint8Array[] = [];
  const reading = (async () => {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      parts.push(next.value);
    }
  })();
  // If the stream ends in an error, the write below reports it; the reader's own failure is not left unhandled.
  reading.catch(() => undefined);
  const encoder = new TextEncoder();
  for (const piece of pieces) await writer.write(typeof piece === "string" ? encoder.encode(piece) : piece);
  await writer.close();
  await reading;
  return Buffer.concat(parts).toString("utf8");
}

test("F10, N10: an event that cannot be read ends the stream; it is neither passed on nor left out", async () => {
  const whole = `data: ${chunk([thinking, { type: "text", text: "ok" }])}`;
  // Cut off before its end, with no blank line after it: a stream that broke off.
  await assert.rejects(run([whole.slice(0, whole.length - 9)]), /could not be read/);
  // The same in the middle of a stream. What came before it has been sent; nothing after it is.
  const first = `data: ${chunk("one")}\n\n`;
  const last = `data: ${chunk("three")}\n\n`;
  await assert.rejects(run([first, `${whole.slice(0, 40)}\n\n`, last]), /could not be read/);
  // The same event, whole, is normalised as usual.
  const fine = await run([`${whole}\n\n`]);
  assert.ok(!fine.includes(THOUGHT));
  assert.ok(fine.includes('"content":"ok"'));
});

test("F10: a blank line written with mixed line ends still ends an event", async () => {
  const first = `data: ${chunk([thinking, { type: "text", text: "one" }])}`;
  const second = `data: ${chunk([thinking, { type: "text", text: "two" }])}`;
  for (const separator of ["\n\r\n", "\r\n\n", "\r\n\r\n", "\n\n", "\r\r", "\r\n\r"]) {
    const out = await run([`${first}${separator}${second}\n\n`]);
    assert.ok(!out.includes(THOUGHT), JSON.stringify(separator));
    assert.ok(out.includes('"content":"one"') && out.includes('"content":"two"'), JSON.stringify(separator));
  }
  // The two halves of a line end may arrive in different pieces.
  const split = await run([`${first}\r`, `\n\r`, `\n${second}\n\n`]);
  assert.ok(!split.includes(THOUGHT));
  assert.ok(split.includes('"content":"one"') && split.includes('"content":"two"'));
});

test("F10: reasoning that upstream sends already flattened is hidden unless it is asked for", () => {
  const event = `data: ${chunk("answer", { reasoning_content: THOUGHT })}`;
  const hidden = normalizeSseEvent(event);
  assert.ok(!hidden.includes(THOUGHT));
  assert.ok(hidden.includes('"content":"answer"'));
  assert.ok(normalizeSseEvent(event, { exposeReasoning: true }).includes(THOUGHT));
});

test("F10: a non-streamed answer that is not valid JSON is refused, not passed on", async () => {
  const body = JSON.stringify({ choices: [{ message: { content: [thinking, { type: "text", text: "ok" }] } }] });
  const mock = await startMock((_req, res) => sendJson(res, body.slice(0, body.length - 6)));
  const shim = await startShim(mock.url);
  try {
    const response = await fetch(`${shim.url}/v1/chat/completions`, { method: "POST", headers: { authorization: "Bearer callers-own", "content-type": "application/json" }, body: chatBody() });
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes(THOUGHT));
  } finally {
    await shim.close();
    await mock.close();
  }
});

test("F11: a long event arriving in many pieces is handled in time proportional to its size, and has a limit", async () => {
  // One megabyte with no blank line, in 20,000 pieces: the reviewer's case took 12.7 s.
  const piece = "x".repeat(50);
  const started = Date.now();
  const out = await run([...Array.from({ length: 20_000 }, () => piece), "\n\n"]);
  assert.equal(out.length, 1_000_002);
  assert.ok(Date.now() - started < 4000, `took ${Date.now() - started} ms`);

  // An event with very many data lines: the reviewer's case took 1.9 s for 60,000.
  const lines = Array.from({ length: 60_000 }, () => "data: x").join("\n");
  const began = Date.now();
  normalizeSseEvent(lines);
  assert.ok(Date.now() - began < 1500, `took ${Date.now() - began} ms`);

  // Past the limit the stream is ended with an error; the buffer does not grow without bound.
  const big = "y".repeat(64 * 1024);
  await assert.rejects(run(Array.from({ length: Math.ceil(MAX_SSE_EVENT_CHARS / big.length) + 2 }, () => big)), /size/);
});

// ------------------------------------------------------------------------------------------
// The review of the remediation (docs/review/2026-11-13-review-a2-1d8bafe.md).

test("N3: a carriage return and line feed is one line end; an event written over several such lines stays whole", async () => {
  // A tool call whose data is written over two lines, each ended with CR LF.
  const toolCall = { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "record_hook", arguments: '{"hook":"x"}' } }] } }] };
  const text = JSON.stringify(toolCall);
  const cut = text.indexOf(",") + 1;
  const event = `data: ${text.slice(0, cut)}\r\ndata: ${text.slice(cut)}\r\n\r\n`;
  for (const size of [1, 2, 3, 7, event.length]) {
    const pieces: string[] = [];
    for (let i = 0; i < event.length; i += size) pieces.push(event.slice(i, i + size));
    const out = await run(pieces);
    const data = out.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim());
    assert.equal(data.length, 1, `one data line, in pieces of ${size}`);
    assert.deepEqual(JSON.parse(data[0]!), toolCall, `the tool call arrives as it was sent, in pieces of ${size}`);
  }
  // A line that follows the data stays in the same event.
  const withId = await run([`data: ${chunk([thinking, { type: "text", text: "ok" }])}\r\nid: 7\r\n\r\ndata: [DONE]\r\n\r\n`]);
  const events = withId.split(/\r\n\r\n|\n\n/).filter(Boolean);
  assert.equal(events.length, 2);
  assert.ok(events[0]!.includes('"content":"ok"') && /(^|\n)id: 7$/.test(events[0]!), "the id line is in the event with its data");
  assert.ok(!withId.includes(THOUGHT));
});

test("N8: reasoning is removed at every level it could be sent at", () => {
  const cases: Array<Record<string, unknown>> = [
    { choices: [{ index: 0, reasoning_content: THOUGHT, delta: { content: "a" } }] },
    { reasoning: THOUGHT, choices: [{ index: 0, delta: { content: "a" } }] },
    { reasoning_content: THOUGHT },
    { choices: [{ index: 0, delta: { content: "a", thinking: THOUGHT } }] },
    { choices: [{ index: 0, message: { content: "a", reasoning: THOUGHT } }] },
  ];
  for (const value of cases) {
    const out = normalizeSseEvent(`data: ${JSON.stringify(value)}`);
    assert.ok(!out.includes(THOUGHT), JSON.stringify(value));
    assert.ok(normalizeSseEvent(`data: ${JSON.stringify(value)}`, { exposeReasoning: true }).includes(THOUGHT));
  }
});

test("N8: the same holds for an answer that is not streamed", async () => {
  const body = JSON.stringify({ reasoning: THOUGHT, choices: [{ index: 0, reasoning_content: THOUGHT, message: { content: "ok", thinking: THOUGHT } }] });
  const mock = await startMock((_req, res) => sendJson(res, body));
  const shim = await startShim(mock.url);
  try {
    const response = await fetch(`${shim.url}/v1/chat/completions`, { method: "POST", headers: { authorization: "Bearer callers-own", "content-type": "application/json" }, body: chatBody() });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes(THOUGHT));
    assert.equal(JSON.parse(text).choices[0].message.content, "ok");
  } finally {
    await shim.close();
    await mock.close();
  }
});

test("N9: what is sent on is written out from what was read, so a repeated key carries nothing past", () => {
  // Parsing keeps the last of two keys with the same name. The first holds the reasoning.
  const event = `data: {"choices":[{"index":0,"delta":{"reasoning_content":"${THOUGHT}"}}],"choices":[{"index":0,"delta":{"content":"a"}}]}`;
  const out = normalizeSseEvent(event);
  assert.ok(!out.includes(THOUGHT));
  assert.deepEqual(JSON.parse(out.slice(5)), { choices: [{ index: 0, delta: { content: "a" } }] });
});
