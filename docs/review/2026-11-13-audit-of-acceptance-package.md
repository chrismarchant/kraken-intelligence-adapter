# Independent audit of the KIC-01 acceptance package

An audit of documents, not a code review. It is not an entry in the review ledger.

| | |
|---|---|
| What was audited | `docs/gates/KIC-01-ACCEPTANCE-PACKAGE.md` (first version) and the section "Review requirement for KIC-01: met at `2537386`" of `harness/state/GATE_STATE.md`, both at commit `630fcb9` |
| Auditor | An independent agent, read-only, commissioned by the orchestrator, with no part in writing the documents or the code |
| Method | Every factual claim checked against source, tests, the review ledger, the review records, the evidence and security documents, the task ledger and git history. It ran `npm run check` once: 202 product and 83 harness tests passed |
| Verdict | **"Yes after the listed corrections; not as written."** The commit, the counts, the diff and the review-check claims held. Several statements overstated |

**This record is the orchestrator's condensed transcription of the auditor's report.** A separate read-only reconciliation of the checkpoint, ledgers and git was run at the same time; its findings are folded in at the end.

## Overstatements found, and what was done

| # | Severity | What the first version said | What the evidence shows | Correction |
|---|---|---|---|---|
| 1 | high | Two conditions met; C2 "met outside OpenBot" | C2 is defined as streaming **inside OpenBot** and is not met. Three conditions (C1–C3) are on OD-1; C4 is this programme's own item | Package section 1; gate ledger |
| 2 | high | "No signing key was handled by an agent session"; "as they stood throughout" | In the live runs at `aad2196` and `075b358` the agent session ran the operator tool with throwaway keys it had made. The rule was written in `075b358`; the permission layer refused from `6f26029` | Package header and section 8 |
| 3 | medium | "Full independent review of the parent `55a66f2`" | The review had a stated scope and stated exclusions. `55a66f2` is two commits before `2537386`, not its parent | Package section 2; gate ledger; the delta review's record |
| 4 | medium | Rows marked as independently reviewed that the approving reviews did not cover: evaluation, contracts, the shim's normaliser, the MCP tool surface, the harness, stores under real concurrency | The evaluator's last change has had no review; the MCP surface was last covered before its last change; real cross-process races were outside every review | Package section 3, with a new mark for "earlier round only". **Scope-completing reviews commissioned at `2537386`** |
| 5 | medium | "None was rated above low by the reviewer who raised it" | One accepted item is what remains of a finding rated high (the plan); one accepted finding was rated medium and was missing (confirmation-code guesses); several have no rating | Gate ledger table rebuilt, A1 to A26, with ratings |
| 6 | medium | A10: the instance template requires an export root the agent cannot write | It did not. The default export root is inside the data directory | Requirement 19 added to the template; A10 reworded; threat model |
| 7 | medium | A2: prompts are built by code from bounded fields | True of KIC's own generation, not of the shim, where the caller writes the prompt | A2 reworded; threat model |
| 8 | medium | A6: "readability only" | A viewer narrower than 72 columns could wrap stored text into the first column | A6 reworded |
| 9 | medium | "Every statement about OpenBot comes from reading source at `v1.0.2`" | The assessment and the capability matrix were written from main; the validator and client library were run from the main-branch checkout | Package section 4 |
| 10 | medium | The package did not point to the threat model's list of known weaknesses | Several live weaknesses were in neither list | Package section 7; both lists extended |
| 11 | low–medium | Source "says the team edition can be confined"; OD-1 "names" this repository as the fallback; live runs given without commits; the live shim run had no kept output | The matrix declines the confinement claim; OD-1's named fallback is minimal primitives; rows 6 and 15 named no commit | Reworded. The live shim check was run again and its output kept: `docs/gates/evidence/shim-live-2026-11-13.txt` |
| 12 | low | Miscounts ("eight reviews broke something"); narrowed findings (A7, A8, A9); wrong source for A1 and A11; command order in "checking this yourself"; "12 tools, none that spends"; package inventory | Seven agent rounds broke the approval path; nine reviews in all requested changes; six tools call the model | Corrected |

## Residual findings that had not been carried forward

Eighteen items from the review records, recorded there as accepted, mitigated, not addressed or residual, were missing from the first table. They are now rows A12 to A26 of the gate ledger's table and, where they were absent, rows of the threat model.

## Inaccuracies in other records

Stale statements were found in the shim's architecture note, three mediation documents, the evidence document, the decision register, the instance template, the companion architecture note and the task ledger. All are corrected in the commit that adds this record. The review ledger itself has inaccurate timestamps and four inaccurate status fields; it is append-only and was not rewritten, and the inaccuracies are listed in the gate ledger.

## What the auditor found supported

The commit SHA and every SHA cited; the empty code diff since `2537386`; the review check; the test counts; 12 MCP tools; 6 skills implemented and 3 deferred; the 27 matrix rows marked T or T+I and 43 test names taken from it; the verdict quotations; the live-run commits for rows 2, 5 and 8; no live JEV transport; no credential pattern in tracked files; every open decision carried into the package.

## What the auditor did not check

CI run numbers (no network). Any live run. The repository's secret-scan script. Anything about upstream source. Negative claims (nothing sent, nothing merged). The reviewers' original reports: only transcriptions exist, so every statement about review coverage rests on them.

## From the session-end reconciliation

No record implies that a gate is accepted; the working tree matched the remote. Corrected as a result: the C2 row of the gate ledger; the checkpoint (branch head, the live run's evidence file, four leftover local agent branches); restart notes on commit-bound review and on what to do when nothing is runnable. Raised for the owner: whether the KIC-01 implementation authorisation, given "for the 2026-11-13 session only", has lapsed, since the machine-readable gate map still said "authorised"; and whether the provisional decision on OD-1 settles KIC-00.
