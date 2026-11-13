# Gate state

No gate has been accepted by the Human Owner. Evidence is presented; acceptance is the owner's.

| Gate | Status | Evidence |
|---|---|---|
| KIC-00 Foundation and feasibility | **Report presented. Awaiting owner approval.** | `docs/gates/KIC-00-REPORT.md` |
| KIC-01 Runtime proof | **Implementation authorised for the 2026-11-13 session only** (workstreams A–D). Evidence presented. **Not accepted.** C1 blocked, C2 demonstrated outside OpenBot, C3 open, C4 demonstrated in tests. | `docs/gates/KIC-01-EVIDENCE.md`, `docs/gates/KIC-01-ASSESSMENT.md`, `docs/spec/directives/KIC-01-SESSION-AUTHORISATION-2026-11-13.md` |
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
| C4 Human editorial approval enforced in code | Demonstrated in tests. Seven independent reviews each found a new defect; all high and medium findings are fixed and tested. The review of the latest fixes is in the table below. |

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
| `12a7626` | New independent review of the resulting exact commit, as the owner directed | In progress when this ledger was written |

**The review requirement for KIC-01 is not met.** No commit has an approving independent review. Seven reviews have requested changes; the review of `12a7626` is in progress. This is a gate stop on anything that depends on KIC-01 being reviewed.

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
| X14 | Independent review of the KIC-01 work: see the table above for the latest outcome | OD-11 |
| X15 | OpenBot `v1.0.2` accepts a custom MCP server only over https at a hostname; the KIC server cannot be attached over a private interface | OD-20 |
| X16 | The corrected mediation package, after the second review's corrections, is not itself re-reviewed | owner, if wanted |
| X17 | The spend ceilings' figures (this repository's instance ceilings and the shim's) are provisional or unset | OD-6 |

Closed since the last ledger: X7 (licence inventory of installed packages done, `LICENSES/third-party.md`), X8 (sub-agent tiers and GitHub Actions exercised), X10 (shim proven with streaming and tools, live), X12 (global-stop hook installed in `.claude/settings.json` and verified in live nested sessions).

Owner decisions: `docs/decisions/OWNER_DECISIONS.md`.
