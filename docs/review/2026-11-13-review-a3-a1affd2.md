# Independent review of the second remediation, part A — commit a1affd2

| | |
|---|---|
| Reviewed commit | `a1affd2c4e9677baa8d15a60fe330ceec13e3c08` (a detached worktree at that commit) |
| Reviewer | Independent agent, Opus tier, no authoring involvement, had not seen the code before (`independent-review-agent-15`). Not a reviewer of any earlier commit |
| Scope | At `a1affd2`: `src/evaluation/**`, `src/contracts/**`, `src/creators/**`, `src/shim/normalize.ts`, the normalisation paths of `src/shim/server.ts`, `clip` in the workflow service, and their tests |
| Tests it ran | `npm run check`: exit 0. Sixteen probes: every accepted letter enumerated through canonicalisation and folding; a scan of non-letters with letter-like names; 3,000 random streams against a reference parser; the repository's fixtures compared across three versions; the new tests run against the previous sources |
| Verdict | **changes-requested.** "Ruled-out terms written with non-letter symbols that read as letters still come out eligible, which breaks claims (e) and (f). The new apostrophe rule reopens a bypass that 1d8bafe had closed. An honest brief can produce an evaluation that breaks its own contract, and then nothing can be evaluated or approved." |

**This record is a transcription by the orchestrator, condensed from the reviewer's report.**

## Closure of the earlier findings

Closed: N1 (for letters: every accepted letter folds to plain ASCII), N2, **N3** (3,000 random streams, no mismatch with a reference parser and no reasoning leaked; the same test finds 1,053 mismatches at `2537386`), N4, N5, N6, N8 (for the three names), N9, N10, N12; F2, F3, F4, F5, F6, F11, F13. Partly closed: F1 (open for symbols and plain look-alikes), F7 (apostrophes reopened), F8 (accepted remainder), F9 (over-matching back for short terms), F10 (finding 7), F12 (finding 4).

## New findings

| # | Severity | Finding | Proven |
|---|---|---|---|
| 1 | **high**; not new | Characters that are not letters but read as letters are neither refused nor read as the letter they show: squared and circled letter emoji ("🅰🅸" for a ruled-out "AI"), regional indicators, APL and mathematical symbols, combining small letters, and two allowed letters that look like other letters (þ like p, ß like B). About 630 such characters survive canonicalisation. The same drafts pass at `1d8bafe` and `2537386` | yes |
| 2 | medium; not new | Plain look-alikes and spacing: "Al" with a lower-case L for "AI", "scarn", "svvindle", "A I", "$cam". The reviewer notes the owner may class this with the accepted limit of pattern rules, "but it is not rephrasing" | yes |
| 3 | medium; **regression** | The apostrophe kept for contractions shields a ruled-out word split before its ending: "guarantee'd", "sca'm", "boos't" | yes |
| 4 | medium; not new; breaks an honest flow | Strings the evaluator writes into its own evidence and failure details are not cut to the lengths the contract allows. A brief with a required point of 213 characters, a long ruled-out term, or a figure of 500 digits written by a model makes the evaluation fail its contract; nothing can then be evaluated or approved | yes |
| 5 | low; regression | The allowed letters leave out Romanian ș and ț, Vietnamese ơ and ư, capital ẞ and pinyin vowels | yes |
| 6 | low; regression | Over-matching for short terms: a ruled-out "US" refuses "used"; "fun" refuses "fund"; "car" refuses "card" | yes |
| 7 | low | A response labelled as an event stream whose body has no data line is passed on as it is; a JSON answer with reasoning, mislabelled, reaches the client. Mislabelled upstream only | yes |
| 8 | low; not shown for the provider | Events the stream format allows, an empty data line or data that is not JSON, now end the stream | yes |
| 9 | low/info | `clip` given text that is not canonical, or that canonicalisation does not hold stable, collapses it to one character and three full stops | yes |
| 10 | info | Writing data out again changes integers above 2^53 and the spelling of some numbers and characters. The repository's fixtures are unaffected | yes |

## Claims

(e) and (f) broken by findings 1, 3 and 2. (g) **held**. (h) held for executability; bounds partly (finding 4). (i) **held**. (j) **held on well-formed input**; weakened by 7, 8 and 10.

## The reviewer on the tests

All 19 tests added in `a1affd2` were run against the `1d8bafe` sources: every one fails there but one, which already passed. Weak: the tipping test is vacuous, since the claims alone are refused; one line of the bounds test is vacuous; no test covers the evasion the apostrophe rule opened, the over-matching of short terms, symbols, or evaluations fitting their own contract. The shim tests are sound.
