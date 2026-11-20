// A temporary repository that carries its own copy of the hook, the scripts and a model policy,
// so that routing tests never touch this repository's ledger.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkRepo, write, sh, HARNESS, gate } from './helpers.mjs';

export const POLICY = {
  version: 1,
  subagents: { launchTools: ['Agent', 'Task'], allowed: ['haiku'], escalation: ['opus'], deniedAgentTypes: ['fork'], deniedTools: ['Workflow', 'mcp__claude-code-remote__create_session'], maxConcurrent: 2, leaseMinutes: 30 },
  delegation: { endpoint: 'https://api.mistral.ai/v1/chat/completions', primary: 'mistral-large-4-0', secondary: ['zai-glm-5-3', 'deepseek-v4-1-flash-1017'], maxRetries: 2, defaultMaxTokens: 4000, requiredForPaths: ['src/**', 'tests/**'] },
  reviews: { maxRoundsPerArea: 2 },
  budgets: { B1: { maxCalls: 40, maxOutputTokens: 200000, ownerReference: 'test' } },
};

export function mkRoutingRepo({ policy = POLICY, agents = {}, gates = [gate('G1', 'authorised', { paths: ['lib/**'] }), gate('P', 'blocked', { paths: ['src/**', 'tests/**'] })], gitInit = true } = {}) {
  const root = mkRepo({ gates, gitInit });
  for (const d of ['hooks', 'scripts']) fs.cpSync(path.join(HARNESS, d), path.join(root, 'harness', d), { recursive: true });
  if (policy !== null) write(root, 'harness/config/model-policy.json', typeof policy === 'string' ? policy : JSON.stringify(policy));
  for (const [name, model] of Object.entries(agents)) {
    write(root, `.claude/agents/${name}.md`, `---\nname: ${name}\ndescription: test agent\n${model === null ? '' : `model: ${model}\n`}tools: Read\n---\n\nBody.\n`);
  }
  write(root, 'harness/state/runtime/.gitignore', '*\n!.gitignore\n');
  if (gitInit) { sh(root, 'git', ['add', '-A']); sh(root, 'git', ['commit', '-q', '-m', 'base']); }
  return root;
}

export function hook(root, input) {
  const r = spawnSync('node', [path.join(root, 'harness/hooks/pre-tool-use.mjs')], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: root, session_id: 's1', tool_input: {}, ...input }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '' },
  });
  const out = r.stdout.trim();
  const json = out ? JSON.parse(out) : null;
  return { code: r.status, out, denied: json?.hookSpecificOutput?.permissionDecision === 'deny', reason: json?.hookSpecificOutput?.permissionDecisionReason || '' };
}

export const ledger = (root) => {
  const p = path.join(root, 'harness/state/model-usage.jsonl');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};

let n = 0;
export const launch = (root, tool_input, extra = {}) => hook(root, { tool_name: 'Agent', tool_use_id: `tu-${++n}`, tool_input, ...extra });

// A streamed chat completion as the provider sends it: a reasoning block, text, then usage.
export function sse({ model = 'mistral-large-4-0', text = '', finish = 'stop', completion = 120, prompt = 300, status = 200 } = {}) {
  if (status !== 200) return new Response('{"message":"error"}', { status, headers: { 'content-type': 'application/json' } });
  const chunk = (o) => `data: ${JSON.stringify({ id: 'cmpl-test', model, ...o })}\n\n`;
  const body = [
    chunk({ choices: [{ delta: { content: [{ type: 'thinking', thinking: [{ type: 'text', text: 'hidden reasoning' }] }] } }] }),
    chunk({ choices: [{ delta: { content: text.slice(0, 10) } }] }),
    chunk({ choices: [{ delta: { content: [{ type: 'text', text: text.slice(10) }] } }] }),
    chunk({ choices: [{ delta: {}, finish_reason: finish }], usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion, completion_tokens_details: { reasoning_tokens: 40 } } }),
    'data: [DONE]\n\n',
  ].join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
