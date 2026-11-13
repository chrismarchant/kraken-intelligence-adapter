# Probe scripts and output of the R1 evaluator review (reviewer 26, code commit c83b0cb)

Kept as the reviewer left them, copied from the scratch directory of the session that ran the review. Record: `docs/review/2026-11-13-r1-evaluator-contract-review-c83b0cb.md`. Working files, not product code or tests; nothing runs them. They import the code by absolute path from a worktree that is not kept; `lib.ts` is the shared helper. File names follow the contract: `p1` to `p8` for the patterns, `ec…` for the requirements, `fp-honest` for honest text, `new-bypasses` and `p-limits` for the limitations.

One probe is not kept: `ec7-4-bounds.ts`, which tests redaction and so contains an invented, secret-shaped value that the repository secret scan refuses, as it should. Its result is in the review record (EC-7.4 and EC-7.7).
