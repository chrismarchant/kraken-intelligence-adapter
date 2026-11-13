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

/** Names under which reasoning is sent already flattened, at any of the levels it has been seen or could be. */
const REASONING_KEYS = ["reasoning_content", "reasoning", "thinking"];

/** Remove flattened reasoning from one object, unless reasoning is asked for. True if anything was removed. */
function hideReasoning(holder: Json, opts: NormalizeOptions): boolean {
  if (opts.exposeReasoning) return false;
  let changed = false;
  for (const key of REASONING_KEYS) {
    if (key in holder) {
      delete holder[key];
      changed = true;
    }
  }
  return changed;
}

function fixContainer(c: Json, field: "message" | "delta", opts: NormalizeOptions): boolean {
  const holder = c[field];
  if (!isObject(holder)) return false;
  const changed = hideReasoning(holder, opts);
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
    if (!isObject(body)) return body;
    const copy = structuredClone(body) as Json;
    hideReasoning(copy, opts);
    for (const c of Array.isArray(copy["choices"]) ? (copy["choices"] as unknown[]) : []) {
      if (isObject(c)) {
        hideReasoning(c, opts);
        fixContainer(c, "message", opts);
      }
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
    if (!isObject(chunk)) return [chunk, false];
    const copy = structuredClone(chunk) as Json;
    let changed = hideReasoning(copy, opts);
    for (const c of Array.isArray(copy["choices"]) ? (copy["choices"] as unknown[]) : []) {
      if (isObject(c)) {
        if (hideReasoning(c, opts)) changed = true;
        if (fixContainer(c, "delta", opts)) changed = true;
        if (fixContainer(c, "message", opts)) changed = true;
      }
    }
    return changed ? [copy, true] : [chunk, false];
  } catch (error) {
    throw new Error("The chunk could not be normalised", { cause: error });
  }
}

/**
 * What normalizeSseEvent returns in place of an event whose data could not be read. In a
 * stream it is never sent: the stream is ended with an error (see createSseNormalizer).
 */
export const DROPPED_EVENT = ": dropped an upstream event that was not valid JSON";

/**
 * Normalise one complete SSE event (text without trailing blank line). Returns the event text.
 *
 * An event whose data is not valid JSON is not passed on: it cannot be normalised, so passing
 * it on would let through whatever it holds, reasoning included. DROPPED_EVENT is returned.
 */
export function normalizeSseEvent(event: string, opts: NormalizeOptions = {}): string {
  const lines = event.split(/\r\n|\n|\r/);
  const dataLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] as string).startsWith("data:")) dataLines.push(i);
  }
  // Besides data, an event may hold comments and the fields that go with data (event, id,
  // retry). Any other line is not part of an event: it may be a JSON answer sent under the
  // wrong label, or text put beside empty data. It cannot be normalised, so the event is not
  // passed on, whether or not it also has data.
  const known = lines.every((line) => line === "" || line.startsWith(":") || /^(?:event|id|retry|data)(?::|$)/.test(line));
  if (!known) return DROPPED_EVENT;
  if (dataLines.length === 0) return event;
  const payload = dataLines
    .map((i) => {
      const v = (lines[i] as string).slice(5);
      return v.startsWith(" ") ? v.slice(1) : v;
    })
    .join("\n");
  // The end marker, and data that is empty, which the format allows and which holds nothing.
  if (payload.trim() === "[DONE]" || payload.trim() === "") return event;
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
  try {
    [out] = normalizeChunk(parsed, opts);
  } catch {
    return DROPPED_EVENT;
  }
  // The data is always written out again from what was read, changed or not. What the client
  // parses is then exactly what was checked here: a repeated key, of which parsing keeps the
  // last, cannot carry something past in the copy that was discarded.
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
  // A blank line ends an event: two line ends in a row, which need not be written the same
  // way. A carriage return followed by a line feed is one line end, never two.
  const sep = /(\r\n|\r(?!\n)|\n)(\r\n|\r(?!\n)|\n)/g;
  let failed = false;
  // An event that cannot be read ends the stream with an error. Leaving it out and carrying on
  // would hand the client a stream with a piece missing, which it could assemble into
  // something upstream never sent: a tool call with different arguments, for one.
  const emit = (controller: TransformStreamDefaultController<Uint8Array>, event: string, separator: string) => {
    if (failed) return;
    const out = normalizeSseEvent(event, opts);
    if (out === DROPPED_EVENT) {
      failed = true;
      // Thrown, so that the stream ends in this error on both sides whichever step it came from.
      throw new Error("An upstream event could not be read");
    }
    controller.enqueue(encoder.encode(out + separator));
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
        emit(controller, held.join("") + work.slice(start, m.index), m[0]);
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
      if (heldChars > MAX_SSE_EVENT_CHARS && !failed) {
        held = [];
        heldChars = 0;
        tail = "";
        failed = true;
        throw new Error("An upstream event exceeded the size the shim will hold");
      }
    },
    flush(controller) {
      const buffer = held.join("") + tail + decoder.decode();
      // What is left has no blank line after it: a stream that broke off mid-event. A whole
      // event is normalised as usual; a broken one ends the stream with an error.
      if (buffer.length > 0) emit(controller, buffer, "");
    },
  });
}
