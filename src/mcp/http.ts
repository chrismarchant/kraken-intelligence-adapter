import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { KicServerDeps } from "./server.ts";
import { createKicServer } from "./server.ts";

export interface HttpOptions {
  host: string;
  port: number;
  /** Bearer token clients must present. Null only for loopback use that was asked for explicitly. */
  token: string | null;
  maxBodyBytes: number;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

export function loadHttpOptions(env: NodeJS.ProcessEnv = process.env): HttpOptions {
  const host = env.KIC_MCP_HOST ?? "127.0.0.1";
  const port = Number(env.KIC_MCP_PORT ?? "8790");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("KIC_MCP_PORT must be a port number.");
  const token = env.KIC_MCP_TOKEN ?? null;
  if (token !== null && token.length < 24) throw new Error("KIC_MCP_TOKEN must be at least 24 characters.");
  if (token === null) {
    if (env.KIC_MCP_ALLOW_UNAUTHENTICATED !== "1") {
      throw new Error("Set KIC_MCP_TOKEN, or KIC_MCP_ALLOW_UNAUTHENTICATED=1 for loopback-only use.");
    }
    if (!LOOPBACK.has(host)) throw new Error("Unauthenticated use is allowed only on a loopback address.");
  }
  return { host, port, token, maxBodyBytes: Number(env.KIC_MCP_MAX_BODY_BYTES ?? 1_048_576) };
}

function send(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

function authorised(req: IncomingMessage, token: string | null): boolean {
  if (token === null) return true;
  const header = req.headers.authorization ?? "";
  const presented = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const expected = Buffer.from(token);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
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
  return createServer(async (req, res) => {
    const path = (req.url ?? "").split("?")[0];
    if (path === "/healthz" && req.method === "GET") return send(res, 200, { ok: true });
    if (path !== "/mcp") return send(res, 404, { error: "not found" });
    if (!authorised(req, options.token)) return send(res, 401, { error: "unauthorised" });
    if (req.method !== "POST") return send(res, 405, { error: "method not allowed" });

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
