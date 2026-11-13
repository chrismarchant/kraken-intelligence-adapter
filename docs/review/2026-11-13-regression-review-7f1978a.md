# Independent regression review of the delta e30451c..7f1978a

| | |
|---|---|
| Reviewed commit | `7f1978a955c4ab849cc747da3ef5e7017114eccc` (a detached worktree at that commit) |
| Reviewer | Independent agent, Opus tier, no authoring involvement, had not seen the code before (`independent-review-agent-22`). Not a reviewer of any earlier commit |
| Scope | A regression-only delta review: `git diff e30451c 7f1978a -- src tests`. Two code commits: `dfe9ead` (the term matching in `src/evaluation/terms.ts`) and `7f1978a` (`requestDecision`, the gateway's charge for a failed request, a comment). The reviewer was told not to re-open whether the rules against disguised text are complete, and to report a disguise only where the delta made something worse than at `e30451c` |
| Tests it ran | `npm run check`: 284 product and 83 harness tests; the secret scan. The new and changed tests against the `e30451c` sources: nine fail there, as they should. The five changed test files five times, and once under load: no flakiness. Old against new on 20,000 random disguises, 30,000 random hashtags, a set of honest sentences and tags; timing; a simulated day of decision requests with the channel up, down, flapping and hanging; 80,000 random sequences through the gateway |
| Verdict | **changes-requested** for the delta. "The terms.ts part brings in regressions: drafts that e30451c refused for a ruled-out term are now eligible, and evaluation got slower. The requestDecision and gateway parts could be approved with follow-ups on their own." |

**This record is a transcription by the orchestrator, condensed from the reviewer's report.**

## Do the approvals recorded at e30451c still stand at 7f1978a?

- **Approval path, claims (a) to (d): still stands.**
- **Store, gateway and MCP code: still stands.** The gateway follow-up is closed. The follow-ups on the audit trail and on naming the standing request are only partly closed (findings 6 to 9).
- **Evaluator:** changes requested at `e30451c`, and it remains so, now with new regressions.

## Findings

| # | Severity | Finding | Kind |
|---|---|---|---|
| 1 | high | The rule added so that a plain number is not read as a word lets any marks surround the digits. In this evaluator those marks stand for letters, so a word made of symbols and one run of digits is no longer read at all: "Our @1 tool" (AI), "4\|", "$@1€" (sale), "8€$+" (best), and spaced letters with a digit, "h 0 7". 430 of 20,000 random disguises were caught at `e30451c` and are missed now, every one by this rule. End to end: "Our @1 tool flags 1 in 4 mismatches.", with a claim citing a reference that contains "1 in 4", is **eligible at `7f1978a` and refused at `e30451c`**. Spellings in digits alone ("8357" for best, "4.1" for AI) are also no longer read: that is the trade-off the fix intended, and it widens the open finding on digits as letters | **regression** |
| 2 | medium | The fix for slow evaluation holds only for the shape it named (capital I's: 3.9 s to 0.18 s). The new trimming of a word's edges backtracks: a body of "a", 7,998 full stops and "b" takes 6.4 s against 3.5 s at `e30451c`; 7,999 exclamation marks and a letter, 1 s against 38 ms. The term search runs before the over-length check, and an approval request runs it inside the campaign lock | **partly a regression**; one shape was already slow at `e30451c` |
| 3 | low to medium | Honest hashtags are refused: a short ruled-out term is now looked for at the start and end of each part of a tag. "#FreshAir", "#ThaiFood", "#Dubai2026" (AI); "#FocusGroup", "#StatusUpdate" (us); "#CoffeeTime" (fee); "#LeadGen" (ad). 15 new refusals in 48 honest tags against 50 terms. Honest sentences: none newly refused, 18 no longer refused (the intended fixes) | **regression** |
| 4 | low | The new cut of a tag where a letter meets a digit loses a short term of digits and a letter in the middle of a tag: "10x" in "#data_10x_team". 2 losses against 1,319 gains in 30,000 random tags | **regression** |
| 5 | info | The contraction fix is closed for the cases named; "can't_lose" with an underscore is still missed | not a regression |
| 6 | low | If a delivery fails only after its request has expired and been replaced, the line saying so is written for a request that no longer exists, and nothing ever removes it. A simulated day of deliveries that hang past expiry: 850 such lines. With the channel up, down or flapping the trail is bounded: 32, 71 and 42 lines, against 366 and 1,099 at `e30451c` | follow-up 1 not fully closed |
| 7 | low | With 25 or more different decisions available, notices to the operator channel still reach 1,200 a day, as at `e30451c`. The improvement is for one decision asked for repeatedly | pre-existing |
| 8 | low | The refusal of a second request ignores the revision instruction: a waiting request with a poor instruction blocks every revision request on that draft for up to 30 minutes, and whoever holds it can ask again the moment the editor declines. The editor's way out is to decline each time, or to wait. At `e30451c` the same caller could already block a whole campaign by filling the 25 waiting places | a regression in availability, not in claims (a) to (d) |
| 9 | low to info | Removing the audit lines of a replaced request is safe: the match cannot remove a line it should not, and nothing that verifies, assembles or releases reads the audit trail or the requests. What is lost: the requester, the time and the outage of every replaced request; and once a decision is asked for again successfully, any record that the channel was down | follow-up 3 reworded, not closed |
| 10 | info | The gateway: in 80,000 random sequences no call was charged more than three times its allowance, and none less than its truthful worst case except where the provider under-reported. `e30451c` went over in about 400 of each 20,000 | follow-up 2 closed |

## Claims, as affected by the delta

(a), (b), (c), (d) **held**. (e) and (f) **broken further** by finding 1; they were already broken at `e30451c`. (n) **held**, and improved. (o) **held**: eight identical requests at once, one accepted and seven refused; 20 rounds through four service instances on one directory, no anomaly. (p) **held**; evaluation is slower (finding 2) but did not throw or hang.

## Not verified by the reviewer

The `e30451c` figure for a delivery that hangs past expiry; real processes on the file store for the concurrent-request check; timing on other hardware; whether the acute accent is an accepted character; that the rules against disguised text are complete (out of scope).
