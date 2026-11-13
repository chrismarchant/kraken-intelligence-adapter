#!/usr/bin/env node
// Claude Code PreToolUse hook: enforces the AEH global stop.
//
// Contract (https://code.claude.com/docs/en/hooks, read 2026-11-13):
//  - stdin: one JSON object with session_id, cwd, permission_mode, hook_event_name ("PreToolUse"),
//    tool_name, tool_input, tool_use_id.
//  - to deny: print {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",
//    "permissionDecisionReason":"..."}} and exit 0 (exit 2 + stderr is the alternative blocking form).
//  - exit 0 with no output = "no decision": the call continues through the normal permission flow.
//    We deliberately never print "allow", which would bypass the user's permission prompts.
//  - any other non-zero exit is a NON-blocking error (the tool call proceeds).
//
// Behaviour: no harness/state/GLOBAL_STOP file -> always allow (silent, exit 0), including on any
// internal error (fail open). Stop file present -> allow read-only tools, deny everything else
// (default deny, so unknown or new tools are also refused while the stop is active).
import fs from 'node:fs';
import path from 'node:path';

const ALLOW_UNDER_STOP = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead', 'TodoWrite', 'ToolSearch']);
// Named for documentation; these are all denied by the default-deny rule anyway.
export const DENY_UNDER_STOP = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'Agent', 'Task', 'mcp__*'];

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

// Fail CLOSED under a stop (unparseable or empty input, or any error while building the reason: deny);
// fail OPEN with no stop (any error: print nothing, exit 0). The hook never prints "allow".
if (stopPath) {
  try {
    const tool = input && typeof input.tool_name === 'string' ? input.tool_name : null;
    if (!tool || !ALLOW_UNDER_STOP.has(tool)) {
      deny(`AEH GLOBAL STOP is active: ${reasonText(stopPath)}. Tool ${tool || '(unknown)'} is denied. ` +
        'Only the Human Owner clears it: aeh clear --level global --by <name> --owner-reference <ref> --reason "...".');
    }
  } catch { deny('AEH GLOBAL STOP is active (internal error while evaluating the tool call; denied)'); }
}
process.exit(0);
