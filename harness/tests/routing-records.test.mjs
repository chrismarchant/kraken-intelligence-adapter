import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { write, sh, aeh, commitAll, reviewEntry, AEH } from './helpers.mjs';
import { mkRoutingRepo } from './routing-helpers.mjs';

const SHA = 'a'.repeat(40);
const add = (root, o) => aeh(root, 'review', 'add', '--entry', JSON.stringify(reviewEntry(SHA, o)));

test('reviews: one review and one re-review per gate and area; a third needs an owner escalation reference', () => {
  const root = mkRoutingRepo();
  write(root, 'docs/review.md', 'r\n');
  assert.equal(add(root, { id: 'R1', area: 'evaluator' }).code, 0);
  assert.equal(aeh(root, 'review', 'rounds', '--gate', 'G1', '--area', 'evaluator').json.left, 1);
  assert.equal(add(root, { id: 'R2', area: 'evaluator' }).code, 0);
  const rounds = aeh(root, 'review', 'rounds', '--gate', 'G1', '--area', 'evaluator');
  assert.deepEqual([rounds.code, rounds.json.left], [1, 0]);
  const third = add(root, { id: 'R3', area: 'evaluator' });
  assert.equal(third.code, 1);
  assert.match(third.json.reason, /limit is 2/);
  assert.equal(add(root, { id: 'R3', area: 'evaluator', ownerEscalation: 'directive 2026-11-20' }).code, 0);
  assert.equal(add(root, { id: 'R4', area: 'evaluator' }).code, 1, 'each further round needs its own reference');
  assert.equal(add(root, { id: 'R5', area: 'store' }).code, 0, 'another area has its own count');
  assert.equal(add(root, { id: 'R6', area: 'evaluator', gate: 'P' }).code, 0, 'another gate has its own count');
  const saved = JSON.parse(fs.readFileSync(path.join(root, 'harness/state/reviews.json'), 'utf8')).reviews;
  assert.deepEqual(saved.map((r) => r.id), ['R1', 'R2', 'R3', 'R5', 'R6']);
  assert.equal(saved[2].ownerEscalation, 'directive 2026-11-20');
  assert.equal(aeh(root, 'check-records').code, 0);
});

test('reviews: an entry without an area is refused once a policy exists; older entries without one are not counted', () => {
  const root = mkRoutingRepo();
  write(root, 'docs/review.md', 'r\n');
  write(root, 'harness/state/reviews.json', JSON.stringify({ reviews: [reviewEntry(SHA, { id: 'OLD1' }), reviewEntry(SHA, { id: 'OLD2' }), reviewEntry(SHA, { id: 'OLD3' })] }));
  assert.match(add(root, { id: 'N1' }).json.reason, /needs an area/);
  assert.equal(add(root, { id: 'N1', area: 'evaluator' }).code, 0);
});

function receipt(root, o) {
  fs.appendFileSync(path.join(root, 'harness/state/model-usage.jsonl'), JSON.stringify({ at: '2026-11-14T00:00:00Z', kind: 'delegation', networkCall: true, outcome: 'ok', providerModel: 'mistral-large-4-0', requestedModel: 'mistral-large-4-0', task: 'T', ...o }) + '\n');
}

test('routing check: a commit that changes delegate-reserved paths needs a receipt that covers them', () => {
  const root = mkRoutingRepo();
  const base = sh(root, 'git', ['rev-parse', 'HEAD']);
  write(root, 'docs/note.md', 'n\n');
  commitAll(root, 'docs only');
  assert.equal(aeh(root, 'routing', 'check', '--base', base).code, 0);

  write(root, 'src/a.ts', 'export const a = 1;\n');
  commitAll(root, 'product change by hand');
  const bare = aeh(root, 'routing', 'check', '--base', base);
  assert.equal(bare.code, 1);
  assert.match(bare.json.problems[0], /no Delegation-Receipt trailer/);

  const mid = sh(root, 'git', ['rev-parse', 'HEAD']);
  write(root, 'src/b.ts', 'export const b = 1;\n');
  commitAll(root, 'product change\n\nDelegation-Receipt: dlg-missing');
  assert.match(aeh(root, 'routing', 'check', '--base', mid).json.problems[0], /not in the usage ledger/);

  const cases = [
    [{ id: 'dlg-bad-outcome', outcome: 'test-failed', files: ['src/c.ts'] }, /outcome test-failed/],
    [{ id: 'dlg-bad-model', providerModel: 'claude-fable-5-2', files: ['src/c.ts'] }, /not a permitted delegate/],
    [{ id: 'dlg-other-files', files: ['src/zzz.ts'] }, /not written by the named receipt/],
  ];
  for (const [r, why] of cases) {
    const before = sh(root, 'git', ['rev-parse', 'HEAD']);
    receipt(root, r);
    fs.appendFileSync(path.join(root, 'src/c.ts'), `// ${r.id}\n`);
    commitAll(root, `change\n\nDelegation-Receipt: ${r.id}`);
    const c = aeh(root, 'routing', 'check', '--base', before);
    assert.equal(c.code, 1, r.id);
    assert.match(c.json.problems.join(' '), why);
  }

  const before = sh(root, 'git', ['rev-parse', 'HEAD']);
  receipt(root, { id: 'dlg-good', files: ['src/d.ts', 'tests/d.test.ts'] });
  write(root, 'src/d.ts', 'export const d = 1;\n');
  write(root, 'tests/d.test.ts', '// t\n');
  commitAll(root, 'delegated change\n\nDelegation-Receipt: dlg-good');
  const good = aeh(root, 'routing', 'check', '--base', before);
  assert.deepEqual([good.code, good.json.commitsChecked], [0, 1]);
});

test('routing check refuses to pass under a global stop; status carries the policy', () => {
  const root = mkRoutingRepo();
  const text = spawnSync('node', [AEH, '--root', root, 'status'], { encoding: 'utf8' }).stdout;
  assert.match(text, /name a model on every launch/);
  write(root, 'harness/state/GLOBAL_STOP', JSON.stringify({ reason: 'drill' }));
  assert.equal(aeh(root, 'routing', 'check').code, 1);
});

