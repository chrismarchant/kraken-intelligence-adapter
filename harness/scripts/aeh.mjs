#!/usr/bin/env node
// AEH command line: ledger status, runnable queue, stops, gate/record/review checks, readiness, checkpoints.
// Repository root: --root <dir> (default cwd). --json for machine output. Non-zero exit = failure.
import fs from 'node:fs';
import path from 'node:path';
import {
  parseArgs, rootOf, readJson, writeJson, P, git, matchPath, validateSchema, findCycle,
  globalStop, analyse, loadTasks, loadGates, logStop, GATE_OK,
} from './lib.mjs';
import { scanLine } from './secret-scan.mjs';

const { positional, flags } = parseArgs(process.argv.slice(2));
const root = rootOf(flags);
const json = !!flags.json;
const now = () => new Date().toISOString();
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const list = (v) => (v === undefined || v === true ? [] : [].concat(v));

let exit = 0;
function emit(obj, lines) {
  if (json) console.log(JSON.stringify(obj, null, 2));
  else for (const l of lines) console.log(l);
}
function fail(reason, extra = {}) {
  exit = exit || 1;
  if (json) console.log(JSON.stringify({ ok: false, reason, ...extra }, null, 2));
  else console.error(`FAIL: ${reason}`);
  return false;
}
const globalStopReason = () => {
  const s = globalStop(root);
  return s ? `GLOBAL STOP active (${s.reason}). Clear it with: aeh clear --level global --by <name> --owner-reference <where the owner authorised it> --reason "..."` : null;
};
// Every check-* command refuses to pass under a global stop.
function guardStop() {
  const r = globalStopReason();
  if (r) { exit = 1; fail(r, { globalStop: true }); return true; }
  return false;
}

const FULL_SHA = /^[0-9a-f]{40}$/;

// ---------------------------------------------------------------- status / next
function cmdStatus() {
  const tasks = loadTasks(root).tasks;
  const gdoc = loadGates(root);
  const stop = globalStop(root);
  const a = analyse(tasks, gdoc.gates, stop);
  const counts = {};
  for (const t of tasks) counts[t.status] = (counts[t.status] || 0) + 1;
  const stops = tasks.filter((t) => t.stop).map((t) => ({ task: t.id, ...t.stop }));
  const gateStops = gdoc.gates.filter((g) => g.stop).map((g) => ({ gate: g.id, ...g.stop }));
  const result = {
    ok: true, globalStop: stop, gates: gdoc.gates.map((g) => ({ id: g.id, status: g.status, reviewRequired: g.reviewRequired })),
    taskCounts: counts, runnable: a.filter((x) => x.state === 'runnable' || x.state === 'halted').length, stops, gateStops,
  };
  emit(result, [
    `Global stop: ${stop ? `ACTIVE - ${stop.reason}` : 'not raised'}`,
    'Gates:', ...gdoc.gates.map((g) => `  ${g.id.padEnd(8)} ${g.status}${g.reviewRequired ? ' (review required)' : ''}${g.stop ? ` [stop: ${g.stop.reason}]` : ''}`),
    `Tasks: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')}`,
    'Stops:', ...(stops.length ? stops.map((s) => `  ${s.task} (${s.level}): ${s.reason}`) : ['  none']),
  ]);
}

function computeNext() {
  const tasks = loadTasks(root).tasks;
  const gates = loadGates(root).gates;
  const stop = globalStop(root);
  const a = analyse(tasks, gates, stop);
  return {
    stop,
    runnable: stop ? [] : a.filter((x) => x.state === 'runnable').map(({ id, title, gate, status }) => ({ id, title, gate, status })),
    blocked: a.filter((x) => x.state === 'blocked').map(({ id, title, causes }) => ({ id, title, causes })),
    waiting: a.filter((x) => x.state === 'waiting').map(({ id, title, causes }) => ({ id, title, causes })),
  };
}

function cmdNext() {
  const n = computeNext();
  if (n.stop) exit = 2;
  emit({ ok: !n.stop, globalStop: n.stop, runnable: n.runnable, blocked: n.blocked, waiting: n.waiting }, [
    ...(n.stop ? [`GLOBAL STOP active: ${n.stop.reason}. Nothing is runnable.`] : []),
    'Runnable:', ...(n.runnable.length ? n.runnable.map((t) => `  ${t.id}  ${t.title} [${t.gate}, ${t.status}]`) : ['  none']),
    'Blocked:', ...(n.blocked.length ? n.blocked.flatMap((t) => [`  ${t.id}  ${t.title}`, ...t.causes.map((c) => `      ${c}`)]) : ['  none']),
    'Waiting:', ...(n.waiting.length ? n.waiting.flatMap((t) => [`  ${t.id}  ${t.title}`, ...t.causes.map((c) => `      ${c}`)]) : ['  none']),
  ]);
}

// ---------------------------------------------------------------- stop / clear
function cmdStop(clear) {
  const level = str(flags.level);
  const reason = str(flags.reason);
  const by = str(flags.by) || (clear ? null : process.env.USER || 'unknown');
  if (!['global', 'local', 'gate'].includes(level)) return fail('--level must be global|local|gate');
  if (!reason) return fail('--reason is required');
  if (clear && !by) return fail('--by is required to clear a stop');
  const entry = { at: now(), by, action: clear ? 'clear' : 'stop', level, reason };
  if (clear && level === 'global') {
    // A recorded attestation, NOT authentication: the script cannot verify who typed this.
    const ref = str(flags['owner-reference']);
    if (!ref) return fail('clearing a global stop requires --owner-reference <text> (pointer to where the owner authorised it: a directive file path, PR or issue URL). This is recorded in the stop log as an attestation; it is not verified.');
    entry.ownerReference = ref;
  }

  if (level === 'global') {
    const p = P.stop(root);
    if (clear) {
      if (!fs.existsSync(p)) return fail('no global stop is active');
      fs.rmSync(p);
    } else {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify({ reason, at: entry.at, by }, null, 2) + '\n');
    }
  } else if (level === 'local') {
    const id = str(flags.task);
    if (!id) return fail('--task is required for a local stop');
    const doc = loadTasks(root);
    const t = doc.tasks.find((x) => x.id === id);
    if (!t) return fail(`unknown task ${id}`);
    entry.task = id;
    if (clear) {
      if (!t.stop) return fail(`task ${id} has no stop`);
      delete t.stop;
      if (t.status === 'blocked') t.status = 'todo';
    } else {
      t.stop = { level: 'local', reason, since: entry.at.slice(0, 10) };
      t.status = 'blocked';
    }
    writeJson(P.tasks(root), doc);
  } else {
    const id = str(flags.gate);
    if (!id) return fail('--gate is required for a gate stop');
    const doc = loadGates(root);
    const g = doc.gates.find((x) => x.id === id);
    if (!g) return fail(`unknown gate ${id}`);
    entry.gate = id;
    if (clear) {
      if (!g.stop) return fail(`gate ${id} has no stop`);
      g.status = g.stop.previousStatus;
      delete g.stop;
    } else {
      if (g.stop) return fail(`gate ${id} already stopped`);
      g.stop = { reason, since: entry.at.slice(0, 10), previousStatus: g.status };
      g.status = 'blocked';
    }
    writeJson(P.gates(root), doc);
  }
  logStop(root, entry);
  emit({ ok: true, ...entry }, [`${clear ? 'cleared' : 'raised'} ${level} stop${entry.task ? ' on ' + entry.task : ''}${entry.gate ? ' on ' + entry.gate : ''}`]);
  return true;
}

// ---------------------------------------------------------------- check-gates
function gateViolations(files, gdoc) {
  const always = gdoc.alwaysAllowed || [];
  const out = [];
  for (const f of files) {
    const owners = gdoc.gates.filter((g) => (g.paths || []).some((p) => matchPath(p, f)));
    if (owners.length) {
      for (const g of owners) if (!GATE_OK.has(g.status)) out.push({ path: f, gate: g.id, reason: `gate ${g.id} is ${g.status}` });
    } else if (!always.some((p) => matchPath(p, f))) {
      out.push({ path: f, gate: null, reason: 'path belongs to no gate and is not an always-allowed docs path' });
    }
  }
  return out;
}

// Load the gate map from the BASE revision so a change cannot authorise its own gate.
// Returns { gdoc, source: 'base'|'head', note }.
function gateMapFor(base) {
  if (!base) return { gdoc: loadGates(root), source: 'head', note: 'no base revision: using the gate map in the working tree' };
  const s = git(root, ['show', `${base}:harness/config/gates.json`]);
  if (s.ok) {
    try { return { gdoc: JSON.parse(s.out), source: 'base', note: `gate map loaded from base ${base}` }; } catch { /* fall through */ }
  }
  return { gdoc: loadGates(root), source: 'head', note: `base ${base} has no readable harness/config/gates.json (first introduction, or no base): FALLING BACK to the gate map in the checked commit, so this check cannot detect a self-authorised gate` };
}

function gateMapChanges(base, head, baseDoc, headDoc) {
  const d = git(root, ['diff', '--name-only', '--no-renames', base, head, '--', 'harness/config/gates.json']);
  if (!d.ok || !d.out.trim()) return [];
  const byId = (doc) => new Map(((doc && doc.gates) || []).map((g) => [g.id, g]));
  const a = byId(baseDoc), b = byId(headDoc);
  const out = [];
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(id), y = b.get(id);
    if (!x) out.push(`gate ${id}: added (status ${y.status})`);
    else if (!y) out.push(`gate ${id}: removed`);
    else {
      const bits = [];
      if (x.status !== y.status) bits.push(`status ${x.status} -> ${y.status}`);
      if (JSON.stringify(x.paths) !== JSON.stringify(y.paths)) bits.push('paths changed');
      if (x.reviewRequired !== y.reviewRequired) bits.push(`reviewRequired ${x.reviewRequired} -> ${y.reviewRequired}`);
      if (bits.length) out.push(`gate ${id}: ${bits.join(', ')}`);
    }
  }
  if (JSON.stringify(baseDoc && baseDoc.alwaysAllowed) !== JSON.stringify(headDoc && headDoc.alwaysAllowed)) out.push('alwaysAllowed changed');
  return out;
}

function cmdCheckGates() {
  if (guardStop()) return;
  let files;
  let base = null;
  let head = 'HEAD';
  if (flags.files !== undefined) files = list(flags.files).flatMap((s) => String(s).split(',')).map((s) => s.trim()).filter(Boolean);
  else {
    base = str(flags.base);
    if (!base) return fail('--base <ref> is required (or --files for tests)');
    head = str(flags.head) || 'HEAD';
    // --no-renames: a rename is reported as a deletion of the source AND an addition of the destination.
    const d = git(root, ['diff', '--name-only', '--no-renames', '-z', base, head]);
    if (!d.ok) return fail(`git diff failed: ${d.err.trim().split('\n')[0]}`);
    files = d.out.split('\0').filter(Boolean);
  }
  const { gdoc, source, note } = gateMapFor(base);
  const notes = [note];
  if (base && source === 'base') {
    const h = git(root, ['show', `${head}:harness/config/gates.json`]);
    let headDoc = null;
    try { headDoc = h.ok ? JSON.parse(h.out) : null; } catch { headDoc = null; }
    for (const c of gateMapChanges(base, head, gdoc, headDoc)) {
      notes.push(`NOTICE gate map change not in effect for this check (needs the owner's merge to the base first): ${c}`);
    }
  }
  const v = gateViolations(files, gdoc);
  if (v.length) {
    exit = 1;
    return emit({ ok: false, reason: 'changed paths belong to gates that are not authorised', gateMapSource: source, notes, violations: v }, [
      ...notes, 'FAIL: changed paths violate gate state', ...v.map((x) => `  ${x.path}: ${x.reason}`)]);
  }
  emit({ ok: true, checked: files.length, gateMapSource: source, notes }, [...notes, `check-gates: ${files.length} changed path(s) allowed`]);
}

// ---------------------------------------------------------------- check-records
function recordProblems() {
  const problems = [];
  let required;
  try { required = readJson(P.required(root)).records; } catch (e) { return [`cannot read required-records.json: ${e.message}`]; }
  for (const r of required) {
    const abs = path.join(root, r);
    if (!fs.existsSync(abs)) problems.push(`missing required record: ${r}`);
    else if (!fs.readFileSync(abs, 'utf8').trim()) problems.push(`empty required record: ${r}`);
  }
  let tasksDoc = null, gdoc = null;
  try { tasksDoc = loadTasks(root); } catch (e) { problems.push(`tasks.json unreadable: ${e.message}`); }
  try { gdoc = loadGates(root); } catch (e) { problems.push(`gates.json unreadable: ${e.message}`); }
  if (gdoc) {
    if (!Array.isArray(gdoc.gates)) problems.push('gates.json: "gates" must be an array');
    else {
      const ids = new Set();
      for (const g of gdoc.gates) {
        if (ids.has(g.id)) problems.push(`gates.json: duplicate gate ${g.id}`);
        ids.add(g.id);
        if (!['presented', 'authorised', 'accepted', 'blocked', 'deferred'].includes(g.status)) problems.push(`gates.json: ${g.id} has invalid status ${g.status}`);
        if (!Array.isArray(g.paths)) problems.push(`gates.json: ${g.id} needs paths[]`);
        if (typeof g.reviewRequired !== 'boolean') problems.push(`gates.json: ${g.id} needs boolean reviewRequired`);
      }
    }
  }
  if (tasksDoc) {
    let schema = null;
    try { schema = readJson(P.taskSchema(root)); } catch (e) { problems.push(`tasks.schema.json unreadable: ${e.message}`); }
    if (schema) problems.push(...validateSchema(tasksDoc, schema).map((e) => `tasks.json ${e}`));
    if (Array.isArray(tasksDoc.tasks)) {
      const ids = new Set();
      for (const t of tasksDoc.tasks) { if (ids.has(t.id)) problems.push(`tasks.json: duplicate id ${t.id}`); ids.add(t.id); }
      const gateIds = new Set((gdoc?.gates || []).map((g) => g.id));
      for (const t of tasksDoc.tasks) {
        for (const d of t.deps || []) if (!ids.has(d)) problems.push(`tasks.json: ${t.id} depends on unknown task ${d}`);
        if (gdoc && !gateIds.has(t.gate)) problems.push(`tasks.json: ${t.id} names unknown gate ${t.gate}`);
        if (t.stop && t.status !== 'blocked') problems.push(`tasks.json: ${t.id} has a stop but status is ${t.status}`);
      }
      const cyc = findCycle(tasksDoc.tasks);
      if (cyc) problems.push(`tasks.json: dependency cycle ${cyc.join(' -> ')}`);
    }
  }
  if (fs.existsSync(P.reviews(root))) {
    try {
      const rdoc = readJson(P.reviews(root));
      const schema = readJson(P.reviewSchema(root));
      problems.push(...validateSchema(rdoc, schema).map((e) => `reviews.json ${e}`));
    } catch (e) { problems.push(`reviews.json/schema unreadable: ${e.message}`); }
  }
  return problems;
}

function cmdCheckRecords() {
  if (guardStop()) return;
  const problems = recordProblems();
  if (problems.length) {
    exit = 1;
    return emit({ ok: false, problems }, ['FAIL: record check', ...problems.map((p) => `  ${p}`)]);
  }
  emit({ ok: true }, ['check-records: ok']);
}

// ---------------------------------------------------------------- reviews
function evaluateReviews(reviews, gate, commit, root) {
  const cands = reviews.filter((r) => r.gate === gate && r.commit === commit);
  if (!cands.length) {
    const other = reviews.filter((r) => r.gate === gate).length;
    return { ok: false, reasons: [`no review is bound to commit ${commit} for gate ${gate}` + (other ? ` (${other} review(s) exist for other commits; a review of an ancestor does not count)` : '')] };
  }
  // Blocking: ANY entry for this commit+gate can fail the check; a passing entry never outvotes it.
  const hasSignoff = (f) => f.ownerSignoff && ['by', 'at', 'reference'].every((k) => typeof f.ownerSignoff[k] === 'string' && f.ownerSignoff[k].trim());
  const blockingFinding = (f) => {
    if (!['high', 'critical'].includes(f.severity)) return null;
    if (f.status === 'open') return 'open';
    if (f.status === 'fixed') return FULL_SHA.test(f.remediationCommit || '') ? null : 'marked fixed without remediationCommit (treated as open)';
    if (f.status === 'accepted' || f.status === 'wontfix') return hasSignoff(f) ? null : `${f.status} without ownerSignoff {by, at, reference}`;
    return 'unrecognised status (treated as open)';
  };
  const blocking = [];
  for (const r of cands) {
    if (['changes-requested', 'failed', 'unavailable'].includes(r.verdict)) blocking.push(`review ${r.id}: verdict is ${r.verdict}`);
    for (const f of r.findings || []) {
      const why = blockingFinding(f);
      if (why) blocking.push(`review ${r.id}: ${f.severity} finding ${f.id} ${why}`);
    }
  }
  // Qualifying: independent, different principal (self-declared), approving verdict, report file exists.
  const results = cands.map((r) => {
    const why = [];
    if (r.independent !== true) why.push('review not marked independent');
    if (!r.reviewer || !r.author || r.reviewer.id === r.author.id) why.push('reviewer is the author');
    if (!['approve', 'approve-with-followups'].includes(r.verdict)) why.push(`verdict is ${r.verdict}`);
    if (!r.reportPath || !fs.existsSync(path.join(root, r.reportPath))) why.push(`report file missing: ${r.reportPath}`);
    return { id: r.id, why };
  });
  if (blocking.length) return { ok: false, reasons: [...blocking, ...results.filter((x) => x.why.length).map((x) => `review ${x.id} does not qualify: ${x.why.join('; ')}`)] };
  const good = results.find((x) => x.why.length === 0);
  if (good) return { ok: true, review: good.id, reasons: [] };
  return { ok: false, reasons: results.map((x) => `review ${x.id}: ${x.why.join('; ')}`) };
}

function cmdCheckReviews() {
  if (guardStop()) return;
  const commit = (str(flags.commit) || '').toLowerCase();
  if (!FULL_SHA.test(commit)) return fail('--commit must be a full 40-character SHA');
  const gdoc = loadGates(root);
  let gates = gdoc.gates.filter((g) => g.reviewRequired);
  if (str(flags.gate)) {
    const g = gdoc.gates.find((x) => x.id === flags.gate);
    if (!g) return fail(`unknown gate ${flags.gate}`);
    gates = [g];
  }
  let reviews;
  try { reviews = readJson(P.reviews(root)).reviews; } catch (e) { return fail(`reviews.json unreadable: ${e.message}`); }
  const results = gates.map((g) => g.reviewRequired
    ? { gate: g.id, ...evaluateReviews(reviews, g.id, commit, root) }
    : { gate: g.id, ok: true, reasons: [], note: 'review not required' });
  const bad = results.filter((r) => !r.ok);
  if (bad.length) {
    exit = 1;
    return emit({ ok: false, commit, results }, ['FAIL: commit-bound review check', ...bad.flatMap((r) => r.reasons.map((x) => `  [${r.gate}] ${x}`))]);
  }
  emit({ ok: true, commit, results }, results.map((r) => `check-reviews: gate ${r.gate} ok${r.note ? ' (' + r.note + ')' : ' via ' + r.review}`));
}

function cmdReviewAdd() {
  let entry;
  if (str(flags.entry)) {
    try { entry = JSON.parse(flags.entry); } catch (e) { return fail(`--entry is not valid JSON: ${e.message}`); }
  } else if (str(flags['entry-file'])) {
    try { entry = readJson(path.resolve(root, flags['entry-file'])); } catch (e) { return fail(`--entry-file unreadable: ${e.message}`); }
  } else {
    const findings = list(flags.finding).map((s) => {
      const [id, severity, status, ...rest] = String(s).split(':');
      return { id, severity, status, summary: rest.join(':') };
    });
    entry = {
      id: flags.id, gate: flags.gate, commit: flags.commit,
      reviewer: { kind: flags['reviewer-kind'], id: flags['reviewer-id'], ...(flags['reviewer-model'] ? { model: flags['reviewer-model'] } : {}) },
      author: { id: flags.author },
      independent: String(flags.independent) === 'true',
      scope: String(flags.scope || '').split(',').filter(Boolean),
      skipped: list(flags.skipped).map((s) => { const [p, ...r] = String(s).split(':'); return { path: p, reason: r.join(':') }; }),
      verdict: flags.verdict, findings, reportPath: flags.report,
    };
  }
  entry.at = entry.at || now();
  if (typeof entry.commit === 'string') entry.commit = entry.commit.toLowerCase();
  if (!FULL_SHA.test(entry.commit || '')) return fail('commit must be a full 40-character lowercase hex SHA');
  const errs = validateSchema({ reviews: [entry] }, readJson(P.reviewSchema(root)));
  if (errs.length) return fail(`invalid review entry: ${errs.join('; ')}`);
  if (!fs.existsSync(path.join(root, entry.reportPath))) return fail(`report file does not exist: ${entry.reportPath}`);
  const doc = fs.existsSync(P.reviews(root)) ? readJson(P.reviews(root)) : { reviews: [] };
  if (doc.reviews.some((r) => r.id === entry.id)) return fail(`review id ${entry.id} already exists`);
  doc.reviews.push(entry);
  writeJson(P.reviews(root), doc);
  emit({ ok: true, id: entry.id }, [`review ${entry.id} recorded for ${entry.commit} (verdict ${entry.verdict}); append-only, commit this file`]);
}

// ---------------------------------------------------------------- readiness
function openDecisions(md) {
  const rows = md.split('\n').filter((l) => l.trim().startsWith('|'));
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const header = rows.map(cells).find((c) => c.some((x) => /^id$/i.test(x)) && c.some((x) => /^status$/i.test(x)));
  if (!header) return [];
  const iId = header.findIndex((x) => /^id$/i.test(x));
  const iSt = header.findIndex((x) => /^status$/i.test(x));
  const iDec = header.findIndex((x) => /^decision$/i.test(x));
  return rows.map(cells).filter((c) => c !== header && c.length > iSt && !/^-+$/.test(c[0].replace(/[: ]/g, '')))
    .filter((c) => /^OPEN/i.test(c[iSt].replace(/[*_`]/g, '').trim()))
    .map((c) => ({ id: c[iId].replace(/[*_`]/g, ''), decision: iDec >= 0 ? c[iDec] : '', status: c[iSt].replace(/[*_`]/g, '') }));
}

function cmdReadiness() {
  const hours = Number(flags.hours);
  const spendRaw = flags['max-spend'];
  const envelopeOk = Number.isFinite(hours) && hours > 0 && typeof spendRaw === 'string' && /^\$?\d+(\.\d+)?$/.test(spendRaw);
  const mdPath = path.join(root, 'docs/decisions/OWNER_DECISIONS.md');
  const open = fs.existsSync(mdPath) ? openDecisions(fs.readFileSync(mdPath, 'utf8')) : [];
  const n = computeNext();
  const mentions = (txt, id) => new RegExp(`\\b${id}\\b`).test(txt);
  const blocked = n.blocked.map((t) => ({ ...t, decisions: open.filter((d) => t.causes.some((c) => mentions(c, d.id))).map((d) => d.id) }));
  const problems = [];
  if (!envelopeOk) problems.push('execution envelope missing or invalid: --hours <positive number> and --max-spend <amount> are both required');
  if (n.stop) problems.push(`global stop active: ${n.stop.reason}`);
  if (!n.runnable.length) problems.push('runnable fallback queue is empty');
  const ok = problems.length === 0;
  if (!ok) exit = 1;
  emit({ ok, envelope: envelopeOk ? { hours, maxSpend: spendRaw } : null, openDecisions: open, blocked, runnable: n.runnable, problems }, [
    `Decision Readiness: ${ok ? 'READY' : 'NOT READY'}`,
    `Envelope: ${envelopeOk ? `${hours} h, max spend ${spendRaw}` : 'MISSING'}`,
    'Open owner decisions:', ...(open.length ? open.map((d) => `  ${d.id}: ${d.decision.slice(0, 80)}`) : ['  none']),
    'Blocked tasks:', ...(blocked.length ? blocked.flatMap((t) => [`  ${t.id}${t.decisions.length ? ' (awaiting ' + t.decisions.join(', ') + ')' : ''}`, ...t.causes.map((c) => `      ${c}`)]) : ['  none']),
    'Runnable fallback queue:', ...(n.runnable.length ? n.runnable.map((t) => `  ${t.id}  ${t.title}`) : ['  EMPTY']),
    ...problems.map((p) => `PROBLEM: ${p}`),
  ]);
}

// ---------------------------------------------------------------- checkpoint
function cmdCheckpoint() {
  const need = ['workstream', 'gate', 'completed', 'open', 'next', 'refs'];
  const miss = need.filter((k) => !str(flags[k]));
  if (miss.length) return fail(`missing flag(s): ${miss.map((m) => '--' + m).join(' ')}`);
  const body = need.map((k) => flags[k]).join('\n');
  if (body.split('\n').some((l) => scanLine(l).length)) return fail('checkpoint text looks like it contains a credential; refusing to write it');
  const file = path.join(root, 'harness/state/CHECKPOINTS.md');
  const branch = str(flags.branch) || (git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).out.trim() || 'unknown');
  const date = now().slice(0, 10);
  const ind = (s) => String(s).split('\n').map((l, i) => (i ? '  ' + l : l)).join('\n');
  const block = [
    `## ${str(flags.title) || 'Checkpoint'} — ${date} (${flags.workstream})`, '', '```',
    `WORKSTREAM_ID: ${flags.workstream}`, `BRANCH: ${branch}`, `CURRENT_GATE: ${ind(flags.gate)}`,
    `COMPLETED: ${ind(flags.completed)}`, `OPEN: ${ind(flags.open)}`, `NEXT_ACTION: ${ind(flags.next)}`, `REFERENCES: ${ind(flags.refs)}`,
    '```', '', '',
  ].join('\n');
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '# Durable checkpoints\n\nNewest first. Never contains credentials.\n\n';
  const m = /^## /m.exec(text);
  text = m ? text.slice(0, m.index) + block + text.slice(m.index) : text.replace(/\n*$/, '\n\n') + block;
  fs.writeFileSync(file, text);
  emit({ ok: true }, ['checkpoint prepended to harness/state/CHECKPOINTS.md']);
}

// ---------------------------------------------------------------- dispatch
const [cmd, sub] = positional;
try {
  switch (cmd) {
    case 'status': cmdStatus(); break;
    case 'next': cmdNext(); break;
    case 'stop': cmdStop(false); break;
    case 'clear': cmdStop(true); break;
    case 'check-gates': cmdCheckGates(); break;
    case 'check-records': cmdCheckRecords(); break;
    case 'check-reviews': cmdCheckReviews(); break;
    case 'review': if (sub === 'add') cmdReviewAdd(); else fail('usage: review add ...'); break;
    case 'readiness': cmdReadiness(); break;
    case 'checkpoint': cmdCheckpoint(); break;
    default:
      console.error('usage: aeh <status|next|stop|clear|check-gates|check-records|check-reviews|review add|readiness|checkpoint> [--root dir] [--json]');
      exit = 64;
  }
} catch (e) {
  exit = exit || 1;
  console.error(`aeh: ${e.message}`);
}
process.exitCode = exit;
