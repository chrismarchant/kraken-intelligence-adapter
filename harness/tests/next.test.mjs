import test from 'node:test';
import assert from 'node:assert/strict';
import { mkRepo, aeh, task, gate } from './helpers.mjs';

const ids = (r) => r.json.runnable.map((t) => t.id);

test('next: runnable when no deps; in_progress and todo both qualify', () => {
  const root = mkRepo({ tasks: [task('A'), task('B', { status: 'in_progress' }), task('C', { status: 'done' })] });
  assert.deepEqual(ids(aeh(root, 'next')).sort(), ['A', 'B']);
});

test('next: dependency must be done; unfinished dep means waiting, not runnable', () => {
  const root = mkRepo({ tasks: [task('A'), task('B', { deps: ['A'] })] });
  const r = aeh(root, 'next');
  assert.deepEqual(ids(r), ['A']);
  assert.deepEqual(r.json.waiting.map((t) => t.id), ['B']);
  const done = mkRepo({ tasks: [task('A', { status: 'done' }), task('B', { deps: ['A'] })] });
  assert.deepEqual(ids(aeh(done, 'next')), ['B']);
});

test('next: a task with a local stop is not runnable and shows its reason', () => {
  const root = mkRepo({ tasks: [task('A', { status: 'blocked', stop: { level: 'local', reason: 'owner action OD-9', since: '2026-11-13' } })] });
  const r = aeh(root, 'next');
  assert.deepEqual(ids(r), []);
  assert.match(r.json.blocked[0].causes[0], /owner action OD-9/);
});

test('next: a blocked dependency blocks dependants transitively, with the reason chain', () => {
  const root = mkRepo({
    tasks: [
      task('A', { status: 'blocked', stop: { level: 'local', reason: 'no key', since: 's' } }),
      task('B', { deps: ['A'] }),
      task('C', { deps: ['B'] }),
      task('D'),
    ],
  });
  const r = aeh(root, 'next');
  assert.deepEqual(ids(r), ['D']);
  const c = r.json.blocked.find((t) => t.id === 'C');
  assert.ok(c, 'C is blocked, not merely waiting');
  assert.match(c.causes[0], /C -> B -> A: local stop: no key/);
});

test('next: gate status must be authorised or accepted', () => {
  const root = mkRepo({
    gates: [gate('G1', 'authorised'), gate('G2', 'presented'), gate('G3', 'accepted'), gate('G4', 'blocked'), gate('G5', 'deferred')],
    tasks: [task('A', { gate: 'G1' }), task('B', { gate: 'G2' }), task('C', { gate: 'G3' }), task('D', { gate: 'G4' }), task('E', { gate: 'G5' })],
  });
  const r = aeh(root, 'next');
  assert.deepEqual(ids(r).sort(), ['A', 'C']);
  assert.match(r.json.blocked.find((t) => t.id === 'B').causes[0], /gate G2 is presented/);
});

test('next: a task depending on a task in an unauthorised gate is blocked', () => {
  const root = mkRepo({
    gates: [gate('G1'), gate('G2', 'blocked')],
    tasks: [task('X', { gate: 'G2' }), task('Y', { gate: 'G1', deps: ['X'] })],
  });
  assert.deepEqual(ids(aeh(root, 'next')), []);
  assert.ok(aeh(root, 'next').json.blocked.some((t) => t.id === 'Y'));
});

test('next: global stop returns nothing and exits non-zero', () => {
  const root = mkRepo({ tasks: [task('A')] });
  assert.equal(aeh(root, 'stop', '--level', 'global', '--reason', 'drill', '--by', 'tester').code, 0);
  const r = aeh(root, 'next');
  assert.notEqual(r.code, 0);
  assert.deepEqual(r.json.runnable, []);
});

test('stop/clear: local and gate stops update the ledgers and clear is recorded', () => {
  const root = mkRepo({ tasks: [task('A')] });
  assert.equal(aeh(root, 'stop', '--level', 'local', '--task', 'A', '--reason', 'why', '--by', 'x').code, 0);
  assert.deepEqual(ids(aeh(root, 'next')), []);
  assert.notEqual(aeh(root, 'clear', '--level', 'local', '--task', 'A', '--reason', 'ok').code, 0, 'clear needs --by');
  assert.equal(aeh(root, 'clear', '--level', 'local', '--task', 'A', '--reason', 'ok', '--by', 'owner').code, 0);
  assert.deepEqual(ids(aeh(root, 'next')), ['A']);

  assert.equal(aeh(root, 'stop', '--level', 'gate', '--gate', 'G1', '--reason', 'veto').code, 0);
  assert.deepEqual(ids(aeh(root, 'next')), []);
  assert.equal(aeh(root, 'clear', '--level', 'gate', '--gate', 'G1', '--reason', 'lifted', '--by', 'owner').code, 0);
  assert.deepEqual(ids(aeh(root, 'next')), ['A']);
});

test('global stop makes every check-* fail; clearing restores them', () => {
  const root = mkRepo({ tasks: [task('A')] });
  aeh(root, 'stop', '--level', 'global', '--reason', 'drill', '--by', 'tester');
  assert.notEqual(aeh(root, 'check-records').code, 0);
  assert.notEqual(aeh(root, 'check-gates', '--files', 'README.md').code, 0);
  assert.notEqual(aeh(root, 'check-reviews', '--commit', 'a'.repeat(40)).code, 0);
  assert.equal(aeh(root, 'clear', '--level', 'global', '--reason', 'done', '--by', 'owner').code, 0);
  assert.equal(aeh(root, 'check-records').code, 0);
});
