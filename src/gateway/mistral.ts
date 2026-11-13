import { z } from "zod";
import type { GenerateRequest, GenerateResult, ModelGateway } from "./gateway.ts";
import type { CallCost } from "./gateway.ts";
import { MAX_TOKEN_FACTOR, ModelCallError, ModelOutputError, parseJsonAnswer } from "./gateway.ts";

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
  /** Hard cap on HTTP requests sent to the provider for one generateJson call, all retries included. */
  maxProviderRequests?: number;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

/** The model endpoint must be HTTPS, or plain HTTP on loopback (the local shim). */
export function checkedBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("The model base URL is not a valid URL.");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname))) {
    throw new Error("The model base URL must use https, or http on a loopback address.");
  }
  if (url.username || url.password) throw new Error("The model base URL must not contain credentials.");
  return raw.replace(/\/+$/, "");
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

/** The most one streamed line may hold. Far above any event a chat stream sends. */
const MAX_LINE_CHARS = 1024 * 1024;
/** The most text an answer may hold: several times what the largest max_tokens can produce. */
const MAX_ANSWER_CHARS = 2 * 1024 * 1024;
/** The most a whole response may hold, reasoning and framing included. */
const MAX_RESPONSE_CHARS = 32 * 1024 * 1024;

/**
 * A count the provider reported, if it is one: a number, not negative. Fractions are rounded
 * up. A figure above `most` is counted as `most`: no request can have used so much, and one
 * absurd figure must not be able to use up an account.
 */
function reportedCount(value: unknown, most: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.min(Math.ceil(value), most) : null;
}

/** Many times what any prompt this code builds can hold. */
const MOST_PROMPT_TOKENS = 2_000_000;


/** Wait, or stop waiting at once if the call is cancelled. */
function pause(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

/**
 * Read a chat completion that is either one JSON document or a server-sent event stream,
 * and return it in the non-streamed shape. Reasoning blocks are discarded.
 */
export async function readCompletion(response: Response): Promise<ChatCompletion> {
  const type = response.headers.get("content-type") ?? "";
  if (!response.body) throw new Error("empty stream");
  if (!type.includes("text/event-stream")) {
    // One JSON document. Read with a limit: the provider's answer is bounded by max_tokens, and
    // anything far larger is not an answer.
    let whole = "";
    const decoder = new TextDecoder();
    for await (const part of response.body as unknown as AsyncIterable<Uint8Array>) {
      whole += decoder.decode(part, { stream: true });
      if (whole.length > MAX_RESPONSE_CHARS) throw new Error("response too large");
    }
    return JSON.parse(whole + decoder.decode()) as ChatCompletion;
  }

  // The answer is collected in pieces and joined once at the end.
  const answer: string[] = [];
  let answerChars = 0;
  let received = 0;
  // The line being received, in pieces as it arrived. Only newly arrived text is searched for
  // a line end, so a long line arriving in many pieces is not gone over again for each piece.
  let held: string[] = [];
  let heldChars = 0;
  let model: string | undefined;
  let finish: string | undefined;
  let usage: ChatCompletion["usage"];
  let done = false;
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
    const piece = messageText(choice?.delta?.content);
    if (piece) {
      answer.push(piece);
      answerChars += piece.length;
      if (answerChars > MAX_ANSWER_CHARS) throw new Error("answer too large");
    }
  };

  for await (const part of response.body as unknown as AsyncIterable<Uint8Array>) {
    received += part.byteLength;
    if (received > MAX_RESPONSE_CHARS) throw new Error("stream too large");
    const arrived = decoder.decode(part, { stream: true });
    let start = 0;
    let newline: number;
    while ((newline = arrived.indexOf("\n", start)) >= 0) {
      take((held.join("") + arrived.slice(start, newline)).replace(/\r$/, ""));
      held = [];
      heldChars = 0;
      start = newline + 1;
    }
    if (start < arrived.length) {
      held.push(arrived.slice(start));
      heldChars += arrived.length - start;
      if (heldChars > MAX_LINE_CHARS) throw new Error("stream line too large");
    }
  }
  const last = (held.join("") + decoder.decode()).trim();
  if (last) take(last);
  if (!done && finish === undefined) throw new Error("stream ended without a finish reason");
  return { model, choices: [{ finish_reason: finish, message: { content: answer.join("") } }], usage };
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
  private readonly maxProviderRequests: number;

  constructor(options: MistralGatewayOptions = {}) {
    this.baseUrl = checkedBaseUrl(options.baseUrl ?? process.env.KIC_MODEL_BASE_URL ?? "https://api.mistral.ai/v1");
    this.model = options.model ?? process.env.KIC_MODEL ?? "mistral-large-4";
    this.apiKey = options.apiKey ?? process.env.MISTRAL_API_KEY ?? "proxy-injected";
    this.timeoutMs = options.timeoutMs ?? 180_000;
    this.retries = options.retries ?? 1;
    this.reasoningEffort = options.reasoningEffort;
    this.transientAttempts = options.transientAttempts ?? 4;
    this.backoffMs = options.backoffMs ?? 1500;
    this.maxProviderRequests = options.maxProviderRequests ?? 6;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async generateJson<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const started = Date.now();
    // Everything this call costs is accumulated here, and is attached to the error if it fails.
    const cost: CallCost = { usage: { promptTokens: 0, completionTokens: 0, reasoningTokens: 0 }, providerRequests: 0 };
    let lastProblem = "no attempt made";
    let correction: string | null = null;
    // Large 4 spends most of its budget on reasoning, and how much varies run to run. A cut-off
    // answer is retried with double the budget rather than failing the step. The allowances of
    // all attempts together never exceed MAX_TOKEN_FACTOR times the request's own allowance,
    // which is the figure callers reserve against.
    let maxTokens = request.maxTokens;
    const allowance = { left: request.maxTokens * MAX_TOKEN_FACTOR };

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (maxTokens > allowance.left) break;
      const completion = await this.call(request, correction, maxTokens, cost, allowance);
      // What the provider reports is checked before it is counted: a figure that is not a
      // non-negative number would not fit the record, and the answer paid for would be lost.
      cost.usage.promptTokens += reportedCount(completion.usage?.prompt_tokens, MOST_PROMPT_TOKENS) ?? 0;
      // An answer that does not say what it cost is charged at its whole allowance, never at nothing.
      // However much is reported, the whole call is never counted as more than it may use:
      // what an answer reports is counted up to what is left of the call's allowance after the
      // answers and failed requests before it. A truthful figure always fits: an answer cannot
      // use more than the max_tokens it was sent with, and those add up to the allowance.
      const room = Math.max(0, MAX_TOKEN_FACTOR * request.maxTokens - cost.usage.completionTokens);
      const charged = Math.min(reportedCount(completion.usage?.completion_tokens, room) ?? maxTokens, Math.max(room, 0));
      cost.usage.completionTokens += charged;
      cost.usage.reasoningTokens += reportedCount(completion.usage?.completion_tokens_details?.reasoning_tokens, charged) ?? 0;

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
          usage: cost.usage,
          providerRequests: cost.providerRequests,
          latencyMs: Date.now() - started,
        };
      }
      lastProblem = z.prettifyError(checked.error);
      correction = `Your previous answer did not match the required schema:\n${lastProblem}\nReturn a corrected JSON object.`;
    }
    throw new ModelOutputError(request.purpose, lastProblem, cost);
  }

  private async call<T>(
    request: GenerateRequest<T>,
    correction: string | null,
    maxTokens: number,
    cost: CallCost,
    allowance: { left: number },
  ): Promise<ChatCompletion> {
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
    // fixed number of times with a growing pause. Anything else fails at once. The total
    // number of requests for one generateJson call is capped whatever the mix of retries.
    let failure = new ModelCallError(`Model call for "${request.purpose}" was not attempted.`, null, cost);
    for (let attempt = 0; attempt < this.transientAttempts; attempt++) {
      if (request.signal?.aborted) throw new ModelCallError(`Model call for "${request.purpose}" was cancelled.`, null, cost);
      if (cost.providerRequests >= this.maxProviderRequests) {
        throw new ModelCallError(`Model call for "${request.purpose}" reached the limit of ${this.maxProviderRequests} provider requests.`, null, cost);
      }
      // Every request sent draws on the call's allowance, retries after a failure included, so
      // the total across all of them stays within MAX_TOKEN_FACTOR times the request's own.
      if (maxTokens > allowance.left) {
        throw new ModelCallError(`Model call for "${request.purpose}" used up its token allowance on failed requests.`, failure.status, cost);
      }
      allowance.left -= maxTokens;
      if (attempt > 0) {
        await pause(this.backoffMs * 3 ** (attempt - 1), request.signal);
        // Cancelled while waiting: nothing was sent, so the allowance set aside is given back.
        if (request.signal?.aborted) {
          allowance.left += maxTokens;
          throw new ModelCallError(`Model call for "${request.purpose}" was cancelled.`, null, cost);
        }
      }
      // A request that failed without saying what it cost is charged at its allowance, but
      // never past what is left of the call's: an earlier answer that reported more than it
      // was allowed has already been counted up to that line, and the reservation made for
      // the call is MAX_TOKEN_FACTOR times the request's allowance and no more.
      const chargeUnreported = (): void => {
        cost.usage.completionTokens += Math.min(maxTokens, Math.max(0, MAX_TOKEN_FACTOR * request.maxTokens - cost.usage.completionTokens));
      };
      const timeout = AbortSignal.timeout(this.timeoutMs);
      const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
      let response: Response;
      cost.providerRequests += 1;
      try {
        response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
          body,
          signal,
          redirect: "error",
        });
      } catch (error) {
        // The provider may have generated up to the request's allowance before the connection
        // failed and reported nothing. It is charged as if it had.
        chargeUnreported();
        if (request.signal?.aborted) throw new ModelCallError(`Model call for "${request.purpose}" was cancelled.`, null, cost);
        failure = new ModelCallError(`Model call for "${request.purpose}" failed: ${(error as Error).name}`, null, cost);
        continue;
      }
      if (response.ok) {
        try {
          return await readCompletion(response);
        } catch (error) {
          // A stream that broke off reported no usage. Charged at the request's allowance.
          chargeUnreported();
          if (request.signal?.aborted) throw new ModelCallError(`Model call for "${request.purpose}" was cancelled.`, null, cost);
          failure = new ModelCallError(`Model call for "${request.purpose}" broke off mid-stream: ${(error as Error).name}`, null, cost);
          continue;
        }
      }
      // The body may echo request content; report the status only.
      // A gateway error may follow generation that was never delivered; a refusal (4xx) does not.
      if (response.status >= 500) chargeUnreported();
      else allowance.left += maxTokens;
      failure = new ModelCallError(`Model call for "${request.purpose}" returned HTTP ${response.status}.`, response.status, cost);
      await response.body?.cancel().catch(() => undefined);
      if (response.status !== 429 && response.status < 500) break;
    }
    throw failure;
  }
}
