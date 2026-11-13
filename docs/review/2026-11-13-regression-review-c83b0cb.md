# Independent regression review of the evaluator's term matching — commit c83b0cb against e30451c

| | |
|---|---|
| Reviewed commit | `c83b0cbd0134eb224552b73e52a43b7111cde721` (a detached worktree at that commit) |
| Comparison baseline | `e30451c517bae16982ad75599d3f62cc4534ff13`, the last commit at which the evaluator as a whole was reviewed |
| Reviewer | Independent agent, Opus tier, no authoring involvement, had not seen the code before (`independent-review-agent-24`). Not a reviewer of any earlier commit. Commissioned inside this programme's sessions; its identity here is declared by the orchestrator |
| Scope | **Regression only**: the term matching in `src/evaluation/terms.ts` and `tests/kic/scope-review-a.test.ts` at `c83b0cb`, compared with `e30451c`; and whether findings 1 to 3 of the review of `184f687` are closed. **Not** a review of whether the evaluator's rules against disguised text are complete: the reviewer was told that five reviews had found they are not, and to report a disguise only where `c83b0cb` is worse than `e30451c` |
| Verdict | **approve-with-followups** (in the owner's terms: APPROVED WITH FINDINGS), for the term matching at `c83b0cb` as a regression review against `e30451c` |

**This record is a transcription by the orchestrator, condensed from the reviewer's report. The verdict is the reviewer's and is given as it was given. It is an approval of this scope only. It is not an approval of the evaluator: the review of `e30451c` that requested changes stands, and its open findings are true of `c83b0cb`.**

## The two statements the reviewer was asked to make

- **Outside `terms.ts` and its test:** "no other source or test file changed between `184f687` and `c83b0cb`." Five record files did: the decision register, two review records, the threat model and the review ledger.
- **Worse than `e30451c`:** "leaving aside the plain-number class and the findings open at `e30451c`, the term matching at `c83b0cb` is worse in two places, and both are consequences of fixes recorded in the a5 record: the '-es' change (the a5 F7 fix); the wider contraction reading (the a5 F3 fix). It is not worse anywhere else I tested."

## Tests it ran, and their results

| What | Result |
|---|---|
| `npm run check` in the worktree | exit 0: type check clean, 289 of 289 product tests, 83 of 83 harness tests |
| `node harness/scripts/secret-scan.mjs` | clean, exit 0 |
| `tests/kic/scope-review-a.test.ts`, five runs | 45 pass, 0 fail each time. The timing test alone as eight processes at once on four cores: all passed |
| `r23-1` and `r23-2` against the `184f687` sources | both fail there, as they should |
| Random disguises: 240,000 (six seeds of 40,000), across `e30451c`, `184f687`, `c83b0cb` and four copies of `c83b0cb` each with one rule switched off | Losses against `e30451c`: 1,039 in the plain-number class and 31 in the "-es" class. **With both restored: 0 of 240,000** |
| Targeted constructions: 1.64 million body cases (stand-in symbols at the outer edges of a word, at its joints, and at both; digits; spaced letters and strokes) | Every loss a pure numeral token. With both classes restored: 0 |
| Hashtags: 75,000 random disguised tags | With both classes restored: 0 lost. No case where `184f687` catches and `c83b0cb` misses |
| Contractions: 20,080 probes | 8,245 lost against `e30451c` (finding 1) |
| Honest text: 3,568 sentences built around numbers joined to words, and 46 fixed strings ("48-hour", "B/101", "24/7", "COVID-19", "A/B test", "1-on-1", "$5-off", "401(k)") | **No new refusal** |
| Honest hashtags: 15,000 random CamelCase tags and 40 named ones | One class of new refusal, finding 4 |
| Timing: 34 body shapes, two sets of terms, three versions, at 8,000 characters; 4,000 to 32,000 characters; under load | Finding 6 |

## Findings

None was rated blocking by the reviewer.

| # | Severity | Finding | Kind |
|---|---|---|---|
| 1 | low | **A word that reads as a listed contraction is read only as that contraction**: when its stand-in symbols are read as letters, when it uses another mark for the apostrophe, or when it is a part of a hyphenated word. What `e30451c` caught and `c83b0cb` misses is the run-together word or the stem: "he'\|\|" for "hell", "we'\|\|" and "w3'll" for "well", "it's-free" for "it". 8,245 of 20,080 contraction-shaped probes; none among the 240,000 random disguises. End to end: "he`ll" is refused for "hell" at `e30451c` and not at `c83b0cb`. Consistent with the design ("we'll" is not "well") and a consequence of the fix recorded for the a5 review's F3. "Recommend the owner record it as a second intended class" | **regression against `e30451c`**, from `dfe9ead`; the same at `184f687`; recorded by no earlier regression review |
| 2 | info | A three-letter term followed by "-es" after a letter that is not a hissing sound is no longer matched: "f€€e£5" ("feees") for "fee". 31 of 240,000. The recorded fix for the a5 review's F7 | a second loss class against `e30451c`; intended |
| 3 | info | The intended plain-number class: 1,039 of 240,000 random disguises. Every one is a pure numeral token: "41", "101", "4.1", "48-B", "#Best_41_2026" | intended |
| 4 | low | Hashtag false positives from runs of capitals: "#SaaSOps" for "so", "#iOSHub" for "os", "#PhDStock" for "ds". The only new class of honest tag refused; its rate depends on the vocabulary (tags with iOS, PhD, SaaS) | finding 3 of the review of `184f687`, open as recorded |
| 5 | info | Honest body text: no new refusals. The new reading of parts added no false positive. Two refusals at `e30451c` are gone, as intended: "48-hour" for "ab", "B/101" for "lol" | — |
| 6 | low to info | Timing at 8,000 characters and 40 long terms. Worst shape at `c83b0cb`: 366 to 490 ms. Ordinary prose: 62 ms at `e30451c`, 116 ms at `184f687`, 180 ms at `c83b0cb`: about 2.9 times `e30451c`. Hyphen-heavy shapes about 6 times (35 to 218 ms). The pathological shapes of `e30451c` remain far faster (5.9 s to 0.37 s). Linear from 4,000 to 32,000 characters. The timing test's bound is 1,500 ms a shape; with six processes on four cores the worst was 1,050 ms, a margin of about 30%, thinner than at `184f687` | not a correctness regression |

## The findings of the review of 184f687

1 **closed**: no loss outside the classes above in 1.64 million targeted constructions; switching the new reading of parts off brings the failures back. 2 **closed**. 3 **open as recorded** (finding 4 here).

## Not verified by the reviewer

Completeness of the search for losses: it rests on random generation and ablation, not on a proof. Timing on other hardware and under heavier load. End-to-end checks for short terms the sample draft itself contains; for those it relied on the term and hashtag finders. Completeness of the rules against disguised text (out of scope).

## Where its evidence is

The reviewer's probe scripts and result files are kept as it left them in `docs/gates/evidence/review-24-c83b0cb/`, with a note on what each is. The seven copies of the source they load are not kept: three are commits and can be extracted again; four were copies of `c83b0cb` with one rule switched off, described in that note. Without those four, the counts by cause above cannot be re-derived exactly from the repository.
