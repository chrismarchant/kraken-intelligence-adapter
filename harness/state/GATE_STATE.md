# Gate state

No gate has been accepted by the Human Owner. Evidence is presented; acceptance is the owner's.

| Gate | Status | Evidence |
|---|---|---|
| KIC-00 Foundation and feasibility | **Report presented. Awaiting owner approval.** | `docs/gates/KIC-00-REPORT.md` |
| KIC-01 Runtime proof | **Implementation authorised for the 2026-11-13 session only** (workstreams A–D). **Presented for owner acceptance at `c83b0cb`. Not accepted.** By area: the approval path, and the store, gateway, spend and MCP code, are approved by independent review (with follow-ups). **The evaluator's rules against disguised text are not approved**: five reviews in a row requested changes, and the question is put to the owner as OD-21. C1 blocked, C2 demonstrated outside OpenBot only, C3 open, C4 demonstrated in tests and independently reviewed. A gate stop is on KIC-01 until the owner decides. | `docs/gates/KIC-01-ACCEPTANCE-PACKAGE.md`, `docs/gates/KIC-01-EVIDENCE.md`, `docs/gates/KIC-01-ASSESSMENT.md`, `docs/spec/directives/KIC-01-SESSION-AUTHORISATION-2026-11-13.md`, `docs/spec/directives/KIC-01-GATE-CLOSURE-INSTRUCTION-2026-11-13.md` |
| KIC-02 Model and skills integration | Not authorised as a gate. Parts were built under the session authorisation: gateway, skills, bounded execution. | `docs/gates/KIC-01-EVIDENCE.md` |
| KIC-03 Comparative intelligence | Not authorised as a gate. Built under the session authorisation with the deterministic mock evaluator. | same |
| KIC-04 Commercial campaign preparation | Not authorised as a gate. Demonstrated through API and command-line tests only. **No user interface.** | same |
| KIC-05 Template deployment proof | **Blocked.** Nothing provisioned or deployed. A proposal exists. | `docs/deployment/INSTANCE-TEMPLATE.md` |
| KIC-06 Kraken integration | Deferred by directive; needs separate authorisation. | — |

Machine-readable gate map: `harness/config/gates.json`. Task ledger: `harness/state/tasks.json` (`node harness/scripts/aeh.mjs status`).

## Owner direction of 2026-11-13 (after the mediation)

Stored verbatim: `docs/spec/directives/KIC-OWNER-DIRECTION-POST-ARCH-MED-01-2026-11-13.md`. **No gate is accepted by it.**

| Item | State |
|---|---|
| Recommendation of the mediation (not a gate) | **Provisionally accepted** by the owner, in the owner's words, subject to independent review of the corrected package. That review: approved with corrections (`docs/review/2026-11-13-mediation-re-review-177a8c4.md`); corrections applied; the version with them is not itself re-reviewed |
| OpenBot | Preferred, unmodified workspace candidate, **conditional on licensing, runtime verification and confinement**. Production adoption not authorised until the selected release (`v1.0.2`) passes runtime, model streaming, persistence, tool-execution and confinement tests. **None of those tests has been run**: local stop on KIC-01-C1 |
| KIC MCP service | The authoritative campaign-preparation boundary |
| Kraken | Sole authority for external commercial execution |
| Standalone OpenDots, OpenDuet, OpenMuse runtimes | Excluded |
| Channels | Deferred. Read-only assessment done: `docs/architecture/mediation/KIC-ARCH-MED-01/A1-opentag-and-release-tag.md` |
| Name | Kraken Intelligence Companion |
| Licensing | Reserved to the owner. Nothing was sent to CopilotKit; no paid service was started |
| Confinement test matrix | `docs/security/CONFINEMENT-TEST-MATRIX.md`. This repository's boundary is tested; everything about OpenBot and about an instance is read in source or proposed, and is labelled so |
| Release-tag comparison | A1. The capabilities relied on are present at `v1.0.2`. One difference matters: the release accepts a custom MCP server only over https at a hostname, so the KIC server cannot be attached over a private interface (OD-20) |

## Architecture mediation KIC-ARCH-MED-01 (2026-11-13)

Investigation and documents only, as the directive authorised. Nothing implemented. Package: `docs/architecture/mediation/KIC-ARCH-MED-01/` (D1–D7). Recommendation: OpenBot unmodified at a pinned release as the workspace; the KIC MCP server as the one boundary; OpenDuet (fork), OpenDots (standalone) and OpenMuse excluded as runtimes; skins as display only; channels later and narrowly; business actions with Kraken. Upstream sources were read, not run. Open decisions OD-12 to OD-19. Four points where the directive and the records differ are recorded in the package README and are not resolved.

Independent review of the package at `ee303a2`: **approved with corrections** (`docs/review/2026-11-13-mediation-review-ee303a2.md`). The recommendation stood; statements about OpenBot's tasks, check-ins, tenant-package grants and approval settings were wrong, and a risk was missing: with OpenBot in front, an instance is prepare-only only if configured to be. All corrections are applied; the corrected package is not re-reviewed. The working system remains this repository without OpenBot.

## Conditions on the foundation decision (OD-1)

| Condition | State |
|---|---|
| C1 Full OpenBot boots on a licensed Intelligence project | **Blocked.** No Intelligence project key; no Docker daemon and no Postgres with the `vector` extension in the session environment. OD-7. |
| C2 Mistral Large 4 works through the shim with streaming inside OpenBot | **Not met as defined.** Demonstrated outside OpenBot only: with the model client library OpenBot's main branch resolves and with the CopilotKit agent class, live, most recently on 2026-11-13 on code identical to `2537386` (`docs/gates/evidence/shim-live-2026-11-13.txt`). OpenBot's own client rejects Large 4's raw response, which is why the shim exists. |
| C3 Licence confirmation from CopilotKit | **Open.** OD-8. |
| C4 Human editorial approval enforced in code | Demonstrated in tests and independently reviewed. Eight agent rounds and a Mistral review each requested changes; every high finding and all but one medium (A12, mitigated) were fixed and given regression tests. The ninth agent round (`55a66f2`) approved; the delta review of `2537386` confirmed the approval. The approving rounds' scope is the approval path, not the whole code (see below). Not shown: a person using the operator tool; an assessment by someone outside this programme's sessions (OD-11). |

## Independent review of KIC-01 work

Reviews are bound to exact commits in `harness/state/reviews.json`. The review check for a commit fails without an approving, independent review and with any blocking one.

| Commit | Reviewer | Verdict |
|---|---|---|
| `983487d` | Independent agent (Opus tier) | changes-requested: 1 critical, 3 high |
| `983487d` | Mistral Large 4, direct API | changes-requested |
| `aad2196` | Second independent agent (Opus tier) | changes-requested: 2 high |
| `075b358` | Third independent agent (Opus tier), focused | changes-requested: 2 high |
| `187f029` | Fourth independent agent (Opus tier) | changes-requested: 2 high |
| `765ae20` | Fifth independent agent (Opus tier), focused | changes-requested: 1 high |
| `8e4696c` | (superseded by the reviews below) | — |
| `b8e0170` | Sixth independent agent (Opus tier) | changes-requested: 1 high |
| `177a8c4` | Approval-path security review commissioned by the owner; seventh independent agent (Opus tier) | changes-requested: 2 high, 2 medium |
| `12a7626` | Eighth independent agent (Opus tier): the new review of the resulting exact commit, as the owner directed | changes-requested: 1 medium, in the model shim. No defect found in the approval path |
| `55a66f2` | Ninth independent agent (Opus tier); the whole commit against four claims, with stated exclusions | **approved**, with follow-ups (1 medium availability regression, 4 low, 3 informational) |
| `2537386` | Tenth independent agent (Opus tier), delta review of `55a66f2..2537386` | **approved**: all five follow-up fixes closed; no regression; 3 informational notes |

## Review requirement for KIC-01: recorded as met at `2537386`, then withdrawn

**Status on 2026-11-13, after scope-completing review A: NOT MET.** `aeh check-reviews --commit 2537386… --gate KIC-01` now fails: a changes-requested review is bound to the commit. The approvals below stand for what they covered, the approval path; they did not cover the evaluator, where the new findings are. What follows in this section, down to "Scope-completing reviews", is the record as it was written before that review, kept for the trail.

Recorded on 2026-11-13 under the owner's gate-closure instruction (`docs/spec/directives/KIC-01-GATE-CLOSURE-INSTRUCTION-2026-11-13.md`). **Meeting the review requirement is not acceptance of the gate.**

| | |
|---|---|
| Approved commit | `2537386bf807ebc62f8e89839d1b9dbda2e6769e` |
| How it is approved | A review of `55a66f26a2d0b1447278dd22e5ea2d2db6d95c5b` against four claims, with a stated scope and stated exclusions: approved with follow-ups. `55a66f2` is two commits before `2537386`; the commit between changes records only. Then a delta review of everything that changed in code between the two: approved |
| What the approving reviews did not cover | The evaluator, the contracts, the gateway's budget path, the MCP tool surface, the shim's normaliser, the stores under real concurrency, the operator tool run as a child process, creator ranking, the skills catalogue and the harness. Earlier rounds covered some of this; some has changed since (the evaluator's figure rules in `dfa7458`, the MCP server in `5e4ee5d`); some was never in a review's scope. **The review check passes on the ledger's rule (an approving independent review bound to the commit, none blocking); that rule does not measure coverage.** Scope-completing reviews of these parts at `2537386` were commissioned on 2026-11-13; see "Scope-completing reviews" below |
| Reviewer of `55a66f2` | `independent-review-agent-9`: an agent, Opus tier, no part in writing the code, had not seen it before. Entry `rev-2026-11-13-agent-55a66f2`; record `docs/review/2026-11-13-review-55a66f2.md` |
| Reviewer of `2537386` | `independent-review-agent-10`: an agent, Opus tier, no part in writing the code, not the reviewer of `55a66f2`. Entry `rev-2026-11-13-agent-delta-2537386`; record `docs/review/2026-11-13-delta-review-2537386.md` |
| Verdicts | `55a66f2`: "I found no defect in commit 55a66f2 that breaks claims (a) to (d) for the attacker described." `2537386`: "The approval of 55a66f2 still stands with commit 2537386 applied. All five fixes close what they claim. I found no regression against claims (a) to (d) and no broken honest flow." |
| What the reviewers are | Agents commissioned inside this programme's sessions. Reviewer identity in the review ledger is self-declared by the orchestrator. **No person and no party outside these sessions has reviewed the approval path** (OD-11, open) |

### Scope-completing reviews at `2537386`

Commissioned on 2026-11-13 after the audit, at the same commit, from two further independent agents:

| Review | Scope | Outcome |
|---|---|---|
| A (`independent-review-agent-11`) | The evaluator, the contracts, creator ranking, the skills catalogue, the shim's normaliser, and their tests | **changes-requested**: 6 medium, 7 low, 1 info. Look-alike letters and non-ASCII digits pass the mandatory constraints; a ruled-out term with a non-ASCII letter never matches; redaction blocks evaluation of honest campaigns; clipped text is refused for good; synthetic creator evidence can be presented as real; the normaliser can leak hidden reasoning on malformed upstream framing. No path to a live JEV; nothing can be made executable. Record: `docs/review/2026-11-13-scope-review-a-2537386.md`. Remediation in progress |
| B (`independent-review-agent-12`) | The MCP tool surface, the gateway and its usage accounting, the stores and lock under real concurrent processes, the budget path, and their tests | **changes-requested**: 5 medium, 3 low, 2 info. An evaluation tool argument that grows a record without limit; an update, or a spend reservation, lost when a dead lock is taken over (shown under forced scheduling); a lock stuck behind a zombie owner; no bound on HTTP connections; unbounded stream buffering in the gateway. No tool publishes, records a decision or takes a path, address, model, key or budget; no argument escapes the data directory. Record: `docs/review/2026-11-13-scope-review-b-2537386.md`. Remediation in progress |

A blocking verdict from either is bound to `2537386` and makes the review check for that commit fail, as it should.

Both were remediated in commit `1d8bafe969d3ebfa3cee42a9889cdab848443081`. What changed against each finding, and what was left as a limit, is at the end of each review's record.

**Reviews of `1d8bafe`, one for each area, both requested changes again:**

| Review | Outcome |
|---|---|
| Part A (`independent-review-agent-13`), `docs/review/2026-11-13-review-a2-1d8bafe.md` | **changes-requested**: 1 high, 2 medium, 7 low. High: letters from the extended Latin blocks that pass for plain ones were neither folded nor refused (also true at `2537386`; no earlier review had found it). Medium: the "mostly Latin" rule could be tipped with unpublished text; **a regression** in the rewritten stream normaliser read a single CRLF as the end of an event and dropped valid events |
| Part B (`independent-review-agent-14`), `docs/review/2026-11-13-review-b2-1d8bafe.md` | **changes-requested**: 2 medium, 4 low. The lock's mutual exclusion held under volume and forced tests. Medium: **a regression**, the new connection limit let 64 silent connections shut out callers with a token; clearing up after a removed lock could delete another process's unfinished file and fail an honest update |

Both were remediated in commit `a1affd2c4e9677baa8d15a60fe330ceec13e3c08`.

**Reviews of `a1affd2`:**

| Review | Outcome |
|---|---|
| Part A (`independent-review-agent-15`), `docs/review/2026-11-13-review-a3-a1affd2.md` | **changes-requested**: 1 high, 3 medium, 5 low, 1 info. The letters and the stream normaliser were found sound (3,000 random streams against a reference parser, no mismatch). High, and older than this work: characters that are not letters but are drawn as letters (squared-letter emoji, mathematical symbols, combining small letters) were neither refused nor read as letters. Medium: plain look-alikes; **a regression** in the apostrophe rule; evaluator strings that could exceed their own contract and block a campaign |
| Part B (`independent-review-agent-16`), `docs/review/2026-11-13-review-b3-a1affd2.md` | **approved, with follow-ups** (6 low, 1 info). The lock held in nine volume trials with real processes and about 1,500 kills: nothing lost, nothing duplicated, no worker failed. The HTTP shut-out is gone. The approval covers the store, gateway and MCP code at `a1affd2`, not the commit as a whole |

Remediated in `efe9415` (part A) and `1f159a20109bb0759c54fdc262abd95aa2800294` (part B follow-ups).

**Reviews of `1f159a2`:**

| Review | Outcome |
|---|---|
| Approval path, delta from `2537386` (`independent-review-agent-19`), `docs/review/2026-11-13-approval-path-delta-review-1f159a2.md` | **approved**, one low follow-up. Signing, the ledger, the operator tool and the decision contract are byte-identical to `2537386`; every attack re-run was refused or detected |
| Store, gateway and MCP, delta from `a1affd2` (`independent-review-agent-18`), `docs/review/2026-11-13-review-b4-1f159a2.md` | **approved, with follow-ups** (1 low to medium, 3 low, 1 info). Nine more volume trials of the lock, 1,549 kills: nothing lost or duplicated. The follow-up that mattered: the new limit on decision requests could lock a campaign out of decisions |
| Evaluator and normaliser (`independent-review-agent-17`), `docs/review/2026-11-13-review-a4-1f159a2.md` | **changes-requested**: 4 high, 5 medium. A regression (a stand-in symbol followed by an exclamation mark); short ruled-out terms never looked for in hashtags, which every earlier review had missed; flags made of two letters; figures and words drawn as emoji. Contracts, creator ranking, the evaluator's output bounds and the stream normaliser held |

Remediated in `e30451c517bae16982ad75599d3f62cc4534ff13`: every character a draft may contain is now named, 694 in all, and looking for a term is rebuilt to read each word every way a reader could; the follow-ups of the store review are fixed.

**Reviews of `e30451c`:**

| Review | Outcome |
|---|---|
| Evaluator and normaliser (`independent-review-agent-20`), `docs/review/2026-11-13-review-a5-e30451c.md` | **changes-requested**: 5 high, 5 medium, 3 low, 2 info. The list of characters held (696 code points accepted, none that should not be); no path to a live JEV; the stream normaliser held. The reading of words did not: three regressions or defects in the code written for the round before, and again new ways to write a ruled-out word past the rules. A gap in the figure rule older than this work: quantities in words ("Nine of ten clients renewed") |
| Store, gateway and decision requests, delta from `1f159a2` (`independent-review-agent-21`), `docs/review/2026-11-13-review-b5-e30451c.md` | **approved, with follow-ups** (1 low to medium, 2 low, 2 info). The approvals of the approval path and of the store, gateway and MCP code given at `1f159a2` stand at `e30451c`. Four more volume trials of the lock, 1,113 kills: nothing lost or duplicated |

**That was the fifth review in a row to request changes to the rules that look for disguised text. The orchestrator did not start a sixth round of closing new disguises.** It fixed what the review found wrong in the code written for the fourth round (`dfe9ead`), closed the follow-ups of the store review (`7f1978a`), and had the result checked for regressions against `e30451c`. Those checks took three passes:

| Regression review | Outcome |
|---|---|
| `e30451c..7f1978a` (`independent-review-agent-22`), `docs/review/2026-11-13-regression-review-7f1978a.md` | **changes-requested.** The approvals of the approval path and of the store, gateway and MCP code still stand. The fix to the term matching had brought in regressions: a rule for plain numbers that hid words written with symbols and digits (high), slower evaluation (medium), honest hashtags refused. Fixed in `184f687` |
| `e30451c..184f687` (`independent-review-agent-23`), `docs/review/2026-11-13-regression-review-184f687.md` | **changes-requested.** The same approvals still stand. Two regressions against `e30451c` remained in the term matching (medium; low to medium), one of them from `dfe9ead` and missed by the pass before. Fixed in `c83b0cbd0134eb224552b73e52a43b7111cde721`, which changes `src/evaluation/terms.ts` and its test file and nothing else |
| The term matching at `c83b0cb` against `e30451c` (`independent-review-agent-24`) | Commissioned on 2026-11-13; **not yet reported.** Until it is recorded here, the last change to the term matching (`184f687..c83b0cb`, 42 lines of one file) is tested by its authors and by the earlier reviewers' probes run again, and not independently reviewed |

**No further change to the code will be made by the orchestrator before the owner decides, whatever the last review says.** `c83b0cb` is the commit presented.

### State by area at `c83b0cb`

| Area | State | Basis |
|---|---|---|
| Approval path: claims (a) to (d) | **Approved** | Approved at `55a66f2` and `2537386` (agents 9, 10); delta-approved at `1f159a2` (agent 19); found to stand at `e30451c`, `7f1978a` and `184f687` (agents 21, 22, 23). Nothing outside the evaluator's term matching changed between `184f687` and `c83b0cb`. The operator tool, signing, the ledger and the decision contract are byte-identical to `2537386` |
| Store, locking, gateway, spend, MCP tools, HTTP transport: claims (k) to (p) | **Approved, with follow-ups** | Changes requested at `2537386` and `1d8bafe` (agents 12, 14); approved with follow-ups at `a1affd2`, `1f159a2`, `e30451c` (agents 16, 18, 21); found to stand at `7f1978a` and `184f687` (agents 22, 23). Open follow-ups: B1 to B4 below |
| Contracts and commands (h); creator ranking (i) | Held when last reviewed | Agent 17 at `1f159a2`, in a review that requested changes elsewhere. Unchanged since |
| No path to a live JEV (g); the stream normaliser (j); the list of characters a draft may contain | Held when last reviewed | Agent 20 at `e30451c`, likewise. Unchanged since |
| **The evaluator's rules against disguised words and figures: claims (e), (f)** | **Not approved** | Changes requested at `2537386`, `1d8bafe`, `a1affd2`, `1f159a2`, `e30451c` (agents 11, 13, 15, 17, 20). Open findings E1 to E9 below. Owner decision OD-21 |
| Skills catalogue; demonstration; harness | Tested by their authors | Harness: rounds 1 and 2 only |

### Open at `c83b0cb`: the evaluator (for OD-21)

Not accepted by the orchestrator. Listed for the owner's decision.

| # | Finding | Source | Rating |
|---|---|---|---|
| E1 | Quantities written in words, outside the listed shapes, are not treated as figures: "Nine of ten clients renewed", "Revenue grew fourfold". Older than this work | Review of `e30451c`, F11 | **high** |
| E2 | A letter repeated for emphasis: "FREEEE", "scammm" | F4 | **high** |
| E3 | A letter masked with a star or an underscore: "sc*m", "fr_e" | F5 | medium |
| E4 | A word hyphenated across a line break | F6 | medium |
| E5 | The digits 9, 6 and 2 are not read as letters | F10 | medium |
| E6 | **A word written the way a number is written is not read as letters**: "8357" (best), "4.1" (AI), "101" (lol). A trade-off made in `dfe9ead` and narrowed in `184f687` and `c83b0cb`, so that "Room 101" is not refused; about 125 in 20,000 random disguises. `e30451c` read these. The figure rule still applies to each | Regression reviews of `7f1978a` and `184f687` | recorded as intended; widens E5 |
| E7 | Three-letter terms ending in "e" miss some endings ("used"); a term looked for as written is missed when spaced ("C ++"); a contraction joined by an underscore | F8, F12; regression review of `7f1978a`, 5 | low |
| E8 | In a hashtag a run of capitals can span two words: "#SaaSOfPR" is refused for "so". One in 15,000 random honest tags | Regression review of `184f687`, 3 | low; errs towards refusing |
| E9 | The first-place medal and the calendar show a figure on most devices; the chequered flag is a flag. All three are in the list of pictures | Review of `e30451c`, noted | noted |

### Open at `c83b0cb`: follow-ups of the approved areas

Accepted by the orchestrator as not blocking those approvals, as the reviewers rated them. Listed so the owner can disagree.

| # | Finding | Source | Rating |
|---|---|---|---|
| B1 | Across 25 different decisions, notices to the operator channel can reach about 1,200 a day | Regression review of `7f1978a`, 7 | low; as before this work |
| B2 | A waiting request holds its place for up to 30 minutes: a poor revision instruction cannot be corrected until the editor declines it or it expires, and whoever holds it can ask again the moment it is declined | Regression review of `7f1978a`, 8 | low |
| B3 | The audit trail keeps the requester, time and outage of a replaced request for one replacement only | Regression reviews of `7f1978a` (9) and `184f687` (5) | info |
| B4 | Ordinary drafts evaluate a constant factor slower than at `e30451c` (more readings); the slowest shape found stays under a second, and scaling is linear | Regression review of `184f687`, 4 | info |

The entries for reviews A and B in the append-only review ledger show their findings as "open", as they were when recorded.

### Evidence against the exact commit

| Check | Result at `2537386` | How it was obtained |
|---|---|---|
| CI | Workflow `ci`, run 23 (id 43428556880): **success** | Read from GitHub Actions for head SHA `2537386` |
| Regression tests | `npm run check` exit 0: type check clean, **202 of 202 product tests and 83 of 83 harness tests pass** | Run by the orchestrator in a clean detached worktree at `2537386`; run again, independently, by the delta reviewer |
| Secret scan | `secret-scan: clean`, exit 0 | Same clean worktree. This is the repository's own pattern scan; GitHub secret scanning was not consulted |
| Record check | `aeh check-records`: ok | Same clean worktree |
| Review check | `aeh check-reviews --commit 2537386… --gate KIC-01`: **ok** via `rev-2026-11-13-agent-delta-2537386`. No blocking review is bound to the commit | Run after the entry was added |
| Later commits | `git diff --stat 2537386 HEAD` touches only `docs/**` and `harness/state/**`. No file under `src/`, `tests/`, `fixtures/`, `tenant-package/`, `harness/scripts/`, `harness/hooks/` or `.github/` changed | The commits after `2537386` carry records. They are not themselves reviewed and need not be: the gate's paths are unchanged |

Without `--gate`, the review check for the commit reports KIC-05 and KIC-06 as having no review. Neither gate is authorised and nothing under their paths exists.

### Findings accepted as they stand

Every finding, residual or stated limit from the review rounds that was not fixed, as far as the records show. Accepted by the orchestrator as not blocking the review requirement, and listed so the owner can disagree. The first version of this table held eleven rows and said none was rated above low; an independent audit (`docs/review/2026-11-13-audit-of-acceptance-package.md`) showed that to be wrong and found the rows from A12 on. "Rating" is the rating of the reviewer who raised it; "none" means the reviewer gave none.

| # | Finding | Source | Rating | Why it was left |
|---|---|---|---|---|
| A1 | A store writer who deletes a revision can have one more generated on the same instruction | Review of `12a7626`, F5 | low | Bounded by the campaign budget; the result still needs the editor's signed approval |
| A2 | Prompt (input) tokens are not limited; only calls and completion tokens are. For KIC's own generation the prompt is built by code from fields of bounded size. **Through the shim the caller writes the prompt**: the only bounds are the 2 MiB body limit and the request ceiling, and the Bots' own conversation is the prompt-heavy side (100,316 prompt against 2,288 completion tokens in the recorded agent runs) | Fifth review, N4; security review; review of `12a7626`, F7 | info | A figure for it belongs with OD-6. Not closed |
| A3 | A request's expiry and attempt count are not covered by a signature | Security review | none | They limit how long and how often the editor is asked; confirming still needs the channel code and the editor's digest |
| A4 | The programme plan is not itself a signed editor decision | What remains of the fifth review's N1, which was rated **high**: the plan was bound to nothing and mostly not shown | none for what remains | Since fixed: the plan is shown in full at release and each approval is bound to its planned post. A signature on the plan is owner decision OD-19 |
| A5 | Right-to-left letters in stored text are shown as written; only direction controls are written out | Fifth review, N4 | info | The editor sees every character; reordering by a terminal was not tested |
| A6 | A pager or viewer narrower than the width the tool breaks at (72 columns when piped) can wrap a stored line **into the first column**, the position the margin is meant to keep stored text out of. The tool's own wrapping can split an escape across lines | Review of `12a7626`, F4 (low, unproven); reviews of `55a66f2` (F7) and `2537386` (N3) | low; info | The fix moved the assumed width to 72 and lets the operator set it. A wrapped piece carries no margin, which is the cue; not closed for narrow viewers |
| A7 | Writing the request body out again can enlarge it, loses precision in very large integers and replaces invalid UTF-8 | Review of `55a66f2`, F4 | info | Cannot increase what a request spends |
| A8 | Whether the provider counts reasoning tokens in reported completion tokens, bounds them by `max_tokens`, ignores the other spelling of the limit, or bills after a disconnect. The shim's concurrency limit counts connections, not generation at the provider | Reviews of `12a7626` and `55a66f2` (F8) | info | Cannot be checked offline; goes with the first live run under a ceiling |
| A9 | A caller that leaves after the reservation check is charged the whole reservation (errs towards charging). **What happens when a caller only half-closes its connection is unknown: not probed** | Delta review, N1 and N2 | info | The first is conservative; the second is unverified |
| A10 | Between the export's path check and its write there is a window, if the export root is writable by an agent process. **The server's default export root is inside the data directory, which the assumed attacker can write** | Review of `12a7626` | none | Exposure: preview files written somewhere else the server's user can write. Releases are written by the operator tool to a directory that may not be inside the data directory. The instance template now asks for the export root to be outside agent-writable space (requirement 19); it did not when the first version of this table said so |
| A11 | The operator tool's output has not been looked at on a real terminal, nor used by a person | Stated as not covered in reviews 4 to 9 | none | Listed under "not demonstrated"; part of OD-9 and OD-11 |
| A12 | Guesses at a confirmation code are not limited across requests | Mistral review, finding 3 | **medium** | Mitigated, not fixed, and without a test: codes are 128 bits, at most 25 requests can be pending, and a correct code signs nothing without the operator's key |
| A13 | Evaluator work is outside the budget | Mistral review, finding 8 | low | The evaluator is deterministic local code today. A requirement for any live evaluator |
| A14 | Clearing a stop, the owner reference given for it, the owner's sign-off and reviewer identity are attestations, not authentication | First review, 17; second review | info; none | The real control is a human merge through branch protection, which is not configured (OD-4) |
| A15 | In the readable summary, a bare URL becomes a link and a leading list marker in one-line text renders as a list | Second review | none | Display of an export; the package JSON is what is signed |
| A16 | In stdio mode the data directory and the operator channel belong to the agent's own user, and the default spend account sits with them. Unsigned mode exists for development. There is no cap on the provider's side | Second review, residual risks | none | Deployment requirements in the instance template; unsigned mode must be asked for and marks the package UNSIGNED |
| A17 | Limits of the figure rules: "ISO-9001 percent", "several-fold" and "vast majority" pass; a year after "in" or "since" is read as a date. Constraints are pattern rules and can be evaded by rephrasing | Third and fourth reviews | none | Stated in the threat model; the editor is shown the full text |
| A18 | Lock recovery: a theoretical three-writer window (not reproduced); a crash between the two renames in `init` leaves a public key alone (fails closed); no test for a late settle. Races between real concurrent processes were outside every review's scope | Third review; all | none | Not reproduced. Under review now (scope-completing review B) |
| A19 | The agent-facing server can present a preview from a decision log whose tail was removed | Third and fourth reviews | none | It is marked a preview and cannot be released: the operator's ledger catches the missing tail |
| A20 | Evaluations shown to the editor can be changed by a store writer and are unsigned | Fourth review, F8 | info | Labelled as advice and outside the digest; eligibility is recomputed by code at assembly |
| A21 | The spend account and releases are plain files, as safe as their directories. The ceilings and the account's path come from the server's environment. The instance ceilings have no reset | Fourth and fifth reviews | none | Deployment requirements; figures pending OD-6 |
| A22 | The readable summary beside a release is not checked by `verify` | Fifth review | none | `verify` checks the package and the commands file |
| A23 | A campaign creation that fails still uses one of the instance's campaign slots | Fifth review, N4 | info | Errs towards the limit |
| A24 | A `select` decision on a draft does not affect what holds a post. A plan rebuilt with identical posts keeps earlier approvals, which is visible at review. A long listing can scroll material off the screen | Review of `12a7626`, F7 | info | The first two are by design; the third goes with A11 |
| A25 | The shim's ceiling can be waived with `SHIM_ALLOW_UNLIMITED=1`. The model endpoint is configurable | Threat model (no reviewer raised them) | — | Each must be set deliberately; the instance template requires a ceiling and an https endpoint |
| A26 | Fixes with no regression test in the repository: the 72-column break, the shim's idle cut-off, and the colon-and-equals listing (from the review of `12a7626`); the departed-caller charge (from the review of `55a66f2`). The idle cut-off has never been tested in real time by anyone | Reviews of `12a7626`, `55a66f2`, `2537386` | — | Checked by reviewers' probes only |

### Known inaccuracies in the review ledger

`harness/state/reviews.json` is append-only and was not rewritten. The audit found these in it:

- Its `at` fields are the times the orchestrator recorded each entry, typed by hand, not measured. Three are later than the commit that remediates the review they record.
- Some `status` fields say "fixed" where the review records say otherwise: the fourth review's F8 (accepted, A20); the review of `12a7626`, F7 (accepted, A24); and two findings of the first review marked fixed at `aad2196`, which the second review found not fixed or fixed with limits at that commit (they were closed later).
- "All high and medium findings were fixed with a regression test" was written in several records. One medium was not: A12.
- Counting: eight agent rounds and the Mistral review requested changes, nine in all. Seven of the agent rounds broke the approval path; the eighth found a defect in the shim only.

### What stays open after this

- **OD-11 stays open**: an approval-path security assessment by someone outside this programme's agent sessions, before any use with a real client.
- The gate stop on REV-1 is replaced by that narrower condition. Work that depends only on KIC-01 being reviewed is no longer stopped by it; work that depends on the gate being accepted still waits for the owner.

The Mistral Code Review Bot is not operational (its block-content defect is unfixed on its default branch) and Codex is unavailable. Neither was substituted silently: the reviews above are recorded as what they are.

## Standing restrictions

| Item | State |
|---|---|
| JEV execution | **Disabled.** No decision endpoint called. The build has no live transport; only the deterministic mock exists. |
| Publishing, outreach, advertising | No capability exists in the code. Provisional commands are `NON-EXECUTABLE` by schema. |
| CopilotKit Intelligence | Permitted under a legitimate licence (owner clarification 2026-11-13). Not configured: no project key. Its memory and learned skills are never authoritative. |
| Upstream code imported | None. |
| Infrastructure provisioned | None. |
| Global stop | Not raised. |

## Open exceptions

| ID | Item | Unblocks when |
|---|---|---|
| X1 | `aeh` not inspected: access refused in two sessions. The harness here was built from first principles and may duplicate it. | OD-2 |
| X2 | "DeepSeek Harness" repository not identified | OD-2 |
| X3 | No operational independent review service. Interim: independent agent reviews and a direct Mistral review, recorded per commit. | OD-5 |
| X4 | Repository is public, has no `main`, no protection, no pull request. CI runs on pushes to the feature branch. | OD-4 |
| X5 | Model unit price for Large 4 unconfirmed; no spend ceiling set | OD-6 |
| X6 | Founding directive not stored verbatim in `docs/spec/directives/`; the session authorisation is stored as a summary | owner supplies the files |
| X9 | Full OpenBot boot not proven | OD-7 |
| X11 | Licence for a client-owned derived deployment not confirmed | OD-8 |
| X13 | The editor's surface is a command-line tool; no real editor has used it | OD-9 |
| X14 | Independent review of the KIC-01 work: by agent reviewers only; state by area under "State by area at `c83b0cb`". An assessment by someone outside this programme's sessions has not been made and is required before real-client use | OD-11 |
| X15 | The evaluator's rules against disguised text were not approved by any review | OD-21 |
| X15 | OpenBot `v1.0.2` accepts a custom MCP server only over https at a hostname; the KIC server cannot be attached over a private interface | OD-20 |
| X16 | The corrected mediation package, after the second review's corrections, is not itself re-reviewed | owner, if wanted |
| X17 | The spend ceilings' figures (this repository's instance ceilings and the shim's) are provisional or unset | OD-6 |

Closed since the last ledger: X7 (licence inventory of installed packages done, `LICENSES/third-party.md`), X8 (sub-agent tiers and GitHub Actions exercised), X10 (shim proven with streaming and tools, live), X12 (global-stop hook installed in `.claude/settings.json` and verified in live nested sessions).

Owner decisions: `docs/decisions/OWNER_DECISIONS.md`.
