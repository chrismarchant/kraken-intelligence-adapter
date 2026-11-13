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
