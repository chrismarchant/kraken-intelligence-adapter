/**
 * Redaction applied to everything that would leave KIC for an external evaluator.
 * It is a required control for any future live JEV path, and is exercised now against
 * the mock so the path that is tested is the path that would run.
 */

const PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "[private-key]", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { label: "[secret]", pattern: /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|github_pat|xox[abprs]|AKIA|ASIA|AIza)[-_A-Za-z0-9]{12,}\b/g },
  { label: "[secret]", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi },
  { label: "[secret]", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { label: "[secret]", pattern: /\b(?:api[_-]?key|token|secret|password|passwd)\b\s*[:=]\s*\S{6,}/gi },
  { label: "[email]", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { label: "[phone]", pattern: /(?<![\w.])\+?\d[\d\s().-]{8,}\d(?![\w.])/g },
  { label: "[url]", pattern: /\bhttps?:\/\/[^\s<>"')]+/gi },
];

const SECRET_SHAPED: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|github_pat|xox[abprs]|AKIA|ASIA|AIza)[-_A-Za-z0-9]{12,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b[A-Za-z0-9+/_-]{40,}\b/,
];

export function redactText(text: string): string {
  let out = text;
  for (const { label, pattern } of PATTERNS) out = out.replace(pattern, label);
  return out;
}

/** Redact every string in a JSON-like value. Keys are left as they are. */
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") return redactText(value) as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v)) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactDeep(v);
    return out as T;
  }
  return value;
}

export class RedactionError extends Error {
  constructor(path: string) {
    // The offending value is deliberately not included.
    super(`Refusing to send evaluator state: a secret-shaped value remains at ${path} after redaction.`);
    this.name = "RedactionError";
  }
}

/** Fail closed if anything secret-shaped survived redaction. */
export function assertNoSecrets(value: unknown, path = "state"): void {
  if (typeof value === "string") {
    if (SECRET_SHAPED.some((p) => p.test(value))) throw new RedactionError(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoSecrets(v, `${path}[${i}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) assertNoSecrets(v, `${path}.${k}`);
  }
}
