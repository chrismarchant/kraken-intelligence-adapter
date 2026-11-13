import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { z } from "zod";
import { FallbackGateway, FixtureGateway, FixtureMissingError, RecordingGateway } from "../../src/gateway/fixture.ts";
import { ModelCallError, ModelOutputError, parseJsonAnswer } from "../../src/gateway/gateway.ts";
import { MAX_TOKEN_FACTOR, costOf } from "../../src/gateway/gateway.ts";
import { MistralGateway, checkedBaseUrl, messageText } from "../../src/gateway/mistral.ts";

const Answer = z.strictObject({ theme: z.string(), score: z.number() });
const request = { purpose: "test-step", system: "sys", user: "user", schema: Answer, schemaName: "answer", maxTokens: 1000 };
const usage = { prompt_tokens: 10, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 40 } };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function sse(events: unknown[]): Response {
  const text = `${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")}data: [DONE]\n\n`;
  const bytes = new TextEncoder().encode(text);
  // Deliver in small pieces so that events and multi-byte characters are split across chunks.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** A fetch double that replies from a queue and records what it was sent. */
function fakeFetch(replies: Array<() => Response | Promise<Response>>) {
  const bodies: Array<Record<string, unknown>> = [];
  const headers: Array<Record<string, string>> = [];
  const impl = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    headers.push(init?.headers as Record<string, string>);
    const next = replies.shift();
    if (!next) throw new Error("no reply scripted");
    return next();
  }) as typeof fetch;
  return { impl, bodies, headers };
}

const gateway = (fetchImpl: typeof fetch, extra = {}) => new MistralGateway({ fetch: fetchImpl, backoffMs: 1, apiKey: "placeholder", ...extra });
const completion = (content: unknown, finish = "stop") => ({ model: "mistral-large-4", choices: [{ finish_reason: finish, message: { content } }], usage });

test("message text is taken from text blocks only, never from reasoning", () => {
  assert.equal(messageText("plain"), "plain");
  assert.equal(messageText(null), "");
  assert.equal(
    messageText([{ type: "thinking", thinking: [{ type: "text", text: "secret reasoning" }] } as never, { type: "text", text: "{\"a\":" }, { type: "text", text: "1}" }]),
    '{"a":1}',
  );
});

test("a JSON answer is parsed from plain text, a fenced block or surrounding prose", () => {
  assert.deepEqual(parseJsonAnswer('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJsonAnswer('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonAnswer('Here it is: {"a":1} — done'), { a: 1 });
  assert.throws(() => parseJsonAnswer("no json here"));
});

test("a block-structured answer is accepted and usage is reported", async () => {
  const { impl, bodies, headers } = fakeFetch([
    () => json(completion([{ type: "thinking", thinking: [{ type: "text", text: "hmm" }] }, { type: "text", text: '{"theme":"reports","score":3}' }])),
  ]);
  const result = await gateway(impl).generateJson(request);
  assert.deepEqual(result.value, { theme: "reports", score: 3 });
  assert.deepEqual(result.usage, { promptTokens: 10, completionTokens: 50, reasoningTokens: 40 });
  assert.equal(result.source, "live");
  assert.equal(bodies[0]!.stream, true);
  assert.equal((bodies[0]!.response_format as { type: string }).type, "json_schema");
  assert.equal(headers[0]!.authorization, "Bearer placeholder");
});

test("a streamed answer is assembled across chunk boundaries and reasoning chunks are dropped", async () => {
  const { impl } = fakeFetch([
    () =>
      sse([
        { model: "mistral-large-4", choices: [{ delta: { role: "assistant", content: "" } }] },
        { choices: [{ delta: { content: [{ type: "thinking", thinking: [{ type: "text", text: "réflexion — not an answer" }] }] } }] },
        { choices: [{ delta: { content: '{"theme":"café ' } }] },
        { choices: [{ delta: { content: 'reports","score":4}' } }] },
        { choices: [{ delta: { content: "" }, finish_reason: "stop" }], usage },
      ]),
  ]);
  const result = await gateway(impl).generateJson(request);
  assert.deepEqual(result.value, { theme: "café reports", score: 4 });
  assert.equal(result.usage.reasoningTokens, 40);
});

test("a cut-off answer is retried with twice the budget", async () => {
  const { impl, bodies } = fakeFetch([() => json(completion("", "length")), () => json(completion('{"theme":"t","score":1}'))]);
  const result = await gateway(impl).generateJson(request);
  assert.equal(result.value.theme, "t");
  assert.deepEqual(bodies.map((b) => b.max_tokens), [1000, 2000]);
  assert.equal(result.usage.completionTokens, 100, "tokens from both attempts are counted");
});

test("malformed or off-schema output is corrected once, then refused", async () => {
  const good = fakeFetch([() => json(completion("not json")), () => json(completion('{"theme":"t","score":1}'))]);
  assert.equal((await gateway(good.impl).generateJson(request)).value.score, 1);
  assert.equal((good.bodies[1]!.messages as unknown[]).length, 3, "the correction is sent as a further message");

  const bad = fakeFetch([
    () => json(completion('{"theme":"t","score":"high"}')),
    () => json(completion('{"theme":"t","score":"high","extra":1}')),
    () => json(completion('{"theme":"t"}')),
  ]);
  await assert.rejects(gateway(bad.impl).generateJson(request), ModelOutputError);
  assert.equal(bad.bodies.length, 2, "one correction, then the call fails");
});

test("transient failures are retried; a client error is not", async () => {
  const flaky = fakeFetch([() => new Response("upstream request failed", { status: 502 }), () => new Response("slow down", { status: 429 }), () => json(completion('{"theme":"t","score":1}'))]);
  assert.equal((await gateway(flaky.impl).generateJson(request)).value.theme, "t");
  assert.equal(flaky.bodies.length, 3);

  const dropped = fakeFetch([
    () => {
      throw new TypeError("fetch failed");
    },
    () => json(completion('{"theme":"t","score":1}')),
  ]);
  assert.equal((await gateway(dropped.impl).generateJson(request)).value.theme, "t");

  const refused = fakeFetch([() => new Response('{"message":"bad request echoing the prompt: user"}', { status: 400 })]);
  await assert.rejects(gateway(refused.impl).generateJson(request), (error: unknown) => {
    assert.ok(error instanceof ModelCallError);
    assert.equal(error.status, 400);
    assert.ok(!error.message.includes("echoing"), "the response body is not copied into the error");
    return true;
  });
  assert.equal(refused.bodies.length, 1);

  const down = fakeFetch(Array.from({ length: 6 }, () => () => new Response("x", { status: 503 })));
  await assert.rejects(gateway(down.impl).generateJson(request), (error: unknown) => error instanceof ModelCallError && error.status === 503);
  assert.equal(down.bodies.length, 3, "retries stop when the call's token allowance is used up");
});

test("recorded output replays exactly, a missing recording is an error, and a stale one is refused", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kic-fixtures-"));
  const live = fakeFetch([() => json(completion('{"theme":"recorded","score":2}'))]);
  const recorded = await new RecordingGateway(gateway(live.impl), dir).generateJson(request);
  assert.equal(readdirSync(dir).length, 1);

  const replayed = await new FixtureGateway(dir).generateJson(request);
  assert.deepEqual(replayed.value, recorded.value);
  assert.equal(replayed.source, "fixture");

  await assert.rejects(new FixtureGateway(dir).generateJson({ ...request, user: "a different prompt" }), FixtureMissingError);
  const Stricter = z.strictObject({ theme: z.string(), score: z.number(), required: z.string() });
  await assert.rejects(new FixtureGateway(dir).generateJson({ ...request, schema: Stricter }), ModelOutputError);

  const fallback = fakeFetch([() => json(completion('{"theme":"fresh","score":9}'))]);
  const combined = new FallbackGateway(new FixtureGateway(dir), gateway(fallback.impl));
  assert.equal((await combined.generateJson(request)).source, "fixture");
  assert.equal((await combined.generateJson({ ...request, user: "a different prompt" })).value.theme, "fresh");
  assert.deepEqual(combined.missed, ["test-step"]);
});

test("what a failed call cost is carried on the error, and provider requests are counted and capped", async () => {
  const ok = fakeFetch([() => new Response("x", { status: 502 }), () => json(completion('{"theme":"t","score":1}'))]);
  assert.equal((await gateway(ok.impl).generateJson(request)).providerRequests, 2, "the retry is counted");

  // Two off-schema answers: the call fails, having spent two requests and their tokens.
  const bad = fakeFetch(Array.from({ length: 3 }, () => () => json(completion('{"theme":"t"}'))));
  const failure = await gateway(bad.impl).generateJson(request).then(
    () => null,
    (error: unknown) => error,
  );
  assert.ok(failure instanceof ModelOutputError);
  assert.deepEqual(costOf(failure), { usage: { promptTokens: 20, completionTokens: 100, reasoningTokens: 80 }, providerRequests: 2 });

  // However retries combine, one call never sends more than the cap.
  const storm = fakeFetch(Array.from({ length: 20 }, () => () => new Response("x", { status: 503 })));
  await assert.rejects(gateway(storm.impl, { maxProviderRequests: 3, transientAttempts: 10 }).generateJson(request), /limit of 3 provider requests/);
  assert.equal(storm.bodies.length, 3);
  assert.deepEqual(costOf(new Error("unrelated")).providerRequests, 0);
});

test("a cancelled call stops at once and is not retried", async () => {
  const controller = new AbortController();
  let calls = 0;
  const impl = ((_url: unknown, init?: RequestInit) => {
    calls += 1;
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  }) as typeof fetch;
  const pending = gateway(impl).generateJson({ ...request, signal: controller.signal });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending, (error: unknown) => error instanceof ModelCallError && /cancelled/.test(error.message) && costOf(error).providerRequests === 1);
  assert.equal(calls, 1, "no retry after cancellation");
});

test("the model endpoint must be https, or http on loopback, and carry no credentials", () => {
  assert.equal(checkedBaseUrl("https://api.mistral.ai/v1/"), "https://api.mistral.ai/v1");
  assert.equal(checkedBaseUrl("http://127.0.0.1:8787/v1"), "http://127.0.0.1:8787/v1");
  assert.equal(checkedBaseUrl("http://localhost:8787/v1"), "http://localhost:8787/v1");
  for (const bad of ["http://models.example/v1", "ftp://127.0.0.1/v1", "not a url", "https://user:pass@api.mistral.ai/v1"]) {
    assert.throws(() => checkedBaseUrl(bad), /model base URL/, bad);
  }
  assert.throws(() => new MistralGateway({ baseUrl: "http://models.example/v1" }), /https/);
});

test("all attempts of one call together never exceed three times its token allowance", async () => {
  // Every answer is cut off. The call tries once at its allowance, once at double, and stops.
  const always = fakeFetch(Array.from({ length: 10 }, () => () => json(completion("", "length"))));
  await assert.rejects(gateway(always.impl, { retries: 5 }).generateJson(request), /cut off/);
  const budgets = always.bodies.map((b) => b.max_tokens as number);
  assert.deepEqual(budgets, [1000, 2000]);
  assert.ok(budgets.reduce((a, b) => a + b, 0) <= MAX_TOKEN_FACTOR * request.maxTokens);

  // Corrections do not escape the limit either, however many retries are configured.
  const wrong = fakeFetch(Array.from({ length: 10 }, () => () => json(completion("not json"))));
  await assert.rejects(gateway(wrong.impl, { retries: 9 }).generateJson(request), ModelOutputError);
  assert.equal(wrong.bodies.length, 3);
  assert.ok(wrong.bodies.reduce((sum, b) => sum + (b.max_tokens as number), 0) <= MAX_TOKEN_FACTOR * request.maxTokens);
});

test("requests that report no usage are charged at their allowance, and count against the call's limit", async () => {
  // The reviewer's point: a stream that breaks off, a dropped connection or a gateway error
  // may follow real generation that is never reported.
  const broken = () => new Response(new ReadableStream({ start: (c) => c.error(new Error("reset")) }), { status: 200, headers: { "content-type": "text/event-stream" } });
  const flaky = fakeFetch([
    broken,
    () => {
      throw new TypeError("fetch failed");
    },
    () => json(completion('{"theme":"t","score":1}')),
  ]);
  const result = await gateway(flaky.impl).generateJson(request);
  assert.equal(result.providerRequests, 3);
  assert.equal(result.usage.completionTokens, 1000 + 1000 + 50, "two unreported requests at 1000 each, plus the reported one");

  // Every request, failed or not, draws on the same allowance: three at 1000, then no more.
  const dead = fakeFetch(Array.from({ length: 10 }, () => broken));
  const failure = await gateway(dead.impl, { transientAttempts: 10, maxProviderRequests: 10 }).generateJson(request).then(() => null, (e: unknown) => e);
  assert.ok(failure instanceof ModelCallError);
  assert.equal(dead.bodies.length, 3);
  assert.equal(costOf(failure).usage.completionTokens, 3000);
  assert.ok(costOf(failure).usage.completionTokens <= MAX_TOKEN_FACTOR * request.maxTokens);

  // A refusal by the provider (4xx) generated nothing: it is neither charged nor counted against the allowance.
  const refused = fakeFetch([() => new Response("{}", { status: 400 })]);
  const refusal = await gateway(refused.impl).generateJson(request).then(() => null, (e: unknown) => e);
  assert.equal(costOf(refusal).usage.completionTokens, 0);
});
