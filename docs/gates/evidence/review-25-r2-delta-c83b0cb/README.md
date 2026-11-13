# Probe scripts and output of the R2 delta review (reviewer 25, code commit c83b0cb, baseline e30451c)

Kept as the reviewer left them, copied by the orchestrator from the scratch directory of the session that ran the review. The record of the review is `docs/review/2026-11-13-r2-delta-review-c83b0cb.md`.

These are a reviewer's working files, not product code or tests, and nothing runs them. The two scripts take the root of a checkout as their working directory or argument and import from it; they were run once against the code of `c83b0cb` ("tree") and once against a copy of `e30451c` ("base"), extracted with `git archive e30451c src tests fixtures package.json tsconfig.json`.

| File | What it is |
|---|---|
| `probe-gateway-charging.ts` | Random sequences of eight provider replies (good, bad and cut-off answers; HTTP 500, 502, 400, 429; dropped connections; broken streams) with usage reported truthfully, over, absurdly, not at all, under, negatively or as not a number. Checks that the total charged never exceeds three times the request's allowance and is never below the truthful lower bound |
| `probe-gateway-tree.log`, `probe-gateway-tree-30k.log`, `probe-gateway-base.log` | Its output: 0 violations in 3,000 and in 30,000 sequences at `c83b0cb`; 157 in 3,000 at `e30451c` |
| `probe-decision-requests.ts` | Six scenarios on the memory and file stores: a confirmed request kept and a declined one replaced; revision binding and the lock-out; growth over 300 rounds with the channel down, up and past expiry; twelve identical requests at once; two service instances on one directory with a delivery that hangs past expiry; the text of the new refusal |
| `probe-decisions-tree.log`, `probe-decisions-base.log` | Its output at `c83b0cb` and at `e30451c` |
| `check-summary.txt`, `secret-scan.log` | The totals of `npm run check` and the secret scan's output in the reviewer's worktree |
| `base-new-tests-summary.txt` | The delta's three test files run on the `e30451c` sources: the four tests that fail there |
| `flaky-6runs.log` | The same three files run six times at `c83b0cb` |
