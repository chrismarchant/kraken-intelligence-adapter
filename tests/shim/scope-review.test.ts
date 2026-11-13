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

test("F10: an event that cannot be read is dropped, not passed on with its reasoning", async () => {
  const whole = `data: ${chunk([thinking, { type: "text", text: "ok" }])}`;
  // Cut off before its end, with no blank line after it: a stream that broke off.
  const cut = await run([whole.slice(0, whole.length - 9)]);
  assert.ok(!cut.includes(THOUGHT), "the reasoning does not get through");
  assert.equal(cut, DROPPED_EVENT);
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
