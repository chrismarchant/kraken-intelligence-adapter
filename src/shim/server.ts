// HTTP reverse proxy: OpenAI-compatible client -> Mistral, with response normalisation.
// Entry point: `node src/shim/server.ts` (npm run shim).
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { pipeline, Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { pathToFileURL } from "node:url";
import { DEFAULT_LIMITS, LimitExceededError } from "../limits.ts";
import { FileSpendLedger } from "../workflow/spend.ts";
import { createSseNormalizer, normalizeChatCompletion } from "./normalize.ts";

export interface ShimConfig {
  host: string;
  port: number;
  upstream: string;
  allowedModels: string[] | null;
  maxBodyBytes: number;
  upstreamTimeoutMs: number;
  exposeReasoning: boolean;
  /** Key injection mode: replaces the client's Authorization header upstream. Requires clientToken. */
  apiKey?: string;
  /** If set, every /v1/* request must present `Authorization: Bearer <clientToken>`; it is never forwarded. */
  clientToken?: string;
  /** Extra Host header names accepted besides loopback names and `host`. */
  allowedHosts?: string[];
  /** One line per request. Defaults to stderr. Never receives credentials or bodies. */
  log?: (line: string) => void;
  /**
   * Key injection mode only: whoever holds the client token spends the provider key, so what
   * one request may ask for, how many run at once and how much may be spent in total are
   * limited here. In pass-through mode the caller spends its own key and none of this applies.
   */
  /** The most completion tokens one request may ask for. A request that names none is given this. Default 32,000. */
  maxTokensPerRequest?: number;
  /** Requests in flight at once. Default 8. */
  maxConcurrent?: number;
  /** A ceiling on everything spent through this shim, kept in a file that survives restarts. */
  spend?: { file: string; maxRequests: number; maxCompletionTokens: number };
}

const DEFAULT_MAX_TOKENS_PER_REQUEST = 32_000;
const DEFAULT_MAX_CONCURRENT = 8;

const LOOPBACK_NAMES = ["127.0.0.1", "::1", "localhost"];
const MIN_TOKEN_LENGTH = 24;

function bareHost(h: string): string {
  const t = h.trim().toLowerCase();
  return t.startsWith("[") && t.endsWith("]") ? t.slice(1, -1) : t;
}

export function isLoopbackHost(h: string): boolean {
  return LOOPBACK_NAMES.includes(bareHost(h));
}

/** Auth-mode rules shared by loadConfig and createShimServer. Messages never contain secret values. */
function checkAuthRules(c: { host: string; apiKey?: string; clientToken?: string }): void {
  if (c.clientToken !== undefined) {
    if (c.clientToken.length < MIN_TOKEN_LENGTH || /\s/.test(c.clientToken)) {
      throw new Error(`SHIM_CLIENT_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters with no whitespace`);
    }
    if (!c.apiKey) {
      throw new Error("SHIM_CLIENT_TOKEN is set but MISTRAL_API_KEY is not: with no injected key there is no provider credential to forward in its place. Set MISTRAL_API_KEY as well, or unset SHIM_CLIENT_TOKEN to run in pass-through mode");
    }
  }
  if (c.apiKey && c.clientToken === undefined) {
    throw new Error("MISTRAL_API_KEY is set (key injection mode): SHIM_CLIENT_TOKEN is required so that not every caller can spend the key");
  }
  if (!isLoopbackHost(c.host) && c.clientToken === undefined) {
    throw new Error("SHIM_HOST is not a loopback address: SHIM_CLIENT_TOKEN is required");
  }
}

function strictInt(name: string, v: string | undefined, d: number, min: number, max: number): number {
  if (v === undefined || v === "") return d;
  if (!/^\d+$/.test(v.trim())) throw new Error(`${name} must be a non-negative integer`);
  const n = Number(v.trim());
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return n;
}

function checkUpstream(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("SHIM_UPSTREAM is not a valid URL");
  }
  if (u.username || u.password) throw new Error("SHIM_UPSTREAM must not contain credentials");
  if (u.protocol === "https:" || (u.protocol === "http:" && isLoopbackHost(u.hostname))) return raw.replace(/\/+$/, "");
  throw new Error("SHIM_UPSTREAM must be an https: URL (http: is allowed only for a loopback host)");
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ShimConfig {
  const list = (v: string | undefined): string[] => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const models = list(env["SHIM_ALLOWED_MODELS"]);
  const cfg: ShimConfig = {
    host: env["SHIM_HOST"] || "127.0.0.1",
    port: strictInt("SHIM_PORT", env["SHIM_PORT"], 8787, 0, 65535),
    upstream: checkUpstream(env["SHIM_UPSTREAM"] || "https://api.mistral.ai"),
    allowedModels: models.length > 0 ? models : null,
    maxBodyBytes: strictInt("SHIM_MAX_BODY_BYTES", env["SHIM_MAX_BODY_BYTES"], 2 * 1024 * 1024, 1, Number.MAX_SAFE_INTEGER),
    upstreamTimeoutMs: strictInt("SHIM_UPSTREAM_TIMEOUT_MS", env["SHIM_UPSTREAM_TIMEOUT_MS"], 120000, 1, Number.MAX_SAFE_INTEGER),
    exposeReasoning: /^(1|true|yes|on)$/i.test(env["SHIM_EXPOSE_REASONING"] ?? ""),
    allowedHosts: list(env["SHIM_ALLOWED_HOSTS"]).map(bareHost),
  };
  if (env["MISTRAL_API_KEY"]) cfg.apiKey = env["MISTRAL_API_KEY"];
  if (env["SHIM_CLIENT_TOKEN"]) cfg.clientToken = env["SHIM_CLIENT_TOKEN"];
  checkAuthRules(cfg);
  if (cfg.apiKey) {
    // Key injection: the holder of the client token spends the provider key. The process refuses
    // to start unless that spending is bounded, or the operator says in so many words that it need not be.
    cfg.maxTokensPerRequest = strictInt("SHIM_MAX_TOKENS_PER_REQUEST", env["SHIM_MAX_TOKENS_PER_REQUEST"], DEFAULT_MAX_TOKENS_PER_REQUEST, 1, 1_000_000);
    cfg.maxConcurrent = strictInt("SHIM_MAX_CONCURRENT", env["SHIM_MAX_CONCURRENT"], DEFAULT_MAX_CONCURRENT, 1, 1024);
    if (cfg.allowedModels === null) throw new Error("MISTRAL_API_KEY is set (key injection mode): SHIM_ALLOWED_MODELS is required, so that the key cannot be spent on any model it can reach");
    const ceiling = [env["SHIM_SPEND_FILE"], env["SHIM_MAX_TOTAL_REQUESTS"], env["SHIM_MAX_TOTAL_COMPLETION_TOKENS"]];
    if (ceiling.every((v) => v !== undefined && v !== "")) {
      cfg.spend = {
        file: ceiling[0] as string,
        maxRequests: strictInt("SHIM_MAX_TOTAL_REQUESTS", ceiling[1], 0, 1, Number.MAX_SAFE_INTEGER),
        maxCompletionTokens: strictInt("SHIM_MAX_TOTAL_COMPLETION_TOKENS", ceiling[2], 0, 1, Number.MAX_SAFE_INTEGER),
      };
      if (!cfg.spend.file.startsWith("/")) throw new Error("SHIM_SPEND_FILE must be an absolute path");
    } else if (ceiling.some((v) => v !== undefined && v !== "")) {
      throw new Error("Set all of SHIM_SPEND_FILE, SHIM_MAX_TOTAL_REQUESTS and SHIM_MAX_TOTAL_COMPLETION_TOKENS, or none");
    } else if (env["SHIM_ALLOW_UNLIMITED"] !== "1") {
      throw new Error(
        "MISTRAL_API_KEY is set (key injection mode): set a spend ceiling with SHIM_SPEND_FILE, SHIM_MAX_TOTAL_REQUESTS and SHIM_MAX_TOTAL_COMPLETION_TOKENS, " +
          "or set SHIM_ALLOW_UNLIMITED=1 to run without one (then the provider must limit the key)",
      );
    }
  }
  return cfg;
}

type Route = { kind: "chat" } | { kind: "models" } | { kind: "wrong-method"; allow: string } | { kind: "none" };

/** Fixed allowlist of forwardable requests. Everything else is refused before any upstream call. */
function route(method: string, pathname: string): Route {
  if (pathname === "/v1/chat/completions") return method === "POST" ? { kind: "chat" } : { kind: "wrong-method", allow: "POST" };
  if (pathname === "/v1/models" || (pathname.startsWith("/v1/models/") && /^[A-Za-z0-9._:-]{1,128}$/.test(pathname.slice("/v1/models/".length)))) {
    return method === "GET" ? { kind: "models" } : { kind: "wrong-method", allow: "GET" };
  }
  return { kind: "none" };
}

const sha256 = (v: string): Buffer => createHash("sha256").update(v, "utf8").digest();

type AuthState = "ok" | "missing" | "bad" | "none";

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
  checkAuthRules(config);
  const log = config.log ?? ((line: string) => process.stderr.write(line + "\n"));
  const upstreamBase = config.upstream.replace(/\/+$/, "");
  const hostAllow = new Set([...LOOPBACK_NAMES, bareHost(config.host), ...(config.allowedHosts ?? []).map(bareHost)]);
  const tokenHash = config.clientToken !== undefined ? sha256(config.clientToken) : undefined;
  // Spending limits, key injection mode only.
  const limited = config.apiKey !== undefined;
  const perRequest = config.maxTokensPerRequest ?? DEFAULT_MAX_TOKENS_PER_REQUEST;
  const maxConcurrent = config.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  const account = limited && config.spend ? new FileSpendLedger(config.spend.file) : null;
  const ceilings = config.spend
    ? {
        ...DEFAULT_LIMITS,
        maxCampaigns: 1,
        maxModelCalls: config.spend.maxRequests,
        maxInstanceModelCalls: config.spend.maxRequests,
        maxCompletionTokens: config.spend.maxCompletionTokens,
        maxInstanceCompletionTokens: config.spend.maxCompletionTokens,
      }
    : DEFAULT_LIMITS;
  let inFlight = 0;

  function checkAuth(req: IncomingMessage): AuthState {
    if (!tokenHash) return "none";
    const h = req.headers["authorization"];
    if (typeof h !== "string") return "missing";
    const m = /^bearer +(\S+)$/i.exec(h.trim());
    if (!m) return "bad";
    return timingSafeEqual(sha256(m[1]!), tokenHash) ? "ok" : "bad";
  }

  function hostOk(req: IncomingMessage): boolean {
    const h = req.headers["host"];
    if (typeof h !== "string" || h === "") return false;
    const m = /^(\[[^\]]+\]|[^:]+)(?::\d+)?$/.exec(h.trim());
    return m !== null && hostAllow.has(bareHost(m[1]!));
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const started = Date.now();
    const method = req.method ?? "GET";
    let pathname = "-";
    let model = "-";
    let auth: AuthState = "none";
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

    // What this request holds against the limits, to be given back or settled when it ends.
    let admitted = false;
    let reservedTokens = 0;
    let charged = false;
    let upstreamStatus = 0;
    res.on("close", () => {
      if (timer) clearTimeout(timer);
      if (!res.writableFinished) abort.abort(); // client went away
      if (admitted) inFlight -= 1;
      if (charged && account) {
        // What the provider reported, if it reported; nothing if it refused the request outright;
        // otherwise the whole of what was asked for, because what was generated is not known.
        const used = usage.completion !== undefined ? usage.completion : upstreamStatus >= 400 && upstreamStatus < 500 ? 0 : reservedTokens;
        void account.settle("shim", { calls: 1, tokens: reservedTokens }, { calls: 1, tokens: used }).catch(() => undefined);
      }
      status = res.statusCode;
      const u = usage.total !== undefined ? ` tokens=${usage.prompt ?? "-"}/${usage.completion ?? "-"}/${usage.total}` : "";
      log(`${method} ${pathname} ${status} ${Date.now() - started}ms auth=${auth} model=${model}${u}`);
    });

    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://localhost") // base for parsing only; never contacted;
    } catch {
      sendError(res, 400, "Bad request URL", "invalid_request_error");
      return;
    }
    pathname = safeToken(url.pathname);

    // DNS-rebinding and browser defence: this is a server-to-server endpoint only.
    if (!hostOk(req)) {
      sendError(res, 403, "Host not allowed", "forbidden");
      return;
    }
    if (req.headers["origin"] !== undefined) {
      sendError(res, 403, "Browser requests (Origin header) are not accepted", "forbidden");
      return;
    }

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

    auth = checkAuth(req);
    if (auth === "missing" || auth === "bad") {
      res.setHeader("www-authenticate", "Bearer");
      sendError(res, 401, "Missing or invalid shim client token", "authentication_error");
      return;
    }

    const target = route(method, url.pathname);
    if (target.kind === "wrong-method") {
      res.setHeader("allow", target.allow);
      sendError(res, 405, "Method not allowed", "method_not_allowed");
      return;
    }
    if (target.kind === "none") {
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

    const isChat = target.kind === "chat";
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
      if (limited) {
        // One answer per request, and no more tokens than the shim allows.
        if (p["n"] !== undefined && p["n"] !== 1) {
          sendError(res, 400, "n must be 1 through this shim", "invalid_request_error");
          return;
        }
        const named = [p["max_tokens"], p["max_completion_tokens"]].filter((v) => v !== undefined && v !== null);
        if (named.some((v) => typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > perRequest)) {
          sendError(res, 400, `max_tokens must be a whole number from 1 to ${perRequest} through this shim`, "invalid_request_error");
          return;
        }
        reservedTokens = named.length > 0 ? Math.max(...(named as number[])) : perRequest;
        // What is sent is what was checked and reserved, never the caller's own bytes: the body is
        // written out again from the parsed request, so that the provider cannot read it differently
        // (a repeated key, say), and it always carries `max_tokens` set to the figure reserved. The
        // other spelling of the limit is dropped, since a provider that ignored it would not be held to it.
        const { max_completion_tokens: _dropped, ...rest } = p;
        body = Buffer.from(JSON.stringify({ ...rest, max_tokens: reservedTokens }), "utf8");
        if (inFlight >= maxConcurrent) {
          res.setHeader("retry-after", "1");
          sendError(res, 429, "Too many requests in flight through this shim", "rate_limit_error");
          return;
        }
        inFlight += 1;
        admitted = true;
        if (account) {
          try {
            await account.reserve("shim", 1, reservedTokens, ceilings);
            charged = true;
            // The caller left while its place was being taken: nothing will be sent, so nothing is charged.
            if (res.destroyed) {
              charged = false;
              await account.settle("shim", { calls: 1, tokens: reservedTokens }, { calls: 0, tokens: 0 }).catch(() => undefined);
              return;
            }
          } catch (e) {
            if (e instanceof LimitExceededError) sendError(res, 429, "The spend ceiling of this shim has been reached", "insufficient_quota");
            else sendError(res, 503, "The shim's spend account is unavailable", "shim_error");
            return;
          }
        }
      }
    }

    // Build upstream request. Egress is limited to the configured upstream origin.
    const headers: Record<string, string> = { "accept-encoding": "identity" };
    for (const h of FORWARD_REQUEST_HEADERS) {
      const v = req.headers[h];
      if (typeof v === "string") headers[h] = v;
    }
    // Key injection mode: the client token authenticated to the shim and is never forwarded.
    if (config.apiKey) headers["authorization"] = `Bearer ${config.apiKey}`;
    else if (typeof req.headers["authorization"] === "string") headers["authorization"] = req.headers["authorization"];

    arm();
    let up: Response;
    try {
      const init: RequestInit = { method, headers, redirect: "manual", signal: abort.signal };
      if (body !== undefined && body.length > 0) init.body = body;
      // A chat request carries everything in its body, which is what was checked: no query goes with it.
      up = await fetch(upstreamBase + url.pathname + (isChat ? "" : url.search), init);
    } catch {
      if (timedOut) sendError(res, 504, "Upstream timed out", "upstream_timeout");
      else if (!res.destroyed) sendError(res, 502, "Upstream unreachable", "upstream_error");
      return;
    }

    upstreamStatus = up.status;
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
      let out: string;
      try {
        out = JSON.stringify(normalizeChatCompletion(JSON.parse(text) as unknown, normOpts));
      } catch {
        // Not JSON, or cut short. It cannot be normalised, so it is not passed on: whatever it
        // holds, reasoning included, would go through as it is.
        sendError(res, 502, "Upstream returned a body that is not valid JSON", "upstream_error");
        return;
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

  const server = http.createServer((req, res) => {
    handle(req, res).catch(() => {
      sendError(res, 500, "Internal shim error", "shim_error");
    });
  });
  // A caller that stops reading must not hold its place for ever: an idle connection is closed.
  // Set once for each connection, not for each request on it.
  const idleMs = config.upstreamTimeoutMs > 0 ? config.upstreamTimeoutMs + 30_000 : 150_000;
  server.on("connection", (socket) => {
    socket.setTimeout(idleMs, () => socket.destroy());
  });
  return server;
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
        `key=${cfg.apiKey ? "env" : "client"} client_auth=${cfg.clientToken ? "token" : "none"}\n`,
    );
  });
}
