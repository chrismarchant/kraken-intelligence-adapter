import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const HARNESS = path.resolve(here, '..');
export const AEH = path.join(HARNESS, 'scripts/aeh.mjs');
export const SCAN = path.join(HARNESS, 'scripts/secret-scan.mjs');
export const HOOK = path.join(HARNESS, 'hooks/pre-tool-use.mjs');

export const task = (id, o = {}) => ({ id, title: id, gate: 'G1', owner: 'agent', deps: [], status: 'todo', evidence: [], ...o });
export const gate = (id, status = 'authorised', o = {}) => ({ id, status, paths: [], reviewRequired: false, ...o });

export function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

export function sh(cwd, cmd, args) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

export function mkRepo({ tasks = [], gates = [gate('G1')], reviews = [], alwaysAllowed = ['docs/**', '*.md'], decisions = null, gitInit = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aeh-test-'));
  write(root, 'harness/state/tasks.json', JSON.stringify({ tasks }));
  write(root, 'harness/config/gates.json', JSON.stringify({ alwaysAllowed, gates }));
  write(root, 'harness/state/reviews.json', JSON.stringify({ reviews }));
  for (const s of ['tasks.schema.json', 'reviews.schema.json']) {
    fs.copyFileSync(path.join(HARNESS, 'config', s), path.join(root, 'harness/config', s));
  }
  write(root, 'harness/config/required-records.json', JSON.stringify({ records: ['README.md', 'harness/state/tasks.json'] }));
  write(root, 'README.md', '# t\n');
  if (decisions !== null) write(root, 'docs/decisions/OWNER_DECISIONS.md', decisions);
  if (gitInit) {
    sh(root, 'git', ['init', '-q']);
    sh(root, 'git', ['config', 'user.email', 't@example.invalid']);
    sh(root, 'git', ['config', 'user.name', 't']);
  }
  return root;
}

export function commitAll(root, msg = 'c') {
  sh(root, 'git', ['add', '-A']);
  sh(root, 'git', ['commit', '-q', '-m', msg]);
  return sh(root, 'git', ['rev-parse', 'HEAD']);
}

export function aeh(root, ...args) {
  const r = spawnSync('node', [AEH, '--root', root, '--json', ...args], { encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* not json */ }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

export const reviewEntry = (commit, o = {}) => ({
  id: 'R1', gate: 'G1', commit,
  reviewer: { kind: 'agent', id: 'reviewer-a', model: 'm' }, author: { id: 'author-b' },
  independent: true, scope: ['src/**'], skipped: [], verdict: 'approve', findings: [],
  reportPath: 'docs/review.md', at: '2026-11-13T00:00:00Z', ...o,
});
