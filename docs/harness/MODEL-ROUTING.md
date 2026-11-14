# Model routing: policy, what backs it, and what does not

Added on 2026-11-14 under the owner authorisation KIC-HARNESS-REPAIR-01. Engineering infrastructure, not product. Why it exists: `docs/harness/ROUTING-AUDIT-2026-11-13.md`.

## 1. Policy

The machine-readable policy is `harness/config/model-policy.json`. The owner's policy it carries:

| Role | Model | Route |
|---|---|---|
| Orchestration, architecture, coordination, final synthesis | Fable 5.2 | The session itself |
| Implementation, debugging, code analysis | `mistral-large-4-0` | `node harness/scripts/delegate.mjs` |
| Alternative engineering, only when chosen explicitly with a reason | `zai-glm-5-3`, `deepseek-v4-1-flash-1017` | The same runner, `--model … --reason "…"` |
| Routine governance, documentation, light checks | Haiku | Sub-agent with `model: haiku`, or an agent type in `.claude/agents` that pins it |
| Exceptional complex review or architectural escalation | Opus | Sub-agent, only after `aeh routing escalate --model opus --owner-reference … --reason …` |

Limits: at most two sub-agents at once; two retries for an engineering task; one review and one re-review for a gate and area unless an owner escalation reference is given; no fallback to Fable or Opus.

## 2. How to use it

```
node harness/scripts/aeh.mjs status                     # ends with the policy and the count of recorded violations
node harness/scripts/aeh.mjs routing report             # usage by provider-reported model and by task; violations
node harness/scripts/aeh.mjs routing check --base <ref> # fails on violations that occurred, and on product commits without a receipt
node harness/scripts/aeh.mjs review rounds --gate KIC-01 --area evaluator   # ask BEFORE commissioning a review
```

Delegating a coding task. The work tree must be a git work tree; the answer may only land in paths matched by `--allow`, and never in a path owned by a gate that is not authorised:

```
node harness/scripts/delegate.mjs --task <task id> --budget <budget id> --model mistral-large-4-0 \
  --workdir <work tree> --instructions <task file> --allow '<glob>' [--file <context file>...] \
  --test '<command>' --out <directory for the patch and test output>
```

The runner prints a receipt and appends it to `harness/state/model-usage.jsonl`. The orchestrator reads the patch, runs the tests itself, and commits with the trailer `Delegation-Receipt: <receipt id>`. A budget is a ceiling the owner sets, by name, in `model-policy.json` (`maxCalls`, `maxOutputTokens`); a delegation without one is refused.

A failed attempt ends there. The runner does not retry, has no second route and no option that adds one. Retrying is a new invocation, counted against the task's limit; when the limit is reached the task stops and goes to the owner.

## 3. What backs each rule

Three strengths are used, and no other word:

- **Blocking.** The action is refused at the point of use, before it happens. Getting past it takes a deliberate edit of a tracked file (the hook, the policy, the settings, the ledger) or a session that does not load this repository's settings. Such an edit shows in `git diff` and in history; it is not prevented. **Nothing in this repository is proof against a session that sets out to defeat it, because Bash can edit any of these files.** That needs the platform (section 6).
- **Detective.** Recorded when it happens and reported by `aeh routing report` and `aeh routing check`. It does not stop anything.
- **Advisory.** Text that a session is expected to follow.

| # | Rule | Mechanism | Strength | What gets past it |
|---|---|---|---|---|
| 1 | Every sub-agent launch names a model; a definition in `.claude/agents` that pins one counts | `PreToolUse` hook on `Agent` (and its old name `Task`): the model is the call's `model`, else the `model:` of the named agent type's definition. `inherit` or no `model:` counts as unnamed | Blocking | Agents started by something other than the `Agent` tool (rule 10 detects them). The hook judges the model **requested**, not the model served |
| 2 | An unnamed launch is denied; so are `fable`, `sonnet`, unknown names, the `fork` type, the `Workflow` tool and `create_session` | The same hook. It fails closed for launch tools if the policy cannot be read | Blocking | As rule 1 |
| 3 | Coding goes to Mistral first | The runner is the route. Using it is advisory. `aeh routing check --base` reports a commit that changes `src/**`, `tests/**`, `fixtures/**`, `tenant-package/**` or `skills/**` without a `Delegation-Receipt` trailer naming an ok receipt, from a permitted delegate, that wrote those files | Advisory to use; detective afterwards | The session can write code itself with Edit or Bash; the check reports it, and only if someone runs the check (it is not in CI: OD-23). A forged ledger line or trailer defeats the check |
| 4 | No silent fallback to Fable or Opus | Runner: one endpoint from the policy, a fixed list of models, no fallback or endpoint option; a provider error, a different reported model or a cut-off answer ends the attempt with a non-zero exit and nothing written. Sub-agents: rules 1 and 2 | Blocking inside the runner and at launch | A provider that silently serves a sub-agent with another model: rule 5 records it afterwards. The session doing the work itself: rule 3 |
| 5 | Requested and provider-reported models are recorded | Delegation: the `model` field of the provider's stream, compared with the request. Sub-agents: the request (hook), `resolvedModel` (`PostToolUse`), and the models named in the sub-agent's transcript (`SubagentStop`) | Detective. The transcript format is not a documented contract: if it cannot be read the ledger says "not available" | The orchestrator's own served model is not recorded by any hook |
| 6 | Usage is counted per task | Delegation: provider-reported prompt, completion and reasoning tokens for each task and budget; a call that broke off is charged at its allowance. Sub-agents: tokens summed from the transcript for each agent | Detective | Sub-agent usage is tied to an agent and its description, not to a task id. **The orchestrator's tokens are not available to the session at all** |
| 7 | At most two sub-agents at once | Hook: a launch reserves a marker under `harness/state/runtime/` (git-ignored, one directory a session); `SubagentStart` turns it into a running marker; `SubagentStop` removes it | Blocking, for launches through the `Agent` tool in one session | A sub-agent that never reports its stop holds a place for 30 minutes; a launch the tool then refuses holds one for 2 minutes. Other sessions count separately |
| 8 | Two retries for an engineering task | Runner: attempts are counted in the ledger by task id; the fourth is refused before any call | Blocking inside the runner | A new task id for the same work; an edited ledger. Both are visible |
| 9 | One review and one re-review for a gate and area, unless an owner escalation reference is given | `aeh review add` requires an area and refuses a third entry for the same gate and area without `--owner-escalation`. `aeh review rounds` answers before a review is commissioned | Blocking at recording: an extra review cannot be entered, so it cannot count toward a gate. Advisory at commissioning | A reviewer can still be launched. The escalation reference is an attestation; nothing verifies who wrote it. Entries made before the policy carry no area and are not counted |
| 10 | Violations are detected and reported | The ledger records refused attempts (unnamed or unpermitted launches, unpermitted delegate models, fallback options) and things that occurred (a sub-agent that started without an allowed launch, a served model nobody allowed, a provider model that differs from the request). `aeh status` shows the counts; `aeh routing check` fails on what occurred | Detective | Not run by CI (OD-23). The ledger is a tracked text file |

Unchanged and not weakened: the global stop is evaluated first by the same hook, with the same rules and the same fail-closed behaviour; the bookkeeping events never print a decision. The gate map, the gate stop on KIC-01 and `check-gates` are untouched. The runner adds to them: it refuses under a global stop, and it refuses to write a path owned by a gate that is not authorised, in any work tree of this repository.

## 4. The existing router: `chrismarchant/mistral-code-router`

Inspected read-only at commit `b778108` on 2026-11-14. No code was copied and no dependency was added.

| Question | Finding |
|---|---|
| Licence | **None.** No licence file and no licence field. The sole author is the owner. Under this repository's rule nothing may be imported from it until it carries a licence and has an entry in `LICENSES/` |
| Architecture | A Claude Code plugin: one zero-dependency MCP server over stdio (`mcp-server/server.js`, 455 lines), a skill, a `/parallel` command and a worker agent |
| Models | Aliases for `mistral-large-4-0`, `zai-glm-5-3`, `zai-glm-5-3-flash`, `deepseek-v4-1-flash-1017`. **Any other model id is passed through**: there is no list of permitted models |
| Interface | MCP tools `mistral_delegate` (one live call), `mistral_models`, and three batch tools. Needs `MISTRAL_API_KEY` in the environment; here the key is injected by the proxy and the variable is not set |
| Task isolation | None. File context is read from any path the process can read, relative to the working directory, with no confinement. No work tree |
| Patch generation | None. It returns the model's text; the session that called it applies the edits, so the code is written to disk by the orchestrator's model |
| Error handling | An API error is returned as an error result. No retry limit in code |
| Fallback | The skill, the command and the README say: on failure, retry once, then **do that workstream locally in the Claude session**. That is a silent fallback to the session's model |
| Model identity | The live path reports the model it **asked for**, not the model in the provider's response. The batch path does report the provider's |
| Usage | `usage` is returned in the tool result. Nothing is kept: no ledger, no task id |
| Transport | Not streamed, 120-second default timeout. The session proxy cuts off non-streamed responses after about 30 seconds (`CLAUDE.md`). Mistral Large 4 returns a reasoning block before the text; the content is passed on as it comes |
| Sub-agents | `workstream-worker` has no `model:`; it runs on the launching session's model. `/parallel` starts one worker for each workstream in one block, without a limit |

**Verdict: not reusable as it stands; reusable as the transport after changes in the router itself.** It was not adopted, for three reasons, each sufficient: it has no licence; it tells the session to fall back to its own model; and it cannot report the provider's model on the live path. Changing it is outside this repository (no write to another programme repository). The harness runner is therefore a governed client of the same Mistral endpoint and the same model ids, written independently, and not a second router: it has no plugin, no MCP server, no aliases and no fan-out. If the router gains a licence, the provider's model in its result, streaming, a pinned worker model, and loses the fallback wording, the runner's network call can be replaced by the router's `mistral_delegate` while the allow-list, the receipts, the limits and the path checks stay where they are. Decision for the owner: OD-22.

## 5. Proof of 2026-11-14

Budget authorised: three model calls and 15,000 output tokens. Used: **two calls, 500 output tokens.** Evidence: `docs/harness/evidence/KIC-HARNESS-REPAIR-01/` and the first lines of `harness/state/model-usage.jsonl`.

| Proof | What was done | Result |
|---|---|---|
| P1 identity | One minimal streamed completion through the runner, `--ping`, asked for `mistral-large-4-0` | HTTP 200. Provider reported `mistral-large-4-0`. Usage reported: 125 prompt, 48 completion (44 reasoning). Receipt `dlg-20261114195847-1fdaf7` |
| P2 negative controls | Offline tests (`harness/tests/routing-delegate.test.mjs`, with a substituted `fetch` that counts calls), and seven runs of the real command line with the network unreachable | A model outside the list (`claude-opus-5-5`, `claude-fable-5-2`, `codestral-latest` and five more in the tests): refused, exit 3, no call. `--fallback-model`, `--endpoint`, `--provider`: refused, exit 2, no call, recorded as a violation. A provider error: one call, no retry, nothing written. A provider that reports another model: nothing written, exit 5 |
| P3 bounded engineering | In a scratch work tree outside the repository's directory, with an acceptance test written by the orchestrator, Mistral was asked for `harness/proof/duration.mjs` and allowed to write only that path | One attempt. Provider reported `mistral-large-4-0`; 557 prompt, 452 completion (225 reasoning). A 23-line file; patch SHA-256 `bf676bc1…10aa`, recomputed and matching. The acceptance test passes (2 of 2), run by the runner and again by the orchestrator. Receipt `dlg-20261114195902-51694d`. The work tree was removed; the file is not in this repository |
| Live hook, this session | A launch without a model; a launch of the pinned `continuity-guardian`; a third launch while two places were held | Denied with the policy's reason; allowed and recorded with `resolvedModel` `claude-haiku-5-5`; denied by the limit |

Not proven live: the secondary routes. `zai-glm-5-3` and `deepseek-v4-1-flash-1017` are in the policy and are listed by the provider's model endpoint, but no call was made to either: the proof budget did not cover it.

## 6. What needs the platform

- **A control the session cannot edit.** The hook, the policy and the settings are files in the repository. Managed settings or permission rules held outside the session's reach would be needed for enforcement in the strict sense.
- **The model actually served to a sub-agent, before it runs.** The hook sees the request. A provider-side substitution is seen only afterwards, from the transcript.
- **No way to switch off model fallback** is documented for Claude Code.
- **The orchestrator's own tokens and cost** are not exposed to the session, so the repair's own Fable usage cannot be reported from here.
- **Per-agent permissions.** A sub-agent's tool list is in its definition; Bash inside any agent can do what Edit is denied.
- **Agent definitions load when a session starts.** `records-clerk` was added in this session and could not be launched in it.
- One setting is outside the repository but within the owner's reach: the environment variable `CLAUDE_CODE_SUBAGENT_MODEL` set to `haiku` in the cloud environment would make an unnamed launch resolve to Haiku and not to the orchestrator's model, as a second line behind the hook. Read in the Claude Code documentation; not tested here.

## 7. Known rough edges

- An "allow" in the ledger is the hook's decision, not proof that an agent ran: the tool or the session's permission classifier can still refuse the launch. `agent-start` is the proof.
- The platform runs agents of its own that stop without a launch or a start passing through the hook; one did so after the first handback and its stop was written to the tracked ledger, which left the work tree dirty for the stop hook. Since then a stop for an agent the harness never saw start is noted only under `harness/state/runtime/` (git-ignored). A launch, start or stop the harness does govern is still a tracked record, so a session that launches a sub-agent after its last commit has one more line to commit.
- The orchestrator wrote these controls itself. No delegation route existed until they did, and the proof budget was three calls. From here on, changes to product code are expected to come through the runner.
- `CLAUDE.md` does not mention this policy: it is outside the paths this authorisation covers (OD-23). A new session meets the policy in `aeh status`, in `docs/harness/RESTART.md`, and in the hook's refusals.
