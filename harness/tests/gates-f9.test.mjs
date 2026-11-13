import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkRepo, aeh, gate, write, commitAll, sh } from './helpers.mjs';

const gates = [
  gate('OPEN', 'authorised', { paths: ['src/**', 'package.json'] }),
  gate('LATER', 'deferred', { paths: ['src/adapters/later/**', 'Dockerfile'] }),
  gate('BLOCKED', 'blocked', { paths: ['deploy/**'] }),
  gate('AEH', 'authorised', { paths: ['harness/**'] }),
];

const setGateStatus = (root, id, status) => {
  const p = root + '/harness/config/gates.json';
  const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
  doc.gates.find((g) => g.id === id).status = status;
  fs.writeFileSync(p, JSON.stringify(doc));
};

// ---- F9a: the gate map comes from the BASE revision ----------------------------------------
test('F9a: a change cannot authorise its own gate (flip to authorised + add a file in one change)', () => {
  const root = mkRepo({ gates, gitInit: true });
  const base = commitAll(root, 'base');
  setGateStatus(root, 'BLOCKED', 'authorised');
  write(root, 'deploy/plan.yml', 'x');
  commitAll(root, 'self-authorising change');
  const r = aeh(root, 'check-gates', '--base', base);
  assert.notEqual(r.code, 0, r.stdout);
  assert.deepEqual(r.json.violations.map((v) => v.path), ['deploy/plan.yml']);
  assert.equal(r.json.gateMapSource, 'base');
  assert.ok(r.json.notes.some((n) => /gate BLOCKED: status blocked -> authorised/.test(n) && /not in effect/.test(n) && /owner/.test(n)), r.stdout);
});

test('F9a: once the gate map change is on the base, later changes are judged by it', () => {
  const root = mkRepo({ gates, gitInit: true });
  commitAll(root, 'initial');
  setGateStatus(root, 'BLOCKED', 'authorised');
  const base = commitAll(root, 'owner-merged gate change');
  write(root, 'deploy/plan.yml', 'x');
  commitAll(root, 'now allowed');
  assert.equal(aeh(root, 'check-gates', '--base', base).code, 0);
});

test('F9a: a gate-map-only change is reported but does not itself fail', () => {
  const root = mkRepo({ gates, gitInit: true });
  const base = commitAll(root, 'base');
  setGateStatus(root, 'LATER', 'authorised');
  commitAll(root, 'map only');
  const r = aeh(root, 'check-gates', '--base', base);
  assert.equal(r.code, 0, r.stdout);
  assert.ok(r.json.notes.some((n) => /gate LATER/.test(n) && /not in effect/.test(n)));
});

test('F9a: base without gates.json (or the empty tree) falls back to the head map and says so', () => {
  const root = mkRepo({ gates, gitInit: true });
  commitAll(root, 'with map');
  const empty = sh(root, 'git', ['hash-object', '-t', 'tree', '/dev/null']);
  const r = aeh(root, 'check-gates', '--base', empty);
  assert.equal(r.json.gateMapSource, 'head');
  assert.ok(r.json.notes.some((n) => /FALLING BACK/.test(n)));
});

// ---- F9b: renames and deletions ---------------------------------------------------------------
test('F9b: moving a file out of a blocked gate path is caught (source path is checked)', () => {
  const root = mkRepo({ gates, gitInit: true });
  write(root, 'deploy/plan.txt', 'a body long enough for git to detect a rename rather than add and delete\n'.repeat(5));
  write(root, 'docs/.keep', '');
  const base = commitAll(root, 'base');
  sh(root, 'git', ['mv', 'deploy/plan.txt', 'docs/plan.txt']);
  commitAll(root, 'rename out');
  const r = aeh(root, 'check-gates', '--base', base);
  assert.notEqual(r.code, 0, r.stdout);
  assert.deepEqual(r.json.violations.map((v) => v.path), ['deploy/plan.txt']);
});

test('F9b: deleting a file under a blocked gate path fails just as adding one does', () => {
  const root = mkRepo({ gates, gitInit: true });
  write(root, 'deploy/old.yml', 'x');
  const base = commitAll(root, 'base');
  fs.rmSync(root + '/deploy/old.yml');
  commitAll(root, 'delete');
  const r = aeh(root, 'check-gates', '--base', base);
  assert.notEqual(r.code, 0);
  assert.equal(r.json.violations[0].path, 'deploy/old.yml');
});
