#!/usr/bin/env node
// Credential-shaped string scanner. Reports path:line and rule name only; never the matched value.
// Scans files tracked by git plus untracked-not-ignored files. Allowlist:
// harness/config/secret-scan-allowlist.txt ("path-glob | line-regex | justification") and the
// inline marker "secret-scan:allow" on the same line.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, rootOf, git, matchPath } from './lib.mjs';

const PLACEHOLDERS = ['proxy-injected', 'dummy'];
const VALUE_STOPWORDS = ['process.env', 'example', 'changeme', 'placeholder', 'xxxxxxxx', 'your-', '${', '$(', 'secrets.'];

const PREFIX_RULES = [
  ['provider-key-sk', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['provider-key-sk-live', /\bsk_(?:live|test)_[A-Za-z0-9]{16,}/],
  ['github-token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/],
  ['github-pat', /\bgithub_pat_[A-Za-z0-9_]{30,}/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}/],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['gitlab-token', /\bglpat-[A-Za-z0-9_-]{20,}/],
  ['npm-token', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['bearer-token', /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}/],
  ['private-key-block', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----/],
];
const ASSIGN_RE = /([A-Za-z0-9_.-]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)[A-Za-z0-9_]*)["']?\s*[:=]\s*["']?([A-Za-z0-9_\-+/=.]{16,})/gi;

export function entropy(s) {
  const freq = new Map();
  for (const c of s) freq.set(c, (freq.get(c) || 0) + 1);
  let h = 0;
  for (const n of freq.values()) { const p = n / s.length; h -= p * Math.log2(p); }
  return h;
}

// A placeholder is skipped only when the WHOLE credential value equals it. A longer token that merely
// contains the word (e.g. a key prefix followed by "dummy") is still a finding.
const isPlaceholder = (s) => PLACEHOLDERS.includes(s.toLowerCase());
// Bare 32-character alphanumeric value on a *_KEY / *_TOKEN / *_SECRET name or after "Bearer ".
const BARE32_RES = [
  /(?:_KEY|_TOKEN|_SECRET)["']?\s*[:=]\s*["']?([A-Za-z0-9]{32})(?![A-Za-z0-9])/gi,
  /\bBearer\s+([A-Za-z0-9]{32})(?![A-Za-z0-9])/g,
];

// Returns rule names that fire on one line.
export function scanLine(line) {
  if (line.includes('secret-scan:allow')) return [];
  const hits = [];
  for (const [name, re] of PREFIX_RULES) {
    const m = re.exec(line);
    if (m && !isPlaceholder(m[0].replace(/^Bearer\s+/i, ''))) hits.push(name);
  }
  for (const re of BARE32_RES) {
    re.lastIndex = 0;
    let b;
    while ((b = re.exec(line))) {
      if (!isPlaceholder(b[1]) && entropy(b[1]) >= 3.0) hits.push('bare-32-char-secret');
    }
  }
  ASSIGN_RE.lastIndex = 0;
  let m;
  while ((m = ASSIGN_RE.exec(line))) {
    const v = m[2];
    const low = v.toLowerCase();
    if (isPlaceholder(v) || VALUE_STOPWORDS.some((w) => low.includes(w))) continue;
    if (v.length >= 20 && /[0-9]/.test(v) && /[A-Za-z]/.test(v) && entropy(v) >= 3.5) hits.push('high-entropy-assignment');
  }
  // The bare rule is a fallback for values the other rules miss; do not double-report a line.
  if (hits.length > 1 && hits.includes('bare-32-char-secret')) return hits.filter((h) => h !== 'bare-32-char-secret');
  return hits;
}

const isEnvFile = (f) => {
  const b = path.basename(f);
  return (b === '.env' || b.startsWith('.env.')) && b !== '.env.example';
};

function loadAllowlist(root) {
  const p = path.join(root, 'harness/config/secret-scan-allowlist.txt');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
    const [glob, pattern, ...why] = l.split('|').map((s) => s.trim());
    return { glob, re: pattern && pattern !== '*' ? new RegExp(pattern) : null, why: why.join('|') };
  }).filter((e) => e.glob && e.why);
}

export function scanRepo(root) {
  const ls = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  if (!ls.ok) throw new Error('not a git repository (git ls-files failed)');
  const files = [...new Set(ls.out.split('\0').filter(Boolean))];
  const allow = loadAllowlist(root);
  const findings = [];
  for (const f of files) {
    const abs = path.join(root, f);
    let st;
    try { st = fs.statSync(abs); } catch { continue; }
    if (!st.isFile() || st.size > 2 * 1024 * 1024) continue;
    const allowFor = allow.filter((a) => matchPath(a.glob, f));
    if (isEnvFile(f) && !allowFor.some((a) => !a.re)) findings.push({ path: f, line: 0, rule: 'env-file-tracked' });
    const buf = fs.readFileSync(abs);
    if (buf.includes(0)) continue;
    buf.toString('utf8').split('\n').forEach((line, i) => {
      const rules = scanLine(line);
      if (!rules.length) return;
      if (allowFor.some((a) => !a.re || a.re.test(line))) return;
      for (const rule of new Set(rules)) findings.push({ path: f, line: i + 1, rule });
    });
  }
  return findings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { flags } = parseArgs(process.argv.slice(2));
  const root = rootOf(flags);
  let findings;
  try { findings = scanRepo(root); } catch (e) { console.error(`secret-scan: ${e.message}`); process.exit(2); }
  if (flags.json) console.log(JSON.stringify({ ok: findings.length === 0, findings }));
  else for (const f of findings) console.error(`${f.path}:${f.line} ${f.rule}`);
  if (findings.length) { console.error(`secret-scan: ${findings.length} finding(s). Values are never printed.`); process.exit(1); }
  if (!flags.json) console.log('secret-scan: clean');
}
