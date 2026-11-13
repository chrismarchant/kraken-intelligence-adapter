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
  let changed = false;
  // Reasoning that upstream sends already flattened is hidden like any other, unless it is asked for.
  if (!opts.exposeReasoning) {
    for (const key of ["reasoning_content", "reasoning"]) {
      if (key in holder) {
        delete holder[key];
        changed = true;
      }
    }
  }
  const content = holder["content"];
  if (content === undefined || content === null || typeof content === "string") return changed;
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
 * when changes are needed; the input is not mutated). Anything that is not a completion is
 * returned as it is. A completion that cannot be processed makes this throw: the caller must
 * not pass it on, since it could not be normalised.
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
  } catch (error) {
    throw new Error("The completion could not be normalised", { cause: error });
  }
}

/**
 * Normalise one parsed chunk (chat.completion.chunk). Returns [value, changed]. A chunk that
 * cannot be processed makes this throw; normalizeSseEvent then drops the event.
 */
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
  } catch (error) {
    throw new Error("The chunk could not be normalised", { cause: error });
  }
}

/** What is sent on in place of an event whose data could not be read. A comment: clients ignore it. */
export const DROPPED_EVENT = ": dropped an upstream event that was not valid JSON";

/**
 * Normalise one complete SSE event (text without trailing blank line). Returns the event text.
 *
 * An event whose data is not valid JSON is not passed on: it cannot be normalised, so passing
 * it on would let through whatever it holds, reasoning included. It is replaced by a comment.
 */
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
    return DROPPED_EVENT;
  }
  try {
    opts.onParsed?.(parsed);
  } catch {
    // observer errors must never break the stream
  }
  let out: unknown;
  let changed: boolean;
  try {
    [out, changed] = normalizeChunk(parsed, opts);
  } catch {
    return DROPPED_EVENT;
  }
  if (!changed) return event;
  const first = dataLines[0] as number;
  const isData = new Set(dataLines);
  const rebuilt: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === first) rebuilt.push("data: " + JSON.stringify(out));
    else if (!isData.has(i)) rebuilt.push(lines[i] as string);
  }
  return rebuilt.join("\n");
}

/** The most one event may hold before its end is seen. Far above anything a chat stream sends. */
export const MAX_SSE_EVENT_CHARS = 4 * 1024 * 1024;

/**
 * Streaming SSE normaliser. Handles arbitrary chunk boundaries, including a split inside a
 * multi-byte UTF-8 character or inside a `data:` line. Events are separated by a blank line.
 */
export function createSseNormalizer(opts: NormalizeOptions = {}): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();
  // The event being received is kept in pieces, as it arrived, apart from its last few
  // characters. Only those and the newly arrived text are searched for the end of the event,
  // so a long event arriving in many pieces is not gone over again for each piece.
  let held: string[] = [];
  let heldChars = 0;
  let tail = "";
  // A blank line ends an event. The two line ends need not be written the same way.
  const sep = /(\r\n|\n|\r)(\r\n|\n|\r)/g;
  const emit = (controller: TransformStreamDefaultController<Uint8Array>, event: string, separator: RegExpExecArray) => {
    const out = normalizeSseEvent(event, opts);
    controller.enqueue(encoder.encode(out === event ? event + separator[0] : out + (separator[1] === separator[2] ? separator[0] : "\n\n")));
  };
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const work = tail + decoder.decode(chunk, { stream: true });
      let start = 0;
      sep.lastIndex = 0;
      for (;;) {
        const m = sep.exec(work);
        if (!m) break;
        const end = m.index + m[0].length;
        // A lone carriage return at the very end may be the first half of a line end still to come.
        if (end === work.length && m[0].endsWith("\r")) break;
        emit(controller, held.join("") + work.slice(start, m.index), m);
        held = [];
        heldChars = 0;
        start = end;
        sep.lastIndex = end;
      }
      const rest = work.slice(start);
      tail = rest.slice(-3);
      if (rest.length > 3) {
        held.push(rest.slice(0, -3));
        heldChars += rest.length - 3;
      }
      if (heldChars > MAX_SSE_EVENT_CHARS) {
        held = [];
        heldChars = 0;
        tail = "";
        controller.error(new Error("An upstream event exceeded the size the shim will hold"));
      }
    },
    flush(controller) {
      const buffer = held.join("") + tail + decoder.decode();
      if (buffer.length > 0) {
        // What is left has no blank line after it: a stream that broke off mid-event. A whole
        // event is normalised as usual; a broken one is dropped by normalizeSseEvent.
        controller.enqueue(encoder.encode(normalizeSseEvent(buffer, opts)));
      }
    },
  });
}
