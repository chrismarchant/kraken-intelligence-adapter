// Test helpers (not a test file): fixture loading, mock upstream, SSE parsing.
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { createShimServer } from "../../src/shim/server.ts";
import type { ShimConfig } from "../../src/shim/server.ts";

export function fixture(name: string): string {
  return readFileSync(new URL(`../../fixtures/shim/${name}`, import.meta.url), "utf8");
}

export interface Recorded { method: string; url: string; headers: http.IncomingHttpHeaders; body: string }

export interface Mock {
  url: string;
  requests: Recorded[];
  close: () => Promise<void>;
}

export async function startMock(handler: (req: IncomingMessage, res: ServerResponse, rec: Recorded) => void): Promise<Mock> {
  const requests: Recorded[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const rec: Recorded = { method: req.method ?? "", url: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString("utf8") };
      requests.push(rec);
      handler(req, res, rec);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}

export function sendJson(res: ServerResponse, text: string, status = 200): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(text);
}

/** Write an SSE body in small byte slices so chunk boundaries fall anywhere. */
export async function sendSse(res: ServerResponse, text: string, sliceBytes: number): Promise<void> {
  res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
  const buf = Buffer.from(text, "utf8");
  for (let i = 0; i < buf.length; i += sliceBytes) {
    res.write(buf.subarray(i, i + sliceBytes));
    await new Promise((r) => setImmediate(r));
  }
  res.end();
}

export interface Shim { url: string; logs: string[]; close: () => Promise<void> }

export async function startShim(upstream: string, over: Partial<ShimConfig> = {}): Promise<Shim> {
  const logs: string[] = [];
  const server = createShimServer({
    host: "127.0.0.1",
    port: 0,
    upstream,
    allowedModels: null,
    maxBodyBytes: 2 * 1024 * 1024,
    upstreamTimeoutMs: 5000,
    exposeReasoning: false,
    log: (l) => logs.push(l),
    ...over,
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    logs,
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}

export interface SseChunk { raw: string; json?: Record<string, any> }

export function parseSse(text: string): SseChunk[] {
  return text
    .split(/\n\n/)
    .filter((e) => e.trim() !== "")
    .map((raw) => {
      const line = raw.split("\n").find((l) => l.startsWith("data:"));
      const payload = line?.slice(5).trim();
      if (payload && payload !== "[DONE]") {
        try { return { raw, json: JSON.parse(payload) }; } catch { /* fallthrough */ }
      }
      return { raw };
    });
}

export function streamText(chunks: SseChunk[]): string {
  return chunks.map((c) => c.json?.choices?.[0]?.delta?.content ?? "").filter((x) => typeof x === "string").join("");
}

export const chatBody = (extra: object = {}): string =>
  JSON.stringify({ model: "mistral-large-4", messages: [{ role: "user", content: "hi" }], ...extra });
