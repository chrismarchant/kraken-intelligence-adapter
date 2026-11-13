import test from 'node:test';
import assert from 'node:assert/strict';
import { mkRepo, aeh, gate, write, commitAll, sh } from './helpers.mjs';

const gates = [
  gate('OPEN', 'authorised', { paths: ['src/**', 'package.json'] }),
  gate('LATER', 'deferred', { paths: ['src/adapters/later/**', 'Dockerfile'] }),
  gate('BLOCKED', 'blocked', { paths: ['deploy/**'] }),
];

test('check-gates: authorised paths and docs are allowed', () => {
  const root = mkRepo({ gates });
  const r = aeh(root, 'check-gates', '--files', 'src/a.ts,package.json,docs/x/y.md,README.md');
  assert.equal(r.code, 0, r.stdout);
});

test('check-gates: path owned by a deferred or blocked gate is denied', () => {
  const root = mkRepo({ gates });
  for (const f of ['deploy/x.yml', 'sub/Dockerfile']) {
    const r = aeh(root, 'check-gates', '--files', f);
    assert.notEqual(r.code, 0, f);
    assert.equal(r.json.violations[0].path, f);
  }
});

test('check-gates: overlapping ownership is denied if any owner is not authorised', () => {
  const root = mkRepo({ gates });
  assert.notEqual(aeh(root, 'check-gates', '--files', 'src/adapters/later/k.ts').code, 0);
});

test('check-gates: path in no gate and not docs is denied', () => {
  const root = mkRepo({ gates });
  const r = aeh(root, 'check-gates', '--files', 'random/thing.js');
  assert.notEqual(r.code, 0);
  assert.match(r.json.violations[0].reason, /no gate/);
});

test('check-gates: --base/--head uses git diff', () => {
  const root = mkRepo({ gates, gitInit: true });
  const base = commitAll(root, 'base');
  write(root, 'src/ok.ts', 'x');
  write(root, 'docs/n.md', 'x');
  commitAll(root, 'good');
  assert.equal(aeh(root, 'check-gates', '--base', base).code, 0);
  write(root, 'deploy/bad.yml', 'x');
  commitAll(root, 'bad');
  const r = aeh(root, 'check-gates', '--base', base, '--head', 'HEAD');
  assert.notEqual(r.code, 0);
  assert.deepEqual(r.json.violations.map((v) => v.path), ['deploy/bad.yml']);
  assert.equal(aeh(root, 'check-gates', '--base', sh(root, 'git', ['rev-parse', 'HEAD'])).code, 0, 'empty diff passes');
  assert.notEqual(aeh(root, 'check-gates', '--base', 'no-such-ref').code, 0);
});
