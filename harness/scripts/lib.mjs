// Shared helpers for the AEH scripts. Zero dependencies, provider-neutral.
// No product-specific logic lives here: specifics are in harness/config and harness/state.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      let key = a.slice(2);
      let val = true;
      const eq = key.indexOf('=');
      if (eq >= 0) {
        val = key.slice(eq + 1);
        key = key.slice(0, eq);
      } else if (key !== 'json' && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        val = argv[++i];
      }
      if (key in flags) flags[key] = [].concat(flags[key], val);
      else flags[key] = val;
    } else positional.push(a);
  }
  return { positional, flags };
}

export const rootOf = (flags) => path.resolve(typeof flags.root === 'string' ? flags.root : process.cwd());
export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
export const writeJson = (p, v) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
};
export const P = {
  tasks: (r) => path.join(r, 'harness/state/tasks.json'),
  gates: (r) => path.join(r, 'harness/config/gates.json'),
  reviews: (r) => path.join(r, 'harness/state/reviews.json'),
  stop: (r) => path.join(r, 'harness/state/GLOBAL_STOP'),
  stopLog: (r) => path.join(r, 'harness/state/STOP_LOG.jsonl'),
  required: (r) => path.join(r, 'harness/config/required-records.json'),
  taskSchema: (r) => path.join(r, 'harness/config/tasks.schema.json'),
  reviewSchema: (r) => path.join(r, 'harness/config/reviews.schema.json'),
};

export function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout || '', err: r.stderr || '' };
}

// --- glob matching ---------------------------------------------------------
// `**` any depth, `*` within a segment, `?` one char. A pattern with no `/`
// matches the basename at any depth (e.g. `*.md`, `Dockerfile`).
export function globToRegex(pat) {
  let re = '';
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '*') {
      if (pat[i + 1] === '*') {
        if (pat[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}
export function matchPath(pat, file) {
  const f = file.replace(/\\/g, '/');
  const re = globToRegex(pat);
  if (!pat.includes('/')) return re.test(f.split('/').pop());
  return re.test(f);
}

// --- minimal JSON-schema subset validator ----------------------------------
// Supports: type, enum, required, properties, additionalProperties:false, items,
// pattern, minLength, minItems. Enough for the ledgers; not a general validator.
export function validateSchema(value, schema, at = '$', errors = []) {
  const t = schema.type;
  const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  if (t) {
    const ok = t === 'integer' ? Number.isInteger(value) : t === actual;
    if (!ok) { errors.push(`${at}: expected ${t}, got ${actual}`); return errors; }
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: must be one of ${schema.enum.join('|')}`);
  if (typeof value === 'string') {
    if (schema.minLength && value.length < schema.minLength) errors.push(`${at}: too short`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: does not match ${schema.pattern}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) errors.push(`${at}: needs at least ${schema.minItems} item(s)`);
    if (schema.items) value.forEach((v, i) => validateSchema(v, schema.items, `${at}[${i}]`, errors));
  }
  if (actual === 'object') {
    for (const k of schema.required || []) if (!(k in value)) errors.push(`${at}: missing required "${k}"`);
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) validateSchema(v, props[k], `${at}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${at}: unexpected property "${k}"`);
    }
  }
  return errors;
}

// --- task graph ------------------------------------------------------------
export const GATE_OK = new Set(['authorised', 'accepted']);

export function findCycle(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const state = new Map();
  const stack = [];
  let cycle = null;
  const visit = (id) => {
    if (cycle || !byId.has(id)) return;
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { cycle = [...stack.slice(stack.indexOf(id)), id]; return; }
    state.set(id, 1); stack.push(id);
    for (const d of byId.get(id).deps || []) visit(d);
    stack.pop(); state.set(id, 2);
  };
  tasks.forEach((t) => visit(t.id));
  return cycle;
}

export function globalStop(root) {
  const p = P.stop(root);
  if (!fs.existsSync(p)) return null;
  try { return readJson(p); } catch { return { reason: '(unreadable GLOBAL_STOP file)', at: null, by: null }; }
}

// Classify every task. A blocked or stopped dependency blocks all dependants
// transitively; a dependency that is merely unfinished makes dependants "waiting".
export function analyse(tasks, gates, stop) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const gateById = new Map(gates.map((g) => [g.id, g]));
  const memo = new Map();
  const own = (t) => {
    const c = [];
    if (t.stop) c.push({ kind: 'block', chain: [t.id], detail: `${t.stop.level} stop: ${t.stop.reason}` });
    else if (t.status === 'blocked' && !(t.deps || []).some((d) => byId.get(d)?.status !== 'done')) c.push({ kind: 'block', chain: [t.id], detail: 'status blocked (no reason recorded)' });
    const g = gateById.get(t.gate);
    if (!g) c.push({ kind: 'block', chain: [t.id], detail: `unknown gate ${t.gate}` });
    else if (!GATE_OK.has(g.status)) c.push({ kind: 'block', chain: [t.id], detail: `gate ${g.id} is ${g.status}` });
    return c;
  };
  const causes = (id, seen) => {
    if (memo.has(id)) return memo.get(id);
    const t = byId.get(id);
    const out = own(t);
    if (!seen.has(id)) {
      seen.add(id);
      for (const dId of t.deps || []) {
        const d = byId.get(dId);
        if (!d) { out.push({ kind: 'block', chain: [id, dId], detail: 'dependency does not exist' }); continue; }
        if (d.status === 'done') continue;
        const sub = causes(dId, seen);
        if (sub.length === 0) out.push({ kind: 'wait', chain: [id, dId], detail: `waiting, status ${d.status}` });
        else for (const s of sub) out.push({ ...s, chain: [id, ...s.chain] });
      }
      seen.delete(id);
    }
    memo.set(id, out);
    return out;
  };
  return tasks.map((t) => {
    if (t.status === 'done') return { id: t.id, title: t.title, state: 'done', causes: [] };
    const cs = causes(t.id, new Set());
    let state;
    if (cs.some((c) => c.kind === 'block')) state = 'blocked';
    else if (cs.length) state = 'waiting';
    else state = 'runnable';
    if (stop && state === 'runnable') state = 'halted';
    return { id: t.id, title: t.title, state, status: t.status, gate: t.gate, causes: cs.map((c) => `${c.chain.join(' -> ')}: ${c.detail}`) };
  });
}

export const loadTasks = (root) => readJson(P.tasks(root));
export const loadGates = (root) => readJson(P.gates(root));

export function logStop(root, entry) {
  fs.mkdirSync(path.dirname(P.stopLog(root)), { recursive: true });
  fs.appendFileSync(P.stopLog(root), JSON.stringify(entry) + '\n');
}
