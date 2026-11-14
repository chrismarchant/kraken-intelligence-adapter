// Model routing: policy, sub-agent launch decisions, the usage ledger and its reports.
// Zero dependencies. Used by the hook (harness/hooks/pre-tool-use.mjs), the delegation runner
// (delegate.mjs) and the command line (aeh.mjs routing ...).
//
// What is enforcement and what is not is stated in docs/harness/MODEL-ROUTING.md. In short: the
// hook decides on the model a launch REQUESTS; the ledger records what the provider REPORTED.
import fs from 'node:fs';
import path from 'node:path';
import { matchPath, git, GATE_OK } from './lib.mjs';

export const RP = {
  policy: (r) => path.join(r, 'harness/config/model-policy.json'),
  ledger: (r) => path.join(r, 'harness/state/model-usage.jsonl'),
  runtime: (r) => path.join(r, 'harness/state/runtime'),
  agents: (r) => path.join(r, '.claude/agents'),
};

export function loadPolicy(root) {
  const p = JSON.parse(fs.readFileSync(RP.policy(root), 'utf8'));
  const s = p.subagents, d = p.delegation;
  const bad = (why) => { throw new Error(`model-policy.json: ${why}`); };
  if (!s || !Array.isArray(s.allowed) || !Array.isArray(s.escalation) || !Array.isArray(s.launchTools)) bad('subagents.{launchTools,allowed,escalation} must be arrays');
  if (!Number.isInteger(s.maxConcurrent) || s.maxConcurrent < 1) bad('subagents.maxConcurrent must be a positive integer');
  if (!d || typeof d.primary !== 'string' || !Array.isArray(d.secondary) || typeof d.endpoint !== 'string') bad('delegation.{endpoint,primary,secondary} are required');
  if (!Number.isInteger(d.maxRetries) || d.maxRetries < 0) bad('delegation.maxRetries must be a non-negative integer');
  if (!p.reviews || !Number.isInteger(p.reviews.maxRoundsPerArea)) bad('reviews.maxRoundsPerArea must be an integer');
  return p;
}

// ---------------------------------------------------------------- ledger
export function appendLedger(root, entry) {
  const p = RP.ledger(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const line = { at: new Date().toISOString(), ...entry };
  fs.appendFileSync(p, JSON.stringify(line) + '\n');
  return line;
}
export function readLedger(root) {
  const p = RP.ledger(root);
  if (!fs.existsSync(p)) return [];
  const out = [];
  for (const l of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { out.push(JSON.parse(l)); } catch { out.push({ kind: 'unreadable-line' }); }
  }
  return out;
}

// ---------------------------------------------------------------- models
// The launch tool takes aliases; agent definitions may carry a full model id.
export function family(model) {
  if (typeof model !== 'string') return null;
  const m = model.trim().toLowerCase();
  if (!m || m === 'inherit') return null;
  const hit = /^(?:claude-)?(haiku|sonnet|opus|fable|mythos)\b/.exec(m);
  return hit ? hit[1] : m;
}

// `model:` from the frontmatter of .claude/agents/<type>.md, or null if the type is not defined
// in this repository or does not pin one.
export function pinnedModel(root, agentType) {
  if (typeof agentType !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(agentType)) return null;
  let text;
  try { text = fs.readFileSync(path.join(RP.agents(root), `${agentType}.md`), 'utf8'); } catch { return null; }
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fm) return null;
  const line = fm[1].split(/\r?\n/).find((l) => /^model\s*:/.test(l));
  if (!line) return null;
  const v = line.replace(/^model\s*:/, '').trim().replace(/^["']|["']$/g, '');
  return v && v.toLowerCase() !== 'inherit' ? v : null;
}

// Escalations are attestations recorded in the ledger (aeh routing escalate). Each grants a number
// of launches; an allowed launch of an escalation model consumes one.
export function escalationsLeft(ledger, fam) {
  let granted = 0, used = 0;
  for (const e of ledger) {
    if (e.kind === 'escalation' && family(e.model) === fam) granted += Number.isInteger(e.uses) && e.uses > 0 ? e.uses : 1;
    if (e.kind === 'agent-launch' && e.decision === 'allow' && e.family === fam && e.escalated) used += 1;
  }
  return granted - used;
}

// Decide one tool call. Returns null when the call is none of this module's business, otherwise
// { decision: 'allow'|'deny', reason, record } where record is what goes in the ledger.
export function decideLaunch(root, policy, input, ledger) {
  const tool = input && input.tool_name;
  const s = policy.subagents;
  if ((s.deniedTools || []).includes(tool)) {
    return { decision: 'deny', reason: `${tool} is not a permitted execution route under the model policy (it starts agents whose model this harness cannot name or bound).`, record: { kind: 'agent-launch', tool, decision: 'deny', rule: 'denied-tool' } };
  }
  if (!s.launchTools.includes(tool)) return null;
  const ti = (input.tool_input && typeof input.tool_input === 'object') ? input.tool_input : {};
  const type = typeof ti.subagent_type === 'string' && ti.subagent_type.trim() ? ti.subagent_type.trim() : null;
  const base = {
    kind: 'agent-launch', tool, toolUseId: input.tool_use_id || null, agentType: type,
    description: typeof ti.description === 'string' ? ti.description.slice(0, 120) : null,
    parentAgent: input.agent_id || null,
  };
  const deny = (rule, reason, extra = {}) => ({ decision: 'deny', reason, record: { ...base, ...extra, decision: 'deny', rule } });
  if (type && (s.deniedAgentTypes || []).includes(type)) return deny('denied-agent-type', `sub-agent type "${type}" always runs on the launching session's model and is not permitted.`);
  const explicit = typeof ti.model === 'string' && ti.model.trim() ? ti.model.trim() : null;
  const pinned = explicit ? null : pinnedModel(root, type);
  const requested = explicit || pinned;
  if (!requested) {
    return deny('unnamed-model', `sub-agent launch names no model: pass "model" (${s.allowed.join(', ')}) or use an agent type whose definition in .claude/agents pins one. An unnamed launch would run on the orchestrator's model.`);
  }
  const fam = family(requested);
  const named = { requestedModel: requested, family: fam, modelSource: explicit ? 'explicit' : 'pinned' };
  if (s.allowed.includes(fam)) return { decision: 'allow', reason: null, record: { ...base, ...named, decision: 'allow' } };
  if (s.escalation.includes(fam)) {
    if (escalationsLeft(ledger, fam) > 0) return { decision: 'allow', reason: null, record: { ...base, ...named, decision: 'allow', escalated: true } };
    return deny('escalation-required', `model "${requested}" needs an owner escalation reference: aeh routing escalate --model ${fam} --owner-reference <where the owner authorised it> --reason "...". None is unused.`, named);
  }
  return deny('model-not-permitted', `model "${requested}" is not permitted for sub-agents (allowed: ${s.allowed.join(', ')}; by owner escalation: ${s.escalation.join(', ')}).`, named);
}

// ---------------------------------------------------------------- concurrency (marker files)
// One directory per session under harness/state/runtime (git-ignored). A launch reserves a
// "pending" marker; SubagentStart turns the oldest pending marker into an "active" one;
// SubagentStop removes it. Markers older than the lease are ignored and removed.
const safe = (s) => String(s || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
function sessionDir(root, sessionId) { return path.join(RP.runtime(root), safe(sessionId)); }
const PENDING_MS = 120000; // a reservation that no SubagentStart claims lapses after two minutes
function liveMarkers(dir, leaseMs, nowMs) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const n of names) {
    const m = /^(active|pending)-(\d+)-(.+)$/.exec(n);
    if (!m) continue;
    if (nowMs - Number(m[2]) > (m[1] === 'pending' ? PENDING_MS : leaseMs)) { try { fs.rmSync(path.join(dir, n)); } catch { /* gone */ } continue; }
    out.push({ name: n, state: m[1], at: Number(m[2]), id: m[3] });
  }
  // Running agents first, then reservations in the order they were made.
  return out.sort((a, b) => (a.state === b.state ? a.at - b.at || a.name.localeCompare(b.name) : a.state === 'active' ? -1 : 1));
}
export function reserveSlot(root, policy, sessionId, toolUseId, nowMs = Date.now()) {
  const dir = sessionDir(root, sessionId);
  const lease = (policy.subagents.leaseMinutes || 30) * 60000;
  fs.mkdirSync(dir, { recursive: true });
  const mine = `pending-${nowMs}-${safe(toolUseId)}`;
  fs.writeFileSync(path.join(dir, mine), '');
  const live = liveMarkers(dir, lease, nowMs);
  const index = live.findIndex((m) => m.name === mine);
  if (index >= policy.subagents.maxConcurrent) {
    try { fs.rmSync(path.join(dir, mine)); } catch { /* gone */ }
    return { ok: false, running: live.length - 1 };
  }
  return { ok: true, running: live.length };
}
export function markStarted(root, policy, sessionId, agentId, nowMs = Date.now()) {
  const dir = sessionDir(root, sessionId);
  const lease = (policy.subagents.leaseMinutes || 30) * 60000;
  fs.mkdirSync(dir, { recursive: true });
  const pending = liveMarkers(dir, lease, nowMs).find((m) => m.state === 'pending');
  if (pending) { try { fs.rmSync(path.join(dir, pending.name)); } catch { /* gone */ } }
  fs.writeFileSync(path.join(dir, `active-${nowMs}-${safe(agentId)}`), '');
  return { registered: !!pending };
}
export function markStopped(root, sessionId, agentId) {
  const dir = sessionDir(root, sessionId);
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return; }
  for (const n of names) if (n.startsWith('active-') && n.endsWith(`-${safe(agentId)}`)) { try { fs.rmSync(path.join(dir, n)); } catch { /* gone */ } }
}

// ---------------------------------------------------------------- transcript telemetry
// Sums what the provider reported in a sub-agent transcript. The transcript format is not a
// documented contract; anything unreadable yields null and the ledger says "not available".
export function transcriptUsage(file, maxBytes = 64 * 1024 * 1024) {
  try {
    if (!file || fs.statSync(file).size > maxBytes) return null;
    const models = {}, seen = new Set();
    const usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    let turns = 0;
    for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!l.includes('"usage"')) continue;
      let j; try { j = JSON.parse(l); } catch { continue; }
      const m = j && j.message;
      if (!m || typeof m.model !== 'string' || !m.usage) continue;
      if (m.id) { if (seen.has(m.id)) continue; seen.add(m.id); }
      turns += 1;
      models[m.model] = (models[m.model] || 0) + 1;
      usage.input += m.usage.input_tokens || 0;
      usage.output += m.usage.output_tokens || 0;
      usage.cacheWrite += m.usage.cache_creation_input_tokens || 0;
      usage.cacheRead += m.usage.cache_read_input_tokens || 0;
    }
    return turns ? { providerModels: Object.keys(models).sort(), turns, usage } : null;
  } catch { return null; }
}

// ---------------------------------------------------------------- delegation accounting
export const delegationModels = (policy) => [policy.delegation.primary, ...policy.delegation.secondary];
export function attemptsFor(ledger, task) { return ledger.filter((e) => e.kind === 'delegation' && e.task === task && e.networkCall).length; }
export function budgetSpent(ledger, budget) {
  let calls = 0, outputTokens = 0;
  for (const e of ledger) {
    if (e.kind !== 'delegation' || e.budget !== budget || !e.networkCall) continue;
    calls += 1;
    outputTokens += Number.isFinite(e.chargedOutputTokens) ? e.chargedOutputTokens : 0;
  }
  return { calls, outputTokens };
}

// Paths in a work tree of this repository are subject to the gate map: a delegate may not write
// where an unauthorised gate owns the path. Same rule as aeh check-gates.
export function gateProblems(gdoc, files) {
  const out = [];
  for (const f of files) {
    const owners = (gdoc.gates || []).filter((g) => (g.paths || []).some((p) => matchPath(p, f)));
    if (owners.length) { for (const g of owners) if (!GATE_OK.has(g.status)) out.push(`${f}: gate ${g.id} is ${g.status}`); }
    else if (!(gdoc.alwaysAllowed || []).some((p) => matchPath(p, f))) out.push(`${f}: path belongs to no gate`);
  }
  return out;
}

// ---------------------------------------------------------------- reports and checks
export function summarise(ledger) {
  const byModel = {}, byTask = {};
  const add = (map, key, e) => {
    const t = (map[key] ||= { calls: 0, promptTokens: 0, outputTokens: 0, reasoningTokens: 0 });
    t.calls += 1; t.promptTokens += e.p || 0; t.outputTokens += e.o || 0; t.reasoningTokens += e.r || 0;
  };
  const agents = { launchesAllowed: 0, launchesDenied: 0, stops: [], results: [] };
  for (const e of ledger) {
    if (e.kind === 'delegation' && e.networkCall) {
      const u = e.usage || {};
      const row = { p: u.promptTokens, o: u.completionTokens, r: u.reasoningTokens };
      add(byModel, e.providerModel || `${e.requestedModel} (provider model not reported)`, row);
      add(byTask, e.task, row);
    } else if (e.kind === 'agent-launch') {
      if (e.decision === 'allow') agents.launchesAllowed += 1; else agents.launchesDenied += 1;
    } else if (e.kind === 'agent-stop' && e.telemetry) {
      const u = e.telemetry.usage;
      for (const m of e.telemetry.providerModels) add(byModel, m, { p: u.input + u.cacheWrite + u.cacheRead, o: u.output, r: 0 });
    }
  }
  return { byModel, byTask, agents, violations: violations(ledger) };
}

// A violation is something the policy forbids that the harness saw: attempted (and refused) or
// already done. Refused attempts are reported so that a pattern is visible, not hidden.
export function violations(ledger) {
  const out = [];
  for (const e of ledger) {
    if (e.kind === 'agent-launch' && e.decision === 'deny') out.push({ at: e.at, rule: e.rule, refused: true, detail: `${e.tool}${e.agentType ? ' ' + e.agentType : ''}${e.requestedModel ? ' model ' + e.requestedModel : ''}` });
    else if (e.kind === 'violation') out.push({ at: e.at, rule: e.rule, refused: e.refused === true, detail: e.detail });
    else if (e.kind === 'delegation' && e.outcome === 'model-mismatch') out.push({ at: e.at, rule: 'provider-model-mismatch', refused: true, detail: `task ${e.task}: asked ${e.requestedModel}, provider reported ${e.providerModel}` });
    else if (e.kind === 'agent-stop' && e.mismatch) out.push({ at: e.at, rule: 'subagent-model-mismatch', refused: false, detail: `agent ${e.agentType || '?'}: ${e.mismatch}` });
    else if (e.kind === 'unreadable-line') out.push({ at: null, rule: 'ledger-unreadable-line', refused: false, detail: 'a line of model-usage.jsonl is not JSON' });
  }
  return out;
}

// Detective check on history: a commit that changes a path the policy reserves for the delegate
// must carry a "Delegation-Receipt: <id>" trailer naming a receipt whose outcome is ok and whose
// provider-reported model is a permitted delegate. A forged ledger line defeats it; see the doc.
export function checkCommits(root, policy, ledger, base, head = 'HEAD') {
  const log = git(root, ['log', '--format=%H', `${base}..${head}`]);
  if (!log.ok) return { ok: false, problems: [`git log ${base}..${head} failed: ${log.err.trim().split('\n')[0]}`], checked: 0 };
  const allowed = new Set(delegationModels(policy));
  const receipts = new Map(ledger.filter((e) => e.kind === 'delegation' && e.id).map((e) => [e.id, e]));
  const problems = [];
  const commits = log.out.split('\n').filter(Boolean);
  for (const sha of commits) {
    const files = git(root, ['diff-tree', '--no-commit-id', '--name-only', '--no-renames', '-r', '-m', '--root', sha]).out.split('\n').filter(Boolean);
    const reserved = [...new Set(files)].filter((f) => policy.delegation.requiredForPaths.some((p) => matchPath(p, f)));
    if (!reserved.length) continue;
    const body = git(root, ['log', '-1', '--format=%B', sha]).out;
    const ids = [...body.matchAll(/^Delegation-Receipt:\s*(\S+)\s*$/gm)].map((m) => m[1]);
    const short = sha.slice(0, 7);
    if (!ids.length) { problems.push(`${short}: changes ${reserved.length} delegate-reserved path(s) (${reserved.slice(0, 3).join(', ')}${reserved.length > 3 ? ', ...' : ''}) with no Delegation-Receipt trailer`); continue; }
    for (const id of ids) {
      const r = receipts.get(id);
      if (!r) problems.push(`${short}: receipt ${id} is not in the usage ledger`);
      else if (r.outcome !== 'ok') problems.push(`${short}: receipt ${id} has outcome ${r.outcome}`);
      else if (!allowed.has(r.providerModel)) problems.push(`${short}: receipt ${id} reports provider model ${r.providerModel}, not a permitted delegate`);
    }
    const covered = new Set(ids.flatMap((id) => (receipts.get(id)?.files || [])));
    const uncovered = reserved.filter((f) => !covered.has(f));
    if (ids.every((id) => receipts.get(id)) && uncovered.length) problems.push(`${short}: ${uncovered.length} delegate-reserved path(s) not written by the named receipt(s): ${uncovered.slice(0, 3).join(', ')}${uncovered.length > 3 ? ', ...' : ''}`);
  }
  return { ok: problems.length === 0, problems, checked: commits.length };
}

// Review rounds: entries for the same gate and area. Entries recorded before the policy carry no
// area and are not counted.
export function reviewRounds(reviews, gate, area) {
  return reviews.filter((r) => r.gate === gate && r.area === area).length;
}
