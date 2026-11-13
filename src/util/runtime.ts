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

/** Run tasks with at most `limit` in flight. Results keep input order. The first failure rejects. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}
