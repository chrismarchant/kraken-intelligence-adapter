import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mkRepo, aeh, task, gate, write } from './helpers.mjs';

const DECISIONS = `# Owner decisions

| ID | Decision | Recommended | Alternatives | Blocks | Status |
|---|---|---|---|---|---|
| OD-1 | Pick foundation | x | y | all | OPEN — awaiting |
| OD-2 | Grant access | x | y | AEH | **DECIDED** 2026-11-13 |
| OD-3 | Another | x | y | z | OPEN |
`;

test('check-records: passes on a valid ledger', () => {
  assert.equal(aeh(mkRepo({ tasks: [task('A'), task('B', { deps: ['A'] })] }), 'check-records').code, 0);
});

test('check-records: detects dependency cycles', () => {
  const root = mkRepo({ tasks: [task('A', { deps: ['C'] }), task('B', { deps: ['A'] }), task('C', { deps: ['B'] })] });
  const r = aeh(root, 'check-records');
  assert.notEqual(r.code, 0);
  assert.ok(r.json.problems.some((p) => /cycle/.test(p)));
});

test('check-records: self-dependency is a cycle', () => {
  assert.notEqual(aeh(mkRepo({ tasks: [task('A', { deps: ['A'] })] }), 'check-records').code, 0);
});

test('check-records: unknown dep, unknown gate, duplicate id, bad status all fail', () => {
  for (const tasks of [
    [task('A', { deps: ['ZZ'] })], [task('A', { gate: 'NOPE' })], [task('A'), task('A')], [task('A', { status: 'wip' })],
  ]) assert.notEqual(aeh(mkRepo({ tasks }), 'check-records').code, 0);
});

test('check-records: missing or empty required record fails', () => {
  const root = mkRepo({ tasks: [task('A')] });
  fs.writeFileSync(path.join(root, 'README.md'), '  \n');
  assert.notEqual(aeh(root, 'check-records').code, 0);
  fs.rmSync(path.join(root, 'README.md'));
  assert.ok(aeh(root, 'check-records').json.problems.some((p) => /missing/.test(p)));
});

test('check-records: stop on a task whose status is not blocked fails', () => {
  const root = mkRepo({ tasks: [task('A', { stop: { level: 'local', reason: 'r', since: 's' } })] });
  assert.notEqual(aeh(root, 'check-records').code, 0);
});

test('readiness: fails when the runnable queue is empty', () => {
  const root = mkRepo({ tasks: [task('A', { status: 'blocked', stop: { level: 'local', reason: 'OD-1 pending', since: 's' } })], decisions: DECISIONS });
  const r = aeh(root, 'readiness', '--hours', '6', '--max-spend', '0');
  assert.notEqual(r.code, 0);
  assert.ok(r.json.problems.some((p) => /queue is empty/.test(p)));
});

test('readiness: fails without the execution envelope', () => {
  const root = mkRepo({ tasks: [task('A')], decisions: DECISIONS });
  assert.notEqual(aeh(root, 'readiness').code, 0);
  assert.notEqual(aeh(root, 'readiness', '--hours', '6').code, 0);
  assert.notEqual(aeh(root, 'readiness', '--max-spend', '0').code, 0);
  assert.notEqual(aeh(root, 'readiness', '--hours', 'abc', '--max-spend', '0').code, 0);
});

test('readiness: passes and lists open decisions, blocked tasks and the fallback queue', () => {
  const root = mkRepo({
    tasks: [task('A'), task('B', { status: 'blocked', stop: { level: 'local', reason: 'needs OD-1', since: 's' } }), task('C', { deps: ['B'] })],
    decisions: DECISIONS,
  });
  const r = aeh(root, 'readiness', '--hours', '6', '--max-spend', '10');
  assert.equal(r.code, 0, r.stdout);
  assert.deepEqual(r.json.openDecisions.map((d) => d.id), ['OD-1', 'OD-3']);
  assert.deepEqual(r.json.runnable.map((t) => t.id), ['A']);
  const ids = r.json.blocked.map((t) => t.id).sort();
  assert.deepEqual(ids, ['B', 'C']);
  assert.deepEqual(r.json.blocked.find((t) => t.id === 'C').decisions, ['OD-1']);
});

test('readiness: global stop fails', () => {
  const root = mkRepo({ tasks: [task('A')], decisions: DECISIONS });
  aeh(root, 'stop', '--level', 'global', '--reason', 'x', '--by', 't');
  assert.notEqual(aeh(root, 'readiness', '--hours', '6', '--max-spend', '0').code, 0);
});

test('checkpoint: prepends a block above the newest existing one', () => {
  const root = mkRepo({ tasks: [task('A')] });
  write(root, 'harness/state/CHECKPOINTS.md', '# Durable checkpoints\n\nNewest first.\n\n## Old one\n\n```\nX: y\n```\n');
  const r = aeh(root, 'checkpoint', '--workstream', 'AEH', '--gate', 'AEH authorised', '--completed', 'did a', '--open', 'b', '--next', 'c', '--refs', 'docs/x.md');
  assert.equal(r.code, 0, r.stdout);
  const t = fs.readFileSync(path.join(root, 'harness/state/CHECKPOINTS.md'), 'utf8');
  assert.ok(t.indexOf('WORKSTREAM_ID: AEH') < t.indexOf('## Old one'));
  assert.ok(t.startsWith('# Durable checkpoints'));
  assert.notEqual(aeh(root, 'checkpoint', '--workstream', 'AEH').code, 0, 'missing flags');
});
