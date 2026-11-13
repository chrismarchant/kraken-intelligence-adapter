# Independent review — commit 983487d

| | |
|---|---|
| Reviewed commit | `983487d76732fa70bf96c001977e17cc714a8700` (working tree clean and equal to the commit) |
| Reviewer | Independent agent, Opus tier, no authoring involvement, read-only |
| Tests it ran | `npm run check`: typecheck passed; 88 product tests and 56 harness tests passed; secret scan clean |
| Verdict | **changes-requested** |
| Remediation | Commit `aad21960bfdc6eaf542fdfecc703beaea84cf8cf`, re-reviewed separately |

**This record is a transcription by the orchestrator, condensed from the reviewer's report.** The reviewer could not write a file in its sandbox. Every finding, its severity, its location and its probe result are kept; wording is shortened. The reviewer's probe scripts were kept in the session's scratch space and are not in this repository.

Scope: the reviewer read in full the workflow, MCP, store, evaluation, gateway, shim, command and contract sources, the harness scripts, hook and CI workflow; it read the approval and bounds tests in part; it skipped the criteria, catalogue, the remaining contracts, shim tests, harness tests and fixtures as lower risk.

## Findings

| # | Severity | Where | Finding and evidence |
|---|---|---|---|
| 1 | critical | `service.ts` `mutate`; `store.ts` `put` | Optimistic concurrency was not atomic: `put` read the revision, awaited, then wrote. Two concurrent writers both passed the check and the second overwrote the first. Probe: a human confirmed a rejection while the agent requested another decision; confirm returned success, the rejection was not stored, and the rejected post was assembled with a provisional command. On the file store, 11 of 30 races lost the decision. |
| 2 | high | `store.ts` write | The temporary file name (pid + millisecond) collided under concurrent writes; interleaved bytes were renamed into place. Probe: 16 of 30 runs left an unparseable campaign file. |
| 3 | high | `runtime.ts` default operator directory; `server.ts` `kic_confirm_decision` | By default the one-time code was written inside the agent's working directory, and the agent-facing server accepted it with any self-declared actor. Probe: a "Self-Approving Agent" selected a narrative. Also: campaign records were unauthenticated JSON, so any same-user process could write an approval. |
| 4 | medium | `service.ts` request/notice; `cli/operator.ts` | The editor confirmed without seeing the content: the notice held only the id and the requester's rationale; the content hash computed at request time was discarded; `decline` left the request pending. |
| 5 | high | `service.ts` budget and timeout; `runtime.ts` `mapLimit` | Spend was not bounded. (a) Concurrent steps passed the budget check on one stale record: 6 gateway calls against a limit of 3. (b) A failed step charged nothing: 20 calls, 0 charged. (c) `mapLimit` kept dispatching after a failure. (d) The timeout was a race and cancelled nothing. (e) One counted call could be 3 × 4 HTTP attempts. (f) Tokens were checked only before a step. |
| 6 | medium | `signals.ts` | Mandatory constraints were evadable with ordinary text. All of these came back eligible: zero-width space, soft hyphen or Cyrillic "а" inside a ruled-out word; `#AIpowered`; `#GameChanging`; a figure in words; "3 in 4"; "14 hours a week"; full-width digits; a figure only in a hashtag; a claim marked as not needing evidence; a figure cited to an existing but irrelevant reference. Scores could not override eligibility; eligibility itself was weak. |
| 7 | medium | `mcp/http.ts` | No Host or Origin validation (DNS rebinding in unauthenticated loopback mode); a non-numeric body limit parsed to NaN and disabled the limit; token comparison leaked length. |
| 8 | medium | `shim/server.ts` | With an injected provider key, any caller reached any `/v1/*` path with that key, including batch, files and model deletion; non-loopback binding allowed with no client authentication. Egress confinement and redirect refusal were correct. |
| 9 | medium | `harness/scripts/aeh.mjs` `check-gates` | The gate map was read from the commit under test, so a change could authorise its own gate; renames showed only the destination, so moving a file out of a blocked path was invisible. |
| 10 | medium | `aeh.mjs` `check-reviews` | Any single passing review won even beside a changes-requested review with an open critical finding; independence was self-declared; accepted or wontfix critical findings did not block. |
| 11 | low | `comparison.ts`, `assemble.ts` | Model text was written raw into markdown: a body containing a code fence closed the block and rendered a forged "all checks passed" note; table cells did not escape newlines; the editor's name was not escaped. |
| 12 | low | `assemble.ts` summary | The summary attributed approval to the first approve decision, not the one bound to the text. |
| 13 | low | `assemble.ts` export; `store.ts` | Exports used default permissions, followed symlinks and overwrote earlier exports; the data directory was not created private. |
| 14 | low | `secret-scan.mjs` | Any token containing "dummy" or "proxy-injected" as a substring was skipped; no rule for bare provider keys. |
| 15 | low | `prompts.ts` | A brief string containing `</brief>` closed the prompt delimiter. Effect limited to the text the model writes. |
| 16 | info | `jev.ts` | The client name was left out of the evaluator state structurally, but draft bodies naming the client were still included; a test name overstated this. |
| 17 | info | `harness/hooks/pre-tool-use.mjs`; `aeh clear` | The hook is not installed by default; its logic was correct. `clear` accepted any `--by`. |
| 18 | info | tests | No test ran a workflow step concurrently; the store conflict test was sequential; the guard tests are text searches only. |
| 19 | info | `docs/gates/KIC-00-REPORT.md` | The public report carried session operational detail (which services were connected in the engineering session). Not secrets. |

## Claims checked by the reviewer

| Claim | Result at 983487d |
|---|---|
| 1 Human-only editorial decisions | **Broken** (findings 1, 3, 4) |
| 2 Eligibility cannot be overridden by scores | Holds with caveats (finding 6) |
| 3 Live JEV execution impossible | Holds with caveats (model base URL not pinned) |
| 4 Nothing can publish, schedule, spend or contact | Holds with caveats (model spend unbounded; shim paths) |
| 5 Bounded execution | **Broken** (finding 5) |
| 6 Model output untrusted | Holds with caveats (findings 11, 15) |
| 7 Secrets and privacy | Holds with caveats (findings 13, 16) |
| 8 MCP HTTP endpoint | Holds with caveats (finding 7) |
| 9 Shim | Holds with caveats (finding 8) |
| 10 Harness | **Broken** (findings 9, 10) |

Not verified by the reviewer: the pinned Action SHAs; anything requiring a live Mistral or JEV call; cross-process races beyond single-process probes; documentation accuracy; dependency licences.

## Remediation in `aad2196` (added by the orchestrator; verified by the confirmation review, filed separately)

| # | Change | Regression tests |
|---|---|---|
| 1, 2 | `CampaignStore.update`: per-campaign mutex plus cross-process lock file; random temporary name, exclusive create, fsync, rename | `tests/kic/concurrency.test.ts` (both stores, two store instances, 60 writers, stale lock) |
| 3 | `kic_confirm_decision` removed from the agent-facing server; decisions signed with an Ed25519 operator key; the server holds the public half only; no default operator directory, and it may not sit inside the data or working directory | `tests/kic/signing.test.ts`, `tests/kic/mcp.test.ts` |
| 4 | Notice carries the content, hashtags, eligibility failures, evaluation line and content hash; the request is bound to that hash; `decline` voids | `tests/kic/signing.test.ts` |
| 5 | Reserve / call / settle steps; cancellation on timeout and on first failure; provider requests capped and counted; failed calls charged; nominal token projection | `tests/kic/concurrency.test.ts`, `tests/kic/gateway.test.ts` |
| 6 | Canonical text; disguised characters refused; joined, spaced and hashtag forms of ruled-out terms; every figure in digits and present in the cited reference | `tests/kic/evaluation.test.ts` |
| 7 | Host and Origin checks; strict numeric limits; hashed token comparison | `tests/kic/mcp.test.ts` |
| 8 | Path and method allowlist; client token; Host and Origin checks; strict config; https upstream | `tests/shim/security.test.ts` |
| 9, 10, 14, 17 | Gate map from the base revision; `--no-renames`; any blocking review blocks; owner sign-off for accepted critical findings; exact placeholder match; global clear needs an owner reference | `harness/tests/gates-f9`, `reviews-f10`, `stop-f17`, `secret-scan` |
| 11, 12, 13, 15, 16 | Escaped inline text and unbreakable fences; summary uses the bound approval; private, non-overwriting exports that refuse links; angle brackets escaped in prompt data; client name removed from all evaluator state | `tests/kic/rendering.test.ts`, `tests/kic/evaluation.test.ts` |
| 18 | Concurrency tests added; model endpoint must be https or loopback | as above |
| 19 | Reworded in the KIC-00 report in a later commit | — |
