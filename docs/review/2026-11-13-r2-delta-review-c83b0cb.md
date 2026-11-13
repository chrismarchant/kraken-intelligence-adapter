# R2 — independent review of the 72-line delta, e30451c to c83b0cb

| | |
|---|---|
| Code commit reviewed | `c83b0cbd0134eb224552b73e52a43b7111cde721`. The reviewer's worktree was at the records-only commit `e7767ab`; it confirmed that `git diff --stat c83b0cb e7767ab` over `src`, `tests`, `fixtures`, `tenant-package` and the package files is empty |
| Baseline | `e30451c517bae16982ad75599d3f62cc4534ff13`, the last commit at which this code had a review with an approving verdict |
| Scope | Exactly `git diff e30451c c83b0cb -- src/workflow src/gateway src/limits.ts`: 72 lines. `src/workflow/service.ts` 39 added and 14 removed (53), all in `requestDecision`; `src/gateway/mistral.ts` 10 and 3 (13), what a failed request is charged; `src/limits.ts` 5 and 1 (6), a comment. The reviewer confirmed the counts and read and exercised every hunk |
| Reviewer | Independent agent, Opus tier, no part in writing the code, had not seen it before (`independent-review-agent-25`). Not a reviewer of any earlier commit. Commissioned inside this programme's sessions under the owner's reconciliation instruction of 2026-11-13; its identity here is declared by the orchestrator |
| Instruction to the reviewer | It was told it was not being asked to approve; that the earlier reviewers' statements about this delta were not to be taken as established; and that the evaluator was out of scope and must not affect its verdict |
| Verdict | **approve-with-followups** (in the owner's terms: APPROVED WITH FINDINGS), **for this delta only**. "It does not depend on the evaluator: no file under src/evaluation was read or relied on." "None of the follow-ups blocks." |

**This record is a transcription by the orchestrator, condensed from the reviewer's report. The verdict is the reviewer's and is given as it was given.**

## The guarantees it was asked to verify

| | Guarantee | Result | Evidence |
|---|---|---|---|
| 1 | Editorial approval | **Preserved** | Only expired, voided or past-expiry requests are replaced; a confirmed request never is. A replaced or declined request cannot be confirmed afterwards: `unknown-request`, nothing recorded. `confirmDecision`, `openRequest` and `describeRequest` are unchanged, and the request digest still binds the campaign, request, action, subject, revision instruction and content. The moment of expiry is treated the same way where a request is replaced and where it is confirmed: there is no moment at which a confirmable request can be replaced |
| 2 | Signing integrity | **Preserved** | `signing.ts`, `operator.ts`, `assemble.ts`, `src/cli/operator.ts` and `src/mcp` are unchanged since `e30451c`. Outside the workflow service and the evaluator, the requests and the audit trail are referred to only by the contract schema and by the MCP summary of pending requests. Verification of the decision log takes only the campaign id and the decisions |
| 3 | Revision binding | **Preserved** | The revision instruction is read from the signed decision log, never from the requests. After a confirmed revision request: exactly one revision; a second revise is refused; a new request is refused as superseded; the confirmed request stays confirmed. Both stores |
| 4 | Spend accounting | **Preserved, and improved over the baseline** | Two places charge, both capped at what is left of three times the request's allowance. 30,000 random sequences at `c83b0cb`: no total above the cap, none below the truthful lower bound, and exact where every report was truthful or missing. The same probe at `e30451c`: 157 violations in 3,000. The reservation made for a step covers the most a call can be charged |
| 5 | Concurrency | **Preserved** | Twelve identical requests at once, both stores: one accepted, eleven refused, one audit line, a valid record. Two service instances on one directory: one accepted of six; a delivery that hangs past expiry and fails after another instance replaced its request writes no line and leaves the replacement waiting. Every record after every scenario satisfies its contract. The removal of audit lines cannot match a line it should not |
| 6 | MCP boundary | **Preserved** | `src/mcp` is unchanged. The new refusal carries only the waiting request's id and expiry, which the campaign summary already shows; no rationale, instruction or code. No MCP tool returns the audit trail. The requester's name in the new audit text is set by the server, and each line is cut to 1,000 characters |

## Findings

None blocking, by the reviewer's rating.

| # | Severity | Finding | New or pre-existing |
|---|---|---|---|
| 1 | low | **One decision can be locked out.** While a request for a decision on a subject is waiting, every other request for it is refused for up to 30 minutes. Whoever has the MCP tools can make the first request; for a revision, theirs is then the only instruction the editor can be shown, and by asking again the moment it expires or is declined they can keep the place. The way out is the editor's: decline, which voids it at once, or wait. The editor only ever confirms text they were shown | **New in this delta** |
| 2 | info | The audit line for a replaced request can describe it wrongly: it says "voided" for a request the editor declined or one voided on a wrong code; lines about its expiry, decline or wrong codes stay and name a request no longer held. The record stays valid, and nothing that signs, verifies or releases reads the trail | Partly new |
| 3 | info | The test `r22-6` depends on timing: it restores the real delivery as soon as it sees the stored request. It passed six of six runs | New (a test) |
| 4 | info | The expiry used for replacement comes from the agent process's clock. If that clock runs ahead of the operator's, a request the editor could still confirm can be replaced; the editor then gets `unknown-request`. Fails safely | Pre-existing |
| 5 | low | An MCP caller can fill all 25 waiting places with different decisions and refill them at each expiry | Pre-existing; easier at `e30451c` |
| 6 | info | The operator channel is bounded per stretch of time, not over a campaign's life: at most 25 waiting decisions each 30 minutes. The record and the audit trail are now bounded under repeated asking: over 300 rounds the trail grows from 7 lines to 8, against 7 to 208 at `e30451c` | Pre-existing |

## Tests it ran

`npm run check` in its worktree: exit 0, type check clean, 289 of 289 product tests, 83 of 83 harness tests. Secret scan clean. The delta's three test files on the `e30451c` sources: 67 tests, 4 fail, the four that should. The same files six times at `c83b0cb`: 67 of 67 each time.

## Not verified by the reviewer

The gateway's cancellation paths after a failed request (read, not probed). A file store shared by separate processes (two service instances in one process were tested). The file operator channel under a full disk or a partial write. Id collisions across processes with the sequential id source, which only tests and the scenario tool use. It did not rely on the earlier reviews' statements about this delta.

## Where its evidence is

`docs/gates/evidence/review-25-r2-delta-c83b0cb/`: its two probe scripts and their output at both commits, with a note on each file.
