import test from 'node:test';
import assert from 'node:assert/strict';
import { mkRepo, aeh, gate, write, commitAll, reviewEntry, sh } from './helpers.mjs';

const SHA = 'a'.repeat(40);
const gates = [gate('G1', 'authorised', { reviewRequired: true })];
function setup(entry, commit = SHA) {
  const root = mkRepo({ gates, reviews: entry ? [entry] : [] });
  write(root, 'docs/review.md', 'report');
  return { root, commit };
}
const check = (root, commit) => aeh(root, 'check-reviews', '--commit', commit, '--gate', 'G1');

test('check-reviews: exact commit, independent, different reviewer, approve passes', () => {
  const { root } = setup(reviewEntry(SHA));
  assert.equal(check(root, SHA).code, 0);
});

test('check-reviews: approve-with-followups passes with a non-blocking open finding', () => {
  const { root } = setup(reviewEntry(SHA, { verdict: 'approve-with-followups', findings: [{ id: 'F1', severity: 'medium', summary: 's', status: 'open' }] }));
  assert.equal(check(root, SHA).code, 0);
});

test('check-reviews: missing review fails', () => {
  const { root } = setup(null);
  const r = check(root, SHA);
  assert.notEqual(r.code, 0);
  assert.match(r.json.results[0].reasons[0], /no review is bound/);
});

test('check-reviews: review of an ancestor commit does not count (real git history)', () => {
  const root = mkRepo({ gates, gitInit: true });
  write(root, 'docs/review.md', 'report');
  const first = commitAll(root, 'one');
  write(root, 'src/a.ts', 'x');
  const second = commitAll(root, 'two');
  assert.notEqual(first, second);
  sh(root, 'git', ['merge-base', '--is-ancestor', first, second]);
  aeh(root, 'review', 'add', '--entry', JSON.stringify(reviewEntry(first)));
  assert.equal(aeh(root, 'check-reviews', '--commit', first, '--gate', 'G1').code, 0);
  const r = aeh(root, 'check-reviews', '--commit', second, '--gate', 'G1');
  assert.notEqual(r.code, 0);
  assert.match(r.json.results[0].reasons[0], /ancestor/);
});

test('check-reviews: non-independent review fails', () => {
  const { root } = setup(reviewEntry(SHA, { independent: false }));
  assert.notEqual(check(root, SHA).code, 0);
});

test('check-reviews: reviewer equal to author fails', () => {
  const { root } = setup(reviewEntry(SHA, { reviewer: { kind: 'agent', id: 'same' }, author: { id: 'same' } }));
  const r = check(root, SHA);
  assert.notEqual(r.code, 0);
  assert.match(r.json.results[0].reasons[0], /author/);
});

for (const verdict of ['unavailable', 'failed', 'changes-requested']) {
  test(`check-reviews: verdict ${verdict} fails`, () => {
    const { root } = setup(reviewEntry(SHA, { verdict }));
    assert.notEqual(check(root, SHA).code, 0);
  });
}

test('check-reviews: open high or critical finding fails; fixed one passes', () => {
  for (const severity of ['high', 'critical']) {
    const { root } = setup(reviewEntry(SHA, { findings: [{ id: 'F', severity, summary: 's', status: 'open' }] }));
    assert.notEqual(check(root, SHA).code, 0, severity);
  }
  const { root } = setup(reviewEntry(SHA, { findings: [{ id: 'F', severity: 'high', summary: 's', status: 'fixed', remediationCommit: 'b'.repeat(40) }] }));
  assert.equal(check(root, SHA).code, 0);
});

test('check-reviews: missing report file fails', () => {
  const root = mkRepo({ gates, reviews: [reviewEntry(SHA)] });
  assert.notEqual(check(root, SHA).code, 0);
});

test('check-reviews: wrong gate entry does not satisfy the gate; short SHA is refused', () => {
  const { root } = setup(reviewEntry(SHA, { gate: 'OTHER' }));
  assert.notEqual(check(root, SHA).code, 0);
  assert.notEqual(check(root, 'abc123').code, 0);
});

test('check-reviews: without --gate every reviewRequired gate is checked; others are skipped', () => {
  const root = mkRepo({ gates: [gate('G1', 'authorised', { reviewRequired: true }), gate('G2')], reviews: [] });
  const r = aeh(root, 'check-reviews', '--commit', SHA);
  assert.notEqual(r.code, 0);
  assert.deepEqual(r.json.results.map((x) => x.gate), ['G1']);
  const none = mkRepo({ gates: [gate('G2')] });
  assert.equal(aeh(none, 'check-reviews', '--commit', SHA).code, 0);
});

test('review add: validates SHA, report existence, verdict and duplicate ids', () => {
  const root = mkRepo({ gates });
  assert.notEqual(aeh(root, 'review', 'add', '--entry', JSON.stringify(reviewEntry('abc'))).code, 0, 'short sha');
  assert.notEqual(aeh(root, 'review', 'add', '--entry', JSON.stringify(reviewEntry(SHA))).code, 0, 'no report file');
  write(root, 'docs/review.md', 'r');
  assert.notEqual(aeh(root, 'review', 'add', '--entry', JSON.stringify(reviewEntry(SHA, { verdict: 'lgtm' }))).code, 0, 'bad verdict');
  assert.equal(aeh(root, 'review', 'add', '--entry', JSON.stringify(reviewEntry(SHA))).code, 0);
  assert.notEqual(aeh(root, 'review', 'add', '--entry', JSON.stringify(reviewEntry(SHA))).code, 0, 'duplicate id');
  assert.equal(check(root, SHA).code, 0);
});

test('review add: flag form builds an entry', () => {
  const root = mkRepo({ gates });
  write(root, 'docs/review.md', 'r');
  const r = aeh(root, 'review', 'add', '--id', 'R9', '--gate', 'G1', '--commit', SHA, '--reviewer-kind', 'model', '--reviewer-id', 'rv',
    '--author', 'au', '--independent', 'true', '--scope', 'src/**', '--verdict', 'approve', '--report', 'docs/review.md',
    '--finding', 'F1:low:open:minor nit');
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(check(root, SHA).code, 0);
});
