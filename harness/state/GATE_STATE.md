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

## Conditions on the foundation decision (OD-1)

| Condition | State |
|---|---|
| C1 Full OpenBot boots on a licensed Intelligence project | **Blocked.** No Intelligence project key; no pgvector or Docker daemon in the session environment. OD-7. |
| C2 Mistral Large 4 through a shim, streaming, with tools | Demonstrated with OpenBot's model client and with the CopilotKit agent class. **Not demonstrated inside OpenBot.** |
| C3 Licence confirmation from CopilotKit | **Open.** OD-8. |
| C4 Human editorial approval enforced in code | Demonstrated in tests. Three independent reviews each found a new defect; all are fixed and tested; the last fixes are unreviewed. |

## Independent review of KIC-01 work

Reviews are bound to exact commits in `harness/state/reviews.json`. The review check for a commit fails without an approving, independent review and with any blocking one.

| Commit | Reviewer | Verdict |
|---|---|---|
| `983487d` | Independent agent (Opus tier) | changes-requested: 1 critical, 3 high |
| `983487d` | Mistral Large 4, direct API | changes-requested |
| `aad2196` | Second independent agent (Opus tier) | changes-requested: 2 high |
| `075b358` | Third independent agent (Opus tier), focused | changes-requested: 2 high |
| `187f029` | none | **Not reviewed.** Fixes for the third review's findings, each with a regression test. |

**The review requirement for KIC-01 is not met.** No commit has an approving independent review. Three rounds was the limit set for the session; a further round is owner decision OD-11. This is a gate stop on anything that depends on KIC-01 being reviewed.

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
| X14 | No approving independent review exists for any commit of the KIC-01 work | OD-11 |

Closed since the last ledger: X7 (licence inventory of installed packages done, `LICENSES/third-party.md`), X8 (sub-agent tiers and GitHub Actions exercised), X10 (shim proven with streaming and tools, live), X12 (global-stop hook installed in `.claude/settings.json` and verified in live nested sessions).

Owner decisions: `docs/decisions/OWNER_DECISIONS.md`.
