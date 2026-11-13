# KIC-01 — acceptance package

Prepared on 2026-11-13 for the Human Owner, under `docs/spec/directives/KIC-01-GATE-CLOSURE-INSTRUCTION-2026-11-13.md` and `docs/spec/directives/KIC-01-FINAL-REVIEW-CLOSURE-INSTRUCTION-2026-11-13.md`.

**Fourth version. Code assessed: `c83b0cbd0134eb224552b73e52a43b7111cde721`. Gate status: BLOCKED / NOT READY. The gate is not accepted; accepting it, in whole or in part, is the owner's decision, and silence is not acceptance.** Nothing was merged, deployed or provisioned. OpenBot was not started. No licence question was sent to anyone. No real signing key exists. No remediation was undertaken after `c83b0cb`, and none will be without a new owner instruction.

Earlier versions: the first was audited and found overstated (`docs/review/2026-11-13-audit-of-acceptance-package.md`); the second offered `2537386` and was withdrawn when reviews of the parts its approving reviews had not covered requested changes. Six rounds of remediation and fourteen further reviews followed.

## 1. Gate disposition

**KIC-01: BLOCKED / NOT READY.** Three reasons, each sufficient by the owner's rule that a required review requesting changes, incomplete coverage or missing material evidence blocks the gate.

| # | Reason | Minimum remediation |
|---|---|---|
| R1 | **The evaluator's rules against disguised words and figures have no approving review.** Five full reviews in a row requested changes (`2537386`, `1d8bafe`, `a1affd2`, `1f159a2`, `e30451c`); the last left two findings rated high and three medium open, and they are true of `c83b0cb` (section 6). Two regression reviews of the fixes that followed also requested changes (`7f1978a`, `184f687`). The final regression review, of `c83b0cb`, is APPROVED WITH FINDINGS **for its scope only**: whether the term matching is worse than at `e30451c`. It does not review the rules themselves, and it records two classes, beside the intended one, in which `c83b0cb` reads less than `e30451c` did | Either an owner ruling on OD-21 that restates what these rules are required to do (pattern rules behind the editor, with the open findings accepted), followed by one independent review of the evaluator at `c83b0cb` against that restated requirement; or further work on the rules under a new instruction, followed by a full review that approves. The first changes the requirement; the second has failed to converge in five rounds |
| R2 | **Review coverage of the final commit is incomplete in three areas.** After the last review with an approving verdict (`e30451c`), 72 lines changed outside the evaluator: `requestDecision` in `src/workflow/service.ts` (53), the gateway's charge for a failed request (13), a comment in `src/limits.ts` (6). Two independent reviewers examined those changes at `7f1978a` and `184f687` and each stated that the earlier approvals still stand; but the verdict each recorded for its commit is CHANGES REQUESTED, because of the evaluator. No approving verdict is bound to a commit that contains them | One delta review of `git diff e30451c c83b0cb -- src/workflow src/gateway src/limits.ts` with its own verdict; or an owner ruling that the two reviewers' recorded statements suffice |
| R3 | **The runtime proof the gate is named for was never run.** C1 (OpenBot boots on a licensed Intelligence project) not met; C2 (Mistral Large 4 through the shim inside OpenBot) not met as defined; C3 (written licence confirmation) not met | Things only the owner can supply: an Intelligence project key, an environment with Docker or pgvector, an identity provider, the licence answer, and a way to attach the MCP server to the release (OD-7, OD-8, OD-15, OD-20). Section 7 |

**Proposed acceptance ruling: none.** An acceptance of KIC-01 as "the runtime proof passed" is not justified by the evidence, and the orchestrator does not propose one. What the evidence would support, if the owner chooses to rule on part of the gate, is set out in section 12 as options, not as a recommendation to accept.

C4, the session goal's rule that editorial approval be enforced in code, is demonstrated and independently reviewed (section 4, area 4, with the qualification in R2). It is not a condition on OD-1 and does not unblock the gate.

## 2. The final review

| | |
|---|---|
| Reviewed commit | `c83b0cbd0134eb224552b73e52a43b7111cde721` |
| Comparison baseline | `e30451c517bae16982ad75599d3f62cc4534ff13`, the last commit at which the evaluator as a whole was reviewed |
| Scope | Regression only: the term matching in `src/evaluation/terms.ts` and its tests. Not a review of whether the evaluator's rules are complete |
| Reviewer | `independent-review-agent-24`: an independent agent, Opus tier, new to the code, no part in writing it, not a reviewer of any earlier commit. Commissioned inside this programme's sessions; identity declared by the orchestrator |
| Verdict | **APPROVED WITH FINDINGS** (recorded in the ledger as `approve-with-followups`), for the term matching at `c83b0cb` as a regression review against `e30451c`. **Not an approval of the evaluator** |
| Record | `docs/review/2026-11-13-regression-review-c83b0cb.md`; ledger entry `rev-2026-11-13-agent-regression-c83b0cb`; the reviewer's probe scripts and output in `docs/gates/evidence/review-24-c83b0cb/` |

The reviewer's two statements, as given:

- "No other source or test file changed between `184f687` and `c83b0cb`."
- "Leaving aside the plain-number class and the findings open at `e30451c`, the term matching at `c83b0cb` is worse in two places, and both are consequences of fixes recorded in the a5 record: the '-es' change; the wider contraction reading. It is not worse anywhere else I tested."

Blocking findings: none, by the reviewer's rating. Non-blocking findings:

| # | Severity | Finding |
|---|---|---|
| 1 | low | **A word that reads as a listed contraction is read only as that contraction.** The run-together word or the stem, which `e30451c` caught, is missed: "he'\|\|" for "hell", "w3'll" for "well", "it's-free" for "it". 8,245 of 20,080 contraction-shaped probes; none among 240,000 random disguises. A regression against `e30451c` that follows from a recorded fix; the reviewer recommends the owner record it as a second intended class |
| 2 | info | A three-letter term followed by "-es" after a letter that is not a hissing sound is no longer matched ("feees" for "fee"). 31 of 240,000. Follows from a recorded fix |
| 3 | info | The intended plain-number class: 1,039 of 240,000. Every loss is a pure numeral token |
| 4 | low | Honest hashtags refused where a run of capitals spans two words ("#SaaSOps" for "so", "#iOSHub" for "os"). Open as recorded before |
| 5 | info | Honest body text: no new refusal in 3,568 sentences and 46 fixed strings |
| 6 | low to info | Ordinary prose evaluates about 2.9 times slower than at `e30451c` (62 ms to 180 ms at 8,000 characters and 40 long terms); the worst shape takes under half a second; linear. The timing test's margin under load is about 30% |

Reproduction results: `npm run check` in the reviewer's worktree at `c83b0cb`, exit 0, 289 of 289 and 83 of 83; secret scan clean; the changed test file five times, no flakiness; the two newest tests fail on the `184f687` sources, as they should. With the plain-number and "-es" classes restored in a copy, losses against `e30451c` were 0 of 240,000 random disguises, 0 of 1.64 million targeted constructions and 0 of 75,000 hashtags. The two regressions the review of `184f687` found are closed.

Not verified by the reviewer: that the search for losses is complete (it rests on random generation and ablation, not proof); timing on other hardware; the completeness of the rules, which was out of scope.

## 3. The code assessed and its evidence

| | |
|---|---|
| Code SHA | `c83b0cbd0134eb224552b73e52a43b7111cde721` on `claude/adoring-edison-4wlees` |
| Later commits | Records only. `git diff --stat c83b0cb HEAD -- src tests fixtures tenant-package harness/scripts harness/hooks .github .claude package.json package-lock.json tsconfig.json` is empty. One file outside `docs/` and `harness/state/` did change: `harness/config/gates.json`, written by the harness's own `stop` command when the gate stop was raised. In it KIC-01's status went from "authorised" to "blocked", with the stop and the previous status recorded; the tool also re-indented the file. The gate's paths and its review requirement are unchanged |
| Product tests | **289 of 289 pass**, none skipped. `npm run check` exit 0 in a detached worktree at `c83b0cb`, run by the orchestrator on 2026-11-13 after the commit; the same counts were obtained independently by reviewer 24 in its own worktree at `c83b0cb` |
| Harness tests | **83 of 83 pass**, same run |
| Type check | Clean, same run |
| CI | Workflow `ci`, **run 58** (id 43475174844): success, head SHA `c83b0cb…`. Read from GitHub Actions |
| Secret scan | The repository's own scan: clean, exit 0, in the same worktree. GitHub's secret scanning was not consulted |
| Record check | `aeh check-records`: ok |
| Review check | `node harness/scripts/aeh.mjs check-reviews --commit c83b0cbd0134eb224552b73e52a43b7111cde721 --gate KIC-01`: **ok**, via `rev-2026-11-13-agent-regression-c83b0cb`. **This does not make the gate ready**. The check asks only whether an approving review is bound to the commit and no blocking one is; it does not measure coverage and does not carry a finding forward from one commit to the next. Read section 4, not the check |
| Reviewers' regression probes, re-run by the orchestrator | The comparison scripts of reviewers 22 and 23, pointed at the `c83b0cb` code against `e30451c`: 60,000 random disguised words classified by cause, none lost outside the one intended class (about 120 in each 20,000 inside it); 15,000 random disguised hashtags, none lost outside that class; 5,000 random honest sentences and 15,000 honest hashtags, one new refusal (the recorded hashtag class); the six end-to-end drafts reviewer 23 showed eligible are refused again. These are the orchestrator's runs of the reviewers' scripts, not independent evidence |
| Live check | `tests/shim/live.ts` against Mistral Large 4, on the code of `7f1978a`: six of six cases, the control without the shim failed as expected. `src/shim/` and `src/gateway/` are unchanged between `7f1978a` and `c83b0cb`. `docs/gates/evidence/shim-live-2026-11-13-final.txt` |
| Working tree | Clean; local HEAD equals the remote branch head. Stated with the SHA in the handback |

Discrepancies found while verifying, and left visible: the review ledger's `at` fields are typed by hand, not measured; some of its `status` fields say "open" for findings since fixed, because the ledger is append-only; the offline demonstration was run on the code of `7f1978a`, not `c83b0cb` (the scenario test that replays the same campaign passes at `c83b0cb`). Others are listed in `harness/state/GATE_STATE.md`, "Known inaccuracies in the review ledger".

## 4. Review coverage matrix

Verdicts are given in the owner's terms: APPROVED, APPROVED WITH FINDINGS, CHANGES REQUESTED. "Held" means a reviewer tested a claim and found it to hold, inside a review whose recorded verdict was CHANGES REQUESTED for another reason; it is not an approval. All reviewers are agents commissioned inside this programme's sessions, each new to the code and bound to an exact commit; their identity in the ledger is self-declared by the orchestrator and the records in `docs/review/` are the orchestrator's transcriptions. Twenty-four agent reviews and one Mistral review are recorded; eighteen of the twenty-five requested changes.

| Area | Last review with an approving verdict, and its SHA | Changes after that SHA | Delta review of those changes | Remaining findings | Coverage |
|---|---|---|---|---|---|
| **1a. Evaluator: rules against disguised words and unbacked figures** (`src/evaluation/terms.ts`, `signals.ts`) | **None.** CHANGES REQUESTED at `2537386`, `1d8bafe`, `a1affd2`, `1f159a2`, `e30451c` (agents 11, 13, 15, 17, 20) | `terms.ts`: 194 lines since `e30451c` (`dfe9ead`, `184f687`, `c83b0cb`). The rest of `src/evaluation/`: none | Regression reviews: `7f1978a` CHANGES REQUESTED (agent 22); `184f687` CHANGES REQUESTED (agent 23); `c83b0cb`: **APPROVED WITH FINDINGS** (agent 24), regression against `e30451c` only | Section 6: two high, three medium, and lower | **Not approved** |
| **1b. Unicode handling: the characters a draft may contain** (`characters.ts`) | None with an approving verdict. **Held** at `e30451c` (agent 20): 696 code points accepted, none that should not be | None | — | Product consequence: 694 named characters only (section 8) | Held, not approved |
| **1c. Stream normaliser** (`src/shim/normalize.ts`) | None with an approving verdict. **Held** at `e30451c` (agent 20), and at `a1affd2` (agent 15: 3,000 random streams against a reference parser, no mismatch) | None (a test was added) | — | None open | Held, not approved |
| **2. Store persistence, locking and concurrency** (`src/store/`) | APPROVED WITH FINDINGS at `e30451c` (agent 21, a delta from `1f159a2`); before it at `1f159a2` (agent 18) and `a1affd2` (agent 16) | **None** | Not needed | One machine and one process-id space only. Volume trials with real processes by four reviewers, about 5,700 kills: nothing lost or duplicated | **Complete** |
| **3. Gateway, MCP contracts and argument validation** (`src/gateway/`, `src/mcp/`, `src/contracts/`) | Gateway and MCP: APPROVED WITH FINDINGS at `e30451c` (agent 21), `1f159a2` (agent 18). Contracts: no approving verdict; **held** at `1f159a2` (agent 17) | Gateway: 13 lines (`7f1978a`, the charge for a failed request). MCP: none. Contracts: none | Examined at `7f1978a` (agent 22: 80,000 random sequences, none over the allowance) and `184f687` (agent 23: byte-identical). **Both verdicts CHANGES REQUESTED, for the evaluator** | Prompt tokens are not limited; the provider's accounting is unverified | **Incomplete (R2)** for the 13 lines; contracts held, not approved |
| **4. Editorial signing, revision binding and approval integrity** (`src/workflow/signing.ts`, `operator.ts`, `assemble.ts`, `service.ts`, `src/cli/operator.ts`) | APPROVED at `2537386` (agent 10); APPROVED WITH FINDINGS at `55a66f2` (agent 9), at `1f159a2` (agent 19, delta from `2537386`) and at `e30451c` (agent 21, delta from `1f159a2`) | `service.ts`: 53 lines, in `requestDecision` only (`7f1978a`, `184f687`). Signing, the operator tool, the ledger and the decision contract: none since `2537386` | Examined at `7f1978a` and `184f687` (agents 22, 23): claims (a) to (d) held; nothing that verifies, assembles or releases reads the requests or the audit trail. **Both verdicts CHANGES REQUESTED, for the evaluator** | The plan is not a signed decision (OD-19); code guesses not limited across requests; evaluations unsigned; a waiting request holds its place for 30 minutes; not assessed by anyone outside the programme (OD-11); never used by a person | **Incomplete (R2)** for the 53 lines |
| **5. Spend ceilings and model-call enforcement** (`src/workflow/spend.ts`, `src/limits.ts`, the gateway's charging, `src/shim/server.ts`) | APPROVED WITH FINDINGS at `e30451c` (agent 21); the shim's ceiling at `1f159a2` (agent 19) | `spend.ts`: none since `2537386`. `shim/server.ts`: none since `a1affd2`. Gateway charge: 13 lines. `limits.ts`: a comment | As area 3 | The ceilings' figures are provisional (OD-6); the shim's key-holding mode has never run against the provider; its ceiling can be waived by a setting | **Incomplete (R2)** for the 13 lines |
| **6. Security, credentials and confinement boundaries** | No single approving review covers this area. Its parts: the approval-path security review at `177a8c4` (agent 7) was CHANGES REQUESTED and its findings were closed by `2537386`; "no tool publishes, records a decision or takes a file, host, model or key", "no argument reaches outside the data and export directories" and the HTTP transport's bounds were in the scope of the store and MCP reviews (APPROVED WITH FINDINGS at `a1affd2`, `1f159a2`); no live JEV path **held** at `e30451c` | `src/mcp/`: none since `1f159a2` | — | Everything about an OpenBot instance is untested (no instance). Deployment requirements are proposals. Reviewer identity and stop clearing are attestations. OD-11 open | **Partial.** This repository's own boundary: covered by the reviews named. OpenBot and instance confinement: not run |

## 5. What exists, by standing

| Standing | What |
|---|---|
| **Implemented and independently verified** (an approving verdict, and unchanged since or the change is noted) | Store and locking. MCP tool surface and HTTP transport. Gateway, except 13 lines (R2). Editorial signing, the decision log, the operator ledger, release and `verify`, terminal-safe output, the approval and confirmation paths, except 53 lines of `requestDecision` (R2). Spend reservation and settlement, campaign and instance ceilings, the shim's spend limits against a stand-in |
| **Implemented; a claim held under independent test, but no approving verdict** | The list of characters a draft may contain. The stream normaliser. Contracts and non-executable commands. Creator ranking. The absence of any live JEV path |
| **Implemented but not independently verified, or reviewed and not approved** | **The evaluator's rules against disguised words and figures (reviewed, not approved).** The 72 lines of R2 (examined, no approving verdict). The generation steps of the workflow (earlier rounds only). The skills catalogue. The demonstration. The harness (rounds 1 and 2 only). Everything run live: the gateway and workflow in their present form have not been run against the provider; the shim was |
| **Proposed, not implemented** | The instance runbook and its 19 deployment requirements (`docs/deployment/INSTANCE-TEMPLATE.md`). Specialist Bots, routines and grants. A signed decision on the plan (OD-19). The receipt and feedback contracts. An editor's surface other than the command-line tool (OD-9) |
| **Blocked by credentials, infrastructure or licensing** | Everything in section 7: OpenBot's runtime, attaching the MCP server, streaming and tools inside OpenBot, persistence and memory, instance confinement, the tenant package loaded by OpenBot; the licence answer |
| **Explicitly excluded from KIC-01** | Live JEV (disabled; no transport in the build). Publishing, outreach, advertising and any spend on a client's behalf (no capability exists). Channels (deferred by the owner). Kraken integration (KIC-06, deferred). Standalone OpenDuet, OpenDots and OpenMuse runtimes (excluded by the owner). Real-client use and real signing keys |

The row-by-row table of capabilities, with tests and live runs:

| Mark | Meaning |
|---|---|
| **T** | Automated tests pass at `c83b0cb`, locally and in CI. The authors' own tests, with the reviewers' exploits added as regression tests. All offline |
| **A** | An approving verdict from independent review, as section 4 states it, with any change since noted there |
| **H** | Held when last independently reviewed, inside a review that requested changes elsewhere |
| **N** | Independently reviewed and **not approved** |
| **L** | Run live against Mistral Large 4. The commit of the run is given |
| — | Not verified in that way |

No row is verified by a person, on a real client's material, or by a party outside this programme.

| # | Capability | Where | T | Review | L | Limits |
|---|---|---|---|---|---|---|
| 1 | Typed contracts: brief, narrative, plan, draft, evaluation, decision, programme package, provisional command | `src/contracts/` | T | H (agent 17, `1f159a2`) | — | — |
| 2 | Model gateway: streamed Mistral adapter, recorded-fixture replay; what is read from the provider is bounded; usage figures are checked; a call is never charged more than three times its allowance, and a failed or silent request is charged at its allowance | `src/gateway/` | T | A | L: the recorded campaign and the agent runs, at or before `075b358`. **Changed since; not run live in its present form** | Largest live campaign: 4 posts |
| 3 | Model shim, normaliser: makes Large 4's responses acceptable to an OpenAI-compatible client; streaming; tool calls; hidden reasoning removed | `src/shim/normalize.ts` | T | H (agent 20, `e30451c`): 3,000 random streams against a reference parser by an earlier reviewer, no mismatch | **L on 2026-11-13 on the code of `7f1978a`; the shim is unchanged since**: six of six cases, control failed as expected. Output kept | Pass-through mode. The client library was taken from OpenBot's main branch (`804aa69`), not from `v1.0.2` |
| 4 | Shim server and its spend limits when it holds the provider key: model allow-list, one answer per request, a cap per request, a concurrency limit, a persistent ceiling | `src/shim/server.ts` | T (against a loopback stand-in) | A (approval path, claim d) | — | **The key-holding mode has never run against the provider**: the session has no provider key to give the shim. Prompt tokens through the shim are bounded only by the body size and the request ceiling. How the provider counts reasoning tokens and bills after a disconnect is unverified |
| 5 | KIC MCP server: stdio and HTTP, 12 tools. None publishes, contacts anyone, spends a client's money or records a decision. Six call the model, within the budget. Arguments are bounded; connections are bounded | `src/mcp/` | T | A | L at `aad2196`, `075b358`, and in part at `6f26029`, driven by the CopilotKit agent class. Changed since | Not attached to OpenBot |
| 6 | Campaign workflow: brief interpretation, three narratives, programme plan, drafts in batches of six, evaluation, comparison, revision; decision requests, one per decision at a time | `src/workflow/` | T | A for approval, confirmation, requests, settlement and assembly. The generation steps: earlier rounds only | L: one recorded run, at or before `075b358`; the workflow has changed since. The scenario test replays the recording | 24-post programme drafted with the scripted model only |
| 7 | Evaluation: deterministic draft analysis; the characters a draft may contain; ruled-out terms; figure rules; JEV-shaped adapter with a deterministic mock | `src/evaluation/` | T | **N** for the rules against disguised words and figures (section 6). H for the character list and for the absence of any live JEV path | — | **No live JEV transport exists**, by rule. The constraints are pattern rules |
| 8 | Editorial approval enforced in code: Ed25519-signed, chained decisions; the key held only by the operator tool; approvals and selection read from the signed log alone; the editor confirms the whole digest of what was shown; one revision per instruction | `src/workflow/`, `src/cli/operator.ts` | T, including the real tool run as child processes with throwaway keys | A | L at `aad2196` and `075b358`, with those commits' operator tool, run by the agent session with throwaway keys (section 8). Changed since | **The current operator tool has not been run live or by a person** |
| 9 | Release: only the operator tool releases; `review` shows everything in the package; the release signature covers the package digest; `verify` checks a released package; every command `NON-EXECUTABLE` | `src/workflow/assemble.ts`, `src/cli/operator.ts` | T | A | — | As row 8. The readable summary beside a release is not checked by `verify` |
| 10 | Terminal-safe operator output: stored text behind a margin; control, invisible, direction, blank, private-use and unassigned characters written out | `src/util/runtime.ts` | T | A | — | Checked by rule, **not on a real terminal**. A pager narrower than 72 columns could wrap stored text into the first column |
| 11 | Spend control for KIC's own generation: reserve, call, settle; campaign budget; instance spend account kept outside the store; instance ceilings | `src/workflow/spend.ts`, `src/limits.ts` | T | A | — | The ceilings' figures are provisional (OD-6). Prompt tokens are not limited |
| 12 | Stores and locking: concurrent writers lose nothing; a dead owner's lock is removed by one process at a time; a pipe, link or directory at a lock's or record's path does not hang or mislead a caller | `src/store/` | T (real processes) | A, with volume trials by four reviewers | — | One machine and one process-id space only |
| 13 | Creator ranking with typed evidence and mandatory eligibility | `src/creators/` | T | H (agent 17, `1f159a2`) | — | Labelled synthetic fixtures only. No creator source connected |
| 14 | Skills catalogue: 6 implemented, 3 deferred | `src/skills/` | T | — | — | — |
| 15 | Synthetic campaign end to end: brief to released package of four `NON-EXECUTABLE` commands | `src/cli/demo.ts`, `tests/kic/scenario.test.ts` | T; the demo was run on the code of `7f1978a` | — | L: recorded once, as row 6 | The editor is a scripted test actor, labelled as such. No person decided anything |
| 16 | Confinement of this repository's own boundary: the rows of the confinement matrix marked T or T+I, each naming its negative test | `docs/security/CONFINEMENT-TEST-MATRIX.md` | T | A for the layer-1 rows marked T+I | — | Everything about OpenBot and about an instance is outside this row |
| 17 | Harness: task ledger, gates, three stop levels, commit-bound reviews, secret scan, CI, global-stop hook | `harness/`, `.github/`, `.claude/` | T (83) | Rounds 1 and 2 only. The harness gate does not require a review | CI on GitHub; the hook in live nested sessions | Reviewer identity and stop clearing are attestations, not authentication. Branch protection is not configured (OD-4). The review check does not carry findings forward (section 2) |

## 6. The evaluator's open findings (OD-21)

A brief can rule out words, and the evaluator refuses a draft that contains one or that states a figure no cited reference backs. Five independent reviews in a row each found a further way to write such a word or figure so that a reader reads it and the rules do not. Each round closed what the round before had found. The fourth replaced the lists of look-alike characters with a list of the 694 characters a draft may contain, and that list held. The reading of words did not.

The orchestrator did not start a sixth round of closing new disguises. It fixed what the fifth review found wrong in the code written for the fourth round, and had the result checked for regressions against `e30451c`. That check took three passes. The first two each found that the fix had made something worse than `e30451c` and requested changes; the third, of `c83b0cb`, is APPROVED WITH FINDINGS for that question only. The code is fragile to change.

Open at `c83b0cb`:

| Open finding | Rated | Example that passes |
|---|---|---|
| Quantities written in words, outside the listed shapes, are not treated as figures. Older than this work; missed by every earlier review | **high** | "Nine of ten clients renewed", "Revenue grew fourfold" |
| A letter repeated for emphasis | **high** | "FREEEE", "scammm" |
| A letter masked with a star or an underscore | medium | "sc*m", "fr_e" |
| A word hyphenated across a line break | medium | "guar-" at a line's end, "antee" on the next |
| The digits 9, 6 and 2 are not read as letters | medium | "9uarantee", once a cited reference contains the digit |
| **A word written the way a number is written is not read as letters.** A trade-off made in this last round so that "Room 101" is not refused for "lol"; the reviewed commit `e30451c` did read these. About 125 in 20,000 random disguises. The figure rule still applies to each | recorded as intended | "8357" for "best", "4.1" for "AI", once a cited reference contains the number |
| Three-letter terms ending in "e" miss some endings | low to medium | "used", "lying" for "use", "lie" |
| A term looked for as written is not found when spaced; a contraction joined by an underscore | low | "C ++", "can't_lose" |
| **A word that reads as a listed contraction is read only as that contraction.** A consequence of a fix in this last round; `e30451c` read these. Reviewer 24 recommends recording it as a second intended class | low | "he'\|\|" for "hell", "w3'll" for "well" |
| A three-letter term followed by "-es" after a letter that is not a hissing sound. A consequence of a fix in this last round, made so that "wines" is not refused for "win" | info | "feees" for "fee" |
| In a hashtag, a run of capitals can span two words, so a few honest tags are refused | low; errs towards refusing | "#SaaSOfPR" for "so" |
| Three listed pictures show a figure or are a flag on most devices | noted | the first-place medal, the calendar, the chequered flag |

These are pattern rules. They catch the plain case and many disguises, not every form a reader can read. What stands behind them is the editor: the operator tool shows the full text of every draft, the signature covers a digest of exactly what was shown, and nothing is released that the editor did not approve.

## 7. Blocked: OpenBot integration and licensing

**OpenBot has never been run as an application by this programme.** What is said about it comes from reading source: the assessment and the capability matrix were written from its main branch (`804aa69`, `f8af37a`), and the capabilities the recommendation relies on were re-checked at release tag `v1.0.2` (mediation A1). Two things were run, both from the main-branch checkout and not from the release: OpenBot's tenant-package validator, and the model client library it resolves. Whether `v1.0.2` resolves the same client version is not recorded.

| Test the owner requires of the selected release | State | Blocked on |
|---|---|---|
| Runtime: OpenBot `v1.0.2` starts, team edition, no Bot computer | **Not run** | An Intelligence project key; Docker, or a Postgres that ships the `vector` extension (OD-7); an identity provider for the team edition (OD-15); the licence (OD-8). Checked by presence only: none of the first three is in the environment |
| Attaching the KIC MCP server | **Not run. May not be possible unmodified**: read at `v1.0.2`, the release accepts a custom server only over https at a hostname, not at a loopback or private address | OD-20: a way to attach that does not modify OpenBot |
| Model streaming and tool execution inside OpenBot, through the shim (C2) | **Not run** | The runtime |
| Persistence across a restart; memory | **Not run** | The runtime |
| Confinement: a Bot cannot post, send or pay | **Not run.** Source read at `v1.0.2` suggests the team edition offers the controls and the personal edition does not. The matrix does not claim that an instance can be confined; that is what the test is for | The runtime. Test design: `docs/security/CONFINEMENT-TEST-MATRIX.md`, D7 step 0d |
| The tenant package loaded by OpenBot | **Not run.** It passed the validator of the main-branch checkout | The runtime |

Also not built, and not to be built without a gate: specialist Bots and routines (Phase 2), channels (deferred by the owner), the receipt and feedback contracts and any Kraken integration (Phase 3, KIC-06).

Recorded as a local stop on task `KIC-01-C1`. Plan for when it clears: `docs/architecture/mediation/KIC-ARCH-MED-01/D7-proof-of-integration-plan.md`. Besides C1 to C3, that proof needs spend figures (OD-6) and, by the roadmap, a decision on whether the external assessment (OD-11) must come before it.

Licensing, reserved to the owner. **Nothing was sent to CopilotKit and no paid service was started.**

| Decision | Question | State |
|---|---|---|
| OD-8 | Which licence a client-owned, self-hosted production instance needs. OpenBot's README says Kubernetes or production use needs "a production Intelligence license beyond evaluation"; whether the pay-as-you-go plan is that licence is not confirmed by anything read | **Open.** Draft questions, unsent: `docs/decisions/LICENCE-QUESTIONS-COPILOTKIT.md` |
| OD-15 | Personal or team edition for each client instance. Confinement points to the team edition, which needs an identity provider and the production licence. Where conversations are kept follows from this | **Open** |
| OD-1 | OpenBot as the foundation | Decided **provisionally**, conditional on licensing, runtime verification and confinement. None of the three is satisfied. Its own named fallback is a build on minimal MIT-licensed primitives |
| Upstream code | None imported. The production packages installed are listed in `LICENSES/third-party.md`; development packages are named in `LICENSES/README.md` only | No decision needed today |

## 8. Outstanding risks and accepted limitations

Full lists: `harness/state/GATE_STATE.md` ("Findings accepted as they stand", A1 to A26; "Open at `c83b0cb`", E1 to E9 and B1 to B4) and `docs/security/THREAT-MODEL.md` ("Known weaknesses"). "Accepted" there means accepted by the orchestrator as not blocking a review requirement, and listed so the owner can disagree. The ones most likely to matter:

- **The evaluator's rules can be written round** (section 6), and are fragile to change.
- **The programme plan is not itself a signed decision** (OD-19). The fifth reviewer rated the original finding high; since then the plan is shown in full at release and each approved post is bound to its place in it.
- **Confirmation-code guesses are not limited across requests** (rated medium, by the Mistral review). Mitigated: codes are 128 bits, at most 25 requests can be pending, and a correct code signs nothing without the operator's key.
- **Evaluations shown to the editor are unsigned** and can be altered by a process that can write the store. They are advice; the mandatory constraints are recomputed at assembly.
- **The server's default export directory is inside the data directory**, which the assumed attacker can write. The instance template asks for it to be placed elsewhere; no instance exists to check it.
- **How the provider counts and bills reasoning tokens is unverified**; the shim's ceiling relies on the provider honouring `max_tokens`, and can be waived by an environment setting.
- **The store's lock is for one machine and one process-id space.** Two containers sharing a store directory are not protected from each other.
- **The operator tool has not been seen on a real terminal or used by a person.**
- **Four older fixes have no regression test in the repository**; they were checked by reviewers' probes.
- **The store's lock is for one machine and one process-id space.**
- **A waiting decision request holds its place for up to 30 minutes**, and across many different decisions notices to the operator channel can reach about 1,200 a day.

Product consequences of the remediation: design choices made to close findings, which the owner has not seen before and may not want.

| Consequence | Why |
|---|---|
| **A draft may contain only 694 named characters**: Latin letters as European languages, Vietnamese and pinyin write them, digits, keyboard marks, a short list of typographic marks and about a hundred pictures. No other script, no flags, no skin tones, no joined emoji. Anything else makes the draft ineligible | Every list of look-alike characters was incomplete. Naming what is allowed is the only form of the rule that held under review |
| **A picture or emoji must stand apart from words** | A picture inside a word can stand for a letter of it |
| **The rules err towards refusing** where text can be read as a ruled-out word: "A1" for "AI", a hashtag that starts or ends with a short ruled-out word | Stated in the threat model |
| **One request for a given decision on a given draft at a time.** A second is refused until the first is answered or expires (30 minutes) | Asking costs nothing, so it had to be bounded another way |
| **Only the 50 newest previews of a programme are kept** in the export directory. Releases are never removed | Previews could be produced without limit |
| **A campaign id and a list of posts given to a tool are bounded and checked** | The same |

## 9. Open owner decisions

| Decision | Subject | Bears on |
|---|---|---|
| **OD-21 (new)** | **The evaluator's rules against disguised text: accept as pattern rules behind the editor, require a different kind of check, or order a sixth round** (section 6) | What "mandatory constraint" may be said to mean; reason R1 |
| **OD-11** | **External approval-path security assessment. Kept open by the owner: required before real-client use.** To settle: who does it, its scope, against which commit, and whether it must precede the OpenBot proof | Any reliance on signed approvals with a real client |
| OD-4 | Repository visibility; a `main` branch and its protection. **No base branch exists, so no pull request can be opened and nothing can be merged** | Merging the accepted commit |
| OD-6 | Spend figures: the instance ceilings and the shim's ceiling; confirmation of the unit price | Any live run beyond small checks |
| OD-7 | Environment, Intelligence key | Section 7 |
| OD-20 | How the KIC MCP server is attached at `v1.0.2` | Section 7 |
| OD-9 | Where the editor confirms: the command-line operator tool as built, or something else. No person has used it | Section 5, row 8; the scope of OD-11 |
| OD-19 | Whether the programme plan becomes a signed editor decision | Section 8 |
| OD-3 | JEV's role and the gate that governs its activation | JEV stays disabled |
| OD-5 | The standing review mechanism. The Mistral review bot is not operational and Codex is unavailable; neither was substituted silently | Every later gate |
| OD-2, OD-10, OD-16, OD-17 | Harness reuse; reasoning effort; future interface; wording on repeated actions | Later work |

Also open in the records: whether the KIC-01 implementation authorisation, given "for the 2026-11-13 session only", has lapsed (the orchestrator treats it as ended and has put a gate stop on KIC-01); and whether the provisional decision on OD-1 settles KIC-00, which the ledger still shows as awaiting approval. Register: `docs/decisions/OWNER_DECISIONS.md`.

## 10. What a ruling on KIC-01 would not imply

Whatever the owner rules, it does not by itself mean any of: OpenBot's adoption for production; approval of a CopilotKit licence; live publishing or client outreach; activation of a signing key for a real client; channels integration; any change to Kraken; or the closure of OD-11 or any other open owner decision. **Kraken remains the sole authority for external commercial execution.** This repository prepares; it has no capability to publish, spend or contact anyone.

Standing restrictions, as they stood through this work:

| Restriction | State |
|---|---|
| JEV | Disabled. No decision endpoint called. No live transport in the build; an independent review at `e30451c` found no network import in the evaluator |
| Publishing, outreach, advertising, spend on a client's behalf | No capability exists in the code |
| Kraken, `jev-router`, upstream repositories | Not written to |
| Credentials | None printed, logged or committed. One invented bearer value in a test file tripped the secret scan in CI (`5e4ee5d`); fixed in the next commit |
| Operator key and confirmation codes | **Not handled by the agent session since `075b358`. Before that they were.** In two live runs, at `aad2196` and at `075b358`, the agent session itself created throwaway keys in scratch space and ran the operator tool with them, playing the editor. The rule against this was written into `CLAUDE.md` in `075b358`; the session's permission layer has refused it since `6f26029`. The test suite still creates throwaway keys and runs the real tool as a child process, and the reviewers ran that suite. No real key and no instance exist |
| Merges, deployments, provisioning, purchases | None |
| Live model calls in this closure work | Three runs of `tests/shim/live.ts`, nine small requests each, in pass-through mode through the session proxy. Nothing else |
| Automatic skill approval | A setting of an OpenBot instance. The instance template requires it off (requirement 13). No instance exists, so it has been set and verified nowhere. In this repository's code nothing learned or remembered is authoritative |

## 11. Checking this yourself

```bash
git fetch origin claude/adoring-edison-4wlees
```

```bash
git worktree add --detach /tmp/kic-c83b0cb c83b0cbd0134eb224552b73e52a43b7111cde721
```

```bash
cd /tmp/kic-c83b0cb && npm ci && npm run check
```

Then, in a checkout of the branch head, where the review ledger is:

```bash
node harness/scripts/aeh.mjs check-reviews --commit c83b0cbd0134eb224552b73e52a43b7111cde721 --gate KIC-01
```

```bash
node harness/scripts/aeh.mjs status
```

The offline demonstration is `node src/cli/demo.ts`. No test asserts the open findings of section 6; to see one, give its example to `analyseDraft` in `src/evaluation/signals.ts` with a brief that rules the word out.

## 12. The owner's options, and what work each would need

The orchestrator has stopped. A gate stop is on KIC-01 in the harness: until the owner clears it, the harness's path check refuses changes under `src/`, `tests/`, `fixtures/` and `tenant-package/`.

| Ruling the owner could make | What it would need first | Fresh instruction needed? |
|---|---|---|
| Keep KIC-01 BLOCKED as it stands | Nothing | No |
| Rule on OD-21 (what the evaluator's rules are required to do) | Nothing; it is a decision. If the ruling is "pattern rules behind the editor", R1 then needs one review of the evaluator at `c83b0cb` against that requirement | Yes, for the review |
| Close R2 | One delta review of 72 lines, or a ruling that the recorded statements of reviewers 22 and 23 suffice | Yes, for the review |
| Accept part of the gate: the standalone companion without OpenBot, carrying C1 to C3 forward to the OpenBot foundation proof | R1 and R2 closed, by whichever route. The owner would be redefining what KIC-01 accepts; the orchestrator does not propose this, and records only that the code does not depend on OpenBot | Yes |
| Unblock R3 | An Intelligence key, an environment, an identity provider, the licence answer, a way to attach the MCP server (OD-7, OD-8, OD-15, OD-20), then mediation Phase 1 | Yes |
| Order the external approval-path assessment (OD-11) | Who, what scope, which commit | Yes |

**Work that needs no fresh approval**: none on the product. Corrections to records, if the owner finds an error in them.

**Work that needs fresh approval**: every item above; any change to code, tests, contracts or acceptance criteria; a merge (no base branch exists: OD-4); KIC-02 and anything after it.
