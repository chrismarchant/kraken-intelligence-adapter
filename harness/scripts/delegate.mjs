#!/usr/bin/env node
// Delegation runner: sends one bounded engineering task to a permitted delegate model, applies the
// files it returns inside one work tree, runs a test command, and writes a usage receipt.
//
//   node harness/scripts/delegate.mjs --task <id> --budget <id> --model <model id> \
//     --workdir <git work tree> --instructions <file> --allow <glob> [--allow <glob>...] \
//     [--file <path in workdir>...] [--test "<command>"] [--out <dir>] [--max-tokens N] \
//     [--reasoning low|medium|high] [--reason "<why a secondary model>"]
//   node harness/scripts/delegate.mjs --ping --task <id> --budget <id> --model <model id>
//
// What it refuses, before any network call: a model the policy does not list; any flag it does not
// know (there is no fallback or endpoint option); a task past its retry limit; a budget that is
// spent or not defined; a global stop; a path outside --allow or owned by an unauthorised gate.
// What it refuses after the call: a provider-reported model that differs from the one asked for;
// a provider error; an answer that was cut off. It never retries by itself and has no other route:
// a failure ends with a non-zero exit and a receipt, and the caller decides.
//
// Exit codes: 0 ok; 2 refused before the call; 3 model not permitted; 4 limit reached;
// 5 provider failure or model mismatch; 6 answer unusable or path refused; 7 test failed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, readJson, matchPath, git, globalStop, P } from './lib.mjs';
import { loadPolicy, appendLedger, readLedger, delegationModels, attemptsFor, budgetSpent, gateProblems } from './routing.mjs';
import { scanLine } from './secret-scan.mjs';

const KNOWN = new Set(['task', 'budget', 'model', 'workdir', 'instructions', 'allow', 'file', 'test', 'out', 'max-tokens', 'reasoning', 'reason', 'ping', 'root', 'json']);
const MAX_CONTEXT_BYTES = 400000;
const MAX_ANSWER_CHARS = 2000000;
const SYSTEM = [
  'You are the implementation model for one bounded engineering task. Follow the task exactly and change nothing else.',
  'Return every file you create or change IN FULL, each in a block of exactly this form:',
  '=== FILE: relative/path ===',
  '<the whole content of the file>',
  '=== END FILE ===',
  'Use only relative paths that match the allowed patterns given in the task. No markdown fences around the blocks.',
  'After the last block you may add one line starting with "NOTES:". Write nothing else.',
].join('\n');

class Refusal extends Error {
  constructor(code, outcome, message) { super(message); this.code = code; this.outcome = outcome; }
}
const arr = (v) => (v === undefined || v === true ? [] : [].concat(v).map(String));

// Read a streamed chat completion. Returns what the provider reported; reasoning blocks are dropped.
async function readStream(response) {
  const models = new Set();
  let id = null, finish = null, usage = null, text = '', held = '';
  const take = (line) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let chunk; try { chunk = JSON.parse(data); } catch { return; }
    if (typeof chunk.model === 'string') models.add(chunk.model);
    if (typeof chunk.id === 'string') id = chunk.id;
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices && chunk.choices[0];
    if (!choice) return;
    if (choice.finish_reason) finish = choice.finish_reason;
    const c = choice.delta ? choice.delta.content : choice.message ? choice.message.content : null;
    if (typeof c === 'string') text += c;
    else if (Array.isArray(c)) for (const b of c) if (b && b.type === 'text' && typeof b.text === 'string') text += b.text;
    if (text.length > MAX_ANSWER_CHARS) throw new Error('answer too large');
  };
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/event-stream')) {
    const doc = JSON.parse(await response.text());
    take('data: ' + JSON.stringify(doc));
    return { models: [...models], id, finish, usage, text };
  }
  const decoder = new TextDecoder();
  for await (const part of response.body) {
    held += decoder.decode(part, { stream: true });
    let i;
    while ((i = held.indexOf('\n')) >= 0) { take(held.slice(0, i).trimEnd()); held = held.slice(i + 1); }
  }
  if (held.trim()) take(held.trim());
  return { models: [...models], id, finish, usage, text };
}

export function parseFiles(answer) {
  const files = [];
  const re = /^=== FILE: (.+?) ===\r?\n([\s\S]*?)\r?\n=== END FILE ===\s*$/gm;
  let m;
  while ((m = re.exec(answer))) files.push({ path: m[1].trim(), content: m[2].endsWith('\n') ? m[2] : m[2] + '\n' });
  return files;
}

function safeRel(p) {
  return typeof p === 'string' && p && !path.isAbsolute(p) && !p.includes('\\') && !p.split('/').some((s) => s === '..' || s === '' || s === '.git') && !p.startsWith('.');
}

// opts: { root, flags, fetchImpl, now }. Returns { exitCode, receipt }.
export async function delegate({ root, flags, fetchImpl = globalThis.fetch }) {
  const base = { kind: 'delegation', id: `dlg-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`, networkCall: false };
  let policy;
  try { policy = loadPolicy(root); } catch (e) { return { exitCode: 2, receipt: { ...base, outcome: 'refused', reason: `policy unreadable: ${e.message}` } }; }
  const task = typeof flags.task === 'string' ? flags.task : null;
  const budget = typeof flags.budget === 'string' ? flags.budget : null;
  const model = typeof flags.model === 'string' ? flags.model : null;
  const ping = flags.ping === true;
  const record = (extra) => appendLedger(root, { ...base, task, budget, requestedModel: model, ...extra });
  const done = (exitCode, extra) => ({ exitCode, receipt: record(extra) });

  try {
    const unknown = Object.keys(flags).filter((k) => !KNOWN.has(k));
    if (unknown.length) {
      const fallback = unknown.some((k) => /fallback|endpoint|base-url|provider/i.test(k));
      if (fallback) appendLedger(root, { kind: 'violation', rule: 'fallback-or-reroute-requested', refused: true, detail: `delegate called with --${unknown.join(' --')}` });
      throw new Refusal(2, 'refused', `unknown option(s): --${unknown.join(', --')}. The runner has one route and no fallback.`);
    }
    if (!task || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(task)) throw new Refusal(2, 'refused', '--task <id> is required');
    if (!model) throw new Refusal(2, 'refused', '--model is required: every delegation names its model');
    if (!delegationModels(policy).includes(model)) {
      appendLedger(root, { kind: 'violation', rule: 'delegate-model-not-permitted', refused: true, detail: `task ${task}: model ${model}` });
      throw new Refusal(3, 'model-not-permitted', `model "${model}" is not a permitted delegate (primary ${policy.delegation.primary}; secondary ${policy.delegation.secondary.join(', ')})`);
    }
    if (model !== policy.delegation.primary && !(typeof flags.reason === 'string' && flags.reason.trim())) {
      throw new Refusal(2, 'refused', `"${model}" is a secondary route: say why the primary is not used with --reason "..."`);
    }
    const stop = globalStop(root);
    if (stop) throw new Refusal(2, 'refused', `GLOBAL STOP active: ${stop.reason}`);
    const b = budget && policy.budgets ? policy.budgets[budget] : null;
    if (!b) throw new Refusal(2, 'refused', `--budget must name a budget defined in harness/config/model-policy.json (got ${budget || 'none'})`);
    const ledger = readLedger(root);
    const attempts = attemptsFor(ledger, task);
    if (attempts >= 1 + policy.delegation.maxRetries) throw new Refusal(4, 'retry-limit', `task ${task} has used its ${1 + policy.delegation.maxRetries} attempts (1 + ${policy.delegation.maxRetries} retries)`);
    const spent = budgetSpent(ledger, budget);
    if (spent.calls >= b.maxCalls) throw new Refusal(4, 'budget-exhausted', `budget ${budget}: ${spent.calls} of ${b.maxCalls} calls used`);
    const room = b.maxOutputTokens - spent.outputTokens;
    const want = Number.parseInt(flags['max-tokens'], 10) || policy.delegation.defaultMaxTokens;
    const maxTokens = Math.min(want, room);
    if (maxTokens < 16) throw new Refusal(4, 'budget-exhausted', `budget ${budget}: ${spent.outputTokens} of ${b.maxOutputTokens} output tokens used`);
    const reasoning = flags.reasoning === undefined ? 'low' : flags.reasoning;
    if (!['low', 'medium', 'high'].includes(reasoning)) throw new Refusal(2, 'refused', '--reasoning must be low|medium|high');

    // ---- what to send, where the answer may land
    let user, workdir = null, allow = [], gdoc = null;
    if (ping) user = 'Reply with the single word: ready';
    else {
      workdir = typeof flags.workdir === 'string' ? fs.realpathSync(path.resolve(flags.workdir)) : null;
      if (!workdir) throw new Refusal(2, 'refused', '--workdir <git work tree> is required');
      const top = git(workdir, ['rev-parse', '--show-toplevel']);
      if (!top.ok || fs.realpathSync(top.out.trim()) !== workdir) throw new Refusal(2, 'refused', '--workdir must be the top of a git work tree');
      allow = arr(flags.allow);
      if (!allow.length) throw new Refusal(2, 'refused', 'at least one --allow <glob> is required');
      // A work tree of this repository answers to this repository's gate map.
      const common = (dir) => { const r = git(dir, ['rev-parse', '--git-common-dir']); return r.ok ? fs.realpathSync(path.resolve(dir, r.out.trim())) : null; };
      if (common(workdir) && common(workdir) === common(root)) gdoc = readJson(P.gates(root));
      if (typeof flags.instructions !== 'string') throw new Refusal(2, 'refused', '--instructions <file> is required');
      const instructions = fs.readFileSync(path.resolve(flags.instructions), 'utf8');
      const parts = [];
      let bytes = 0;
      for (const f of arr(flags.file)) {
        if (!safeRel(f)) throw new Refusal(6, 'path-refused', `--file ${f}: not a plain relative path inside the work tree`);
        const abs = fs.realpathSync(path.join(workdir, f));
        if (!abs.startsWith(workdir + path.sep)) throw new Refusal(6, 'path-refused', `--file ${f}: resolves outside the work tree`);
        const content = fs.readFileSync(abs, 'utf8');
        bytes += content.length;
        if (bytes > MAX_CONTEXT_BYTES) throw new Refusal(2, 'refused', `context files exceed ${MAX_CONTEXT_BYTES} bytes`);
        parts.push(`<file path="${f}">\n${content}\n</file>`);
      }
      user = [`<task>\n${instructions.trim()}\n</task>`, `<allowed-paths>\n${allow.join('\n')}\n</allowed-paths>`, ...parts].join('\n\n');
      if (user.split('\n').some((l) => scanLine(l).length)) throw new Refusal(2, 'refused', 'the prompt contains a credential-shaped string; nothing was sent');
    }

    // ---- the one call
    const meta = { networkCall: true, attempt: attempts + 1, maxTokens, reasoning, endpointHost: new URL(policy.delegation.endpoint).host, ...(flags.reason ? { secondaryReason: String(flags.reason).slice(0, 200) } : {}) };
    let got, status = null;
    try {
      const response = await fetchImpl(policy.delegation.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${process.env.MISTRAL_API_KEY || 'proxy-injected'}` },
        body: JSON.stringify({ model, max_tokens: maxTokens, stream: true, reasoning_effort: reasoning, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }),
        signal: AbortSignal.timeout(300000),
      });
      status = response.status;
      if (!response.ok) return done(5, { ...meta, outcome: 'provider-error', httpStatus: status, chargedOutputTokens: 0, providerModel: null });
      got = await readStream(response);
    } catch (e) {
      // A call that broke off reported no usage: charged at its allowance.
      return done(5, { ...meta, outcome: 'provider-error', httpStatus: status, error: String(e.name || 'Error'), chargedOutputTokens: maxTokens, providerModel: null });
    }
    const u = got.usage || {};
    const completion = Number.isFinite(u.completion_tokens) ? u.completion_tokens : null;
    const reported = {
      ...meta, httpStatus: status, providerModel: got.models.length === 1 ? got.models[0] : got.models.length ? got.models.join('+') : null,
      providerResponseId: got.id, finishReason: got.finish,
      usage: { promptTokens: u.prompt_tokens ?? null, completionTokens: completion, reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? null, totalTokens: u.total_tokens ?? null },
      chargedOutputTokens: completion ?? maxTokens,
    };
    if (reported.providerModel !== model) return done(5, { ...reported, outcome: 'model-mismatch' });
    if (got.finish !== 'stop') return done(6, { ...reported, outcome: 'truncated' });
    if (ping) return done(0, { ...reported, outcome: 'ok', answerChars: got.text.trim().length });

    // ---- apply inside the work tree
    const files = parseFiles(got.text);
    if (!files.length) return done(6, { ...reported, outcome: 'no-files' });
    const problems = [];
    for (const f of files) {
      if (!safeRel(f.path)) problems.push(`${f.path}: not a plain relative path`);
      else if (!allow.some((g) => matchPath(g, f.path))) problems.push(`${f.path}: outside --allow`);
    }
    if (gdoc) problems.push(...gateProblems(gdoc, files.map((f) => f.path).filter(safeRel)));
    if (problems.length) return done(6, { ...reported, outcome: 'path-refused', problems: problems.slice(0, 10) });
    for (const f of files) {
      const abs = path.join(workdir, f.path);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const real = fs.realpathSync(path.dirname(abs));
      if (real !== workdir && !real.startsWith(workdir + path.sep)) return done(6, { ...reported, outcome: 'path-refused', problems: [`${f.path}: resolves outside the work tree`] });
      fs.writeFileSync(abs, f.content);
    }
    const names = files.map((f) => f.path);
    git(workdir, ['add', '-N', '--', ...names]);
    const patch = git(workdir, ['diff', '--', ...names]).out;
    const patchSha256 = crypto.createHash('sha256').update(patch).digest('hex');
    let patchFile = null;
    if (typeof flags.out === 'string') {
      fs.mkdirSync(path.resolve(flags.out), { recursive: true });
      patchFile = path.join(path.resolve(flags.out), `${base.id}.patch`);
      fs.writeFileSync(patchFile, patch);
    }
    let test = null;
    if (typeof flags.test === 'string' && flags.test.trim()) {
      const r = spawnSync('sh', ['-c', flags.test], { cwd: workdir, encoding: 'utf8', timeout: 600000 });
      test = { command: flags.test, exitCode: r.status === null ? -1 : r.status };
      if (typeof flags.out === 'string') fs.writeFileSync(path.join(path.resolve(flags.out), `${base.id}.test.txt`), `${r.stdout || ''}\n${r.stderr || ''}`);
    }
    const applied = { ...reported, files: names, patchSha256, patchLines: patch.split('\n').length, ...(test ? { test } : {}) };
    if (test && test.exitCode !== 0) return done(7, { ...applied, outcome: 'test-failed' });
    return { exitCode: 0, receipt: record({ ...applied, outcome: 'ok' }), patchFile };
  } catch (e) {
    if (e instanceof Refusal) return done(e.code, { outcome: e.outcome, reason: e.message });
    return done(2, { outcome: 'refused', reason: `internal error: ${e.message}` });
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Node's fetch honours the session proxy only when this is set at start.
  if ((process.env.HTTPS_PROXY || process.env.https_proxy) && process.env.NODE_USE_ENV_PROXY !== '1') {
    const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
    process.exit(r.status === null ? 1 : r.status);
  }
  const { flags } = parseArgs(process.argv.slice(2));
  const root = path.resolve(typeof flags.root === 'string' ? flags.root : path.dirname(fileURLToPath(import.meta.url)) + '/../..');
  const { exitCode, receipt, patchFile } = await delegate({ root, flags });
  console.log(JSON.stringify({ exitCode, ...(patchFile ? { patchFile } : {}), receipt }, null, 2));
  process.exit(exitCode);
}
