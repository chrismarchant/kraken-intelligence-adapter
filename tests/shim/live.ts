// Manual live verification (NOT part of `npm test`).
//   NODE_USE_ENV_PROXY=1 node tests/shim/live.ts
// Env: OPENBOT_SERVER_DIR (path whose node_modules provides @copilotkit/runtime/v2 -> @ai-sdk/openai, ai)
//      LIVE_MODEL (default mistral-large-4). Auth: the session proxy injects the real key;
//      this script only ever sends the literal placeholder "proxy-injected".
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { createShimServer } from "../../src/shim/server.ts";

const MODEL = process.env["LIVE_MODEL"] ?? "mistral-large-4";
const OPENBOT_DIR =
  process.env["OPENBOT_SERVER_DIR"] ??
  "/tmp/claude-0/-home-user-kraken-intelligence-adapter/7f983aaa-ebce-54b6-b1bf-d0a292850218/scratchpad/openbot/src/server";
const KEY = "proxy-injected";

const results: string[] = [];
function report(id: string, status: "PASS" | "FAIL" | "SKIP", detail: string): void {
  const line = `${status} ${id}: ${detail}`;
  results.push(line);
  console.log(line);
}
const short = (s: unknown): string => String(s).replace(/\s+/g, " ").slice(0, 160);

const logs: string[] = [];
const server = createShimServer({
  host: "127.0.0.1", port: 0, upstream: "https://api.mistral.ai", allowedModels: [MODEL],
  maxBodyBytes: 2 * 1024 * 1024, upstreamTimeoutMs: 120000, exposeReasoning: false,
  log: (l) => logs.push(l),
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const shimBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
const hdr = { "content-type": "application/json", authorization: `Bearer ${KEY}` };
const toolDef = { type: "function", function: { name: "record_hook", description: "record a hook", parameters: { type: "object", properties: { hook: { type: "string" } }, required: ["hook"] } } };

async function rawCase(id: string, fn: () => Promise<string>): Promise<void> {
  try { report(id, "PASS", await fn()); } catch (e) { report(id, "FAIL", short((e as Error).message)); }
}

await rawCase("a raw fetch non-stream", async () => {
  const r = await fetch(`${shimBase}/chat/completions`, { method: "POST", headers: hdr, body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: "user", content: "Say hello in five words." }] }) });
  const j = (await r.json()) as any;
  if (r.status !== 200 || typeof j.choices?.[0]?.message?.content !== "string" || !j.choices[0].message.content) throw new Error(`status ${r.status} content ${typeof j.choices?.[0]?.message?.content}`);
  return `content is string: ${short(j.choices[0].message.content)}`;
});

await rawCase("b raw fetch stream", async () => {
  const r = await fetch(`${shimBase}/chat/completions`, { method: "POST", headers: hdr, body: JSON.stringify({ model: MODEL, max_tokens: 2000, stream: true, stream_options: { include_usage: true }, messages: [{ role: "user", content: "Say hello in five words." }] }) });
  const t = await r.text();
  let text = ""; let usage = false; let done = false;
  for (const ev of t.split("\n\n")) {
    const line = ev.split("\n").find((l) => l.startsWith("data:"));
    if (!line) continue;
    const p = line.slice(5).trim();
    if (p === "[DONE]") { done = true; continue; }
    const j = JSON.parse(p);
    const d = j.choices?.[0]?.delta;
    if (d && "content" in d && typeof d.content !== "string") throw new Error("non-string delta.content");
    text += d?.content ?? "";
    if (j.usage) usage = true;
  }
  if (r.status !== 200 || !text || !done) throw new Error(`status ${r.status} text=${text.length} done=${done}`);
  return `all deltas strings, usage chunk=${usage}, text: ${short(text)}`;
});

await rawCase("c raw fetch tool call", async () => {
  for (const stream of [false, true]) {
    const r = await fetch(`${shimBase}/chat/completions`, { method: "POST", headers: hdr, body: JSON.stringify({ model: MODEL, max_tokens: 2000, stream, tool_choice: "any", tools: [toolDef], messages: [{ role: "user", content: "Use the tool to record one LinkedIn hook about data quality." }] }) });
    const t = await r.text();
    if (r.status !== 200 || !t.includes("record_hook") || t.includes('"thinking"')) throw new Error(`stream=${stream} status ${r.status}`);
    if (!stream) { const j = JSON.parse(t); if (j.choices[0].message.tool_calls?.[0]?.function?.name !== "record_hook" || typeof j.choices[0].message.content !== "string") throw new Error("bad non-stream tool shape"); }
  }
  return "tool_calls preserved, no thinking blocks (non-stream and stream)";
});

// d-f: the exact client OpenBot uses.
let ai: any; let sdk: any;
if (existsSync(OPENBOT_DIR + "/node_modules/@copilotkit")) {
  try {
    const r = createRequire(OPENBOT_DIR + "/");
    const rr = createRequire(r.resolve("@copilotkit/runtime/v2"));
    const { createOpenAI } = await import(rr.resolve("@ai-sdk/openai"));
    sdk = await import(rr.resolve("ai"));
    ai = createOpenAI;
  } catch (e) {
    report("d-f client resolution", "SKIP", `could not load client under ${process.release.name}: ${short((e as Error).message)}`);
  }
} else {
  report("d-f client resolution", "SKIP", `OpenBot checkout not found at ${OPENBOT_DIR}`);
}

if (ai) {
  const { generateText, streamText, tool, jsonSchema } = sdk;
  const mkTools = (calls: string[]) => ({
    record_hook: tool({
      description: "record a hook",
      inputSchema: jsonSchema({ type: "object", properties: { hook: { type: "string" } }, required: ["hook"] }),
      execute: async (a: any) => { calls.push(String(a.hook)); return { saved: true, len: String(a.hook).length }; },
    }),
  });
  const stop = (s: any) => s.steps.length >= 3;
  const toolPrompt = "Use the tool to record one LinkedIn hook about data quality, then reply DONE.";

  const dCase = async (id: string, base: string, key: string) => {
    const calls: string[] = [];
    const client = ai({ baseURL: base, apiKey: key });
    const res = await generateText({ model: client.chat(MODEL), maxOutputTokens: 3000, prompt: toolPrompt, tools: mkTools(calls), stopWhen: stop });
    if (calls.length < 1) throw new Error("tool not executed");
    return `steps=${res.steps.length} toolExecuted=${calls.length} text=${short(JSON.stringify(res.text))}`;
  };

  try { report("d generateText + tool via shim", "PASS", await dCase("d", shimBase, KEY)); } catch (e) { report("d generateText + tool via shim", "FAIL", short((e as Error).message)); }

  try {
    const client = ai({ baseURL: shimBase, apiKey: KEY });
    const res = streamText({ model: client.chat(MODEL), maxOutputTokens: 3000, prompt: "Reply with one short sentence about data quality." });
    let text = ""; for await (const t of res.textStream) text += t;
    if (!text.trim()) throw new Error("empty streamed text");
    report("e streamText plain via shim", "PASS", `text=${short(JSON.stringify(text))}`);
  } catch (e) { report("e streamText plain via shim", "FAIL", short((e as Error).message)); }

  try {
    const calls: string[] = [];
    const client = ai({ baseURL: shimBase, apiKey: KEY });
    const res = streamText({ model: client.chat(MODEL), maxOutputTokens: 3000, prompt: toolPrompt, tools: mkTools(calls), stopWhen: stop });
    let text = ""; for await (const t of res.textStream) text += t;
    const steps = await res.steps;
    if (calls.length < 1) throw new Error("tool not executed");
    if (!text.trim()) throw new Error("no final answer text");
    report("f streamText + tool exec + final answer via shim", "PASS", `steps=${steps.length} toolExecuted=${calls.length} text=${short(JSON.stringify(text))}`);
  } catch (e) { report("f streamText + tool exec + final answer via shim", "FAIL", short((e as Error).message)); }

  // Control: same client, no shim. Expected to FAIL (this proves the shim is what fixes it).
  try {
    const d = await dCase("control", "https://api.mistral.ai/v1", KEY);
    report("control d WITHOUT shim (expected FAIL)", "PASS", `unexpectedly succeeded: ${d}`);
  } catch (e) { report("control d WITHOUT shim (expected FAIL)", "FAIL", `failed as expected: ${short((e as Error).message)}`); }
}

console.log(`\nruntime: ${process.release.name} ${process.version}; shim request log lines: ${logs.length}`);
for (const l of logs) console.log("  shim:", l);
server.closeAllConnections();
server.close();
if (results.some((l) => l.startsWith("FAIL") && !l.includes("(expected FAIL)"))) process.exitCode = 1;
