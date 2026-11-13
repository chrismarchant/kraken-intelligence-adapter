import { z } from "zod";
import type { TokenUsage } from "../contracts/index.ts";

export interface GenerateRequest<T> {
  /** Stable name of the calling step, e.g. "narrative-fanout". Used for fixtures and logs. */
  purpose: string;
  system: string;
  user: string;
  /** Shape the model must return. Every field should be required: strict JSON modes expect it. */
  schema: z.ZodType<T>;
  schemaName: string;
  maxTokens: number;
  /** Aborting this cancels the call, including any request in flight. */
  signal?: AbortSignal;
}

export interface GenerateResult<T> {
  value: T;
  provider: string;
  model: string;
  source: "live" | "fixture";
  usage: TokenUsage;
  /** HTTP requests sent to the provider for this result, including retries. Zero for a replay. */
  providerRequests: number;
  latencyMs: number;
}

/** What a failed call still cost. Attached to gateway errors so the cost can be recorded. */
export interface CallCost {
  usage: TokenUsage;
  providerRequests: number;
}

export const NO_COST: CallCost = Object.freeze({
  usage: Object.freeze({ promptTokens: 0, completionTokens: 0, reasoningTokens: 0 }),
  providerRequests: 0,
});

export function costOf(error: unknown): CallCost {
  const cost = (error as { cost?: CallCost } | null)?.cost;
  return cost ?? NO_COST;
}

/**
 * Provider-neutral inference boundary. Skills depend on this interface only, so the
 * provider, a gateway service or a recorded fixture can stand behind it.
 */
export interface ModelGateway {
  generateJson<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>>;
}

export class ModelOutputError extends Error {
  readonly purpose: string;
  cost: CallCost;
  constructor(purpose: string, message: string, cost: CallCost = NO_COST) {
    super(`Model output for "${purpose}" was rejected: ${message}`);
    this.name = "ModelOutputError";
    this.purpose = purpose;
    this.cost = cost;
  }
}

export class ModelCallError extends Error {
  readonly status: number | null;
  cost: CallCost;
  constructor(message: string, status: number | null = null, cost: CallCost = NO_COST) {
    super(message);
    this.name = "ModelCallError";
    this.status = status;
    this.cost = cost;
  }
}

/** Parse the first JSON object in a model's text answer. Tolerates a fenced code block. */
export function parseJsonAnswer(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced ? (fenced[1] as string) : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new SyntaxError("no JSON object found in the model's answer");
  }
}
