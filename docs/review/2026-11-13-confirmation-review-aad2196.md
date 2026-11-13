# Confirmation review — commit aad2196

| | |
|---|---|
| Reviewed commit | `aad21960bfdc6eaf542fdfecc703beaea84cf8cf` (the committed tree, extracted with `git archive`) |
| Reviewer | Independent agent, Opus tier, no authoring involvement, and not the reviewer of `983487d` |
| Tests it ran | `npm run check` on the committed tree: type check clean; 130 product tests and 82 harness tests passed |
| Verdict | **changes-requested** — two new high findings (N1, N2) |
| Remediation | Commit `075b358978249e9e8dd2b898b408ecc5730806ff`, re-reviewed separately |

**This record is a transcription by the orchestrator, condensed from the reviewer's report.** The reviewer could not write a file in its sandbox. Every finding, its severity, its location and its probe result are kept; wording is shortened. Probe scripts stayed in the session's scratch space.

## Earlier findings (from the review of 983487d), as re-checked at aad2196

| # | Earlier finding | Result |
|---|---|---|
| 1 | Lost update | Fixed for the reported scenario; stale-lock handling raised N3 |
| 2 | Temporary-file collision | Fixed |
| 3 | Agent self-approval | Partly fixed: no decision tool, signer required, forged unsigned approval refused; two new bypasses, N1 and N2 |
| 4 | Editor confirmed without seeing content | Partly fixed: the tool still displayed the notice file as written (N2) |
| 5 | Unbounded spend | Partly fixed: calls reserved, failures charged, cancellation works; tokens neither reserved nor projected at worst case (N5) |
| 6 | Eligibility bypasses | Partly fixed: all twelve earlier bypasses caught; new gaps and false positives (N6) |
| 7 | MCP HTTP | Fixed |
| 8 | Shim | Fixed (by reading) |
| 9 | Self-authorising gate map | Fixed |
| 10 | Failed review outvoted | Fixed; sign-off and reviewer identity remain self-declared |
| 11 | Markdown injection | Fixed; bare URLs still autolink, and a leading list marker in one-line text renders as a list |
| 12 | Stale approver in summary | Fixed |
| 13 | Export permissions, overwrite, links | Fixed |
| 14 | Secret-scan placeholder | Fixed |
| 15 | Prompt delimiter | Fixed |
| 16 | Client name in evaluator state | Fixed with limits: short or lower-case names survived |
| 17 | Stop clearing; hook | Partly fixed: owner reference required, unverified |
| 18 | Weak tests | Fixed; no test yet for N1, N2 or two waiters on a stale lock |
| 19 | Operational detail in a public report | Not fixed in that commit |

## New findings

| # | Severity | Where | Finding and evidence |
|---|---|---|---|
| N1 | high | `service.ts` `latestDecisionFor`; `assemble.ts` `approvalOf` | Signed decisions could be rolled back. "Latest" meant last by array position and the signature covered neither order nor completeness, so a writer to the store could reorder or delete genuine decisions; a request for revision never revoked an approval. Probes: approve then reject, then move the approval to the end — assembled; delete the rejection — assembled; approve, request revision, revise, flip the superseded original back — assembled. |
| N2 | high | `cli/operator.ts`; `workflow/operator.ts` | The operator tool displayed and acted on the unauthenticated notice file. Probe: the agent requested approval of one draft, rewrote the notice to read as a rejection of another, and the editor's `confirm` recorded a signed approval of the first. |
| N3 | medium | `store.ts` lock | Stale-lock takeover was unsafe: two waiters could both remove a stale lock and both hold it (1 lost update in 40 trials); a holder slower than the staleness window lost its update; release removed the lock without checking ownership. |
| N4 | low | `store.ts` | A fresh lock left by a crash blocked writers for longer than their own timeout. |
| N5 | medium | `service.ts` budget; `mistral.ts` retries | Only calls were reserved, not tokens: two 8,000-token steps both ran under a 10,000 limit. A call could use five times its allowance (12,000 → 60,000). A process dying between reserve and settle left the tokens unrecorded. |
| N6 | medium | `signals.ts` | Remaining gaps: invisible characters outside the format class (U+FE0F, U+3164); look-alikes outside Cyrillic and Greek (ɡ, dotless ı, Armenian, Cherokee); magnitudes and shares in words ("two million records", "a hundred hours", "hundreds of", "a dozen", "half their time", "a third"); dotted initials ("A.I.-powered"); ruled-out words split by a hyphen, spaces, emphasis marks or an emoji. Unusably strict: "B2B", "2026", "Q3", "24/7", "COVID-19" each made a post ineligible. |
| N7 | low | `mcp/runtime.ts` `inside` | Containment was lexical: a directory named `..op` inside the working directory, and a link pointing inside it, were accepted. |
| N8 | low | `cli/operator.ts`; `workflow/operator.ts` | `init` could leave a private key without its public half; one malformed file in the channel blocked every command; notices for closed requests were never removed. |
| N9 | low | `assemble.ts`; `mcp/server.ts` | In unsigned mode the warning appeared only in the package notes and summary, not on the commands file or the tool result. |

## Residual risks the reviewer listed for the owner

- The operator's private key, tool and working directory must be out of the agent runtime's reach. If the agent can read the key, every control falls.
- The data directory and the operator channel are writable by the agent-facing server; in stdio mode that is the agent's own user.
- Unsigned mode accepts any decision written to the store and is for development only.
- Budget enforcement has no provider-side cap behind it.
- The harness gate and review checks are attestations: reviewer identity and owner sign-off are not authenticated.
- Eligibility rules are heuristics. A person must still read every approved post.

Not verified by the reviewer: live model behaviour; separate operating-system processes; rendering in a real markdown renderer; the uncommitted working-tree edits present during the review.

## Remediation in `075b358` (added by the orchestrator; verified by the focused re-review, filed separately)

| # | Change | Regression tests |
|---|---|---|
| N1 | Decisions are a signed chain (sequence number and predecessor digest inside the signature); one bad entry invalidates the log; a revision request, and the existence of a revision, withdraw an approval; the operator keeps a ledger of each log's head outside the store; packages are previews until released and signed by the operator tool | `tests/kic/signing.test.ts` |
| N2 | The notice carries only a pointer and the code; the tool reads action, subject and content from the campaign record; the editor must name the action, subject and content hash; the decision is refused on any mismatch | `tests/kic/signing.test.ts`, `tests/kic/processes.test.ts` (forged notice through the real tool) |
| N3, N4 | Locks name their owner; takeover only when the owning process is gone; guarded release; pre-write check; a displaced writer retries | `tests/kic/concurrency.test.ts` (slow holder; eight stores after a crashed writer, 25 trials), `tests/kic/processes.test.ts` (four processes) |
| N5 | A call is capped at three times its allowance; that worst case is reserved while a step is in flight; an unsettled reservation is charged in full when it expires | `tests/kic/concurrency.test.ts`, `tests/kic/gateway.test.ts` |
| N6 | All characters that take no space removed or refused; mixed-script words refused; accents, look-alikes, dotted initials and split words folded before matching; magnitudes and shares in words refused; a short list of everyday digit terms allowed | `tests/kic/evaluation.test.ts` |
| N7, N8, N9 | Containment follows links; key creation is all-or-nothing; unreadable channel files are skipped and closed requests cleared; unsigned mode is marked on each command, the commands file and the tool result | `tests/kic/processes.test.ts`, `tests/kic/mcp.test.ts` |
| 16 | Short client names scrubbed; generic company words left alone | `tests/kic/evaluation.test.ts` |
| 19 | Reworded in the KIC-00 report | — |
