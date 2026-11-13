# Independent review of the second remediation, part B — commit a1affd2

| | |
|---|---|
| Reviewed commit | `a1affd2c4e9677baa8d15a60fe330ceec13e3c08` (a detached worktree at that commit) |
| Reviewer | Independent agent, Opus tier, no authoring involvement, had not seen the code before (`independent-review-agent-16`). Not a reviewer of any earlier commit |
| Scope | At `a1affd2`: `src/store/**`, `src/workflow/spend.ts`, the ledger's use of the lock, `src/gateway/**`, `src/mcp/**`, the evaluation change and budget path in the workflow service, and their tests |
| Tests it ran | `npm run check`: 249 product and 83 harness tests passed. Fifteen probes, among them nine volume trials of the lock with real processes and about 1,500 kills, and floods of the HTTP endpoint compared across three versions |
| Verdict | **approved, with follow-ups.** "No defect I found breaks a claim or an honest flow. Mutual exclusion and 'no honest update fails' held in 9 trials with real processes and kills (about 1,500 kills in total), the HTTP lock-out from N3 is gone at the default settings, and the remaining findings are low severity or need a store writer or a file system without hard links." |

**This record is a transcription by the orchestrator, condensed from the reviewer's report.** It approves the store, gateway and MCP code at `a1affd2`. It does not approve the commit as a whole: the review of the evaluator at the same commit requested changes.

## Volume trials of the lock

Eight workers, each alternating a campaign update and a spend reservation, with a parent that kills a worker and starts another on a timer.

| Trials | Kills | Campaign updates, acknowledged / stored | Reservations, acknowledged / stored |
|---|---|---|---|
| 3 of 20 s, no delays | 83, 79, 73 | 1530/1531, 1467/1469, 1528/1528 | 1529/1529, 1465/1466, 1526/1526 |
| 2 of 25 s, a delay of up to 15 ms before and after every file-system call, a kill every 40 to 120 ms | 278, 281 | 110/112, 114/121 | 85/86, 89/94 |
| 2 of 25 s, the same, with hard links made to fail so that the in-place fallback is used | 295, 292 | 79/85, 88/91 | 62/66, 73/76 |
| 2 of 20 s, the in-place fallback, no delays | 80, 87 | 1570/1570, 1500/1500 | 1566/1568, 1499/1499 |

In every trial: nothing lost, nothing duplicated, no worker ended for any reason but the kill. A write that was stored but not acknowledged is a worker killed between the two.

## Closure of the earlier findings

Closed: N2, N3 (the shut-out, at default settings), N4, N7 (by reading), F1 to F9. Partly closed: N1 (finding 2), N5 (finding 3), N6 (findings 1 and 4). N8 accepted, with finding 6.

## Follow-ups

| # | Severity | Finding | Proven |
|---|---|---|---|
| 1 | low; regression | The short-cut that makes a repeated evaluation a no-op compares with every stored evaluation, not with the latest for the post. When a post's live drafts return to an earlier set, the earlier evaluation is returned and nothing is written, but the editor's comparison uses the latest one stored, which can still list and rank drafts since rejected | yes |
| 2 | low; store writer only | A named pipe at the lock's path blocks the caller for ever | yes |
| 3 | low | A reported completion figure is capped at ten times each attempt's allowance; two absurd reports charged 360,000 tokens against a reservation of 36,000. Errs towards charging | yes |
| 4 | low; not new | The cap of 25 pending decision requests counts only unexpired ones and nothing removes old ones: about 660 KB a day for a campaign, without budget | yes |
| 5 | info | A flood of connections at 32,000 a second or more delays callers on fresh connections by a second or two; at 64,000 a second one request in seven timed out. The cause is the kernel's listen queue, not the eviction logic. Callers on connections already open were unaffected, and no authenticated connection was evicted. At `1d8bafe` the same flood shut callers out almost completely | yes |
| 6 | low | A file carrying the right to remove a lock that is empty, or begins with a zero, counts as a live remover for ever. Arises on a file system without hard links if a remover is killed between creating and writing the file, or from a store writer | yes |
| 7 | low; not new | Each call of the assembly tool writes a new export directory of about 73 KB, without budget or limit. Needs one approved draft | yes |

## Claims

(k) **held**. (l) **held**. (m) **held** for authentication and limits; fresh connections can be delayed by a flood (finding 5). (n) **held**. (o) **held** for mutual exclusion, atomic writes and honest updates; "a stale lock never blocks for ever" is broken for a named pipe at the lock path (finding 2) and an empty right file (finding 6). (p) **held**.

## The reviewer on the tests

Each new test, copied into a `1d8bafe` tree, fails there. Not flaky: the file passed five times in a row, and the four test files in scope passed three times with four processes hogging four cores. Gaps: the HTTP attacker in the test is slow; no test of a named pipe, of the tidy-up, of the fallback without hard links, of threads, or of a changed set of drafts in the no-op test (which is why finding 1 was missed).
