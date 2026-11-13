// Pure response normalisation for Mistral Large 4 -> OpenAI Chat Completions.
// Mistral returns `message.content` / `delta.content` as an array of blocks:
//   {type:"thinking", thinking:[{type:"text",text}], closed:true} and {type:"text", text}
// OpenAI-compatible clients expect a string. No I/O, no side effects.

export interface NormalizeOptions {
  /** Expose thinking text as `reasoning_content` (default: dropped). */
  exposeReasoning?: boolean;
  /** Called with every parsed JSON chunk/body before normalisation (e.g. to read `usage`). */
  onParsed?: (value: unknown) => void;
}

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function thinkingText(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(thinkingText).join("");
  if (isObject(v) && typeof v["text"] === "string") return v["text"];
  return "";
}

/** Split a content-block array into visible text and reasoning text. Unknown blocks are ignored. */
export function flattenContentBlocks(blocks: unknown[]): { text: string; reasoning: string } {
  let text = "";
  let reasoning = "";
  for (const b of blocks) {
    if (typeof b === "string") {
      text += b;
    } else if (isObject(b)) {
      if (b["type"] === "text" && typeof b["text"] === "string") text += b["text"];
      else if (b["type"] === "thinking") reasoning += thinkingText(b["thinking"]);
    }
  }
  return { text, reasoning };
}

function fixContainer(c: Json, field: "message" | "delta", opts: NormalizeOptions): boolean {
  const holder = c[field];
  if (!isObject(holder)) return false;
  const content = holder["content"];
  if (content === undefined || content === null || typeof content === "string") return false;
  if (Array.isArray(content)) {
    const { text, reasoning } = flattenContentBlocks(content);
    if (field === "delta" && text === "") delete holder["content"];
    else holder["content"] = text;
    if (opts.exposeReasoning && reasoning !== "") holder["reasoning_content"] = reasoning;
  } else {
    // Unexpected object/number content: never leave a non-string behind.
    if (field === "delta") delete holder["content"];
    else holder["content"] = "";
  }
  return true;
}

/**
 * Normalise a parsed chat.completion body in place-safe fashion (returns a new top-level object
 * when changes are needed; the input is not mutated). Never throws.
 */
export function normalizeChatCompletion<T = unknown>(body: T, opts: NormalizeOptions = {}): T {
  try {
    try {
      opts.onParsed?.(body);
    } catch {
      // observer errors must never break normalisation
    }
    if (!isObject(body) || !Array.isArray(body["choices"])) return body;
    const copy = structuredClone(body) as Json;
    for (const c of copy["choices"] as unknown[]) {
      if (isObject(c)) fixContainer(c, "message", opts);
    }
    return copy as T;
  } catch {
    return body;
  }
}

/** Normalise one parsed chunk (chat.completion.chunk). Returns [value, changed]. Never throws. */
export function normalizeChunk(chunk: unknown, opts: NormalizeOptions = {}): [unknown, boolean] {
  try {
    if (!isObject(chunk) || !Array.isArray(chunk["choices"])) return [chunk, false];
    const copy = structuredClone(chunk) as Json;
    let changed = false;
    for (const c of copy["choices"] as unknown[]) {
      if (isObject(c)) {
        if (fixContainer(c, "delta", opts)) changed = true;
        if (fixContainer(c, "message", opts)) changed = true;
      }
    }
    return changed ? [copy, true] : [chunk, false];
  } catch {
    return [chunk, false];
  }
}

/** Normalise one complete SSE event (text without trailing blank line). Returns the event text. */
export function normalizeSseEvent(event: string, opts: NormalizeOptions = {}): string {
  const lines = event.split(/\r\n|\n|\r/);
  const dataLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] as string).startsWith("data:")) dataLines.push(i);
  }
  if (dataLines.length === 0) return event;
  const payload = dataLines
    .map((i) => {
      const v = (lines[i] as string).slice(5);
      return v.startsWith(" ") ? v.slice(1) : v;
    })
    .join("\n");
  if (payload.trim() === "[DONE]") return event;
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return event;
  }
  try {
    opts.onParsed?.(parsed);
  } catch {
    // observer errors must never break the stream
  }
  const [out, changed] = normalizeChunk(parsed, opts);
  if (!changed) return event;
  const first = dataLines[0] as number;
  const rebuilt: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === first) rebuilt.push("data: " + JSON.stringify(out));
    else if (!dataLines.includes(i)) rebuilt.push(lines[i] as string);
  }
  return rebuilt.join("\n");
}

/**
 * Streaming SSE normaliser. Handles arbitrary chunk boundaries, including a split inside a
 * multi-byte UTF-8 character or inside a `data:` line. Events are separated by a blank line.
 */
export function createSseNormalizer(opts: NormalizeOptions = {}): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();
  let buffer = "";
  const sep = /\r\n\r\n|\n\n|\r\r/;
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      for (;;) {
        const m = sep.exec(buffer);
        if (!m) break;
        const event = buffer.slice(0, m.index);
        const end = m.index + m[0].length;
        const raw = buffer.slice(0, end);
        buffer = buffer.slice(end);
        const out = normalizeSseEvent(event, opts);
        controller.enqueue(encoder.encode(out === event ? raw : out + (m[0] === "\r\n\r\n" ? "\r\n\r\n" : m[0] === "\r\r" ? "\r\r" : "\n\n")));
      }
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer.length > 0) {
        const out = normalizeSseEvent(buffer, opts);
        controller.enqueue(encoder.encode(out));
      }
    },
  });
}
