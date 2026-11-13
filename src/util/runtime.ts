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

/**
 * Bring text to one canonical form before any rule looks at it: compatibility characters
 * are folded (full-width digits and signs become ordinary ones) and invisible format
 * characters (zero-width spaces, soft hyphens, direction marks) are removed.
 */
export function canonicalText(text: string): string {
  return text.normalize("NFKC").replace(/\p{Cf}/gu, "");
}
