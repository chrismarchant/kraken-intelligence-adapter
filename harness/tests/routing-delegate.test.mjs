import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { write, HARNESS } from './helpers.mjs';
import { mkRoutingRepo, ledger, sse, POLICY } from './routing-helpers.mjs';
import { delegate, parseFiles } from '../scripts/delegate.mjs';

const block = (p, c) => `=== FILE: ${p} ===\n${c}\n=== END FILE ===\n`;
function setup() {
  const root = mkRoutingRepo();
  write(root, 'task.md', 'Add lib/a.mjs exporting one().\n');
  return root;
}
// A fetch that counts its calls and answers from a list.
function fake(...answers) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); const a = answers[Math.min(calls.length - 1, answers.length - 1)]; if (a instanceof Error) throw a; return a(); };
  f.calls = calls;
  return f;
}
const flagsFor = (root, o = {}) => ({ task: 'T1', budget: 'B1', model: 'mistral-large-4-0', workdir: root, instructions: path.join(root, 'task.md'), allow: 'lib/**', ...o });
const run = (root, fetchImpl, o) => delegate({ root, flags: flagsFor(root, o), fetchImpl });

test('P2: a model the policy does not list is refused before any network call', async () => {
  const root = setup();
  for (const model of ['claude-fable-5-2', 'fable', 'claude-opus-5-5', 'opus', 'haiku', 'codestral-latest', 'mistral-large-latest', 'MISTRAL-LARGE-4-0']) {
    const f = fake(() => sse());
    const r = await run(root, f, { model });
    assert.equal(r.exitCode, 3, model);
    assert.equal(r.receipt.outcome, 'model-not-permitted');
    assert.equal(r.receipt.networkCall, false);
    assert.equal(f.calls.length, 0, model);
  }
  assert.equal(ledger(root).filter((e) => e.kind === 'violation' && e.rule === 'delegate-model-not-permitted').length, 8);
  assert.equal((await run(root, fake(() => sse()), { model: undefined })).exitCode, 2);
});

test('P2: a fallback, endpoint or provider option is refused and recorded; there is no such route', async () => {
  const root = setup();
  for (const extra of [{ 'fallback-model': 'claude-opus-5-5' }, { fallback: true }, { endpoint: 'https://api.anthropic.com/v1/messages' }, { 'base-url': 'https://example.invalid' }, { provider: 'anthropic' }]) {
    const f = fake(() => sse());
    const r = await run(root, f, extra);
    assert.equal(r.exitCode, 2, JSON.stringify(extra));
    assert.match(r.receipt.reason, /no fallback/);
    assert.equal(f.calls.length, 0);
  }
  assert.equal(ledger(root).filter((e) => e.rule === 'fallback-or-reroute-requested').length, 5);
});

test('P2: a provider error ends the attempt: one call, no retry, no other model, nothing written', async () => {
  const root = setup();
  let i = 0;
  for (const answer of [() => sse({ status: 500 }), () => sse({ status: 429 }), new Error('socket hang up')]) {
    const f = fake(answer);
    const r = await run(root, f, { task: `E${i++}` });
    assert.equal(r.exitCode, 5);
    assert.equal(r.receipt.outcome, 'provider-error');
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url, 'https://api.mistral.ai/v1/chat/completions');
    assert.equal(f.calls[0].body.model, 'mistral-large-4-0');
  }
  assert.equal(fs.existsSync(path.join(root, 'lib')), false);
});

test('P2: a provider that reports another model fails closed: nothing is written', async () => {
  const root = setup();
  const r = await run(root, fake(() => sse({ model: 'mistral-medium-3-5', text: block('lib/a.mjs', 'export const one = () => 1;') })));
  assert.equal(r.exitCode, 5);
  assert.equal(r.receipt.outcome, 'model-mismatch');
  assert.equal(r.receipt.providerModel, 'mistral-medium-3-5');
  assert.equal(r.receipt.requestedModel, 'mistral-large-4-0');
  assert.equal(fs.existsSync(path.join(root, 'lib/a.mjs')), false);
  const report = spawnSync('node', [path.join(HARNESS, 'scripts/aeh.mjs'), '--root', root, '--json', 'routing', 'report'], { encoding: 'utf8' });
  assert.match(report.stdout, /provider-model-mismatch/);
});

test('a good answer is applied, tested and receipted with task, requested and reported model, and tokens', async () => {
  const root = setup();
  write(root, 'lib/check.mjs', "import { one } from './a.mjs';\nif (one() !== 1) process.exit(1);\n");
  const out = path.join(root, 'out');
  const f = fake(() => sse({ text: block('lib/a.mjs', 'export const one = () => 1;') + 'NOTES: done', completion: 222, prompt: 333 }));
  const r = await run(root, f, { file: 'lib/check.mjs', test: 'node lib/check.mjs', out, 'max-tokens': '900' });
  assert.equal(r.exitCode, 0);
  const e = r.receipt;
  assert.deepEqual([e.kind, e.task, e.budget, e.requestedModel, e.providerModel, e.outcome, e.attempt], ['delegation', 'T1', 'B1', 'mistral-large-4-0', 'mistral-large-4-0', 'ok', 1]);
  assert.deepEqual(e.usage, { promptTokens: 333, completionTokens: 222, reasoningTokens: 40, totalTokens: 555 });
  assert.equal(e.chargedOutputTokens, 222);
  assert.deepEqual(e.files, ['lib/a.mjs']);
  assert.deepEqual(e.test, { command: 'node lib/check.mjs', exitCode: 0 });
  assert.match(e.patchSha256, /^[0-9a-f]{64}$/);
  assert.equal(fs.readFileSync(path.join(root, 'lib/a.mjs'), 'utf8'), 'export const one = () => 1;\n');
  assert.match(fs.readFileSync(r.patchFile, 'utf8'), /\+export const one/);
  // What was sent: the named model, streaming, the cap, the context file; the reasoning block was dropped.
  const b = f.calls[0].body;
  assert.deepEqual([b.model, b.stream, b.max_tokens, b.reasoning_effort], ['mistral-large-4-0', true, 900, 'low']);
  assert.match(b.messages[1].content, /<file path="lib\/check.mjs">/);
  assert.equal(f.calls[0].init.headers.Authorization, `Bearer ${process.env.MISTRAL_API_KEY || 'proxy-injected'}`);
  assert.deepEqual(ledger(root).at(-1).id, e.id);
});

test('a failing test command is a failed attempt', async () => {
  const root = setup();
  const r = await run(root, fake(() => sse({ text: block('lib/a.mjs', 'export const one = () => 2;') })), { test: 'exit 3' });
  assert.equal(r.exitCode, 7);
  assert.equal(r.receipt.outcome, 'test-failed');
  assert.equal(r.receipt.test.exitCode, 3);
});

test('a cut-off answer or one without file blocks changes nothing', async () => {
  const root = setup();
  const a = await run(root, fake(() => sse({ finish: 'length', text: block('lib/a.mjs', 'x') })));
  assert.deepEqual([a.exitCode, a.receipt.outcome], [6, 'truncated']);
  const b = await run(root, fake(() => sse({ text: 'I would rather explain.' })), { task: 'T2' });
  assert.deepEqual([b.exitCode, b.receipt.outcome], [6, 'no-files']);
  assert.equal(fs.existsSync(path.join(root, 'lib')), false);
});

test('paths: outside --allow, escaping the tree, or owned by a blocked gate are refused and nothing is written', async () => {
  const root = setup();
  const cases = [
    ['docs/x.md', 'lib/**', /outside --allow/],
    ['../x.mjs', 'lib/**', /not a plain relative path/],
    ['/etc/x', '**', /not a plain relative path/],
    ['lib/../../x', 'lib/**', /not a plain relative path/],
    ['.git/hooks/pre-commit', '**', /not a plain relative path/],
    ['src/evaluation/terms.ts', 'src/**', /gate P is blocked/],
    ['tests/a.test.ts', '**', /gate P is blocked/],
  ];
  let i = 0;
  for (const [p, allow, why] of cases) {
    const good = block('lib/ok.mjs', 'export {};');
    const r = await run(root, fake(() => sse({ text: good + block(p, 'x') })), { allow: [allow, 'lib/**'], task: `P${i++}` });
    assert.equal(r.exitCode, 6, p);
    assert.equal(r.receipt.outcome, 'path-refused');
    assert.match(r.receipt.problems.join(' '), why, p);
  }
  assert.equal(fs.existsSync(path.join(root, 'lib/ok.mjs')), false, 'one refused path refuses the whole answer');
  assert.equal(fs.existsSync(path.join(root, 'src')), false);
  const c = await run(root, fake(() => sse()), { file: '../outside.txt' });
  assert.deepEqual([c.exitCode, c.receipt.outcome, c.receipt.networkCall], [6, 'path-refused', false]);
});

test('retries: a task gets one attempt and two retries, then is refused without a call', async () => {
  const root = setup();
  const f = fake(() => sse({ status: 500 }));
  for (let i = 1; i <= 3; i++) {
    const r = await run(root, f);
    assert.deepEqual([r.exitCode, r.receipt.attempt], [5, i]);
  }
  const r = await run(root, f);
  assert.deepEqual([r.exitCode, r.receipt.outcome, r.receipt.networkCall], [4, 'retry-limit', false]);
  assert.equal(f.calls.length, 3);
  assert.equal((await run(root, f, { task: 'OTHER' })).exitCode, 5, 'another task has its own count');
});

test('budget: calls and output tokens are capped; an undefined budget is refused', async () => {
  const root = mkRoutingRepo({ policy: { ...POLICY, budgets: { SMALL: { maxCalls: 2, maxOutputTokens: 1000 } } } });
  write(root, 'task.md', 't\n');
  const ok = () => sse({ text: block('lib/a.mjs', 'export {};'), completion: 700 });
  assert.equal((await run(root, fake(ok), { budget: 'NOPE' })).exitCode, 2);
  assert.equal((await run(root, fake(ok), { budget: undefined })).exitCode, 2);
  const f = fake(ok);
  assert.equal((await run(root, f, { budget: 'SMALL', task: 'A', 'max-tokens': '5000' })).exitCode, 0);
  assert.equal(f.calls[0].body.max_tokens, 1000, 'the request is capped at what the budget has left');
  const second = await run(root, f, { budget: 'SMALL', task: 'B' });
  assert.equal(f.calls[1].body.max_tokens, 300);
  assert.equal(second.exitCode, 0);
  const third = await run(root, f, { budget: 'SMALL', task: 'C' });
  assert.deepEqual([third.exitCode, third.receipt.outcome], [4, 'budget-exhausted']);
  assert.equal(f.calls.length, 2);
  // A call that broke off is charged at its allowance.
  const root2 = setup();
  const broke = await run(root2, fake(new Error('reset')), { 'max-tokens': '800' });
  assert.equal(broke.receipt.chargedOutputTokens, 800);
});

test('a secondary model must be chosen explicitly with a reason; the primary is never substituted', async () => {
  const root = setup();
  const f = fake(() => sse({ model: 'zai-glm-5-3', text: block('lib/a.mjs', 'export {};') }));
  assert.equal((await run(root, f, { model: 'zai-glm-5-3' })).exitCode, 2);
  assert.equal(f.calls.length, 0);
  const r = await run(root, f, { model: 'zai-glm-5-3', reason: 'long multi-file context' });
  assert.equal(r.exitCode, 0);
  assert.deepEqual([r.receipt.requestedModel, r.receipt.providerModel, f.calls[0].body.model], ['zai-glm-5-3', 'zai-glm-5-3', 'zai-glm-5-3']);
});

test('the global stop refuses a delegation; a credential-shaped prompt is not sent', async () => {
  const root = setup();
  write(root, 'harness/state/GLOBAL_STOP', JSON.stringify({ reason: 'drill' }));
  const f = fake(() => sse());
  const r = await run(root, f);
  assert.deepEqual([r.exitCode, f.calls.length], [2, 0]);
  assert.match(r.receipt.reason, /GLOBAL STOP/);
  fs.rmSync(path.join(root, 'harness/state/GLOBAL_STOP'));
  write(root, 'lib/leak.mjs', `const k = "sk-${'a1B2c3D4'.repeat(6)}";\n`);
  const s = await run(root, f, { file: 'lib/leak.mjs' });
  assert.deepEqual([s.exitCode, f.calls.length], [2, 0]);
  assert.match(s.receipt.reason, /credential-shaped/);
});

test('--ping verifies identity and usage without a work tree', async () => {
  const root = setup();
  const r = await delegate({ root, flags: { ping: true, task: 'PING', budget: 'B1', model: 'mistral-large-4-0', 'max-tokens': '500' }, fetchImpl: fake(() => sse({ text: 'ready', completion: 61 })) });
  assert.deepEqual([r.exitCode, r.receipt.outcome, r.receipt.providerModel, r.receipt.usage.completionTokens], [0, 'ok', 'mistral-large-4-0', 61]);
});

test('parseFiles reads only well-formed blocks', () => {
  assert.deepEqual(parseFiles(block('a/b.mjs', 'x\ny') + 'NOTES: n').map((f) => [f.path, f.content]), [['a/b.mjs', 'x\ny\n']]);
  assert.equal(parseFiles('=== FILE: a ===\nno end').length, 0);
});

test('the command line never reaches the network for a refused model (exit 3)', () => {
  const root = setup();
  const r = spawnSync('node', [path.join(HARNESS, 'scripts/delegate.mjs'), '--root', root, '--ping', '--task', 'X', '--budget', 'B1', '--model', 'claude-opus-5-5'], { encoding: 'utf8', env: { ...process.env, HTTPS_PROXY: 'http://127.0.0.1:9', https_proxy: 'http://127.0.0.1:9' } });
  assert.equal(r.status, 3);
  assert.equal(JSON.parse(r.stdout).receipt.outcome, 'model-not-permitted');
});
