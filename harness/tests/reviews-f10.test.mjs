import test from 'node:test';
import assert from 'node:assert/strict';
import { mkRepo, aeh, gate, write, reviewEntry } from './helpers.mjs';

const SHA = 'a'.repeat(40);
const REM = 'b'.repeat(40);
const gates = [gate('G1', 'authorised', { reviewRequired: true })];
function setup(entries) {
  const root = mkRepo({ gates, reviews: entries });
  write(root, 'docs/review.md', 'report');
  return root;
}
const check = (root) => aeh(root, 'check-reviews', '--commit', SHA, '--gate', 'G1');
const crit = (o = {}) => ({ id: 'F1', severity: 'critical', summary: 's', status: 'open', ...o });
const signoff = { by: 'owner', at: '2026-11-13T00:00:00Z', reference: 'docs/decisions/OWNER_DECISIONS.md#OD-9' };

test('F10: a passing review does not outvote changes-requested with an open critical finding on the same commit', () => {
  const root = setup([
    reviewEntry(SHA, { id: 'R1' }),
    reviewEntry(SHA, { id: 'R2', reviewer: { kind: 'agent', id: 'reviewer-c' }, verdict: 'changes-requested', findings: [crit()] }),
  ]);
  const r = check(root);
  assert.notEqual(r.code, 0, r.stdout);
  assert.match(r.json.results[0].reasons.join('\n'), /R2: verdict is changes-requested/);
  assert.match(r.json.results[0].reasons.join('\n'), /critical finding F1 open/);
});

test('F10: failed and unavailable entries each block a passing entry', () => {
  for (const verdict of ['failed', 'unavailable']) {
    const root = setup([reviewEntry(SHA, { id: 'R1' }), reviewEntry(SHA, { id: 'R2', verdict })]);
    assert.notEqual(check(root).code, 0, verdict);
  }
});

test('F10: an open high finding inside an approving entry blocks, even beside another clean approval', () => {
  const root = setup([
    reviewEntry(SHA, { id: 'R1' }),
    reviewEntry(SHA, { id: 'R2', verdict: 'approve-with-followups', findings: [crit({ severity: 'high' })] }),
  ]);
  assert.notEqual(check(root).code, 0);
});

test('F10: only blocking entries with no qualifying pass still fails; a clean pass alone passes', () => {
  assert.equal(check(setup([reviewEntry(SHA)])).code, 0);
  assert.notEqual(check(setup([reviewEntry(SHA, { independent: false })])).code, 0);
});

test('F10: accepted or wontfix critical without ownerSignoff blocks', () => {
  for (const status of ['accepted', 'wontfix']) {
    const root = setup([reviewEntry(SHA, { verdict: 'approve-with-followups', findings: [crit({ status })] })]);
    const r = check(root);
    assert.notEqual(r.code, 0, status);
    assert.match(r.json.results[0].reasons.join('\n'), /without ownerSignoff/);
  }
});

test('F10: an incomplete ownerSignoff (empty reference) is rejected by the schema and blocks if present in the ledger', () => {
  const bad = { ...signoff, reference: '' };
  const root = setup([reviewEntry(SHA, { verdict: 'approve-with-followups', findings: [crit({ status: 'accepted', ownerSignoff: bad })] })]);
  assert.notEqual(check(root).code, 0);
  assert.notEqual(aeh(root, 'check-records').code, 0);
});

test('F10: accepted critical WITH a complete ownerSignoff passes, and validates', () => {
  const root = setup([reviewEntry(SHA, { verdict: 'approve-with-followups', findings: [crit({ status: 'accepted', ownerSignoff: signoff })] })]);
  assert.equal(check(root).code, 0, check(root).stdout);
  assert.equal(aeh(root, 'check-records').code, 0, aeh(root, 'check-records').stdout);
});

test('F10: fixed critical without remediationCommit blocks; with a 40-char remediationCommit passes', () => {
  const noRem = setup([reviewEntry(SHA, { findings: [crit({ status: 'fixed' })] })]);
  const r = check(noRem);
  assert.notEqual(r.code, 0);
  assert.match(r.json.results[0].reasons.join('\n'), /without remediationCommit/);
  const withRem = setup([reviewEntry(SHA, { findings: [crit({ status: 'fixed', remediationCommit: REM })] })]);
  assert.equal(check(withRem).code, 0);
});

test('F10: exact-SHA, independence, reviewer != author and report file are still required', () => {
  assert.notEqual(check(setup([reviewEntry('c'.repeat(40))])).code, 0);
  assert.notEqual(check(setup([reviewEntry(SHA, { author: { id: 'reviewer-a' } })])).code, 0);
  const root = mkRepo({ gates, reviews: [reviewEntry(SHA, { reportPath: 'docs/missing.md' })] });
  assert.notEqual(check(root).code, 0);
});
