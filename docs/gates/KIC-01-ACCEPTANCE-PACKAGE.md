# KIC-01 — acceptance package

Prepared on 2026-11-13 for the Human Owner, under `docs/spec/directives/KIC-01-GATE-CLOSURE-INSTRUCTION-2026-11-13.md`.

**The gate is not accepted. Accepting it, in whole or in part, is the owner's decision, and silence is not acceptance.** Nothing was merged, deployed or provisioned. OpenBot was not started. No signing key was handled by an agent session. No licence question was sent to anyone.

## 1. The decision in front of the owner

KIC-01 was set up as a runtime proof with four conditions (C1–C4) on the foundation decision OD-1. Two are met and two are not:

| Condition | State |
|---|---|
| C1 OpenBot runs on a licensed Intelligence project | **Not met. Never run.** Blocked on things only the owner can supply (section 4) |
| C2 Mistral Large 4 through a shim, streaming, with tools | **Met outside OpenBot.** Not shown inside it |
| C3 Licence confirmation from CopilotKit | **Not met.** The owner's to seek (section 5) |
| C4 Human editorial approval enforced in code | **Met**: tested, and independently reviewed and approved at `2537386` by agents inside this programme. Not yet assessed by anyone outside it (OD-11) |

So KIC-01 cannot honestly be accepted as "the runtime proof passed". What can be decided is one of these:

| Option | Meaning | What follows |
|---|---|---|
| **A. Accept in part (recommended)** | Accept the standalone companion at `2537386`: the KIC MCP service, the workflow and approval path, the model shim and the harness (workstreams B, C, D and the shim half of A). Carry C1 and C3 forward, unaccepted, as the entry conditions of the OpenBot foundation proof (mediation Phase 1) | The reviewed code can be merged by the owner once a base branch exists (OD-4). The OpenBot work stays blocked exactly as it is now. Real-client use stays barred until OD-11 is done |
| B. Hold the gate open | Accept nothing until C1 and C3 are met | Nothing changes. The reviewed code stays on the feature branch; later work on it will need a fresh review at a new commit |
| C. Ask for more first | For example the external assessment (OD-11) before any acceptance, or a person's run of the operator tool | The orchestrator prepares what is asked for |

Why A is recommended: what was built does not depend on OpenBot, it is what the owner's direction calls "the authoritative campaign-preparation boundary", and OD-1 already names it as the fallback that works today. Holding it unaccepted gains no safety, since acceptance of it authorises no use with a client and no OpenBot work. It is a recommendation only.

**What acceptance under option A would not mean:** that OpenBot is adopted or works; that a licence exists; that anything may be deployed; that the approval path is safe for a real client; that JEV may be enabled; that any later gate is authorised.

## 2. The commit

| | |
|---|---|
| Commit offered for acceptance | `2537386bf807ebc62f8e89839d1b9dbda2e6769e` on `claude/adoring-edison-4wlees` |
| Later commits on the branch | Records only: `docs/**` and `harness/state/**`. `git diff --stat 2537386 HEAD -- src tests fixtures tenant-package harness/scripts harness/hooks .github package.json package-lock.json` is empty |
| Review | Full independent review of the parent `55a66f2`: approved with follow-ups. Delta review of `55a66f2..2537386`: approved. Reviewers `independent-review-agent-9` and `independent-review-agent-10`, both agents (Opus tier) with no part in writing the code. Records: `docs/review/2026-11-13-review-55a66f2.md`, `docs/review/2026-11-13-delta-review-2537386.md` |
| CI | Workflow `ci`, run 23 (id 43428556880), success on `2537386` |
| Tests | Clean detached worktree at `2537386`: `npm run check` exit 0; type check clean; 202 of 202 product tests; 83 of 83 harness tests |
| Secret scan | The repository's own scan: clean, exit 0. GitHub's secret scanning was not consulted |
| Review check | `node harness/scripts/aeh.mjs check-reviews --commit 2537386bf807ebc62f8e89839d1b9dbda2e6769e --gate KIC-01`: ok |

The full table, with how each result was obtained, is in `harness/state/GATE_STATE.md` under "Review requirement for KIC-01".

## 3. Part A — implemented and verified

How to read the "verified by" column:

| Mark | Meaning |
|---|---|
| **T** | Automated tests pass at `2537386`, in a clean checkout and in CI. These are the authors' own tests. All are offline |
| **R** | Attacked by independent agent reviewers; approved at `2537386` (full review of the parent, delta review of the rest) |
| **L** | Run live against Mistral Large 4. The commit of the run is given; where code has changed since, that is said |
| — | Not verified in that way |

No row is verified by a person, on a real client's material, or by a party outside this programme.

| # | Capability | Where | T | R | L | Limits of the verification |
|---|---|---|---|---|---|---|
| 1 | Typed contracts: brief, narrative, plan, draft, evaluation, decision, programme package, provisional command | `src/contracts/` | T | R | — | — |
| 2 | Model gateway: streamed Mistral adapter, recorded-fixture replay, missing usage charged at the maximum | `src/gateway/` | T | Partly: the gateway's own budget path was outside the last full review's scope (unchanged since earlier reviews) | L: the recorded campaign, and KIC's own generation in the agent runs at `aad2196` and `075b358` | Largest live campaign: 4 posts. Not re-run live at `2537386` |
| 3 | Model shim: makes Large 4's responses acceptable to the OpenAI-compatible client OpenBot uses; streaming; tool calls | `src/shim/` | T | R | **L on 2026-11-13 on code identical to `2537386`**: `tests/shim/live.ts`, nine requests, all 200; text generation with a tool, plain streaming, and streaming with a tool executed all passed; the control without the shim failed as expected | Pass-through mode only. The lines for the three raw-request cases were not kept from this run's output |
| 4 | Shim spend limits when it holds the provider key: model allow-list, one answer per request, a cap per request, a concurrency limit, a persistent ceiling | `src/shim/server.ts` | T (against a loopback stand-in) | R | — | **Never run against the provider**: the session has no provider key to give the shim. How the provider counts reasoning tokens and bills after a disconnect is unverified (A8) |
| 5 | KIC MCP server: stdio and HTTP, 12 tools, none that publishes, spends, contacts or records a decision | `src/mcp/` | T | Reviews 1 to 8; outside the ninth review's scope (unchanged by its commit) | L at `aad2196`, `075b358`, and in part at `6f26029`, driven by the CopilotKit agent class | Not attached to OpenBot. Not re-run live at `2537386` |
| 6 | Campaign workflow: brief interpretation, three narratives, programme plan, drafts in batches of six, evaluation, comparison, revision | `src/workflow/` | T | R | L (recorded run; replayed byte-for-byte by a test) | 24-post programme drafted with the scripted model only |
| 7 | Evaluation: deterministic draft analysis, mandatory constraints, JEV-shaped adapter with a deterministic mock | `src/evaluation/` | T | R | — | **No live JEV transport exists**, by rule |
| 8 | Editorial approval enforced in code: Ed25519-signed, chained decisions; the key held only by the operator tool; approvals and selection read from the signed log alone; the editor confirms the whole digest of what was shown; one revision per instruction | `src/workflow/`, `src/cli/operator.ts` | T, including the real tool run as child processes with throwaway keys | R: eight reviews broke something, the ninth and tenth did not | L at `aad2196` and `075b358`, with those commits' operator tool | **The current operator tool has not been run live or by a person.** The session's permission layer refuses to let an agent session run it with a signing key, which is the rule working as intended |
| 9 | Release: only the operator tool releases; `review` shows everything in the package; the release signature covers the package digest; `verify` checks a released package; every command `NON-EXECUTABLE` | `src/workflow/assemble.ts`, `src/cli/operator.ts` | T | R | — | As row 8 |
| 10 | Terminal-safe operator output: stored text behind a margin, every control, invisible, direction, blank, private-use and unassigned character written out | `src/util/runtime.ts` | T | R, with a 300,000-string fuzz by the delta reviewer | — | Checked by rule, **not on a real terminal** (A5, A6, A11) |
| 11 | Spend control for KIC's own generation: reserve, call, settle; campaign budget; instance spend account kept outside the store; instance ceilings | `src/workflow/spend.ts`, `src/limits.ts` | T | R | — | The ceilings' figures are provisional (OD-6). Prompt tokens are not limited (A2) |
| 12 | Stores and locking: concurrent writers lose nothing; a lock is taken over only when its owner is gone | `src/store/` | T (four processes on one campaign; eight stores recovering from a dead writer) | Earlier reviews; real cross-process races were outside the last review's scope | — | One machine only |
| 13 | Creator ranking with typed evidence and mandatory eligibility | `src/creators/` | T | — (not named in the scope of any review record) | — | Labelled synthetic fixtures only. No creator source connected |
| 14 | Skills catalogue: 6 implemented, 3 deferred | `src/skills/` | T | — | — | — |
| 15 | Synthetic campaign end to end: brief to released package of four `NON-EXECUTABLE` commands | `src/cli/demo.ts`, `tests/kic/scenario.test.ts` | T | — | L (recorded once; replays are offline) | The editor is a scripted test actor, labelled as such. No person decided anything |
| 16 | Confinement of this repository's own boundary: the rows of the confinement matrix marked T or T+I (27 across its layers), each naming its negative test. Five of those tests are in `tests/kic/confinement.test.ts`; the rest are the regression tests from the reviews | `docs/security/CONFINEMENT-TEST-MATRIX.md` | T | R for layer 1 | — | Everything about OpenBot and about an instance is outside this row: read in source, a deployment requirement, or proposed |
| 17 | Harness: task ledger, gates, three stop levels, commit-bound reviews, secret scan, CI, global-stop hook | `harness/`, `.github/`, `.claude/` | T (83) | Not in the scope of the last reviews | CI on GitHub; the hook in live nested sessions | Reviewer identity in the review ledger is self-declared. Branch protection is not configured (OD-4) |

A prompt-injection probe was run live once and the model ignored the planted instructions. That is one sample of model behaviour. The control that does not depend on the model is tested: a draft that obeyed would be refused.

## 4. Part B — blocked: OpenBot integration

**None of this has been run. Every statement about OpenBot in this repository comes from reading source at release tag `v1.0.2`.**

| Test the owner requires of the selected release | State | Blocked on |
|---|---|---|
| Runtime: OpenBot `v1.0.2` starts, team edition, no Bot computer | **Not run** | An Intelligence project key; Docker, or a Postgres that ships the `vector` extension (OD-7); an identity provider for the team edition (OD-15); the licence (OD-8) |
| Attaching the KIC MCP server | **Not run. May not be possible unmodified**: the release accepts a custom server only over https at a hostname, not at a loopback or private address | OD-20: a way to attach that does not modify OpenBot |
| Model streaming and tool execution inside OpenBot, through the shim | **Not run.** Shown only with the agent class and model client OpenBot uses, outside OpenBot | The runtime |
| Persistence across a restart | **Not run** | The runtime |
| Confinement: a Bot cannot post, send or pay | **Not run.** Source says the team edition can be confined and the personal edition cannot | The runtime. Test design: `docs/security/CONFINEMENT-TEST-MATRIX.md`, D7 step 0d |
| The tenant package loaded by OpenBot | **Not run.** It passes upstream's validator | The runtime |

Also not built, and not to be built without a gate: specialist Bots and routines (Phase 2), channels (deferred by the owner), the receipt and feedback contracts and any Kraken integration (Phase 3, KIC-06).

Recorded as a local stop on task `KIC-01-C1`. It was hit once and not retried. Plan for when it clears: `docs/architecture/mediation/KIC-ARCH-MED-01/D7-proof-of-integration-plan.md`.

## 5. Part C — outstanding licensing decisions

Reserved to the owner. **Nothing was sent to CopilotKit and no paid service was started.**

| Decision | Question | State |
|---|---|---|
| OD-8 | Which licence a client-owned, self-hosted production instance needs. OpenBot's README says Kubernetes or production use needs "a production Intelligence license beyond evaluation"; whether the pay-as-you-go plan is that licence is not confirmed by anything read | **Open.** Draft questions, unsent: `docs/decisions/LICENCE-QUESTIONS-COPILOTKIT.md` |
| OD-15 | Personal or team edition for each client instance. Confinement points to the team edition, which needs an identity provider and the production licence. Where conversations are kept follows from this | **Open** |
| OD-1 | OpenBot as the foundation | Decided **provisionally**, conditional on licensing, runtime verification and confinement. None of the three is satisfied |
| Upstream code | None imported. Installed packages are inventoried in `LICENSES/third-party.md` | No decision needed today |

If the licence answer is unfavourable, the fallback recorded in OD-1 is this repository without OpenBot.

## 6. Other owner decisions still open

| Decision | Subject | Bears on |
|---|---|---|
| **OD-11** | **External approval-path security assessment. Kept open by the owner: required before real-client use.** To settle: who does it, its scope, and against which commit | Any reliance on signed approvals with a real client |
| OD-4 | Repository visibility; a `main` branch and its protection. **No base branch exists, so no pull request can be opened and nothing can be merged** | Merging the accepted commit |
| OD-6 | Spend figures: the instance ceilings and the shim's ceiling; confirmation of the unit price | Any live run beyond small checks |
| OD-7 | Environment, Intelligence key | Part B |
| OD-20 | How the KIC MCP server is attached at `v1.0.2` | Part B |
| OD-9 | Where the editor confirms: the command-line operator tool as built, or something else. No person has used it | Row 8; OD-11's scope |
| OD-19 | Whether the programme plan becomes a signed editor decision | A4 |
| OD-3 | JEV's role and the gate that governs its activation | JEV stays disabled |
| OD-5 | The standing review mechanism. The Mistral review bot is not operational and Codex is unavailable; neither was substituted silently | Every later gate |
| OD-2, OD-10, OD-16, OD-17 | Harness reuse; reasoning effort; future interface; wording on repeated actions | Later work |

Register: `docs/decisions/OWNER_DECISIONS.md`.

## 7. Non-blocking findings accepted as they stand

Eleven, A1 to A11, each with its source and the reason it does not block, in `harness/state/GATE_STATE.md`. None was rated above low by the reviewer who raised it. The three the owner is most likely to want to weigh:

- **A4** The programme plan is shown in full at release but is not itself a signed decision (OD-19).
- **A8** How the provider counts and bills reasoning tokens is unverified; the shim's ceiling relies on the provider honouring `max_tokens`.
- **A11** The operator tool has not been seen on a real terminal or used by a person.

Accepting the gate under option A accepts these as known weaknesses. The owner may instead require any of them to be closed first.

## 8. Standing restrictions, as they stood throughout

| Restriction | State |
|---|---|
| JEV | Disabled. No decision endpoint called. No live transport in the build |
| Publishing, outreach, advertising, spend on the client's behalf | No capability exists in the code |
| Kraken, `jev-router`, upstream repositories | Not written to |
| Credentials | None printed, logged or committed. One invented bearer value in a test file tripped the secret scan in CI (`5e4ee5d`); fixed in the next commit |
| Operator key and confirmation codes | Not handled by the agent session |
| Merges, deployments, provisioning, purchases | None |
| Automatic skill approval | A setting of an OpenBot instance. The instance template requires it off (requirement 13). No instance exists, so it has been set and verified nowhere. In this repository's code nothing learned or remembered is authoritative |

## 9. Checking this yourself

```bash
git fetch origin claude/adoring-edison-4wlees
```

```bash
git worktree add --detach /tmp/kic-2537386 2537386bf807ebc62f8e89839d1b9dbda2e6769e
```

```bash
cd /tmp/kic-2537386 && npm ci && npm run check
```

```bash
node harness/scripts/aeh.mjs check-reviews --commit 2537386bf807ebc62f8e89839d1b9dbda2e6769e --gate KIC-01
```

The last command is run from the branch head, where the review ledger is. The offline demonstration is `node src/cli/demo.ts`.

## 10. To accept, hold or redirect

The orchestrator stops here. To act, the owner records the decision in `harness/state/GATE_STATE.md` or says it in the session: which option, for which commit, and any conditions. Until then the ledger reads "presented, not accepted".
