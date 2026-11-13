# Independent re-review of the corrected mediation package — commit 177a8c4

This is the review the owner made the provisional acceptance of the recommendation subject to (direction of 2026-11-13).

| | |
|---|---|
| Reviewed | `docs/architecture/mediation/KIC-ARCH-MED-01/` (README, D1–D7), the directive summary, the first review's record, the decision register and the OpenBot section of the instance template, at commit `177a8c4671fa66d1a67b613f303d1cf573b8f766` |
| Reviewer | Independent agent, Opus tier, no authoring involvement, had not reviewed the package before |
| Method | The first review's 18 findings re-checked; 34 further claims fact-checked against source, at OpenBot's main (`f8af37a`) **and at its release tag `v1.0.2`** (`cca9f60`); consistency with the owner's decisions; whether any step of the proof could publish, spend or contact a real person. Nothing upstream was built or run |
| Not checked | OpenDots' count of enforcement points; OpenDuet's modified/added file split; OpenMuse beyond its JEV transport; the Channels SDK internals; OpenTag beyond its licence and lockfile; OpenBot's policy rules, egress filter internals, sign-in, desktop and mobile apps; D1's claims about this repository |
| Verdict | **approved-with-corrections.** The recommendation holds against source at both main and `v1.0.2`, and every capability it relies on is present at `v1.0.2`. **The proof plan's confinement test would have given a false pass.** Findings 1 to 4 had to be fixed before Phase 1 could be authorised. None of the corrections changes the architecture |
| Corrections | Applied in the commit that adds this record. The version with these corrections has not itself been re-reviewed |

**This record is a transcription by the orchestrator, condensed from the reviewer's report.**

## The first review's findings

Of 18: 13 corrected, 5 partly (4, 5, 8, 10 and, in one respect, 17). The partial ones are findings 1 to 3, 6 and 8 below.

## Fact check

Of 34 claims: 27 confirmed (several with a nuance), 1 wrong as generalised, 5 overstated or incomplete, 1 dated. All OpenBot capabilities relied on were present at `v1.0.2`. Not at `v1.0.2`: the REST API specification, the "OpenFuse" skin name, and adding an MCP server with OAuth.

## Findings

| # | Severity | Finding | Correction applied |
|---|---|---|---|
| 1 | high | **The confinement test would pass for the wrong reason.** Its stand-in page was "served inside the instance", but at `v1.0.2` a Bot computer may reach only public addresses, so the submission would fail on the network floor while a real site stayed reachable. And a posting action is recognised only by the name of its button or tool, so a button labelled "Submit" would not be treated as posting | Test replaced (D7 step 0d; `docs/security/CONFINEMENT-TEST-MATRIX.md`): a public-range address the tester controls, a button labelled "Post", and a pass only when the control under test is what stopped it |
| 2 | medium–high | **"Closed" does not mean blocked.** An admin's "Ask every time" still lets a person allow the action once; only "Members do it themselves" means the Bot never does it. Recognition is by keyword and is not a boundary on its own | Stated everywhere the word was used (D2, D3, D4, D5, A1, the template) |
| 3 | medium–high | **Stronger controls exist and were not used; the personal edition's limit was understated.** At `v1.0.2` a team admin can switch off the browser, network and password manager, and the Bot computer is absent unless configured. In the personal edition these are fixed on and a computer is mandatory. Campaign preparation needs no browsing | "No Bot computer" is now the primary arrangement (D4 row 5, D5 P2, D6 Phase 1, D7 limit 2); the personal edition's limit is stated |
| 4 | medium | **A proof step could reach real people**: nothing restricted the Bot computer's public egress, and step 0 asked a Bot to submit a form | Phase 1 runs with no Bot computer; egress is recorded (D7 limits 2 and 4) |
| 5 | medium | Self-hosted Intelligence was misdescribed: only the local macOS evaluation is "not a production installation"; Kubernetes self-hosting with a production licence is the documented production route. "No separate license token" had lost a word. OpenBot for Business is early access | Corrected in D2, D3, D5 P7 and the register |
| 6 | medium | Phase 1 steps needed decisions that were not listed: a routine and a grant | The routine moved to Phase 2; D7 states exactly what authorising Phase 1 covers |
| 7 | medium | Step 4's approval might never be asked for, and "always was not taken" was a weak pass | A team rule that asks, standing answers off, the fixture kept in scratch space |
| 8 | medium | Capabilities were stated without saying they were read on main; the latest tag was not named | `v1.0.2` named; A1 added; D2 says how to read its OpenBot column |
| 9 | low–medium | The proposed shim ceiling was new code needing a gate | Built since, under the owner's continuity instruction and in response to the security review (`12a7626`); the documents say so |
| 10–13 | low | "A turn runs at most twice" is true of task turns only; present-tense governance bullets read as state; seven kinds, not six; "conversations are stored by the vendor" is an inference | Corrected |
| 14 | medium | Rewording needed for the owner's decisions: OpenBot's status; the decided proposals; channels out of Phase 2 | Done (D4, D5, D6, D7, README) |
| 15 | low | "OpenTag was not available" was dated | A1 |

## The reviewer's summary of the proof plan

No step publishes, sends through Kraken or contacts Kraken. The exceptions were a Bot computer with public egress (finding 4) and spend, bounded only once a ceiling existed (finding 9). Both are addressed in the corrected plan.
