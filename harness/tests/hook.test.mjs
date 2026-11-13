import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkRepo, write, HOOK } from './helpers.mjs';

function run(input, root, raw = null) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: '' };
  const r = spawnSync('node', [HOOK], {
    input: raw ?? JSON.stringify({ hook_event_name: 'PreToolUse', cwd: root, tool_input: {}, ...input }), encoding: 'utf8', env,
  });
  return { code: r.status, out: r.stdout.trim(), json: r.stdout.trim() ? JSON.parse(r.stdout) : null };
}
const stopped = () => {
  const root = mkRepo({});
  write(root, 'harness/state/GLOBAL_STOP', JSON.stringify({ reason: 'drill', at: 'now', by: 'tester' }));
  return root;
};

test('no stop file: every tool is allowed (silent, exit 0)', () => {
  const root = mkRepo({});
  for (const tool_name of ['Write', 'Edit', 'Bash', 'Agent', 'mcp__x__y', 'Read', 'WhateverNew']) {
    const r = run({ tool_name }, root);
    assert.equal(r.code, 0);
    assert.equal(r.out, '');
  }
});

test('stop file: write and execute tools are denied with the documented output shape', () => {
  const root = stopped();
  for (const tool_name of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'Agent', 'mcp__github__create_pull_request', 'mcp__any__tool']) {
    const r = run({ tool_name }, root);
    assert.equal(r.code, 0);
    assert.equal(r.json.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(r.json.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(r.json.hookSpecificOutput.permissionDecisionReason, /GLOBAL STOP.*drill/);
  }
});

test('stop file: Read, Grep and Glob are still allowed', () => {
  const root = stopped();
  for (const tool_name of ['Read', 'Grep', 'Glob']) assert.equal(run({ tool_name }, root).out, '', tool_name);
});

test('stop file in a parent directory of cwd is honoured', () => {
  const root = stopped();
  write(root, 'sub/dir/.keep', '');
  assert.equal(run({ tool_name: 'Bash', cwd: root + '/sub/dir' }, root).json.hookSpecificOutput.permissionDecision, 'deny');
});

test('fail open: garbage, empty or non-object stdin with no stop file allows', () => {
  const root = mkRepo({});
  for (const raw of ['not json', '', '[]', 'null', '{"cwd": 5}']) {
    const r = run({}, root, raw);
    assert.equal(r.code, 0, raw);
    assert.equal(r.out, '', raw);
  }
});

test('fail open: unreadable stop path is not treated as a stop when cwd does not exist', () => {
  const r = run({ tool_name: 'Bash', cwd: '/nonexistent/dir/for/test' }, '/nonexistent');
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
});

test('stop active and input unparseable: denies (cannot tell which tool)', () => {
  const root = stopped();
  const r = spawnSync('node', [HOOK], { input: 'garbage', encoding: 'utf8', cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: '' } });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
});
