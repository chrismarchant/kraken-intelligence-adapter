// HTTP reverse proxy: OpenAI-compatible client -> Mistral, with response normalisation.
// Entry point: `node src/shim/server.ts` (npm run shim).
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pipeline, Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { pathToFileURL } from "node:url";
import { createSseNormalizer, normalizeChatCompletion } from "./normalize.ts";

export interface ShimConfig {
  host: string;
  port: number;
  upstream: string;
  allowedModels: string[] | null;
  maxBodyBytes: number;
  upstreamTimeoutMs: number;
  exposeReasoning: boolean;
  /** If set, replaces the client's Authorization header upstream. */
  apiKey?: string;
  /** One line per request. Defaults to stderr. Never receives credentials or bodies. */
  log?: (line: string) => void;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ShimConfig {
  const num = (v: string | undefined, d: number): number => {
    const n = v === undefined || v === "" ? NaN : Number(v);
    return Number.isFinite(n) && n >= 0 ? n : d;
  };
  const models = (env["SHIM_ALLOWED_MODELS"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const cfg: ShimConfig = {
    host: env["SHIM_HOST"] || "127.0.0.1",
    port: num(env["SHIM_PORT"], 8787),
    upstream: (env["SHIM_UPSTREAM"] || "https://api.mistral.ai").replace(/\/+$/, ""),
    allowedModels: models.length > 0 ? models : null,
    maxBodyBytes: num(env["SHIM_MAX_BODY_BYTES"], 2 * 1024 * 1024),
    upstreamTimeoutMs: num(env["SHIM_UPSTREAM_TIMEOUT_MS"], 120000),
    exposeReasoning: /^(1|true|yes|on)$/i.test(env["SHIM_EXPOSE_REASONING"] ?? ""),
  };
  if (env["MISTRAL_API_KEY"]) cfg.apiKey = env["MISTRAL_API_KEY"];
  return cfg;
}

const FORWARD_REQUEST_HEADERS = ["content-type", "accept", "user-agent"];
const DROP_RESPONSE_HEADERS = new Set([
  "connection", "keep-alive", "transfer-encoding", "content-length", "content-encoding",
  "upgrade", "proxy-authenticate", "proxy-connection", "te", "trailer", "set-cookie", "set-cookie2",
]);

function sendError(res: ServerResponse, status: number, message: string, type: string): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const body = JSON.stringify({ error: { message, type, code: status } });
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

class BodyTooLarge extends Error {}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > limit) {
      reject(new BodyTooLarge());
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new BodyTooLarge());
        chunks.length = 0;
        req.resume();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function safeToken(v: unknown): string {
  return typeof v === "string" ? v.replace(/[^\w.:\-/]/g, "?").slice(0, 80) : "-";
}

interface Usage { prompt?: number; completion?: number; total?: number }

function pickUsage(v: unknown, into: Usage): void {
  if (typeof v !== "object" || v === null) return;
  const u = (v as Record<string, unknown>)["usage"];
  if (typeof u !== "object" || u === null) return;
  const r = u as Record<string, unknown>;
  if (typeof r["prompt_tokens"] === "number") into.prompt = r["prompt_tokens"];
  if (typeof r["completion_tokens"] === "number") into.completion = r["completion_tokens"];
  if (typeof r["total_tokens"] === "number") into.total = r["total_tokens"];
}

export function createShimServer(config: ShimConfig): http.Server {
  const log = config.log ?? ((line: string) => process.stderr.write(line + "\n"));
  const upstreamBase = config.upstream.replace(/\/+$/, "");

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const started = Date.now();
    const method = req.method ?? "GET";
    let pathname = "-";
    let model = "-";
    let status = 0;
    const usage: Usage = {};
    const abort = new AbortController();
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    const arm = (): void => {
      if (timer) clearTimeout(timer);
      if (config.upstreamTimeoutMs > 0) {
        timer = setTimeout(() => {
          timedOut = true;
          abort.abort();
        }, config.upstreamTimeoutMs);
      }
    };

    res.on("close", () => {
      if (timer) clearTimeout(timer);
      if (!res.writableFinished) abort.abort(); // client went away
      status = res.statusCode;
      const u = usage.total !== undefined ? ` tokens=${usage.prompt ?? "-"}/${usage.completion ?? "-"}/${usage.total}` : "";
      log(`${method} ${pathname} ${status} ${Date.now() - started}ms model=${model}${u}`);
    });

    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://localhost") // base for parsing only; never contacted;
    } catch {
      sendError(res, 400, "Bad request URL", "invalid_request_error");
      return;
    }
    pathname = safeToken(url.pathname);

    if (url.pathname === "/healthz" && method === "GET") {
      const body = '{"ok":true}';
      res.writeHead(200, { "content-type": "application/json", "content-length": body.length });
      res.end(body);
      return;
    }
    if (!url.pathname.startsWith("/v1/") || (req.url ?? "").startsWith("//")) {
      sendError(res, 404, "Not found", "not_found");
      return;
    }

    // Read and (for chat completions) inspect the body.
    let body: Buffer | undefined;
    if (method !== "GET" && method !== "HEAD") {
      try {
        body = await readBody(req, config.maxBodyBytes);
      } catch (e) {
        if (e instanceof BodyTooLarge) sendError(res, 413, "Request body too large", "invalid_request_error");
        else sendError(res, 400, "Could not read request body", "invalid_request_error");
        return;
      }
    }

    const isChat = method === "POST" && url.pathname === "/v1/chat/completions";
    let wantsStream = false;
    if (isChat) {
      let parsed: unknown;
      try {
        parsed = JSON.parse((body ?? Buffer.alloc(0)).toString("utf8"));
      } catch {
        sendError(res, 400, "Request body is not valid JSON", "invalid_request_error");
        return;
      }
      const p = (parsed ?? {}) as Record<string, unknown>;
      model = safeToken(p["model"]);
      wantsStream = p["stream"] === true;
      if (config.allowedModels && (typeof p["model"] !== "string" || !config.allowedModels.includes(p["model"]))) {
        sendError(res, 400, "Model not allowed by shim", "invalid_request_error");
        return;
      }
    }

    // Build upstream request. Egress is limited to the configured upstream origin.
    const headers: Record<string, string> = { "accept-encoding": "identity" };
    for (const h of FORWARD_REQUEST_HEADERS) {
      const v = req.headers[h];
      if (typeof v === "string") headers[h] = v;
    }
    if (config.apiKey) headers["authorization"] = `Bearer ${config.apiKey}`;
    else if (typeof req.headers["authorization"] === "string") headers["authorization"] = req.headers["authorization"];

    arm();
    let up: Response;
    try {
      const init: RequestInit = { method, headers, redirect: "manual", signal: abort.signal };
      if (body !== undefined && body.length > 0) init.body = body;
      up = await fetch(upstreamBase + url.pathname + url.search, init);
    } catch {
      if (timedOut) sendError(res, 504, "Upstream timed out", "upstream_timeout");
      else if (!res.destroyed) sendError(res, 502, "Upstream unreachable", "upstream_error");
      return;
    }

    if (up.status >= 300 && up.status < 400) {
      void up.body?.cancel().catch(() => undefined);
      sendError(res, 502, "Upstream returned a redirect; refused", "upstream_error");
      return;
    }

    const ctype = up.headers.get("content-type") ?? "";
    const outHeaders: Record<string, string> = {};
    up.headers.forEach((v, k) => {
      if (!DROP_RESPONSE_HEADERS.has(k.toLowerCase())) outHeaders[k] = v;
    });

    const normOpts = {
      exposeReasoning: config.exposeReasoning,
      onParsed: (v: unknown) => pickUsage(v, usage),
    };

    // Streamed chat completion: normalise SSE on the fly.
    if (isChat && up.ok && up.body && (ctype.includes("text/event-stream") || wantsStream && !ctype.includes("json"))) {
      res.writeHead(up.status, { ...outHeaders, "cache-control": "no-cache" });
      res.flushHeaders();
      const idle = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, c) {
          arm();
          c.enqueue(chunk);
        },
      });
      const src = Readable.fromWeb(up.body.pipeThrough(idle).pipeThrough(createSseNormalizer(normOpts)) as NodeWebReadableStream);
      pipeline(src, res, () => undefined);
      return;
    }

    // Everything else: buffer for chat (JSON normalise) or stream through unchanged.
    if (isChat && up.ok) {
      let text: string;
      try {
        text = await up.text();
      } catch {
        if (timedOut) sendError(res, 504, "Upstream timed out", "upstream_timeout");
        else if (!res.destroyed) sendError(res, 502, "Upstream read failed", "upstream_error");
        return;
      }
      let out = text;
      try {
        out = JSON.stringify(normalizeChatCompletion(JSON.parse(text) as unknown, normOpts));
      } catch {
        out = text; // not JSON: pass through untouched
      }
      const buf = Buffer.from(out, "utf8");
      res.writeHead(up.status, { ...outHeaders, "content-length": buf.length });
      res.end(buf);
      return;
    }

    res.writeHead(up.status, outHeaders);
    if (!up.body || method === "HEAD") {
      res.end();
      return;
    }
    const idle = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, c) {
        arm();
        c.enqueue(chunk);
      },
    });
    pipeline(Readable.fromWeb(up.body.pipeThrough(idle) as NodeWebReadableStream), res, () => undefined);
  }

  return http.createServer((req, res) => {
    handle(req, res).catch(() => {
      sendError(res, 500, "Internal shim error", "shim_error");
    });
  });
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const cfg = loadConfig();
  const server = createShimServer(cfg);
  server.listen(cfg.port, cfg.host, () => {
    const a = server.address();
    const port = typeof a === "object" && a ? a.port : cfg.port;
    process.stderr.write(
      `shim listening on http://${cfg.host}:${port} upstream=${cfg.upstream} ` +
        `models=${cfg.allowedModels?.join(",") ?? "any"} reasoning=${cfg.exposeReasoning ? "exposed" : "dropped"} ` +
        `key=${cfg.apiKey ? "env" : "client"}\n`,
    );
  });
}
