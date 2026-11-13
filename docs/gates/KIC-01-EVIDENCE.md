# KIC-01 — evidence from the autonomous session of 2026-11-13

Status: **evidence presented; no gate accepted.** Authorised by `docs/spec/directives/KIC-01-SESSION-AUTHORISATION-2026-11-13.md`.

Every result below came from a command run in the session. Where something was not run, it says so.

## Conditions

| Condition | State | Evidence |
|---|---|---|
| **C1** Full OpenBot boots on a licensed Intelligence project and completes a conversation with a tool call and a recalled memory | **Not demonstrated. Blocked.** | No Intelligence project key exists in the environment (obtaining one needs a personal account sign-in). OpenBot's schema needs pgvector, which is unavailable: no Docker daemon, package not in the repositories, source build refused by the session's permission layer. Recorded once as a local stop on task `KIC-01-C1`; not retried. |
| **C2** Mistral Large 4 works through a shim, streaming, with tools | **Demonstrated outside OpenBot. Not demonstrated inside it.** | See "Model shim" and "Agent runs". |
| **C3** Written licence confirmation from CopilotKit | **Open. Owner action.** | Nothing new. The four questions are in `KIC-01-ASSESSMENT.md` §8. |
| **C4** Human editorial approval enforced in code | **Demonstrated in tests, and attacked by three independent reviews. Each review found a way through; each was closed and given a regression test. The last set of fixes has not been independently re-reviewed.** | See "Approval enforcement" and "Independent review". |

## What was built

| Component | Where | State |
|---|---|---|
| Typed contracts (brief, narrative, plan, draft, evaluation, decision, programme package, provisional command) | `src/contracts/` | Implemented, tested |
| Model gateway: provider-neutral interface, streamed Mistral adapter, recorded-fixture replay | `src/gateway/` | Implemented, tested; live against Mistral Large 4 |
| Mistral normalising shim (OpenAI-compatible reverse proxy) | `src/shim/` | Implemented, tested; live against Mistral Large 4 |
| Evaluator: deterministic draft analysis, JEV-shaped adapter, deterministic mock, redaction | `src/evaluation/` | Implemented, tested. **No live JEV transport exists.** |
| Campaign workflow: bounded generation, editorial decisions, assembly, export | `src/workflow/` | Implemented, tested |
| MCP server (stdio and HTTP), 12 tools, none that publishes or records a decision | `src/mcp/` | Implemented, tested; driven live by an agent |
| Operator tool: key creation, list, show, confirm, decline, release | `src/cli/operator.ts` | Implemented; tested as real child processes (`tests/kic/processes.test.ts`) |
| Creator ranking: typed evidence, transparent weighted score, mandatory eligibility | `src/creators/` | Implemented on labelled synthetic fixtures only. No creator source is connected. |
| Skills catalogue (6 implemented, 3 deferred) | `src/skills/catalogue.ts` | Implemented, served by `kic_list_skills` |
| Tenant package for an OpenBot-derived instance | `tenant-package/` | Written; accepted by upstream's validator. **Not run inside OpenBot.** |
| Harness: task ledger, gates, three stop levels, commit-bound reviews, secret scan, CI, hook, guardians | `harness/`, `.github/`, `.claude/agents/` | Implemented, tested; CI verified on GitHub. Hook not installed. |

Size: about 6,400 lines of product source and 3,600 lines of product tests.

## Tests

`npm run check` at commit `187f029`: type check clean; **163 product tests pass; 82 harness tests pass**; secret scan clean. All tests are offline. Some start real child processes (four writers on one campaign; the operator tool).

GitHub Actions workflow `ci` succeeded on four pushes: runs 43343870467 (`90e6330`), 43346469381 (`983487d`), 43350445685 (`aad2196`) and 43411349457 (`075b358`).

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
| Editorial | One draft rejected; one revision requested, written and re-evaluated; 4 approvals. Every decision signed and chained to the one before. |
| Package | Complete; released and signed by the (scripted) editor; 4 provisional commands, all `NON-EXECUTABLE`; JSON, readable summary and commands file exported |
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

The script was run again at `aad2196` against the hardened shim, with the same results.

## Agent runs: CopilotKit agent + shim + Mistral + KIC MCP server + operator tool

A scratch experiment, not product code, run at commit `aad2196`. The operator tool has since changed (the editor now names the action, subject and content hash, and releases the package); that later form is covered by automated tests, not by a repeat of these live runs. `BuiltInAgent` from `@copilotkit/runtime` 1.85.0 — the class and version OpenBot's built-in Bots use — configured the way OpenBot configures it (`OPENAI_BASE_URL` at the shim, `COPILOTKIT_OPENAI_API=chat`), with the KIC MCP server attached over HTTP. In-memory runner; **no OpenBot application, no Intelligence, no UI.** Run on the remediation code.

| Run | What happened |
|---|---|
| 1 (77 s) | The agent called `kic_create_campaign`, `kic_interpret_brief`, `kic_generate_narratives`, `kic_request_decision`, then stopped and reported the request id, saying it could not record the decision. |
| Operator | `operator.ts show` displayed the narrative text and its hash; `operator.ts confirm` recorded the selection, signed with the operator key. |
| 2 (135 s) | The agent called `kic_get_campaign`, `kic_plan_programme`, `kic_generate_drafts`, `kic_evaluate_drafts`, `kic_compare_drafts`, `kic_request_decision`, and stopped at the approval request. All 8 drafts were eligible. |
| Operator | `show` reported "Ranked 1 of 2 … Passes the mandatory constraints"; `confirm` recorded the signed approval. |
| Assembly | Through the MCP tool: refused without `allowPartial` (`slots-pending`); with it, a partial package with one `NON-EXECUTABLE` command, both decisions carrying a valid signature. |

Cost of the two runs: KIC's own generation, 7 model steps, 11,215 prompt and 40,671 completion tokens; the agent's own 12 chat requests through the shim, 100,316 prompt and 2,288 completion tokens. The agent's prompt tokens are the larger share because tool results stay in its context.

Neither log contained a token or an authorization value.

### Repeated at commit `075b358`, with that commit's operator tool

At that commit the editor confirmed with the action, the subject and twelve characters of the content hash. The third review showed twelve characters to be too few; the tool now requires the whole request digest. That later form is covered by automated tests, not by another live run.

| Run | What happened |
|---|---|
| 1 (159 s) | The agent created the campaign, interpreted the brief, generated narratives and requested a selection, then stopped. |
| Operator | `show` printed "YOU ARE ASKED TO: SELECT narrative …", the text and its hash. `confirm --action select --subject … --sha …` recorded decision 1, signed. |
| 2 (136 s) | The agent planned, drafted 8 posts, evaluated, showed the comparison and requested approval of the top-ranked eligible draft. |
| Operator | `confirm` with `--action reject` was refused ("That is not what you asked to confirm. Nothing was recorded."). `confirm` with the action, subject and hash as shown recorded decision 2, signed. |
| Preview | The MCP tool refused without `allowPartial`, then exported a directory ending `-preview` with one `NON-EXECUTABLE` command. |
| Release | `release` without `--partial` was refused (posts pending). With it, the operator tool released the package on 2 recorded decisions, signed with the operator key, to a directory ending `-released`. |

Cost: KIC's generation, 7 model steps, 11,313 prompt and 29,811 completion tokens; the agent's 10 chat requests, 75,323 prompt and 2,496 completion tokens. No reservation was left behind. Neither log contained a token.

## Cost, as far as it can be verified

Measured token use is above. The provider's pricing page, read on 2026-11-13, lists "Mistral Large" at $0.50 per million input tokens and $1.50 per million output tokens. It does not name Large 4 and does not say how reasoning tokens are billed.

**If** that price applies to Large 4 and reasoning is billed as output, the recorded four-post campaign costs about $0.06 in generation (13,045 × $0.50 + 38,742 × $1.50, per million), and the agent's own conversation in the two agent runs about $0.05. These are arithmetic on an unconfirmed price, not a quotation. Reasoning effort "low" was used throughout; on the one prompt where both were measured, the provider default used about twice the reasoning tokens.

Not measured: cost at realistic campaign sizes, with real briefs, or with more revision passes.

## Approval enforcement (C4)

What the code guarantees, each covered by tests in `tests/kic/approval.test.ts`, `signing.test.ts`, `concurrency.test.ts`, `processes.test.ts` and `mcp.test.ts`:

- Nothing is selected, approved, rejected or revised except by a decision recorded with the operator's signing key. The agent-facing server holds only the public key and has no tool that records a decision; with the right one-time code it is still refused.
- Decisions form a signed chain. Each carries its number in the log and the digest of the one before, inside the signature. A decision that is forged, unsigned, signed with another key, moved, repeated, re-pointed or removed from the middle makes the whole log untrusted, and nothing is planned, revised, assembled or signed on top of it.
- Removing decisions from the end of the log is caught by the operator's own ledger, kept beside the key and outside the store. The operator tool then refuses to sign a decision or to release a package.
- The editor is shown the request from the campaign record, never from the operator channel, and must give back the whole 64-character digest of what they read: the request, its action, its subject, any revision instruction and the exact content. A decision is refused, and the request closed, if the stored request or the current text no longer produces that digest. A prefix of the digest is not accepted.
- The operator channel can do no more than say that a request is waiting. Its files are accepted only with well-formed ids, and nothing in one can make the tool touch a file outside the channel.
- The operator's ledger must exist. If it is missing, the tool stops; starting a new one is an explicit command.
- The latest decision about a subject wins. A rejection, a request for revision, or the existence of a revision withdraws an approval, whatever the stored status says.
- A draft cannot be approved unless it has been evaluated and passes the mandatory constraints, whatever it scores.
- A programme cannot be planned without a selected narrative, or assembled without an approved post; pending posts need an explicit partial assembly.
- What the agent-facing server assembles is a preview and says so. Only the operator tool releases a package. The release signature covers the package's digest, who released it, when, why, and the length of the decision log it was made on; any change to the package or to those facts invalidates it.
- Concurrent writers cannot lose a decision: tested on both stores, on two store instances, on eight stores recovering from a crashed writer, and on four separate processes.

## Prompt injection: one live probe

A scratch run, one model call. The synthetic brief was given a planted override in two places: text that tried to close the brief's delimiter and then ordered every post to claim a 300% return, to say results are guaranteed, to use a ruled-out hashtag, to give an email address and to mark every claim as needing no evidence; and a note in a reference asking for an invented customer quotation.

Result: both drafts ignored all of it, cited the survey reference for their one figure, and passed the mandatory constraints. This is **one sample of model behaviour**, not a guarantee. The control that does not depend on the model is the code: `tests/kic/evaluation.test.ts` shows that a draft which did obey would be refused (`must-avoid-term`, `unlisted-statistic`), and `tests/kic/rendering.test.ts` shows that brief text cannot close a prompt delimiter.

## Independent review

| Commit | Reviewer | Verdict | Record |
|---|---|---|---|
| `983487d` | Independent agent, Opus tier | changes-requested (1 critical, 3 high) | `docs/review/2026-11-13-independent-agent-983487d.md` |
| `983487d` | Mistral Large 4, direct API | changes-requested | `docs/review/2026-11-13-mistral-large-4-983487d.md` |
| `aad2196` | Second independent agent, Opus tier | changes-requested (2 high: decision rollback; forged operator notice) | `docs/review/2026-11-13-confirmation-review-aad2196.md` |
| `075b358` | Third independent agent, Opus tier, scope limited to the nine findings and the remediation | changes-requested (2 high: a 12-character hash prefix could be collided; a planted notice could delete the operator's ledger) | `docs/review/2026-11-13-focused-re-review-075b358.md` |
| `187f029` | **None.** The fixes for the third review's twelve findings each have a regression test, but no independent reviewer has read them. | — | — |

Three rounds were set as the limit for this session, and each round found real defects in the round before. The honest reading is that the approval controls have improved a great deal under attack and have not yet survived a review unbroken. Whether to commission a fourth, and by whom, is an owner decision (OD-11). Each review is bound to the exact commit it read; `node harness/scripts/aeh.mjs check-reviews --commit <sha> --gate KIC-01` fails for any commit without an approving, independent review and with any blocking one.

The Mistral Code Review Bot and Codex were not used: the bot's block-content defect is unfixed on its default branch, and the Codex credential is rejected.

## Not demonstrated

- The OpenBot application running at all, with or without Intelligence. No OpenBot UI, thread persistence, memory or learning was exercised.
- The shim or the KIC MCP server inside a running OpenBot; the tenant package loaded by OpenBot.
- Any real editor using any interface.
- Any real client, brief, creator or performance data.
- Live JEV, by design.
- Deployment of any kind.
- Stores shared between machines: the lock relies on process ids and is for one machine only.
- A person using the operator tool. It has been driven by tests and by this session, not by an editor.
- Long campaigns: the largest run was 4 posts.
