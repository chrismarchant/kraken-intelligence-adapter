#!/usr/bin/env node
// Claude Code hook: enforces the AEH global stop and the model-routing policy for sub-agents.
//
// Contract (https://code.claude.com/docs/en/hooks, read 2026-11-13 and 2026-11-14):
//  - stdin: one JSON object with session_id, cwd, permission_mode, hook_event_name, and for tool
//    events tool_name, tool_input, tool_use_id. A call made by a sub-agent also carries agent_id.
//  - to deny (PreToolUse): print {"hookSpecificOutput":{"hookEventName":"PreToolUse",
//    "permissionDecision":"deny","permissionDecisionReason":"..."}} and exit 0.
//  - exit 0 with no output = "no decision": the call continues through the normal permission flow.
//    We deliberately never print "allow", which would bypass the user's permission prompts.
//  - any other non-zero exit is a NON-blocking error (the tool call proceeds).
//
// Global stop (unchanged): no harness/state/GLOBAL_STOP file -> no decision; stop file present ->
// allow read-only tools, deny everything else, and fail CLOSED on any error.
//
// Model routing (PreToolUse on a sub-agent launch): the launch must name a permitted model, either
// in the call or through a definition in .claude/agents that pins one; see harness/scripts/routing.mjs
// and docs/harness/MODEL-ROUTING.md. Fails CLOSED for launch tools if the policy cannot be read.
// PostToolUse, SubagentStart and SubagentStop only keep books; they never block and never print.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOW_UNDER_STOP = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead', 'TodoWrite', 'ToolSearch']);
// Named for documentation; these are all denied by the default-deny rule anyway.
export const DENY_UNDER_STOP = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'Agent', 'Task', 'mcp__*'];
// Tools that start agents. Used only when the policy file cannot be read, to fail closed.
const LAUNCH_FALLBACK = new Set(['Agent', 'Task', 'Workflow', 'mcp__claude-code-remote__create_session']);
const BOOKKEEPING_EVENTS = new Set(['PostToolUse', 'SubagentStart', 'SubagentStop']);

function findStop(cwd) {
  const dirs = [];
  for (let d = path.resolve(cwd || process.cwd()); ; d = path.dirname(d)) {
    dirs.push(d);
    if (path.dirname(d) === d) break;
  }
  if (process.env.CLAUDE_PROJECT_DIR) dirs.push(path.resolve(process.env.CLAUDE_PROJECT_DIR));
  for (const d of dirs) {
    const p = path.join(d, 'harness/state/GLOBAL_STOP');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function reasonText(stopPath) {
  try {
    const s = JSON.parse(fs.readFileSync(stopPath, 'utf8'));
    return `${s.reason || 'no reason recorded'} (raised ${s.at || 'unknown'} by ${s.by || 'unknown'})`;
  } catch { return 'stop file present but unreadable'; }
}

let input = null;
try {
  const raw = fs.readFileSync(0, 'utf8');
  input = raw.trim() ? JSON.parse(raw) : null;
} catch { input = null; }

let stopPath = null;
try { stopPath = findStop(input && input.cwd); } catch { stopPath = null; }

const deny = (reason) => process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
}) + '\n');

const event = input && typeof input === 'object' && typeof input.hook_event_name === 'string' ? input.hook_event_name : null;
const bookkeeping = BOOKKEEPING_EVENTS.has(event);

// Fail CLOSED under a stop (unparseable or empty input, or any error while building the reason: deny);
// fail OPEN with no stop (any error: print nothing, exit 0). The hook never prints "allow".
let stopDenied = false;
if (stopPath && !bookkeeping) {
  try {
    const tool = input && typeof input.tool_name === 'string' ? input.tool_name : null;
    if (!tool || !ALLOW_UNDER_STOP.has(tool)) {
      stopDenied = true;
      deny(`AEH GLOBAL STOP is active: ${reasonText(stopPath)}. Tool ${tool || '(unknown)'} is denied. ` +
        'Only the Human Owner clears it: aeh clear --level global --by <name> --owner-reference <ref> --reason "...".');
    }
  } catch { stopDenied = true; deny('AEH GLOBAL STOP is active (internal error while evaluating the tool call; denied)'); }
}

// ---------------------------------------------------------------- model routing
// The policy is the one beside this script, whatever the session's working directory is.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function routing() {
  const tool = typeof input.tool_name === 'string' ? input.tool_name : null;
  let R, policy;
  try {
    R = await import('../scripts/routing.mjs');
    policy = R.loadPolicy(root);
  } catch (e) {
    if (event === 'PreToolUse' && LAUNCH_FALLBACK.has(tool)) deny(`Model-routing policy could not be evaluated (${String(e.message).slice(0, 160)}); ${tool} is denied until harness/config/model-policy.json is readable.`);
    return;
  }
  const session = input.session_id;
  const log = (entry) => { try { R.appendLedger(root, entry); } catch { /* the decision stands without the record */ } };

  if (event === 'PreToolUse') {
    let d;
    try { d = R.decideLaunch(root, policy, input, R.readLedger(root)); } catch (e) {
      if (LAUNCH_FALLBACK.has(tool) || policy.subagents.launchTools.includes(tool)) deny(`Model-routing decision failed (${String(e.message).slice(0, 160)}); ${tool} is denied.`);
      return;
    }
    if (!d) return;
    if (d.decision === 'allow') {
      let slot;
      try { slot = R.reserveSlot(root, policy, session, input.tool_use_id || `${Date.now()}`); } catch { slot = { ok: false, running: '?' }; }
      if (!slot.ok) {
        log({ ...d.record, decision: 'deny', rule: 'concurrency-limit' });
        deny(`Sub-agent limit reached: ${policy.subagents.maxConcurrent} may run at once and ${slot.running} are running or starting. Wait for one to finish.`);
        return;
      }
      log(d.record);
      return;
    }
    log(d.record);
    deny(`Model-routing policy: ${d.reason}`);
    return;
  }

  if (event === 'SubagentStart') {
    const r = R.markStarted(root, policy, session, input.agent_id);
    log({ kind: 'agent-start', agentId: input.agent_id || null, agentType: input.agent_type || null });
    if (!r.registered) log({ kind: 'violation', rule: 'unregistered-subagent-start', refused: false, detail: `sub-agent ${input.agent_type || '?'} started without a launch this hook allowed` });
    return;
  }

  if (event === 'SubagentStop') {
    R.markStopped(root, session, input.agent_id);
    // The platform also runs agents of its own (summaries and the like) that stop without ever
    // passing a launch or a start through this hook. They are none of the ledger's business, and
    // a write to a tracked file after a turn has ended leaves the tree dirty for the stop hook.
    // They are noted under harness/state/runtime, which git ignores.
    if (!input.agent_id || !R.readLedger(root).some((e) => e.kind === 'agent-start' && e.agentId === input.agent_id)) {
      try { R.noteRuntime(root, { kind: 'unmatched-agent-stop', agentId: input.agent_id || null, agentType: input.agent_type || null }); } catch { /* a note, nothing more */ }
      return;
    }
    const telemetry = R.transcriptUsage(input.agent_transcript_path);
    let mismatch = null;
    if (telemetry) {
      const ledger = R.readLedger(root);
      const ok = (fam) => policy.subagents.allowed.includes(fam)
        || (policy.subagents.escalation.includes(fam) && ledger.some((e) => e.kind === 'agent-launch' && e.decision === 'allow' && e.escalated && e.family === fam));
      const off = telemetry.providerModels.filter((m) => !ok(R.family(m)));
      if (off.length) mismatch = `provider reported ${off.join(', ')}, which no allowed launch named`;
    }
    log({ kind: 'agent-stop', agentId: input.agent_id || null, agentType: input.agent_type || null, telemetry, ...(telemetry ? {} : { telemetryNote: 'not available' }), ...(mismatch ? { mismatch } : {}) });
    return;
  }

  if (event === 'PostToolUse' && policy.subagents.launchTools.includes(tool)) {
    const tr = input.tool_response && typeof input.tool_response === 'object' ? input.tool_response : {};
    const launch = R.readLedger(root).findLast((e) => e.kind === 'agent-launch' && e.decision === 'allow' && e.toolUseId && e.toolUseId === input.tool_use_id);
    const resolved = typeof tr.resolvedModel === 'string' ? tr.resolvedModel : null;
    log({
      kind: 'agent-result', toolUseId: input.tool_use_id || null, agentId: tr.agentId || null, status: tr.status || null,
      requestedModel: launch ? launch.requestedModel : null, resolvedModel: resolved,
      ...(Number.isFinite(tr.totalTokens) ? { totalTokens: tr.totalTokens } : {}),
      ...(Number.isFinite(tr.totalDurationMs) ? { durationMs: tr.totalDurationMs } : {}),
      ...(Array.isArray(tr.modelsUsed) ? { modelsUsed: tr.modelsUsed } : {}),
    });
    if (launch && resolved && R.family(resolved) !== launch.family) {
      log({ kind: 'violation', rule: 'subagent-model-mismatch', refused: false, detail: `launch asked for ${launch.requestedModel}; the tool reported ${resolved}` });
    }
    if (tr.status === 'completed' && tr.agentId) R.markStopped(root, session, tr.agentId);
  }
}

if (!stopDenied && input && typeof input === 'object' && !Array.isArray(input) && (event === 'PreToolUse' || bookkeeping)) {
  try { await routing(); } catch { /* bookkeeping must never break a session */ }
}
process.exit(0);
