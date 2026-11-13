import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { mkRepo, write, aeh, HOOK, task } from './helpers.mjs';

function hook(root, raw, { projectDir = '' } = {}) {
  const r = spawnSync('node', [HOOK], { input: raw, encoding: 'utf8', cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir } });
  return { code: r.status, out: r.stdout.trim(), json: r.stdout.trim() ? JSON.parse(r.stdout) : null };
}
const stopped = (content = JSON.stringify({ reason: 'drill', at: 'now', by: 't' })) => {
  const root = mkRepo({});
  write(root, 'harness/state/GLOBAL_STOP', content);
  return root;
};
const call = (root, tool_name) => JSON.stringify({ hook_event_name: 'PreToolUse', cwd: root, tool_name, tool_input: {} });

// ---- F17a ------------------------------------------------------------------------------------
test('F17a: clearing a global stop without --owner-reference is refused and the stop stays', () => {
  const root = mkRepo({ tasks: [task('A')] });
  assert.equal(aeh(root, 'stop', '--level', 'global', '--reason', 'drill', '--by', 'tester').code, 0);
  const r = aeh(root, 'clear', '--level', 'global', '--reason', 'done', '--by', 'anyone');
  assert.notEqual(r.code, 0);
  assert.match(r.json.reason, /owner-reference/);
  assert.ok(fs.existsSync(root + '/harness/state/GLOBAL_STOP'));
});

test('F17a: with --owner-reference the clear works and the reference is recorded in the stop log', () => {
  const root = mkRepo({ tasks: [task('A')] });
  aeh(root, 'stop', '--level', 'global', '--reason', 'drill', '--by', 'tester');
  const ref = 'docs/decisions/OWNER_DECISIONS.md#OD-77';
  assert.equal(aeh(root, 'clear', '--level', 'global', '--reason', 'done', '--by', 'owner', '--owner-reference', ref).code, 0);
  assert.ok(!fs.existsSync(root + '/harness/state/GLOBAL_STOP'));
  const lines = fs.readFileSync(root + '/harness/state/STOP_LOG.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.at(-1).action, 'clear');
  assert.equal(lines.at(-1).ownerReference, ref);
});

test('F17a: local and gate clears do not need --owner-reference', () => {
  const root = mkRepo({ tasks: [task('A')] });
  aeh(root, 'stop', '--level', 'local', '--task', 'A', '--reason', 'why');
  assert.equal(aeh(root, 'clear', '--level', 'local', '--task', 'A', '--reason', 'ok', '--by', 'owner').code, 0);
});

// ---- F17b ------------------------------------------------------------------------------------
test('F17b: under a stop every non-read-only tool is denied, including with empty, garbage or non-object stdin', () => {
  const root = stopped();
  for (const raw of ['', '   ', 'garbage', '[]', 'null', '42', '{"tool_name": 123}', '{}']) {
    const r = hook(root, raw);
    assert.equal(r.code, 0, raw);
    assert.equal(r.json.hookSpecificOutput.permissionDecision, 'deny', JSON.stringify(raw));
  }
  for (const t of ['Bash', 'Write', 'Edit', 'mcp__any__thing', 'BrandNewTool']) {
    assert.equal(hook(root, call(root, t)).json.hookSpecificOutput.permissionDecision, 'deny', t);
  }
});

test('F17b: under a stop the read-only set is not denied, and nothing is ever printed that approves', () => {
  const root = stopped();
  for (const t of ['Read', 'Grep', 'Glob']) assert.equal(hook(root, call(root, t)).out, '', t);
  const denied = hook(root, call(root, 'Bash')).out;
  assert.ok(!/"allow"|"ask"/.test(denied));
});

test('F17b: a corrupt stop file still denies', () => {
  const root = stopped('{not json');
  const r = hook(root, call(root, 'Bash'));
  assert.equal(r.json.hookSpecificOutput.permissionDecision, 'deny');
});

test('F17b: a stop found through CLAUDE_PROJECT_DIR is honoured when cwd is elsewhere', () => {
  const root = stopped();
  const elsewhere = fs.mkdtempSync(os.tmpdir() + '/aeh-else-');
  const raw = JSON.stringify({ hook_event_name: 'PreToolUse', cwd: elsewhere, tool_name: 'Bash', tool_input: {} });
  assert.equal(hook(elsewhere, raw, { projectDir: root }).json.hookSpecificOutput.permissionDecision, 'deny');
});

test('F17b: with no stop file the hook is silent (exit 0, no output) for every input, never prints allow', () => {
  const root = mkRepo({});
  for (const raw of ['', 'garbage', '[]', 'null', call(root, 'Bash'), call(root, 'Write'), '{"tool_name": 123}']) {
    const r = hook(root, raw);
    assert.equal(r.code, 0, raw);
    assert.equal(r.out, '', raw);
  }
});
