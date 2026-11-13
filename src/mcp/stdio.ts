import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRuntime } from "./runtime.ts";
import { createKicServer } from "./server.ts";

// stdout carries the protocol; anything for a person goes to stderr.
const { service, config } = createRuntime();
const server = createKicServer({ service, exportRoot: config.exportDir, requestedBy: process.env.KIC_REQUESTED_BY ?? "mcp-stdio-client" });
await server.connect(new StdioServerTransport());
console.error(`[kic-mcp] stdio server ready (model: ${config.modelMode}, evaluator: ${config.evaluator}).`);
