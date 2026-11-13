# Independent review of the remediation, part B — commit 1d8bafe

The commit-bound review of the remediation of scope-completing review B.

| | |
|---|---|
| Reviewed commit | `1d8bafe969d3ebfa3cee42a9889cdab848443081` (a detached worktree at that commit) |
| Reviewer | Independent agent, Opus tier, no authoring involvement, had not seen the code before (`independent-review-agent-14`). Not the reviewer of `2537386` |
| Scope | At `1d8bafe`: `src/store/**` (the rewritten lock above all), `src/workflow/spend.ts`, the ledger's use of the lock, `src/gateway/**`, `src/mcp/**`, the evaluation change and budget path in the workflow service, and their tests. Asked to decide for itself whether each of F1 to F9 of the earlier review was closed, to look for regressions, and to re-test claims (k) to (p) |
| Tests it ran | `npm run check`: 230 product and 83 harness tests passed. Thirteen probes of its own, among them two volume tests of the lock with real processes |
| Verdict | **changes-requested.** "An unauthenticated client can still make every authenticated HTTP request fail, and it now takes less effort than before (claim (m)). Separately, the new lock-breaking protocol makes honest updates fail with an internal error when several processes recover from a crashed writer." |

**This record is a transcription by the orchestrator, condensed from the reviewer's report.**

## Closure of the earlier findings

| # | Result |
|---|---|
| F1 | Partly closed. Repeated post numbers are refused and an evaluation of the same drafts replaces the earlier one; the reviewer confirmed that the replacement cannot drop coverage that is still needed, and that evaluations are not part of a request's digest. But each call still appends an audit entry, with no budget and no cap (N6) |
| F2 | **Closed for mutual exclusion.** "I found no interleaving that loses exclusion as long as `ownerAlive` is right." Volume: four trials of eight real processes with about 28 kills each, about 3,280 acknowledged updates, none lost, none duplicated, no torn record. The same with random delays of up to 15 ms injected into every file-system call and a kill every 40 to 120 ms, about 460 kills: none lost, none duplicated. These runs exposed N2 |
| F3 | Closed |
| F4 | Closed. A theoretical residual: N7 |
| F5 | **Not closed, and worse than before** (N3) |
| F6 | Closed. 3,000 randomised streams gave output identical to the reader at `2537386` |
| F7 | Partly closed: a figure above 2^53 still fails the record's contract (N5) |
| F8 | Closed |
| F9 | Partly closed: export result paths can still name server directories (N4) |

## New findings

| # | Severity | Finding | Proven |
|---|---|---|---|
| N1 | low; not new | When the lock path, or a file that carries the right to remove a lock, exists but cannot be read (a directory, a dangling link, another user's file), the code retries at once and never looks at its deadline: a busy loop without end. Needs a store writer or a foreign file | yes |
| N2 | low–medium; **new** | Clearing the files that named a removed lock also deletes another claimant's temporary file, which begins with the same name. If that lands between the claimant's write and its link, the link fails and an honest update fails with an internal error. Seen unforced: in one of four volume trials, and eight worker failures across four delayed trials. Mutual exclusion is not lost | yes |
| N3 | medium; **regression** | The connection limit of 64 counts connections that have not shown a token, and the runtime enforces the header timeout only on a 30-second sweep. 64 silent connections make every authenticated request fail for about 30 seconds, and an attacker who reconnects keeps it so. Before, the same effect needed 400 half-sent requests and a lowered descriptor limit. The in-flight counter itself is exact on every path tried | yes |
| N4 | low | Export paths are made relative to the export directory as configured, but are built from its resolved path. Through a symlinked export directory the result climbs out and names the real directories | yes |
| N5 | low | A reported usage figure is accepted if it is finite and not negative. A figure of 1e17 fails the record's contract, discards the paid-for answer and charges the instance account 1e17 tokens; one near 2^53 succeeds and charges it. Either way every later model call on the instance is refused until someone edits the account file | yes |
| N6 | low | The record still grows without budget: 160 bytes of audit for each evaluation call, unbounded. A decision request that fails delivery is voided at once, so the cap on pending requests never applies to it (read, not run) | yes for evaluation |
| N7 | info | The state read is that of the process's first thread. During an exit it can show as a zombie while another thread is finishing a write | no |
| N8 | info | 32 dead removers in a row block a lock for ever. The lock now needs hard links, where it used not to | partly |

## Claims

(k) held, except that N4 discloses directory names. (l) **held**. (m) broken: N3. (n) held for concurrency; broken under an implausible usage figure (N5). (o) mutual exclusion and atomic writes **held** under volume and forced tests; "a stale lock never blocks for ever" broken for an unreadable lock path (N1); honest updates can fail during recovery (N2). (p) held, usage aside (N5).

## The reviewer on the regression tests

Sound: both F1 tests, "the right is held by one process", F4 with a real zombie, F6, F7, F8, F9. Weak: the first F2 test would also pass against the old code, which re-read the lock before moving it, so it does not model the old race itself; "many writers" and F3 run in one process, where every contender has the same process id, so the successor path is never exercised; the F5 test checks settings and never that an authenticated client gets through, which is why N3 was missed. No test covers N1 or N2.

## Remediation in `a1affd2` (added by the orchestrator)

| # | Change | Regression test |
|---|---|---|
| N1 | Something at the lock's path, or at a right's path, that is not a readable file (a directory, a dangling link, another user's file) makes the caller wait, and give up at its deadline. The first version of this fix missed the dangling link; the new test caught it | `tests/kic/scope-review-b.test.ts` "N1" |
| N2 | Clearing up after a removed lock deletes only the rights themselves, which end in a number. A claimant whose unfinished file has gone all the same tries again | "N2" |
| N3 | No limit that turns newcomers away. At 256 connections the server closes the one that has been idle longest, taking first from those that never showed a valid token, never one with a request in progress. Header timeout 5 s, checked every second | "F5, N3": 300 silent connections, then an attacker reconnecting every 2 ms; a caller with a token is served every time |
| N4 | Export paths are the export's own two directory names and the file, however the export directory is reached | "N4", through a symlinked directory |
| N5 | A reported completion figure is counted as at most ten times the request's allowance, a prompt figure as at most two million, and reasoning as at most the completion | "N5" |
| N6 | Evaluating again what has not changed writes nothing: no evaluation, no audit entry, no new revision | "N6" |
| N7 | Every thread is looked at before an owner is called dead | — (not reproducible on demand) |
| N8 | A file system without hard links falls back to creating the file in place. Old leftovers of processes that died while taking a lock are tidied after a crash | — |

The reviewer's two volume probes were re-run by the orchestrator on this code: nine trials, eight real processes each, about 690 kills, about 3,800 acknowledged updates; none lost, none duplicated, and no worker ended other than by being killed (the failure the reviewer saw in N2 did not recur).

Not changed, and accepted as limits: a decision request whose delivery to the operator fails is voided at once and does not count towards the cap on pending requests (read by the reviewer, not run; it needs the operator channel to fail); 32 dead removers in a row block a lock.
