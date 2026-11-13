# Focused re-review — commit 075b358

| | |
|---|---|
| Reviewed commit | `075b358978249e9e8dd2b898b408ecc5730806ff` (the committed tree, extracted with `git archive`) |
| Reviewer | Independent agent, Opus tier, no authoring involvement |
| Scope | The remediation of the nine findings N1–N9 (`git diff aad2196 075b358`). Deliberately not re-opened: harness, shim, rendering, prompts, documents other than the threat model and the deployment template. |
| Tests it ran | `npm run check` on the committed tree: type check clean; 155 product tests and 82 harness tests passed |
| Verdict | **changes-requested** — two new high findings (R1, R2) |
| Remediation | Commit `187f029c64a12ec8b5d32a512c5883e7a88e170e`. **Not independently re-reviewed**: three review rounds was the limit set for the session. |

**This record is a transcription by the orchestrator, condensed from the reviewer's report.** Every finding, its severity, its location and its probe result are kept; wording is shortened. Probe scripts stayed in the session's scratch space.

## N1–N9 as re-checked at 075b358

| # | Result | Reviewer's evidence |
|---|---|---|
| N1 decision rollback | Partly fixed | Reorder, delete from the middle, duplicate, re-point and transplant all invalidate the log; a revision request withdraws approval; a superseded draft flipped back is ignored; previews are marked everywhere. Not fixed: removal from the end is caught only by the operator's ledger, which failed open (R3), could be deleted through the operator channel (R2) and could be bypassed with an id mismatch (R4). |
| N2 forged notice | Partly fixed | The tool reads everything from the record and enforces action, subject and hash prefix. Broken: a 12-character prefix can be collided (R1); the revision instruction was not pinned (R5). |
| N3 lock takeover | Fixed, with residuals | Eight stores × 20 updates after a dead-owner lock lost nothing. Re-running the change on retry is safe. Residuals: a reused process id made a stale lock permanent (R6); a theoretical three-writer window during recovery that the reviewer could not reproduce. |
| N4 orphaned lock | Fixed | |
| N5 token budget | Fixed for its own accounting | Residual: tokens generated on broken streams were not counted (R7). |
| N6 eligibility | Fixed for the earlier list | All 17 earlier bypasses fail; all 5 earlier false positives pass. New gaps R9, R10. Accepted as limits: an identifier used to carry a figure ("ISO-9001 percent"), "several-fold", "vast majority". |
| N7 path containment | Fixed | |
| N8 key creation, channel files | Fixed as asked | The clean-up of stale notices introduced R2. |
| N9 unsigned marker | Fixed | |

## New findings

| # | Severity | Where | Finding and evidence |
|---|---|---|---|
| R1 | high | `cli/operator.ts` confirm | The editor pinned only 12 hexadecimal characters (48 bits) of the content hash. A writer to the store can prepare two contents with the same prefix and swap them between `show` and `confirm`. Probe: a single-threaded search found a collision in 84 seconds, with the nonce in a field the tool did not display; the editor's confirmation then signed an approval of the altered text. Limit: the swap has to land between the two commands. |
| R2 | high | `workflow/operator.ts` `clear`; `cli/operator.ts` list | The notice's `requestId` was used unvalidated as a file name. A planted notice with a path as its id made the editor's `list` delete the operator's ledger. With R3 this re-opened removal of decisions from the end of a log: a rejected draft was released with a valid signature. |
| R3 | medium | `workflow/ledger.ts`; `signing.ts` | A missing ledger read as empty, so losing it (deletion, a new machine, a restored key) silently turned rollback detection off. Not documented. |
| R4 | medium | `store.ts` get/write; `service.ts` confirm | A record filed under another campaign's id was accepted. By copying files between two campaigns, the reviewer got the operator to sign on top of a log its own ledger knew was rolled back, forking decision 3. Release was still refused. |
| R5 | medium | `cli/operator.ts`; `service.ts` | The revision instruction was signed but not pinned by confirmation: the editor was shown one instruction and signed another. The revised draft still needed its own approval. |
| R6 | medium | `store.ts` lock | A lock naming the current process id, or any reused live id, was never cleared: after a crash and restart with the same id, a campaign stayed locked. |
| R7 | medium | `gateway/mistral.ts` | Tokens were counted only from finished responses; broken or timed-out streams were retried and whatever the provider generated was never counted. |
| R8 | low | `workflow/assemble.ts` | The release signature covered only the package digest: releaser, time, reason and log length could be altered with the release still valid. |
| R9 | low | `evaluation/signals.ts` | The year exemption hid real figures: "cut errors by 2000 hours", "ship by 2030 units", "after 2020 hires". |
| R10 | low | `util/runtime.ts`; `signals.ts` | An invisible character survived when it followed an emoji or a symbol inside a word. |
| R11 | low | `workflow/ledger.ts` | The ledger was updated without a lock: two operator processes could drop each other's entries; and a crash between storing a decision and advancing the ledger left the ledger one behind. |
| R12 | low | `cli/operator.ts` release | The record was read twice, and only the decision count compared. |

Residual risks the reviewer listed: rollback detection depends on the ledger file being kept with the key and out of the agent's reach; the operator channel must not be writable by anything the agent controls beyond the server's own notices; the agent-facing server can always present a log with its tail removed as a preview, so consumers must accept only packages for which the release verifies against the instance's public key; the store and lock are for one machine; provider-side spend can exceed the recorded budget on broken streams; eligibility is pattern-based.

Tests the reviewer said were missing: R1, R2, R3, R4, R5, R6, R8 and settle-after-expiry.

## Remediation in `187f029` (added by the orchestrator; not independently re-reviewed)

| # | Change | Regression tests |
|---|---|---|
| R1, R5 | `show` prints a request digest covering the campaign, request, action, subject, revision instruction and full content hash; `confirm` requires all 64 characters; the service recomputes it under the lock. Parts of a draft covered by the hash but not published are displayed. | `tests/kic/signing.test.ts` (digest coverage; swapped instruction; swapped content with the request rewritten to match; prefix refused), `tests/kic/processes.test.ts` (prefix refused by the real tool) |
| R2 | Notice ids must be well formed and the notice must sit in the file named for its request; `clear` removes only a validated name inside the channel | `tests/kic/processes.test.ts` (four traversal payloads; key, public key and ledger untouched) |
| R3, R11 | A missing ledger is an error; the ledger is created with the key; a new one needs `new-ledger --accept-current-state`; updates are locked; `list` advances a ledger left one behind | `tests/kic/processes.test.ts` (list, confirm and release refused without the ledger; explicit re-baseline) |
| R4 | A stored record must carry the id it is filed under | `tests/kic/concurrency.test.ts` |
| R6 | Locks record the owner's run and start time; an earlier run with the same id, or a reused id, is treated as gone | `tests/kic/concurrency.test.ts` |
| R7 | Every provider request draws on the call's allowance; one that reports no usage is charged at its allowance | `tests/kic/gateway.test.ts` |
| R8 | The release signature covers releaser, time, reason, package digest and log length; a release also requires the package's log head to equal the head the operator checked | `tests/kic/signing.test.ts` |
| R9, R10 | A year is exempt only as a date, not before a counted thing; symbols and invisible characters inside a word are folded before matching | `tests/kic/evaluation.test.ts` |
| R12 | Release assembles from the record that was checked | by reading; `checkedRecord` |

Not addressed: the theoretical three-writer window during lock recovery (not reproduced by the reviewer); a crash between the two renames in `init` leaves a public key alone (fails closed); the settle-after-expiry path has a test for expiry but not for a late settle.
