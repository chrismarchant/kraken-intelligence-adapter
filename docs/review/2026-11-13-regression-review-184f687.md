# Independent regression review of the delta e30451c..184f687

| | |
|---|---|
| Reviewed commit | `184f687f18a9158516c2b3927b2ec95fad7b2aa8` (a detached worktree at that commit) |
| Reviewer | Independent agent, Opus tier, no authoring involvement, had not seen the code before (`independent-review-agent-23`). Not a reviewer of any earlier commit |
| Scope | A regression-only delta review: `git diff e30451c 184f687 -- src tests`. Three code commits: `dfe9ead`, `7f1978a` and `184f687`. The comparison base for "regression" was `e30451c`. The reviewer was told not to re-open whether the rules against disguised text are complete |
| Tests it ran | `npm run check`: 287 product and 83 harness tests; the secret scan. The changed test files five times: no flakiness; the timing test's worst shape takes about 440 ms against its bound of 1,500 ms. The new tests against the `7f1978a` and `e30451c` sources: they fail there, as they should. Old against new on 2 × 20,000 random disguises sorted by cause, with ablated copies of the code to confirm each cause; 30,000 random hashtags; 3,000 random honest sentences and 40 targeted ones; timing over 38 body shapes and three sets of terms; simulated days of decision requests; concurrency on both stores |
| Verdict | **changes-requested** for the delta. "Evaluator: still worse than e30451c outside the intended plain-number class, in two places. Drafts that e30451c refused are eligible at 184f687. requestDecision and gateway: these parts on their own would be approve-with-followups." |

**This record is a transcription by the orchestrator, condensed from the reviewer's report.**

## Do the approvals recorded at e30451c still stand at 184f687?

- **Approval path, claims (a) to (d): still stands.** `requestDecision` changed only the text of audit lines, and nothing on the approval path reads it.
- **Store, gateway and MCP code: still stands**, with follow-ups (findings 5 and 6). The gateway and the limits are byte-identical to `7f1978a`. The audit trail stays bounded with the channel up, down, flapping or hanging.
- **Evaluator:** leaving aside the findings recorded as open at `e30451c`, it is still worse than `e30451c` in findings 1 and 2. Against `7f1978a` it is much better: about 128 losses against about 2,170 in 20,000 random disguises. It also catches about 500 in 20,000 that `e30451c` missed.

## Findings

| # | Severity | Finding | Kind |
|---|---|---|---|
| 1 | medium | Since `dfe9ead` a word is cut into parts at hyphens, dashes and slashes before its edges are handled. A part with a stand-in symbol on its outer edge and another at the joint is read by no reading: "Get it $fr€€-trial today" (free), "Start your +fr€€/trial today", "Our $4\|-powered checks" (AI) are **eligible at `184f687` and refused at `e30451c`**. About 75 in 20,000 random disguises. Confirmed by ablation: without the cut into parts every one is caught | **regression** against `e30451c`; present at `7f1978a` and missed by the review of it |
| 2 | low to medium | The rule that a digit set apart among single letters or stand-in symbols is read as a letter does not count the upright stroke as a stand-in: "Our 4 \| tool" (AI), "\| 0 \|" (lol) are lost. About 13 in 20,000 | **regression** against `e30451c`; a gap in the fix of the previous review's finding 1 |
| 3 | low | In a hashtag a run of capitals can span two words: "#SaaSOfPR" is refused for "so", "#PhDStudents" for "ds", "#iOSApps" for "os". One new refusal in 15,000 random honest tags | new false positives against `e30451c` |
| 4 | low to info | Ordinary shapes are a constant factor slower than at `e30451c` (for example 127 ms to 223 ms), because there are more readings. The pathological shapes are far faster (5.8 s to 0.44 s; 2.6 s to 28 ms). Slowest seen: under 0.45 s unloaded, under 0.9 s with six processes at once. Scaling is linear | not a regression |
| 5 | info | The requester, time and outage of a replaced request are carried for one replacement only | the previous review's finding 9, partly closed |
| 6 | info | The requester's text in the audit line is bounded and cannot be used to remove or forge a line. Through MCP it is set by the server's configuration, not by the caller | — |

**The intended class, for the owner.** A word written the way a number is written is no longer read as letters: "8357" (best), "5413" (sale), "4.1", "4/1" and "4 1" (AI), "101" (lol), "47" (at), "70" (to); in hashtags "#83710"; and the parts of a slashed or hyphenated word, "x/101". About 125 in 20,000 random disguises. The figure rule still applies to each of them.

Honest text: 3,000 random business sentences and 40 targeted strings, no new refusal in a post's body.

## The previous regression review's findings

1 partly closed (finding 2 here). 2 closed. 3 closed for the named tags (finding 3 here). 4 closed. 5 open as recorded. 6 closed: a simulated day of deliveries hanging past expiry leaves 2 lines, against 49 at `7f1978a`. 7 and 8 open as recorded. 9 partly closed. 10 closed.

## Claims, as affected by the delta

(a), (b), (c), (d) **held**. (e), (f) **broken**, as at `e30451c`, and weakened further by findings 1 and 2. (n) **held**. (o) **held**: eight identical requests at once, one accepted; eight concurrent replacements with every second delivery failing, one standing request and no stray line; 20 rounds on each store. (p) **held**.

## Not verified by the reviewer

Timing on other hardware; concurrency across separate processes; whether finding 1 covers every shape (characterised by random generation and an ablation, not by proof); completeness of the rules against disguised text (out of scope).
