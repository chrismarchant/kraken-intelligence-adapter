# Gate state

No gate has been accepted by the Human Owner. Evidence is presented; acceptance is the owner's.

| Gate | Status | Evidence |
|---|---|---|
| KIC-00 Foundation and feasibility | **Report presented. Awaiting owner approval.** | `docs/gates/KIC-00-REPORT.md` |
| KIC-01 Runtime proof | **Implementation authorised for the 2026-11-13 session only** (workstreams A–D). **Acceptance package presented. Not accepted: the decision is the owner's.** Review requirement met at commit `2537386`. C1 blocked, C2 demonstrated outside OpenBot, C3 open, C4 demonstrated in tests and independently reviewed. | `docs/gates/KIC-01-ACCEPTANCE-PACKAGE.md`, `docs/gates/KIC-01-EVIDENCE.md`, `docs/gates/KIC-01-ASSESSMENT.md`, `docs/spec/directives/KIC-01-SESSION-AUTHORISATION-2026-11-13.md`, `docs/spec/directives/KIC-01-GATE-CLOSURE-INSTRUCTION-2026-11-13.md` |
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
| Recommendation of the mediation | **Provisionally accepted**, subject to independent review of the corrected package. That review: approved with corrections (`docs/review/2026-11-13-mediation-re-review-177a8c4.md`); corrections applied; the version with them is not itself re-reviewed |
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
| C2 Mistral Large 4 through a shim, streaming, with tools | Demonstrated with OpenBot's model client and with the CopilotKit agent class. **Not demonstrated inside OpenBot.** |
| C3 Licence confirmation from CopilotKit | **Open.** OD-8. |
| C4 Human editorial approval enforced in code | Demonstrated in tests and independently reviewed. Eight reviews each requested changes; all high and medium findings were fixed and given regression tests. The ninth (`55a66f2`) approved; the delta review of `2537386` confirmed the approval. Not shown: a person using the operator tool; an assessment by someone outside this programme's sessions (OD-11). |

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
| `55a66f2` | Ninth independent agent (Opus tier), full review | **approved**, with follow-ups (1 medium availability regression, 4 low, 3 informational) |
| `2537386` | Tenth independent agent (Opus tier), delta review of `55a66f2..2537386` | **approved**: all five follow-up fixes closed; no regression; 3 informational notes |

## Review requirement for KIC-01: met at `2537386`

Recorded on 2026-11-13 under the owner's gate-closure instruction (`docs/spec/directives/KIC-01-GATE-CLOSURE-INSTRUCTION-2026-11-13.md`). **Meeting the review requirement is not acceptance of the gate.**

| | |
|---|---|
| Approved commit | `2537386bf807ebc62f8e89839d1b9dbda2e6769e` |
| How it is approved | A full review of its parent, `55a66f26a2d0b1447278dd22e5ea2d2db6d95c5b`: approved with follow-ups. Then a delta review of everything that changed between the two: approved. The delta review is scoped to the diff; it is not a second full review |
| Reviewer of `55a66f2` | `independent-review-agent-9`: an agent, Opus tier, no part in writing the code, had not seen it before. Entry `rev-2026-11-13-agent-55a66f2`; record `docs/review/2026-11-13-review-55a66f2.md` |
| Reviewer of `2537386` | `independent-review-agent-10`: an agent, Opus tier, no part in writing the code, not the reviewer of `55a66f2`. Entry `rev-2026-11-13-agent-delta-2537386`; record `docs/review/2026-11-13-delta-review-2537386.md` |
| Verdicts | `55a66f2`: "I found no defect in commit 55a66f2 that breaks claims (a) to (d) for the attacker described." `2537386`: "The approval of 55a66f2 still stands with commit 2537386 applied. All five fixes close what they claim. I found no regression against claims (a) to (d) and no broken honest flow." |
| What the reviewers are | Agents commissioned inside this programme's sessions. Reviewer identity in the review ledger is self-declared by the orchestrator. **No person and no party outside these sessions has reviewed the approval path** (OD-11, open) |

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

### Non-blocking findings accepted as they stand

Accepted by the orchestrator as not blocking the review requirement, and listed so the owner can disagree. None was rated above low by the reviewer who raised it.

| # | Finding | Source | Why it does not block |
|---|---|---|---|
| A1 | A store writer who deletes a revision can have one more generated on the same instruction | Security review; review of `12a7626` (F5, low) | Bounded by the campaign budget; the result still needs the editor's signed approval |
| A2 | Prompt (input) tokens are not limited; only completion tokens and calls are | Fifth review; security review; review of `12a7626` | Prompts are built by code from fields of bounded size. A figure belongs with OD-6 |
| A3 | A request's expiry and attempt count are not covered by a signature | Security review | They limit how long and how often the editor is asked; they grant nothing |
| A4 | The programme plan is shown in full at release but is not itself a signed editor decision | Fifth review | Owner decision OD-19 |
| A5 | Right-to-left letters in stored text are shown as written; only direction controls are written out | Fifth review | The editor sees every character; reordering by a terminal was not tested |
| A6 | A pager narrower than the tool's width can wrap a stored line; the tool's wrapping can split an escape across lines | Reviews of `55a66f2` and `2537386` | Readability only; the margin cannot be imitated by stored text |
| A7 | Writing the request body out again can enlarge it and lose precision in very large integers | Review of `55a66f2` | Cannot increase what a request spends |
| A8 | Whether the provider counts reasoning tokens in reported completion tokens, bounds them by `max_tokens`, or bills after a disconnect | Review of `55a66f2` | Cannot be checked offline; goes with the first live run under a ceiling |
| A9 | A caller that leaves after the reservation check is charged the whole reservation; a half-closed connection was not probed | Delta review | Errs on the side of charging too much |
| A10 | Between the export's path check and its write there is a window, if the export root is writable by an agent process | Review of `12a7626` | A deployment requirement: the export root is not agent-writable (instance template) |
| A11 | The operator tool's output has not been looked at on a real terminal, nor used by a person | Every review | Listed under "not demonstrated"; part of OD-9 and OD-11 |

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
| X14 | Independent review of the KIC-01 work: met at `2537386` by agent reviewers. An assessment by someone outside this programme's sessions has not been made and is required before real-client use | OD-11 |
| X15 | OpenBot `v1.0.2` accepts a custom MCP server only over https at a hostname; the KIC server cannot be attached over a private interface | OD-20 |
| X16 | The corrected mediation package, after the second review's corrections, is not itself re-reviewed | owner, if wanted |
| X17 | The spend ceilings' figures (this repository's instance ceilings and the shim's) are provisional or unset | OD-6 |

Closed since the last ledger: X7 (licence inventory of installed packages done, `LICENSES/third-party.md`), X8 (sub-agent tiers and GitHub Actions exercised), X10 (shim proven with streaming and tools, live), X12 (global-stop hook installed in `.claude/settings.json` and verified in live nested sessions).

Owner decisions: `docs/decisions/OWNER_DECISIONS.md`.
