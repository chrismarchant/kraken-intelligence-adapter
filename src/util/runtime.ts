import { createHash, randomBytes } from "node:crypto";

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** A clock that advances one second per reading. Makes tests and fixtures reproducible. */
export function fixedClock(startIso = "2026-01-05T09:00:00.000Z"): Clock {
  let t = Date.parse(startIso);
  return {
    now() {
      const d = new Date(t);
      t += 1000;
      return d;
    },
  };
}

export interface IdSource {
  next(prefix: string): string;
}

export const randomIds: IdSource = {
  next: (prefix) => `${prefix}-${randomBytes(6).toString("hex")}`,
};

/** Sequential ids per prefix: nar-001, nar-002, ... */
export function sequentialIds(): IdSource {
  const counters = new Map<string, number>();
  return {
    next(prefix) {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${String(n).padStart(3, "0")}`;
    },
  };
}

export interface CodeSource {
  /** A one-time confirmation code. Must be unpredictable in production. */
  next(): string;
}

export const randomCodes: CodeSource = {
  next: () => randomBytes(16).toString("hex"),
};

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** JSON with object keys sorted at every level, so equal values hash equally. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export type Settled<R> = { status: "fulfilled"; value: R } | { status: "rejected"; reason: unknown } | { status: "skipped" };

/**
 * Run tasks with at most `limit` in flight and report how each ended, in input order.
 * After the first failure no further task is started (those are "skipped") and `onFailure`
 * is called once, so the caller can cancel what is in flight. Tasks already running are
 * always awaited, so what they cost can still be recorded.
 */
export async function mapLimitSettled<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onFailure?: () => void,
): Promise<Settled<R>[]> {
  const results: Settled<R>[] = items.map(() => ({ status: "skipped" }));
  let next = 0;
  let failed = false;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      if (failed) return;
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index] as T, index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
        if (!failed) {
          failed = true;
          onFailure?.();
        }
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/** Run tasks with at most `limit` in flight. Results keep input order. The first failure rejects. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const settled = await mapLimitSettled(items, limit, fn);
  const failure = settled.find((s) => s.status === "rejected");
  if (failure && failure.status === "rejected") throw failure.reason;
  return settled.map((s) => (s as { status: "fulfilled"; value: R }).value);
}

const INVISIBLE = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/gu;
/** Control characters other than tab and line feed, and the line and paragraph separators. */
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/g;
const EMOJI_BEFORE = /\p{Extended_Pictographic}\uFE0F?[\u{1F3FB}-\u{1F3FF}]?$/u;
const EMOJI_AFTER = /^\p{Extended_Pictographic}/u;

/**
 * Whether an invisible character is part of an emoji, judged by both neighbours: a
 * variation selector directly after a pictograph or inside a keycap, or a joiner directly
 * between two pictographs. Everything else that takes no space is not part of the text.
 */
function partOfEmoji(character: string, offset: number, whole: string): boolean {
  const before = whole.slice(Math.max(0, offset - 8), offset);
  const after = whole.slice(offset + character.length, offset + character.length + 4);
  if (character === "\uFE0F") return /\p{Extended_Pictographic}$/u.test(before) || (/[0-9#*]$/.test(before) && after.startsWith("\u20E3"));
  if (character === "\u200D") return EMOJI_BEFORE.test(before) && EMOJI_AFTER.test(after);
  return false;
}

/**
 * Bring text to one canonical form before any rule looks at it. Compatibility characters
 * are folded (full-width digits and signs become ordinary ones). Characters that take no
 * space are removed: zero-width spaces and joiners, soft hyphens, direction marks and
 * overrides, variation selectors, tag characters, fillers and the blank braille pattern.
 * Control characters other than tab and line feed are removed too. The one exception is a
 * joiner or variation selector that is part of an emoji, judged by what stands on both
 * sides of it.
 */
export function canonicalText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(INVISIBLE, (character, offset: number, whole: string) => (partOfEmoji(character, offset, whole) ? character : ""))
    .replace(/\u2800/g, "")
    // One space between words, none at the end of a line, at most one blank line: padding
    // carries no meaning and can be used to push text to where a reader does not expect it.
    .replace(/[ \t]+/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Text made safe to print on a terminal: every control, invisible or direction character
 * is written out as a visible code (\u{1b}), so that nothing stored in a record can move
 * the cursor, erase a line, reorder what is displayed or hide inside it. A line feed is
 * kept only where several lines are expected.
 */
export function displaySafe(text: string, options: { multiline?: boolean } = {}): string {
  const visible = (character: string) => `\\u{${(character.codePointAt(0) as number).toString(16)}}`;
  return text
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u2800]/g, (character) => (character === "\n" && options.multiline ? character : visible(character)))
    .replace(INVISIBLE, (character, offset: number, whole: string) => (partOfEmoji(character, offset, whole) ? character : visible(character)))
    // Every blank that is not an ordinary space is written out, and so is a run of spaces:
    // padding is how text is pushed to the edge of a terminal or made to look like a margin.
    .replace(/[^\S \n]|\p{Zs}(?<! )/gu, (character) => visible(character))
    .replace(/ {2,}/g, (run) => ` ${"\\u{20}".repeat(run.length - 1)}`)
    .replace(/^ /gm, "\\u{20}");
}

/**
 * Break one line of already-safe text into pieces that fit a terminal line, so that the
 * caller can put a margin in front of every piece. Characters outside ASCII are counted as
 * two columns wide, which is never too few.
 */
export function fitToWidth(line: string, width: number): string[] {
  const pieces: string[] = [];
  let piece = "";
  let used = 0;
  for (const character of line) {
    const columns = (character.codePointAt(0) as number) < 0x80 ? 1 : 2;
    if (used + columns > width && piece !== "") {
      pieces.push(piece);
      piece = "";
      used = 0;
    }
    piece += character;
    used += columns;
  }
  pieces.push(piece);
  return pieces;
}
