import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { KicServerDeps } from "./server.ts";
import { createKicServer } from "./server.ts";

export interface HttpOptions {
  host: string;
  port: number;
  /** Bearer token clients must present. Null only for loopback use that was asked for explicitly. */
  token: string | null;
  maxBodyBytes: number;
  /** Host names (without port) a request may be addressed to. Guards against DNS rebinding. */
  allowedHosts: string[];
  /** Origins a browser-based client may call from. Empty means no browser may call at all. */
  allowedOrigins: string[];
  /**
   * Connections held open at once. Default 256. At the limit, room is made for a newcomer by
   * closing the connection that has waited longest without a request in progress, one that
   * has never shown a valid token before any that has. A connection with a request in
   * progress is never closed to make room.
   */
  maxConnections?: number;
  /** Tool requests being worked on at once; further ones are answered 503. Default 16. */
  maxInFlight?: number;
  /** How long a client may take to send its headers, and its whole request. Defaults 5 s and 30 s. */
  headersTimeoutMs?: number;
  requestTimeoutMs?: number;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

function positiveInteger(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  if (!/^[0-9]+$/.test(raw) || Number(raw) < 1) throw new Error(`${name} must be a positive whole number.`);
  return Number(raw);
}

const list = (raw: string | undefined) => (raw ?? "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);

export function loadHttpOptions(env: NodeJS.ProcessEnv = process.env): HttpOptions {
  const host = env.KIC_MCP_HOST ?? "127.0.0.1";
  const portRaw = env.KIC_MCP_PORT ?? "8790";
  if (!/^[0-9]+$/.test(portRaw) || Number(portRaw) > 65535) throw new Error("KIC_MCP_PORT must be a port number.");
  const token = env.KIC_MCP_TOKEN ?? null;
  if (token !== null && token.length < 24) throw new Error("KIC_MCP_TOKEN must be at least 24 characters.");
  if (token === null) {
    if (env.KIC_MCP_ALLOW_UNAUTHENTICATED !== "1") {
      throw new Error("Set KIC_MCP_TOKEN, or KIC_MCP_ALLOW_UNAUTHENTICATED=1 for loopback-only use.");
    }
    if (!LOOPBACK.has(host)) throw new Error("Unauthenticated use is allowed only on a loopback address.");
  }
  return {
    host,
    port: Number(portRaw),
    token,
    maxBodyBytes: positiveInteger("KIC_MCP_MAX_BODY_BYTES", env.KIC_MCP_MAX_BODY_BYTES, 1_048_576),
    allowedHosts: [...new Set([...LOOPBACK, host.toLowerCase(), ...list(env.KIC_MCP_ALLOWED_HOSTS)])],
    allowedOrigins: list(env.KIC_MCP_ALLOWED_ORIGINS),
  };
}

/** The host a request was addressed to, without its port. Handles bracketed IPv6. */
function hostOf(header: string | undefined): string {
  const value = (header ?? "").trim().toLowerCase();
  if (value.startsWith("[")) return value.slice(1, value.indexOf("]"));
  return value.split(":")[0] ?? "";
}

function send(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

function authorised(req: IncomingMessage, token: string | null): boolean {
  if (token === null) return true;
  const header = req.headers.authorization ?? "";
  // Both sides are hashed first, so the comparison reveals nothing about the token's length.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header.startsWith("Bearer ") ? header.slice(7) : ""), digest(token));
}

async function readBody(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new RangeError("body too large");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/**
 * Streamable HTTP endpoint at POST /mcp, stateless: each request gets its own server and
 * transport, and all durable state is in the campaign store. This is the form an agent
 * workspace adds "by URL".
 */
export function createHttpServer(deps: KicServerDeps, options: HttpOptions): Server {
  const maxInFlight = options.maxInFlight ?? 16;
  const maxConnections = options.maxConnections ?? 256;
  let inFlight = 0;
  // What is known of each open connection: whether a request is in progress on it, whether it
  // has ever shown a valid token, and when it last became idle.
  const connections = new Map<Socket, { busy: number; trusted: boolean; idleSince: number }>();
  const httpServer = createServer({ connectionsCheckingInterval: 1000 }, async (req, res) => {
    const connection = connections.get(req.socket);
    if (connection) {
      connection.busy += 1;
      res.once("close", () => {
        connection.busy -= 1;
        connection.idleSince = Date.now();
      });
    }
    const path = (req.url ?? "").split("?")[0];
    // A page on another site must not be able to reach this server by pointing a name at it
    // or by calling it from a browser: the Host must be one we answer to, and an Origin must
    // be one that was explicitly allowed.
    if (!options.allowedHosts.includes(hostOf(req.headers.host))) return send(res, 403, { error: "host not allowed" });
    const origin = req.headers.origin;
    if (origin !== undefined && !options.allowedOrigins.includes(origin.toLowerCase())) return send(res, 403, { error: "origin not allowed" });
    if (path === "/healthz" && req.method === "GET") return send(res, 200, { ok: true });
    if (path !== "/mcp") return send(res, 404, { error: "not found" });
    if (!authorised(req, options.token)) return send(res, 401, { error: "unauthorised" });
    if (connection) connection.trusted = true;
    if (req.method !== "POST") return send(res, 405, { error: "method not allowed" });
    // Work in progress is bounded. A caller over the limit is told to come back, not queued.
    if (inFlight >= maxInFlight) {
      res.setHeader("retry-after", "1");
      return send(res, 503, { error: "busy" });
    }
    inFlight += 1;
    res.once("close", () => {
      inFlight -= 1;
    });

    let body: unknown;
    try {
      body = await readBody(req, options.maxBodyBytes);
    } catch (error) {
      return send(res, error instanceof RangeError ? 413 : 400, { error: error instanceof RangeError ? "body too large" : "invalid JSON" });
    }
    const server = createKicServer(deps);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) send(res, 500, { error: "internal error" });
    }
  });
  // What a client can hold open before it has shown a token is bounded: how many connections,
  // and how long each may take to send its headers and then the rest of its request (checked
  // every second). A request that has arrived may take as long as its tool call needs.
  //
  // The limit on connections does not turn newcomers away, which would let whoever fills it
  // shut out everyone else. It closes the connection that has been idle longest, taking first
  // from those that have never shown a valid token. A caller with a token sends its request as
  // soon as it connects, and a connection with a request in progress is not closed.
  httpServer.on("connection", (socket: Socket) => {
    if (connections.size >= maxConnections) {
      let oldest: Socket | null = null;
      let oldestRank = Infinity;
      for (const [candidate, state] of connections) {
        if (state.busy > 0) continue;
        // Untrusted connections sort before trusted ones; within each, the longest idle first.
        const rank = (state.trusted ? 1e15 : 0) + state.idleSince;
        if (rank < oldestRank) [oldest, oldestRank] = [candidate, rank];
      }
      if (oldest === null) {
        socket.destroy();
        return;
      }
      connections.delete(oldest);
      oldest.destroy();
    }
    connections.set(socket, { busy: 0, trusted: false, idleSince: Date.now() });
    socket.once("close", () => connections.delete(socket));
  });
  httpServer.headersTimeout = options.headersTimeoutMs ?? 5_000;
  httpServer.requestTimeout = options.requestTimeoutMs ?? 30_000;
  httpServer.keepAliveTimeout = 5_000;
  return httpServer;
}

if (import.meta.main) {
  const { createRuntime } = await import("./runtime.ts");
  const options = loadHttpOptions();
  const { service, config } = createRuntime();
  const server = createHttpServer({ service, exportRoot: config.exportDir, requestedBy: process.env.KIC_REQUESTED_BY ?? "mcp-http-client" }, options);
  server.listen(options.port, options.host, () => {
    console.error(
      `[kic-mcp] http server on http://${options.host}:${options.port}/mcp ` +
        `(auth: ${options.token ? "bearer token" : "none, loopback only"}, model: ${config.modelMode}, evaluator: ${config.evaluator}).`,
    );
  });
}
