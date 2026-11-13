# Probe scripts and output of the final regression review (reviewer 24, commit c83b0cb against e30451c)

Kept as the reviewer left them, copied by the orchestrator from the scratch directory of the session that ran the review. The record of the review is `docs/review/2026-11-13-regression-review-c83b0cb.md`.

These are a reviewer's working files, not product code or tests, and nothing runs them. They are not runnable as they stand: `lib.ts` loads seven copies of the source from absolute paths in that scratch directory: the three commits `e30451c`, `184f687` and `c83b0cb` (extract each with `git archive <commit> src tests | tar -x -C <dir>`), and four copies of `c83b0cb` each with one rule of `src/evaluation/terms.ts` switched off, which were **not kept**: no plain numbers (`-noplain`), no contraction check after stand-in symbols are read (`-nodisg`), the apostrophe list cut back to one mark (`-noapos`), and no plain numbers with the "-es" ending restored (`-both`).

| File | What it is |
|---|---|
| `lib.ts` | Loader for the versions, and a helper that runs `analyseDraft` end to end |
| `gen.ts`, `o11.txt` to `o16.txt` | Random disguises, six seeds of 40,000. Each result file gives, per pattern of which versions caught a case, the count, then the cases lost against `e30451c` |
| `targ.ts`, `tg0.txt` to `tg2.txt` | Targeted constructions: stand-in symbols at the edges and joints of words |
| `contr.ts`, `t0.ts` | Contraction probes; an end-to-end case |
| `tags.ts`, `tag1.txt` to `tag3.txt` | Disguised hashtags |
| `fp.ts`, `fptag.ts` | Honest sentences and honest hashtags |
| `timing.ts`, `scale.ts`, `tim.txt`, `load1.txt` to `load6.txt` | Timing by shape for the three versions (columns: length, term set, shape, then milliseconds at `e30451c`, `184f687`, `c83b0cb`), and the same under load |
| `check-summary.txt`, `scan.txt` | The totals of `npm run check` and the secret scan's output, in the reviewer's worktree at `c83b0cb` |
