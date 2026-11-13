import { z } from "zod";
import type { GenerateRequest, GenerateResult, ModelGateway } from "./gateway.ts";
import { ModelCallError, ModelOutputError, parseJsonAnswer } from "./gateway.ts";

export interface MistralGatewayOptions {
  /** OpenAI-compatible base URL. The Mistral API, or the normalising shim in front of it. */
  baseUrl?: string;
  model?: string;
  /**
   * Bearer value. In a managed session the network proxy injects the real key and this is a
   * placeholder; in a client instance it comes from that instance's secret store.
   */
  apiKey?: string;
  timeoutMs?: number;
  /** Extra attempts after a rejected, malformed or truncated answer. */
  retries?: number;
  /** Optional reasoning effort. Mistral Large 4 accepts low, medium and high (verified 2026-11-13). */
  reasoningEffort?: "low" | "medium" | "high";
  fetch?: typeof fetch;
  /** Total tries for one request when the failure is transient (429, 5xx, network). */
  transientAttempts?: number;
  /** First pause between transient retries; each later pause is three times longer. */
  backoffMs?: number;
}

interface ChatMessageBlock {
  type?: string;
  text?: string;
}

interface ChatCompletion {
  model?: string;
  choices?: Array<{ finish_reason?: string; message?: { content?: string | ChatMessageBlock[] | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

/** Text of an assistant message whose content may be a string or a list of blocks. */
export function messageText(content: string | ChatMessageBlock[] | null | undefined): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  // Mistral Large 4 returns a thinking block followed by text blocks. Only text is an answer.
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");
}

interface StreamChunk {
  model?: string;
  choices?: Array<{ finish_reason?: string | null; delta?: { content?: string | ChatMessageBlock[] | null } }>;
  usage?: ChatCompletion["usage"];
}

/**
 * Read a chat completion that is either one JSON document or a server-sent event stream,
 * and return it in the non-streamed shape. Reasoning blocks are discarded.
 */
export async function readCompletion(response: Response): Promise<ChatCompletion> {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/event-stream")) return (await response.json()) as ChatCompletion;
  if (!response.body) throw new Error("empty stream");

  let text = "";
  let model: string | undefined;
  let finish: string | undefined;
  let usage: ChatCompletion["usage"];
  let done = false;
  let buffer = "";
  const decoder = new TextDecoder();

  const take = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data === "[DONE]") {
      done = true;
      return;
    }
    const chunk = JSON.parse(data) as StreamChunk;
    model = chunk.model ?? model;
    usage = chunk.usage ?? usage;
    const choice = chunk.choices?.[0];
    if (choice?.finish_reason) finish = choice.finish_reason;
    text += messageText(choice?.delta?.content);
  };

  for await (const part of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(part, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      take(buffer.slice(0, newline).replace(/\r$/, ""));
      buffer = buffer.slice(newline + 1);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) take(buffer.trim());
  if (!done && finish === undefined) throw new Error("stream ended without a finish reason");
  return { model, choices: [{ finish_reason: finish, message: { content: text } }], usage };
}

export class MistralGateway implements ModelGateway {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly reasoningEffort: "low" | "medium" | "high" | undefined;
  private readonly transientAttempts: number;
  private readonly backoffMs: number;

  constructor(options: MistralGatewayOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.KIC_MODEL_BASE_URL ?? "https://api.mistral.ai/v1").replace(/\/+$/, "");
    this.model = options.model ?? process.env.KIC_MODEL ?? "mistral-large-4";
    this.apiKey = options.apiKey ?? process.env.MISTRAL_API_KEY ?? "proxy-injected";
    this.timeoutMs = options.timeoutMs ?? 180_000;
    this.retries = options.retries ?? 2;
    this.reasoningEffort = options.reasoningEffort;
    this.transientAttempts = options.transientAttempts ?? 4;
    this.backoffMs = options.backoffMs ?? 1500;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async generateJson<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const started = Date.now();
    const usage = { promptTokens: 0, completionTokens: 0, reasoningTokens: 0 };
    let lastProblem = "no attempt made";
    let correction: string | null = null;
    // Large 4 spends most of its budget on reasoning, and how much varies run to run. A cut-off
    // answer is retried once with double the budget rather than failing the step.
    let maxTokens = request.maxTokens;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const completion = await this.call(request, correction, maxTokens);
      usage.promptTokens += completion.usage?.prompt_tokens ?? 0;
      usage.completionTokens += completion.usage?.completion_tokens ?? 0;
      usage.reasoningTokens += completion.usage?.completion_tokens_details?.reasoning_tokens ?? 0;

      const choice = completion.choices?.[0];
      const text = messageText(choice?.message?.content);
      if (choice?.finish_reason === "length") {
        lastProblem = `the answer was cut off at ${maxTokens} tokens`;
        correction = null;
        maxTokens = Math.min(maxTokens * 2, request.maxTokens * 2);
        continue;
      }
      let parsed: unknown;
      try {
        parsed = parseJsonAnswer(text);
      } catch (error) {
        lastProblem = (error as Error).message;
        correction = `Your previous answer was not valid JSON (${lastProblem}). Return only the JSON object.`;
        continue;
      }
      const checked = request.schema.safeParse(parsed);
      if (checked.success) {
        return {
          value: checked.data,
          provider: "mistral",
          model: completion.model ?? this.model,
          source: "live",
          usage,
          latencyMs: Date.now() - started,
        };
      }
      lastProblem = z.prettifyError(checked.error);
      correction = `Your previous answer did not match the required schema:\n${lastProblem}\nReturn a corrected JSON object.`;
    }
    throw new ModelOutputError(request.purpose, lastProblem);
  }

  private async call<T>(request: GenerateRequest<T>, correction: string | null, maxTokens: number): Promise<ChatCompletion> {
    const messages = [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ];
    if (correction) messages.push({ role: "user", content: correction });

    const body = JSON.stringify({
      model: this.model,
      max_tokens: maxTokens,
      messages,
      // Streamed, so that a long reasoning phase keeps the connection alive through proxies
      // that cut off slow non-streamed responses.
      stream: true,
      ...(this.reasoningEffort ? { reasoning_effort: this.reasoningEffort } : {}),
      response_format: {
        type: "json_schema",
        json_schema: { name: request.schemaName, strict: true, schema: z.toJSONSchema(request.schema) },
      },
    });

    // Transient failures (rate limits, gateway errors, dropped connections) are retried a
    // fixed number of times with a growing pause. Anything else fails at once.
    let failure = new ModelCallError(`Model call for "${request.purpose}" was not attempted.`);
    for (let attempt = 0; attempt < this.transientAttempts; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, this.backoffMs * 3 ** (attempt - 1)));
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
          redirect: "error",
        });
      } catch (error) {
        failure = new ModelCallError(`Model call for "${request.purpose}" failed: ${(error as Error).name}`);
        continue;
      }
      if (response.ok) {
        try {
          return await readCompletion(response);
        } catch (error) {
          failure = new ModelCallError(`Model call for "${request.purpose}" broke off mid-stream: ${(error as Error).name}`);
          continue;
        }
      }
      // The body may echo request content; report the status only.
      failure = new ModelCallError(`Model call for "${request.purpose}" returned HTTP ${response.status}.`, response.status);
      await response.body?.cancel().catch(() => undefined);
      if (response.status !== 429 && response.status < 500) break;
    }
    throw failure;
  }
}
