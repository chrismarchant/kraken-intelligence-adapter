// Manual: NODE_USE_ENV_PROXY=1 node tests/shim/capture.ts
// Records raw Mistral responses (body only, no headers, no key) as fixtures.
import { writeFileSync } from "node:fs";

const tool = {
  type: "function",
  function: {
    name: "record_hook",
    description: "record a hook",
    parameters: { type: "object", properties: { hook: { type: "string" } }, required: ["hook"] },
  },
};
const plain = { model: "mistral-large-4", max_tokens: 2000, messages: [{ role: "user", content: "Reply with one short sentence about data quality, including the word café." }] };
const withTool = { model: "mistral-large-4", max_tokens: 2000, tools: [tool], tool_choice: "any", messages: [{ role: "user", content: "Use the tool to record one LinkedIn hook about data quality." }] };

const out = new URL("../../fixtures/shim/", import.meta.url);
async function cap(name: string, body: object, stream: boolean): Promise<void> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer proxy-injected" },
    body: JSON.stringify({ ...body, stream, ...(stream ? { stream_options: { include_usage: true } } : {}) }),
  });
  const text = await res.text();
  console.log(name, res.status, res.headers.get("content-type"), text.length);
  if (res.ok) writeFileSync(new URL(name, out), text);
}
await cap("nonstream-plain.json", plain, false);
await cap("nonstream-tool.json", withTool, false);
await cap("stream-plain.sse", plain, true);
await cap("stream-tool.sse", withTool, true);
