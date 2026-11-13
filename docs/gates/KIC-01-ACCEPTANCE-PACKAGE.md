# KIC-01 — acceptance package

Prepared on 2026-11-13 for the Human Owner, under `docs/spec/directives/KIC-01-GATE-CLOSURE-INSTRUCTION-2026-11-13.md`.

**The gate is not accepted. Accepting it, in whole or in part, is the owner's decision, and silence is not acceptance.** Nothing was merged, deployed or provisioned. OpenBot was not started. No licence question was sent to anyone. No real signing key exists; what the agent session did with throwaway keys is in section 8.

**NOT READY FOR A DECISION. After this version was written, a scope-completing review of the evaluator and contracts requested changes at `2537386` (`docs/review/2026-11-13-scope-review-a-2537386.md`). The review check for that commit no longer passes. Remediation and a new commit-bound review are in progress; this package will be reissued against the new commit. Do not accept `2537386`.**

**Second version.** The first version of this package was audited by an independent agent on the day it was written (`docs/review/2026-11-13-audit-of-acceptance-package.md`). The audit found it accurate on the commit, the counts and the checks, and overstated in several places: how much of the code the approving reviews covered, the state of condition C2, what the agent session had done with signing keys, and the list of accepted weaknesses. This version corrects those.

## 1. The decision in front of the owner

The foundation decision OD-1 rests on three conditions, C1 to C3 (`docs/gates/KIC-01-ASSESSMENT.md`). **None of the three is met.** The ledger also tracks a fourth item, C4, for the session goal's rule that editorial approval be enforced in code. It is not a condition on OD-1.

| | Requirement | State |
|---|---|---|
| C1 | OpenBot boots on a legitimately obtained Intelligence project and completes a conversation with a tool call and a recalled memory | **Not met. Never run.** Blocked on things only the owner can supply (section 4) |
| C2 | Mistral Large 4 works through the shim with streaming **inside OpenBot** | **Not met as defined.** Shown outside OpenBot only: with the model client library OpenBot's main branch resolves, and with the CopilotKit agent class |
| C3 | CopilotKit confirms in writing which licence a client-owned deployment needs | **Not met.** The owner's to seek (section 5) |
| C4 | Human editorial approval enforced in code | **Demonstrated**: tested; the approval path attacked in ten review rounds and approved in the last two, by agents inside this programme. Not yet assessed by anyone outside it (OD-11) |

So KIC-01 cannot honestly be accepted as "the runtime proof passed". What can be decided is one of these:

| Option | Meaning | What follows |
|---|---|---|
| **A. Accept in part (recommended)** | Accept the standalone companion at `2537386`: the KIC MCP service, the workflow and approval path, the model shim and the harness. Carry C1, C2 and C3 forward, unaccepted, to the OpenBot foundation proof (mediation Phase 1) | The code can be merged by the owner once a base branch exists (OD-4). The OpenBot work stays blocked exactly as it is now. Real-client use stays barred until OD-11 is done |
| B. Hold the gate open | Accept nothing until C1 to C3 are met | Nothing changes. The code stays on the feature branch; later work on it will need a fresh review at a new commit |
| C. Ask for more first | For example the external assessment (OD-11), a person's run of the operator tool, or closing a named weakness, before any acceptance | The orchestrator prepares what is asked for |

Why A is recommended: what was built does not depend on OpenBot, and the owner's direction of 2026-11-13 names the KIC MCP service as "the authoritative campaign-preparation boundary". The mediation's roadmap records this repository without OpenBot as what works today. That needs a caveat: it has no workspace for an editor, only a command-line operator tool that no person has used (OD-9). Holding it unaccepted gains no safety, since accepting it authorises no use with a client and no OpenBot work. This is a recommendation only.

**What acceptance under option A would not mean:** that OpenBot is adopted or works; that a licence exists; that anything may be deployed; that the approval path is safe for a real client; that JEV may be enabled; that any later gate is authorised.

## 2. The commit and its review

| | |
|---|---|
| Commit offered for acceptance | `2537386bf807ebc62f8e89839d1b9dbda2e6769e` on `claude/adoring-edison-4wlees` |
| Later commits on the branch | Records only: `docs/**` and `harness/state/**`. `git diff --stat 2537386 HEAD -- src tests fixtures tenant-package harness/scripts harness/hooks .github package.json package-lock.json` is empty |
| CI | Workflow `ci`, run 23 (id 43428556880), success on `2537386` |
| Tests | Clean detached worktree at `2537386`: `npm run check` exit 0; type check clean; 202 of 202 product tests; 83 of 83 harness tests. Confirmed independently by the delta reviewer and by the auditor of this package |
| Secret scan | The repository's own scan: clean, exit 0. GitHub's secret scanning was not consulted |
| Review check | `node harness/scripts/aeh.mjs check-reviews --commit 2537386bf807ebc62f8e89839d1b9dbda2e6769e --gate KIC-01`: ok |

### What the approving reviews covered, and what they did not

The review check passes because an approving, independent review is bound to the commit and no blocking one is. **That is a statement about the ledger's rule, not about coverage.** The two approving reviews had a stated scope:

| Review | Scope | Verdict |
|---|---|---|
| `55a66f2` (`independent-review-agent-9`). `55a66f2` is two commits before `2537386`; the commit between them changes records only | The whole commit against four claims about editorial decisions, what the editor is shown, what is released, and the spend ceilings. Files read: the shim's server, the spend account, the operator tool, the display functions, assembly, and the approval, confirm, describe and settle parts of the workflow service, with the signing log and ledger | approved with follow-ups |
| `2537386` (`independent-review-agent-10`) | The diff `55a66f2..2537386` and the code around it | approved |

Outside the scope of both: the evaluator, the contracts, the gateway's budget path, the MCP tool surface, the shim's normaliser, the stores and their locking under real concurrency, the operator tool run as a child process, creator ranking, the skills catalogue, and the harness. Some of that was covered by earlier rounds, which requested changes; some has changed since it was last reviewed; some has never been named in a review's scope. Section 3 says which, row by row.

**Scope-completing reviews of those parts, at the same commit, were commissioned on 2026-11-13 after the audit. They had not returned when this version was written.** Their outcome will be recorded in `harness/state/GATE_STATE.md` and here. Until it is, treat the uncovered parts as tested by their authors and not independently reviewed at this commit.

All reviewers are agents commissioned inside this programme's sessions. Their identity in the review ledger is self-declared by the orchestrator, and the review records are the orchestrator's transcriptions of their reports.

## 3. Part A — implemented, and how each part is verified

| Mark | Meaning |
|---|---|
| **T** | Automated tests pass at `2537386`, in a clean checkout and in CI. These are the authors' own tests. All are offline |
| **R** | In the stated scope of the approving reviews (rounds 9 and 10) |
| **r** | Reviewed in an earlier round only. Those rounds requested changes. The row says whether the code has changed since |
| **L** | Run live against Mistral Large 4. The commit of the run is given, and whether the code has changed since |
| — | Not verified in that way |

No row is verified by a person, on a real client's material, or by a party outside this programme.

| # | Capability | Where | T | Review | L | Limits |
|---|---|---|---|---|---|---|
| 1 | Typed contracts: brief, narrative, plan, draft, evaluation, decision, programme package, provisional command | `src/contracts/` | T | r: named contract files in earlier rounds; last changed in `5e4ee5d`, of which round 8 attacked the signed post number. Not in the scope of rounds 9 or 10 | — | — |
| 2 | Model gateway: streamed Mistral adapter, recorded-fixture replay, missing usage charged at the maximum | `src/gateway/` | T | r: rounds 4 and 5; unchanged since `765ae20`. Streaming usage accounting was not covered by round 8 | L: the recorded campaign and the agent runs, at or before `075b358`; unchanged since `765ae20`, so not run live in its present form | Largest live campaign: 4 posts |
| 3 | Model shim, normaliser: makes Large 4's responses acceptable to an OpenAI-compatible client; streaming; tool calls | `src/shim/normalize.ts` | T | r: read by round 1 only; unchanged since before that review | **L on 2026-11-13 on code identical to `2537386`**: all six cases passed and the control without the shim failed as expected. Output kept: `docs/gates/evidence/shim-live-2026-11-13.txt` | Pass-through mode. The client library was taken from OpenBot's main branch (`804aa69`), not from `v1.0.2` |
| 4 | Shim server and its spend limits when it holds the provider key: model allow-list, one answer per request, a cap per request, a concurrency limit, a persistent ceiling | `src/shim/server.ts` | T (against a loopback stand-in) | **R** | — | **The key-holding mode has never run against the provider**: the session has no provider key to give the shim. Prompt tokens through the shim are bounded only by the body size and the request ceiling. How the provider counts reasoning tokens and bills after a disconnect is unverified |
| 5 | KIC MCP server: stdio and HTTP, 12 tools. None publishes, contacts anyone, spends a client's money or records a decision. Six call the model, within the budget | `src/mcp/` | T | r: the tool surface was last covered by the security review (`177a8c4`) and has changed since (`5e4ee5d`); round 8 covered `runtime.ts` only | L at `aad2196`, `075b358`, and in part at `6f26029`, driven by the CopilotKit agent class. Changed since | Not attached to OpenBot |
| 6 | Campaign workflow: brief interpretation, three narratives, programme plan, drafts in batches of six, evaluation, comparison, revision | `src/workflow/` | T | **R** for approval, confirmation, description of a request, settlement and assembly. r for the generation steps | L: one recorded run, at or before `075b358`; the workflow has changed since. The scenario test replays the recording and checks that two replays are byte-identical to each other | 24-post programme drafted with the scripted model only |
| 7 | Evaluation: deterministic draft analysis, mandatory constraints, JEV-shaped adapter with a deterministic mock | `src/evaluation/` | T | r: rounds 1 to 4 in part. **Its last change (`dfa7458`, an exemption in the figure rules) has had no review.** One file, the criteria, was never in a review's scope | — | **No live JEV transport exists**, by rule. Constraints are heuristics and can be evaded by rephrasing |
| 8 | Editorial approval enforced in code: Ed25519-signed, chained decisions; the key held only by the operator tool; approvals and selection read from the signed log alone; the editor confirms the whole digest of what was shown; one revision per instruction | `src/workflow/`, `src/cli/operator.ts` | T, including the real tool run as child processes with throwaway keys | **R.** Seven agent rounds broke the approval path; the eighth found nothing in it; the ninth and tenth approved | L at `aad2196` and `075b358`, with those commits' operator tool, run by the agent session with throwaway keys (section 8). Changed since | **The current operator tool has not been run live or by a person** |
| 9 | Release: only the operator tool releases; `review` shows everything in the package; the release signature covers the package digest; `verify` checks a released package; every command `NON-EXECUTABLE` | `src/workflow/assemble.ts`, `src/cli/operator.ts` | T | **R** | — | As row 8. The readable summary beside a release is not checked by `verify` |
| 10 | Terminal-safe operator output: stored text behind a margin; control, invisible, direction, blank, private-use and unassigned characters written out | `src/util/runtime.ts` | T | **R**, with a 300,000-string fuzz by the delta reviewer | — | Checked by rule, **not on a real terminal**. A pager narrower than 72 columns could wrap stored text into the first column |
| 11 | Spend control for KIC's own generation: reserve, call, settle; campaign budget; instance spend account kept outside the store; instance ceilings | `src/workflow/spend.ts`, `src/limits.ts` | T | **R** | — | The ceilings' figures are provisional (OD-6). Prompt tokens are not limited |
| 12 | Stores and locking: concurrent writers lose nothing; a lock is taken over only when its owner is gone | `src/store/` | T (four processes on one campaign; eight stores recovering from a dead writer) | r: rounds 1 to 3. **Races between real concurrent processes were outside every review's scope** | — | One machine only |
| 13 | Creator ranking with typed evidence and mandatory eligibility | `src/creators/` | T | — (skimmed once) | — | Labelled synthetic fixtures only. No creator source connected |
| 14 | Skills catalogue: 6 implemented, 3 deferred | `src/skills/` | T | — | — | — |
| 15 | Synthetic campaign end to end: brief to released package of four `NON-EXECUTABLE` commands | `src/cli/demo.ts`, `tests/kic/scenario.test.ts` | T | — | L: recorded once, as row 6 | The editor is a scripted test actor, labelled as such. No person decided anything |
| 16 | Confinement of this repository's own boundary: the 27 rows of the confinement matrix marked T or T+I, each naming its negative test. Five of those tests are in `tests/kic/confinement.test.ts`; the others are the authors' tests and the regression tests from the reviews | `docs/security/CONFINEMENT-TEST-MATRIX.md` | T | **R** for the layer-1 rows marked T+I only | — | Everything about OpenBot and about an instance is outside this row |
| 17 | Harness: task ledger, gates, three stop levels, commit-bound reviews, secret scan, CI, global-stop hook | `harness/`, `.github/`, `.claude/` | T (83) | r: rounds 1 and 2. The hook's installation (`6f26029`) has had no review. The harness gate does not require one | CI on GitHub; the hook in live nested sessions | Reviewer identity and stop clearing are attestations, not authentication. Branch protection is not configured (OD-4) |

A prompt-injection probe was run live once, at an earlier commit that the record does not name, and the model ignored the planted instructions. That is one sample of model behaviour. The control that does not depend on the model is tested: a draft that obeyed would be refused.

## 4. Part B — blocked: OpenBot integration

**OpenBot has never been run as an application by this programme.** What is said about it comes from reading source: the assessment and the capability matrix were written from its main branch (`804aa69`, `f8af37a`), and the capabilities the recommendation relies on were re-checked at release tag `v1.0.2` (mediation A1). Two things were run, both from the main-branch checkout and not from the release: OpenBot's tenant-package validator, and the model client library it resolves. Whether `v1.0.2` resolves the same client version is not recorded.

| Test the owner requires of the selected release | State | Blocked on |
|---|---|---|
| Runtime: OpenBot `v1.0.2` starts, team edition, no Bot computer | **Not run** | An Intelligence project key; Docker, or a Postgres that ships the `vector` extension (OD-7); an identity provider for the team edition (OD-15); the licence (OD-8). Re-checked on 2026-11-13 by presence only: none of the first three is in the environment |
| Attaching the KIC MCP server | **Not run. May not be possible unmodified**: read at `v1.0.2`, the release accepts a custom server only over https at a hostname, not at a loopback or private address | OD-20: a way to attach that does not modify OpenBot |
| Model streaming and tool execution inside OpenBot, through the shim (C2) | **Not run** | The runtime |
| Persistence across a restart; memory | **Not run** | The runtime |
| Confinement: a Bot cannot post, send or pay | **Not run.** Source read at `v1.0.2` suggests the team edition offers the controls and the personal edition does not. The matrix does not claim that an instance can be confined; that is what the test is for | The runtime. Test design: `docs/security/CONFINEMENT-TEST-MATRIX.md`, D7 step 0d |
| The tenant package loaded by OpenBot | **Not run.** It passed the validator of the main-branch checkout | The runtime |

Also not built, and not to be built without a gate: specialist Bots and routines (Phase 2), channels (deferred by the owner), the receipt and feedback contracts and any Kraken integration (Phase 3, KIC-06).

Recorded as a local stop on task `KIC-01-C1`. Plan for when it clears: `docs/architecture/mediation/KIC-ARCH-MED-01/D7-proof-of-integration-plan.md`. Besides C1 to C3, that proof needs spend figures (OD-6) and, by the roadmap, a decision on whether the external assessment (OD-11) must come before it.

## 5. Part C — outstanding licensing decisions

Reserved to the owner. **Nothing was sent to CopilotKit and no paid service was started.**

| Decision | Question | State |
|---|---|---|
| OD-8 | Which licence a client-owned, self-hosted production instance needs. OpenBot's README says Kubernetes or production use needs "a production Intelligence license beyond evaluation"; whether the pay-as-you-go plan is that licence is not confirmed by anything read | **Open.** Draft questions, unsent: `docs/decisions/LICENCE-QUESTIONS-COPILOTKIT.md` |
| OD-15 | Personal or team edition for each client instance. Confinement points to the team edition, which needs an identity provider and the production licence. Where conversations are kept follows from this | **Open** |
| OD-1 | OpenBot as the foundation | Decided **provisionally**, conditional on licensing, runtime verification and confinement. None of the three is satisfied. Its own named fallback is a build on minimal MIT-licensed primitives |
| Upstream code | None imported. The production packages installed are listed in `LICENSES/third-party.md`; development packages are named in `LICENSES/README.md` only | No decision needed today |

## 6. Other owner decisions still open

| Decision | Subject | Bears on |
|---|---|---|
| **OD-11** | **External approval-path security assessment. Kept open by the owner: required before real-client use.** To settle: who does it, its scope, against which commit, and whether it must precede the OpenBot proof | Any reliance on signed approvals with a real client |
| OD-4 | Repository visibility; a `main` branch and its protection. **No base branch exists, so no pull request can be opened and nothing can be merged** | Merging the accepted commit |
| OD-6 | Spend figures: the instance ceilings and the shim's ceiling; confirmation of the unit price | Any live run beyond small checks |
| OD-7 | Environment, Intelligence key | Part B |
| OD-20 | How the KIC MCP server is attached at `v1.0.2` | Part B |
| OD-9 | Where the editor confirms: the command-line operator tool as built, or something else. No person has used it | Row 8; OD-11's scope |
| OD-19 | Whether the programme plan becomes a signed editor decision | Section 7 |
| OD-3 | JEV's role and the gate that governs its activation | JEV stays disabled |
| OD-5 | The standing review mechanism. The Mistral review bot is not operational and Codex is unavailable; neither was substituted silently | Every later gate |
| OD-2, OD-10, OD-16, OD-17 | Harness reuse; reasoning effort; future interface; wording on repeated actions | Later work |

Two questions the records leave open, raised by the session-end reconciliation:

- **Has the KIC-01 implementation authorisation lapsed?** It was given "for the 2026-11-13 session only". The orchestrator treats it as ending at this boundary, and puts a gate stop on KIC-01 once the scope-completing reviews are recorded, so that the harness refuses changes under its paths until the owner decides (section 10).
- **Does the provisional decision on OD-1 settle KIC-00?** The ledger still shows KIC-00 as "report presented, awaiting owner approval".

Register: `docs/decisions/OWNER_DECISIONS.md`.

## 7. Known weaknesses that acceptance would accept

Two lists, which overlap:

- `harness/state/GATE_STATE.md`, "Findings accepted as they stand": every finding from every review round that was not fixed, with its source, the reviewer's own rating and why it was left.
- `docs/security/THREAT-MODEL.md`, "Known weaknesses": the same and the design limits no reviewer raised.

**Most were rated low or informational by the reviewer who raised them. Not all**: one is what remains of a finding rated high, one was rated medium, and several carry no rating. The ones the owner is most likely to want to weigh:

- **The programme plan is not itself a signed decision** (OD-19). The fifth reviewer rated the original finding high: the plan was bound to nothing and mostly not shown. Since then the plan is shown in full at release and each approved post is bound to its place in it. The plan still carries no signature of its own.
- **Confirmation-code guesses are not limited across requests** (rated medium, by the Mistral review). Left as mitigated: codes are 128 bits, at most 25 requests can be pending, and a correct code signs nothing without the operator's key.
- **Evaluations shown to the editor are unsigned** and can be altered by a process that can write the store. They are advice; the mandatory constraints are recomputed at assembly.
- **The server's default export directory is inside the data directory**, which the assumed attacker can write. Releases are written by the operator tool elsewhere. The instance template now asks for the export directory to be placed outside agent-writable space; no instance exists to check it.
- **How the provider counts and bills reasoning tokens is unverified**; the shim's ceiling relies on the provider honouring `max_tokens`, and can be waived by an environment setting.
- **The operator tool has not been seen on a real terminal or used by a person.**
- **Four fixes have no regression test in the repository**; they were checked by reviewers' probes.

Accepting the gate under option A accepts these as known. The owner may instead require any of them to be closed first.

## 8. Standing restrictions, as they stood

| Restriction | State |
|---|---|
| JEV | Disabled. No decision endpoint called. No live transport in the build |
| Publishing, outreach, advertising, spend on a client's behalf | No capability exists in the code |
| Kraken, `jev-router`, upstream repositories | Not written to |
| Credentials | None printed, logged or committed. One invented bearer value in a test file tripped the secret scan in CI (`5e4ee5d`); fixed in the next commit |
| Operator key and confirmation codes | **Not handled by the agent session since `075b358`. Before that they were.** In two live runs, at `aad2196` and at `075b358`, the agent session itself created throwaway keys in scratch space and ran the operator tool with them, playing the editor. The rule against this was written into `CLAUDE.md` in `075b358`; the session's permission layer has refused it since `6f26029`. The test suite still creates throwaway keys and runs the real tool as a child process. No real key and no instance exist |
| Merges, deployments, provisioning, purchases | None |
| Automatic skill approval | A setting of an OpenBot instance. The instance template requires it off (requirement 13). No instance exists, so it has been set and verified nowhere. In this repository's code nothing learned or remembered is authoritative |

## 9. Checking this yourself

In a clean checkout of the commit:

```bash
git fetch origin claude/adoring-edison-4wlees
```

```bash
git worktree add --detach /tmp/kic-2537386 2537386bf807ebc62f8e89839d1b9dbda2e6769e
```

```bash
cd /tmp/kic-2537386 && npm ci && npm run check
```

Then, back in a checkout of the branch head, where the review ledger is:

```bash
node harness/scripts/aeh.mjs check-reviews --commit 2537386bf807ebc62f8e89839d1b9dbda2e6769e --gate KIC-01
```

The offline demonstration is `node src/cli/demo.ts`.

## 10. To accept, hold or redirect

The orchestrator stops at this boundary once the scope-completing reviews of section 2 are recorded. A gate stop then goes on KIC-01 in the harness, with the reason "presented for owner acceptance": until it is cleared, the harness's path check refuses changes under `src/`, `tests/`, `fixtures/` and `tenant-package/`. Clearing it is the owner's. `node harness/scripts/aeh.mjs status` shows whether it is on.

To act, the owner says in the session, or records in `harness/state/GATE_STATE.md`: which option, for which commit, and any conditions. Until then the ledger reads "presented, not accepted".
