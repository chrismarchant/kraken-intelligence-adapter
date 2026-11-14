import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { write, aeh, sh } from './helpers.mjs';
import { mkRoutingRepo, hook, launch, ledger, POLICY } from './routing-helpers.mjs';

const transcript = (root, model) => {
  const p = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(p, [
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'x' } }),
    JSON.stringify({ type: 'assistant', message: { id: 'm1', model, usage: { input_tokens: 5, output_tokens: 70, cache_creation_input_tokens: 100, cache_read_input_tokens: 900 } } }),
    JSON.stringify({ type: 'assistant', message: { id: 'm1', model, usage: { input_tokens: 5, output_tokens: 70 } } }),
    JSON.stringify({ type: 'assistant', message: { id: 'm2', model, usage: { input_tokens: 2, output_tokens: 30 } } }),
  ].join('\n'));
  return p;
};

test('a launch that names no model is denied and recorded', () => {
  const root = mkRoutingRepo();
  for (const tool_input of [{}, { subagent_type: 'general-purpose', prompt: 'p' }, { subagent_type: 'Explore', model: '' }, { subagent_type: 'Explore', model: '  ' }]) {
    const r = launch(root, tool_input);
    assert.equal(r.code, 0);
    assert.ok(r.denied, JSON.stringify(tool_input));
    assert.match(r.reason, /names no model/);
  }
  const l = ledger(root);
  assert.equal(l.length, 4);
  assert.ok(l.every((e) => e.kind === 'agent-launch' && e.decision === 'deny' && e.rule === 'unnamed-model'));
});

test('an explicit permitted model is allowed without printing a decision, and recorded as requested', () => {
  const root = mkRoutingRepo();
  const r = launch(root, { subagent_type: 'general-purpose', model: 'haiku', description: 'light check' });
  assert.equal(r.out, '');
  const [e] = ledger(root);
  assert.deepEqual([e.decision, e.requestedModel, e.family, e.modelSource, e.agentType], ['allow', 'haiku', 'haiku', 'explicit', 'general-purpose']);
});

test('the old tool name Task is governed the same way', () => {
  const root = mkRoutingRepo();
  assert.ok(hook(root, { tool_name: 'Task', tool_input: { subagent_type: 'general-purpose' } }).denied);
  assert.equal(hook(root, { tool_name: 'Task', tool_use_id: 'x', tool_input: { subagent_type: 'general-purpose', model: 'haiku' } }).out, '');
});

test('a pinned agent definition counts as naming a model; an unpinned or inheriting one does not', () => {
  const root = mkRoutingRepo({ agents: { pinned: 'haiku', fullid: 'claude-haiku-5-5', inherits: 'inherit', nomodel: null, premium: 'opus', top: 'fable' } });
  assert.equal(launch(root, { subagent_type: 'pinned' }).out, '');
  assert.equal(launch(root, { subagent_type: 'fullid' }).out, '');
  assert.match(launch(root, { subagent_type: 'inherits' }).reason, /names no model/);
  assert.match(launch(root, { subagent_type: 'nomodel' }).reason, /names no model/);
  assert.match(launch(root, { subagent_type: 'premium' }).reason, /owner escalation/);
  assert.match(launch(root, { subagent_type: 'top' }).reason, /not permitted/);
  assert.match(launch(root, { subagent_type: '../../etc/passwd' }).reason, /names no model/);
  const l = ledger(root);
  assert.deepEqual(l.slice(0, 2).map((e) => e.modelSource), ['pinned', 'pinned']);
});

test('the call\'s model overrides the pin, so a pinned type cannot carry a premium model in', () => {
  const root = mkRoutingRepo({ agents: { pinned: 'haiku' } });
  assert.match(launch(root, { subagent_type: 'pinned', model: 'opus' }).reason, /owner escalation/);
  assert.match(launch(root, { subagent_type: 'pinned', model: 'fable' }).reason, /not permitted/);
});

test('fable, sonnet, full ids of them and unknown names are denied', () => {
  const root = mkRoutingRepo();
  for (const model of ['fable', 'sonnet', 'claude-fable-5-2', 'claude-sonnet-5-5', 'mythos', 'gpt-x', 'inherit']) {
    assert.ok(launch(root, { subagent_type: 'general-purpose', model }).denied, model);
  }
});

test('opus needs a recorded owner escalation, and each escalation is used up', () => {
  const root = mkRoutingRepo();
  const opus = () => launch(root, { subagent_type: 'general-purpose', model: 'opus' });
  assert.match(opus().reason, /owner escalation/);
  assert.equal(aeh(root, 'routing', 'escalate', '--model', 'opus', '--reason', 'r').code, 1);
  assert.equal(aeh(root, 'routing', 'escalate', '--model', 'haiku', '--owner-reference', 'x', '--reason', 'r').code, 1);
  assert.equal(aeh(root, 'routing', 'escalate', '--model', 'opus', '--owner-reference', 'directive X', '--reason', 'architecture review').code, 0);
  assert.equal(opus().out, '');
  assert.match(opus().reason, /owner escalation/);
  const allowed = ledger(root).filter((e) => e.kind === 'agent-launch' && e.decision === 'allow');
  assert.equal(allowed.length, 1);
  assert.equal(allowed[0].escalated, true);
});

test('fork, Workflow and remote session creation are denied outright', () => {
  const root = mkRoutingRepo();
  assert.match(launch(root, { subagent_type: 'fork' }).reason, /launching session's model/);
  assert.match(launch(root, { subagent_type: 'fork', model: 'haiku' }).reason, /launching session's model/);
  assert.ok(hook(root, { tool_name: 'Workflow', tool_input: { script: 'x' } }).denied);
  assert.ok(hook(root, { tool_name: 'mcp__claude-code-remote__create_session', tool_input: { model: 'claude-haiku-5-5' } }).denied);
});

test('other tools are not touched by routing', () => {
  const root = mkRoutingRepo();
  for (const tool_name of ['Bash', 'Read', 'Edit', 'Write', 'mcp__x__y', 'SendMessage']) assert.equal(hook(root, { tool_name }).out, '', tool_name);
  assert.equal(ledger(root).length, 0);
});

test('at most two sub-agents: the third launch is denied until one stops', () => {
  const root = mkRoutingRepo();
  const go = () => launch(root, { subagent_type: 'general-purpose', model: 'haiku' });
  assert.equal(go().out, '');
  assert.equal(go().out, '');
  assert.match(go().reason, /limit reached/);
  hook(root, { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'general-purpose' });
  hook(root, { hook_event_name: 'SubagentStart', agent_id: 'a2', agent_type: 'general-purpose' });
  assert.match(go().reason, /limit reached/);
  assert.equal(hook(root, { hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'general-purpose' }).out, '');
  assert.equal(go().out, '');
  assert.match(go().reason, /limit reached/);
  // Another session has its own count.
  assert.equal(launch(root, { subagent_type: 'general-purpose', model: 'haiku' }, { session_id: 's2' }).out, '');
  const l = ledger(root);
  assert.equal(l.filter((e) => e.rule === 'concurrency-limit').length, 3);
  assert.equal(l.filter((e) => e.kind === 'violation').length, 0);
});

test('a sub-agent that starts without an allowed launch is reported as a violation that occurred', () => {
  const root = mkRoutingRepo();
  assert.equal(hook(root, { hook_event_name: 'SubagentStart', agent_id: 'rogue', agent_type: 'general-purpose' }).out, '');
  const v = ledger(root).find((e) => e.kind === 'violation');
  assert.equal(v.rule, 'unregistered-subagent-start');
  assert.equal(aeh(root, 'routing', 'check').code, 1);
});

test('SubagentStop records the provider-reported model and tokens from the transcript', () => {
  const root = mkRoutingRepo();
  launch(root, { subagent_type: 'general-purpose', model: 'haiku' });
  hook(root, { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'general-purpose' });
  const r = hook(root, { hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'general-purpose', agent_transcript_path: transcript(root, 'claude-haiku-5-5') });
  assert.equal(r.out, '');
  const stop = ledger(root).find((e) => e.kind === 'agent-stop');
  assert.deepEqual(stop.telemetry.providerModels, ['claude-haiku-5-5']);
  assert.deepEqual(stop.telemetry.usage, { input: 7, output: 100, cacheWrite: 100, cacheRead: 900 });
  assert.equal(stop.mismatch, undefined);
  assert.equal(aeh(root, 'routing', 'check').code, 0);
});

test('a sub-agent the provider served with a model nobody allowed is reported', () => {
  const root = mkRoutingRepo();
  launch(root, { subagent_type: 'general-purpose', model: 'haiku' });
  hook(root, { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'general-purpose' });
  hook(root, { hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'general-purpose', agent_transcript_path: transcript(root, 'claude-fable-5-2') });
  const stop = ledger(root).find((e) => e.kind === 'agent-stop');
  assert.match(stop.mismatch, /claude-fable-5-2/);
  const c = aeh(root, 'routing', 'check');
  assert.equal(c.code, 1);
  assert.match(c.json.problems.join(' '), /subagent-model-mismatch/);
});

test('SubagentStop without a readable transcript says telemetry is not available', () => {
  const root = mkRoutingRepo();
  launch(root, { subagent_type: 'general-purpose', model: 'haiku' });
  hook(root, { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'general-purpose' });
  hook(root, { hook_event_name: 'SubagentStop', agent_id: 'a1', agent_transcript_path: '/nonexistent/t.jsonl' });
  const stop = ledger(root).find((e) => e.kind === 'agent-stop');
  assert.equal(stop.telemetry, null);
  assert.equal(stop.telemetryNote, 'not available');
});

test('a stop for an agent this harness never saw start writes nothing to a tracked file', () => {
  const root = mkRoutingRepo();
  for (const extra of [{ agent_id: 'platform-internal' }, { agent_id: 'x', agent_type: 'summary', agent_transcript_path: transcript(root, 'claude-fable-5-2') }, {}]) {
    const r = hook(root, { hook_event_name: 'SubagentStop', ...extra });
    assert.deepEqual([r.code, r.out], [0, '']);
  }
  fs.rmSync(path.join(root, 'transcript.jsonl'));
  assert.equal(ledger(root).length, 0);
  assert.equal(sh(root, 'git', ['status', '--porcelain']), '', 'the work tree stays clean');
  const notes = fs.readFileSync(path.join(root, 'harness/state/runtime/notes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(notes.map((n) => n.kind), ['unmatched-agent-stop', 'unmatched-agent-stop', 'unmatched-agent-stop']);
});

test('PostToolUse records the resolved model and tokens, and reports a different family', () => {
  const root = mkRoutingRepo();
  hook(root, { tool_name: 'Agent', tool_use_id: 'tu-a', tool_input: { subagent_type: 'general-purpose', model: 'haiku' } });
  hook(root, { hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 'tu-a', tool_response: { status: 'completed', agentId: 'a1', resolvedModel: 'claude-haiku-5-5', totalTokens: 1234, totalDurationMs: 99 } });
  hook(root, { tool_name: 'Agent', tool_use_id: 'tu-b', tool_input: { subagent_type: 'general-purpose', model: 'haiku' } });
  hook(root, { hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 'tu-b', tool_response: { status: 'async_launched', agentId: 'a2', resolvedModel: 'claude-opus-5-5' } });
  const l = ledger(root);
  const results = l.filter((e) => e.kind === 'agent-result');
  assert.deepEqual([results[0].requestedModel, results[0].resolvedModel, results[0].totalTokens], ['haiku', 'claude-haiku-5-5', 1234]);
  assert.equal(l.filter((e) => e.kind === 'violation' && e.rule === 'subagent-model-mismatch').length, 1);
});

test('fail closed: with an unreadable policy every launch tool is denied and other tools are untouched', () => {
  for (const policy of ['{ not json', JSON.stringify({ ...POLICY, subagents: { allowed: 'haiku' } })]) {
    const root = mkRoutingRepo({ policy });
    assert.match(launch(root, { subagent_type: 'general-purpose', model: 'haiku' }).reason, /could not be evaluated/);
    assert.ok(hook(root, { tool_name: 'Workflow' }).denied);
    assert.equal(hook(root, { tool_name: 'Bash' }).out, '');
    assert.equal(hook(root, { hook_event_name: 'SubagentStop', agent_id: 'a' }).code, 0);
  }
  const root = mkRoutingRepo({ policy: null });
  assert.ok(launch(root, { subagent_type: 'general-purpose', model: 'haiku' }).denied);
});

test('the global stop still comes first and is unchanged by routing', () => {
  const root = mkRoutingRepo({ agents: { pinned: 'haiku' } });
  write(root, 'harness/state/GLOBAL_STOP', JSON.stringify({ reason: 'drill', at: 'now', by: 'tester' }));
  for (const tool_name of ['Bash', 'Edit', 'Write', 'mcp__x__y']) assert.match(hook(root, { tool_name }).reason, /GLOBAL STOP.*drill/, tool_name);
  assert.match(launch(root, { subagent_type: 'pinned' }).reason, /GLOBAL STOP/);
  assert.match(launch(root, { subagent_type: 'general-purpose', model: 'haiku' }).reason, /GLOBAL STOP/);
  for (const tool_name of ['Read', 'Grep', 'Glob']) assert.equal(hook(root, { tool_name }).out, '', tool_name);
  assert.equal(ledger(root).length, 0);
  // Bookkeeping events never print a decision, stop or no stop.
  assert.equal(hook(root, { hook_event_name: 'SubagentStop', agent_id: 'a' }).out, '');
});

test('a call made by a sub-agent is recorded with its parent, and governed the same', () => {
  const root = mkRoutingRepo();
  assert.ok(launch(root, { subagent_type: 'general-purpose' }, { agent_id: 'parent-1' }).denied);
  assert.equal(ledger(root)[0].parentAgent, 'parent-1');
});

test('status shows the policy; report lists refused attempts', () => {
  const root = mkRoutingRepo();
  launch(root, { subagent_type: 'general-purpose' });
  const s = aeh(root, 'routing', 'report');
  assert.equal(s.json.agents.launchesDenied, 1);
  assert.equal(s.json.violations[0].rule, 'unnamed-model');
  assert.equal(s.json.violations[0].refused, true);
  assert.equal(aeh(root, 'routing', 'check').code, 0, 'a refused attempt does not fail the check');
});
