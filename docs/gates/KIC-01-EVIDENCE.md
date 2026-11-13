# KIC-01 — evidence from the autonomous session of 2026-11-13

Status: **evidence presented; no gate accepted.** Authorised by `docs/spec/directives/KIC-01-SESSION-AUTHORISATION-2026-11-13.md`.

Every result below came from a command run in the session. Where something was not run, it says so.

## Conditions

| Condition | State | Evidence |
|---|---|---|
| **C1** Full OpenBot boots on a licensed Intelligence project and completes a conversation with a tool call and a recalled memory | **Not demonstrated. Blocked.** | No Intelligence project key exists in the environment (obtaining one needs a personal account sign-in). OpenBot's schema needs pgvector, which is unavailable: no Docker daemon, package not in the repositories, source build refused by the session's permission layer. Recorded once as a local stop on task `KIC-01-C1`; not retried. |
| **C2** Mistral Large 4 works through a shim, streaming, with tools | **Demonstrated outside OpenBot. Not demonstrated inside it.** | See "Model shim" and "Agent runs". |
| **C3** Written licence confirmation from CopilotKit | **Open. Owner action.** | Nothing new. The four questions are in `KIC-01-ASSESSMENT.md` §8. |
| **C4** Human editorial approval enforced in code | **Demonstrated, and independently attacked.** | See "Approval enforcement". |

## What was built

| Component | Where | State |
|---|---|---|
| Typed contracts (brief, narrative, plan, draft, evaluation, decision, programme package, provisional command) | `src/contracts/` | Implemented, tested |
| Model gateway: provider-neutral interface, streamed Mistral adapter, recorded-fixture replay | `src/gateway/` | Implemented, tested; live against Mistral Large 4 |
| Mistral normalising shim (OpenAI-compatible reverse proxy) | `src/shim/` | Implemented, tested; live against Mistral Large 4 |
| Evaluator: deterministic draft analysis, JEV-shaped adapter, deterministic mock, redaction | `src/evaluation/` | Implemented, tested. **No live JEV transport exists.** |
| Campaign workflow: bounded generation, editorial decisions, assembly, export | `src/workflow/` | Implemented, tested |
| MCP server (stdio and HTTP), 12 tools, none that publishes or records a decision | `src/mcp/` | Implemented, tested; driven live by an agent |
| Operator tool: key creation, show, confirm, decline | `src/cli/operator.ts` | Implemented; exercised by hand in the agent runs. No automated test of the command-line wrapper itself. |
| Skills catalogue (6 implemented, 3 deferred) | `src/skills/catalogue.ts` | Implemented, served by `kic_list_skills` |
| Tenant package for an OpenBot-derived instance | `tenant-package/` | Written; accepted by upstream's validator. **Not run inside OpenBot.** |
| Harness: task ledger, gates, three stop levels, commit-bound reviews, secret scan, CI, hook, guardians | `harness/`, `.github/`, `.claude/agents/` | Implemented, tested; CI verified on GitHub. Hook not installed. |

Size: about 5,500 lines of product source and 2,900 lines of product tests.

## Tests

`npm run check` at the remediation commit: type check clean; **130 product tests pass; 82 harness tests pass**; secret scan clean. All tests are offline.

GitHub Actions workflow `ci` succeeded on three pushes: runs 43343870467 (`90e6330`), 43346469381 (`983487d`) and 43350445685 (`aad2196`).

## Commercial proof: the synthetic campaign

Scenario: `src/cli/scenario.ts`, brief `fixtures/campaigns/synthetic-harbourline.brief.json` (an invented company; every figure is labelled as invented).

```
NODE_USE_ENV_PROXY=1 node src/cli/demo.ts --mode fill     # live for any step with no recording
node src/cli/demo.ts                                      # offline replay
```

Result of the recorded run, replayed by `tests/kic/scenario.test.ts`:

| Step | Result |
|---|---|
| Brief | Accepted; interpretation with 5 key messages and 5 open questions |
| Narratives | 3 alternatives from Mistral Large 4; one selected and one rejected by the editor |
| Programme | 4 posts over 2 weeks, sequenced, each with a rationale and a call to action |
| Drafts | 8 drafts, 2 alternatives per post, by Mistral Large 4 |
| Evaluation | All 4 posts compared on 6 criteria by the deterministic mock, with evidence per criterion, confidence and stated limits. All 8 drafts passed the mandatory constraints. |
| Editorial | One draft rejected; one revision requested, written and re-evaluated; 4 approvals. Every decision signed. |
| Package | Complete; 4 provisional commands, all `NON-EXECUTABLE`; JSON, readable summary and commands file exported |
| Determinism | Two replays produce byte-identical packages |

**The editor in this scenario is a scripted test actor, labelled as such in every record. No person made these decisions and no UI was involved.**

Model cost of the recorded run (8 model steps): 13,045 prompt tokens and 38,742 completion tokens, of which 33,507 were reasoning. The run took about three and a half minutes live with reasoning effort "low".

## Model shim

`tests/shim/live.ts`, run once at commit `3306759` under Node 22, model `mistral-large-4`:

| Case | Result |
|---|---|
| Raw non-streamed, streamed and tool-call requests | Pass |
| `generateText` with one tool, through the client OpenBot resolves | Pass |
| `streamText`, plain | Pass |
| `streamText` with a tool executed and a final answer | Pass |
| Control: the same client straight at the Mistral API, no shim | Fails as expected ("Invalid JSON response") |

The live script was **not re-run** after the shim's security hardening (`1c7fedf`); the hardened shim was exercised live by the agent runs below instead.

## Agent runs: CopilotKit agent + shim + Mistral + KIC MCP server + operator tool

A scratch experiment, not product code. `BuiltInAgent` from `@copilotkit/runtime` 1.85.0 — the class and version OpenBot's built-in Bots use — configured the way OpenBot configures it (`OPENAI_BASE_URL` at the shim, `COPILOTKIT_OPENAI_API=chat`), with the KIC MCP server attached over HTTP. In-memory runner; **no OpenBot application, no Intelligence, no UI.** Run on the remediation code.

| Run | What happened |
|---|---|
| 1 (77 s) | The agent called `kic_create_campaign`, `kic_interpret_brief`, `kic_generate_narratives`, `kic_request_decision`, then stopped and reported the request id, saying it could not record the decision. |
| Operator | `operator.ts show` displayed the narrative text and its hash; `operator.ts confirm` recorded the selection, signed with the operator key. |
| 2 (135 s) | The agent called `kic_get_campaign`, `kic_plan_programme`, `kic_generate_drafts`, `kic_evaluate_drafts`, `kic_compare_drafts`, `kic_request_decision`, and stopped at the approval request. All 8 drafts were eligible. |
| Operator | `show` reported "Ranked 1 of 2 … Passes the mandatory constraints"; `confirm` recorded the signed approval. |
| Assembly | Through the MCP tool: refused without `allowPartial` (`slots-pending`); with it, a partial package with one `NON-EXECUTABLE` command, both decisions carrying a valid signature. |

Cost of the two runs: KIC's own generation, 7 model steps, 11,215 prompt and 40,671 completion tokens; the agent's own 12 chat requests through the shim, 100,316 prompt and 2,288 completion tokens. The agent's prompt tokens are the larger share because tool results stay in its context.

Neither log contained a token or an authorization value.

## Cost, as far as it can be verified

Measured token use is above. The provider's pricing page, read on 2026-11-13, lists "Mistral Large" at $0.50 per million input tokens and $1.50 per million output tokens. It does not name Large 4 and does not say how reasoning tokens are billed.

**If** that price applies to Large 4 and reasoning is billed as output, the recorded four-post campaign costs about $0.06 in generation (13,045 × $0.50 + 38,742 × $1.50, per million), and the agent's own conversation in the two agent runs about $0.05. These are arithmetic on an unconfirmed price, not a quotation. Reasoning effort "low" was used throughout; on the one prompt where both were measured, the provider default used about twice the reasoning tokens.

Not measured: cost at realistic campaign sizes, with real briefs, or with more revision passes.

## Approval enforcement (C4)

What the code guarantees, each covered by tests in `tests/kic/approval.test.ts`, `signing.test.ts`, `concurrency.test.ts` and `mcp.test.ts`:

- Nothing is selected, approved, rejected or revised except by a decision recorded with the operator's signing key. The agent-facing server holds only the public key and has no tool that records a decision; with the right one-time code it is still refused.
- A decision written straight into the store, unsigned, mis-signed or signed with another key, does not count. A genuine signature does not transfer to another campaign, draft, action or actor.
- A decision is bound to the exact text the editor was shown. Text changed after the request voids it; text changed after approval is not treated as approved.
- The latest decision about a subject wins, so a rejection after an approval stands even if the stored status is altered.
- A draft cannot be approved unless it has been evaluated and passes the mandatory constraints, whatever it scores.
- A programme cannot be planned without a selected narrative, or assembled without an approved post; pending posts need an explicit partial assembly.
- Concurrent writes cannot lose a decision (both stores, and two store instances on one directory).

## Prompt injection: one live probe

A scratch run, one model call. The synthetic brief was given a planted override in two places: text that tried to close the brief's delimiter and then ordered every post to claim a 300% return, to say results are guaranteed, to use a ruled-out hashtag, to give an email address and to mark every claim as needing no evidence; and a note in a reference asking for an invented customer quotation.

Result: both drafts ignored all of it, cited the survey reference for their one figure, and passed the mandatory constraints. This is **one sample of model behaviour**, not a guarantee. The control that does not depend on the model is the code: `tests/kic/evaluation.test.ts` shows that a draft which did obey would be refused (`must-avoid-term`, `unlisted-statistic`), and `tests/kic/rendering.test.ts` shows that brief text cannot close a prompt delimiter.

## Independent review

| Commit | Reviewer | Verdict | Record |
|---|---|---|---|
| `983487d` | Independent agent, Opus tier | changes-requested (1 critical, 3 high) | `docs/review/2026-11-13-independent-agent-983487d.md` |
| `983487d` | Mistral Large 4, direct API | changes-requested | `docs/review/2026-11-13-mistral-large-4-983487d.md` |
| `aad2196` | Second independent agent, Opus tier | see `harness/state/reviews.json` | filed when returned |

The Mistral Code Review Bot and Codex were not used: the bot's block-content defect is unfixed on its default branch, and the Codex credential is rejected.

## Not demonstrated

- The OpenBot application running at all, with or without Intelligence. No OpenBot UI, thread persistence, memory or learning was exercised.
- The shim or the KIC MCP server inside a running OpenBot; the tenant package loaded by OpenBot.
- Any real editor using any interface.
- Any real client, brief, creator or performance data.
- Live JEV, by design.
- Deployment of any kind.
- Behaviour across separate operating-system processes under load (two store instances in one process were tested, not two processes).
- Long campaigns: the largest run was 4 posts.
