# Independent review of the remediation, part A — commit 1d8bafe

The commit-bound review of the remediation of scope-completing review A.

| | |
|---|---|
| Reviewed commit | `1d8bafe969d3ebfa3cee42a9889cdab848443081` (a detached worktree at that commit) |
| Reviewer | Independent agent, Opus tier, no authoring involvement, had not seen the code before (`independent-review-agent-13`). Not the reviewer of `2537386` |
| Scope | At `1d8bafe`: `src/evaluation/**`, `src/contracts/**`, `src/creators/**`, `src/shim/normalize.ts`, the non-streamed path of `src/shim/server.ts`, `clip` in the workflow service, and their tests. Asked to decide for itself whether each of F1 to F13 of the earlier review was closed, to look for regressions, and to re-test claims (e) to (j) |
| Tests it ran | `npm run check`: exit 0. Fifteen probes of its own, which also compared the old and new evaluator, normaliser and ranking, re-evaluated the recorded campaign (eligibility unchanged) and compared fixture streams old against new (identical) |
| Verdict | **changes-requested.** "Claim (f) still breaks at 1d8bafe. A ruled-out term written in Latin look-alike letters that are neither folded nor refused passes every check (N1). A post that has been cheaply tipped to 'not mostly Latin' lets look-alike letters from scripts that are not folded pass (N2). The SSE rewrite now drops valid multi-line events that use CRLF line ends, tool calls included (N3, a regression that breaks (j))." |

**This record is a transcription by the orchestrator, condensed from the reviewer's report.**

## Closure of the earlier findings

| # | Result |
|---|---|
| F1 | Partly closed: Greek and Cyrillic look-alikes are caught. Not closed for N1 and N2 |
| F2 | Partly closed: digits of other scripts are caught. Numerals that are letters ("四十%") pass once a post is tipped (N2) |
| F3 | Closed |
| F4 | Closed as an honest flow. Side effect: N7 |
| F5 | Partly closed: the ellipsis is fixed; the cut can fall inside an emoji sequence (N6) |
| F6 | Closed |
| F7 | Closed for marks between letters. A space character that compatibility folding leaves alone (U+1680) still splits a word; so it did before. Over-matching: N5 |
| F8 | Partly closed: "at 1:12 reps", "from 13:20 to 20:20 coverage" and "12 pm per unit" are still read as times |
| F9 | Partly closed, with a regression on three-letter terms (N4) |
| F10 | Partly closed: N3, N8, N9 |
| F11 | Closed. Past the size limit the stream ends in an error, which fails closed |
| F12 | Partly closed: a released package's provenance fields, the evaluation arrays and the creator arrays are still unbounded. Not reachable by an agent as far as the reviewer saw |
| F13 | Closed. Still as noted before: a missing fee and unknown consent leave a candidate eligible |

## New findings

| # | Severity | Finding | Proven |
|---|---|---|---|
| N1 | **high** | Latin-script look-alike letters from the extended Latin blocks are neither folded nor refused: "AꞮ" for a ruled-out "AI", "ꜱcam", "ꜰraud" and five more all come back eligible. Also true at `2537386` | yes |
| N2 | medium | The "mostly Latin" rule can be tipped: twelve claims of Greek text, which are not published, make the post count as not mostly Latin, and look-alikes from scripts that are not folded (Cherokee, Lisu) then pass, as do numerals that are letters | yes |
| N3 | medium, **regression** | The rewritten stream normaliser treats a single CRLF as the end of an event. A valid tool-call chunk written over two CRLF `data:` lines is dropped; an `id:` line after the data moves to an event of its own | yes |
| N4 | low, regression | A term of three letters no longer catches its inflections: "fix" does not catch "fixed" | yes |
| N5 | low, regression | Removing every mark between letters removes apostrophes: "We'll" is refused when "well" is ruled out | yes |
| N6 | low | `clip` cuts by code unit: a cut just after the joiner inside an emoji leaves the text out of canonical form, and the draft is refused; a cut inside a surrogate pair stores half a character | yes |
| N7 | low/info | The mock evaluator judges on redacted text: a draft whose ruled-out term sits inside a long run is chosen by the mock, the choice is then discarded as ineligible, and no draft is recommended. Eligibility and ranking are unaffected | yes |
| N8 | low | Reasoning is removed only inside `delta` and `message`. At the level of a choice, at the top level, or as `delta.thinking`, it is passed on. Whether the provider ever sends these is not known | yes |
| N9 | low | An event the normaliser did not change is passed on as it arrived: a repeated key can carry reasoning in the copy that parsing discards | yes |
| N10 | low | Dropping an unreadable event in the middle of a tool call lets the client assemble different arguments from the pieces that remain. Before, the client received the broken event and failed visibly | yes |
| N11 | info, by design | In a mostly-Latin post any word in another script is now refused: a name in Cyrillic, "(東京)", "the α release" | yes |
| N12 | info | A blocking concern with a long description makes the ranking throw | yes |
| N13 | info | Ordinary times are refused as figures unless written in one of the forms the rule accepts | yes |

## Claims

(e) broken by N1 and N2. (f) broken: N1, N2, N4; weakened by what remains of F2, F7 and F8; over-matching N5. (g) **held**. (h) held for executability; bounds partly. (i) **held**. (j) broken: N3; N10; N8 and N9 under some upstream shapes.

## The reviewer on the regression tests

Each new test checks what its name says and would fail with its fix reverted; none passes vacuously. Gaps: no extended-Latin or tipping case, no cut inside an emoji, no "at 1:12" case, no three-letter inflection, no contraction, and the mixed-separator test uses single-line events only, which is why N3 was not caught.

## Remediation in `a1affd2` (added by the orchestrator)

| # | Change | Regression test |
|---|---|---|
| N1, N2, what remained of F1 and F2 | A list of allowed letters replaces the lists of look-alikes: the Latin alphabet as European languages write it. Any other letter is refused, in every part of a draft, whatever the rest contains. The "mostly Latin" rule is removed. The extra letters of European alphabets are read as the plain letters they stand for | `tests/kic/scope-review-a.test.ts` "N1" (two tests), "N2" |
| What remained of F7 | A blank that is not an ordinary space, and a private-use or unassigned character, are refused | "F7 remainder" |
| N3 | A carriage return and line feed is one line end | `tests/shim/scope-review.test.ts` "N3": a tool call written over two such lines, delivered in pieces of 1, 2, 3 and 7 characters and whole |
| N4 | A term of three letters or more is given the usual endings; one of one or two letters only "s", "ed" and "ing" | "N4" |
| N5 | The apostrophe of a contraction or possessive is left in place | "N5" |
| N6 | Text is clipped between characters; the cut moves back until the result is canonical and fits | "N6" |
| N8 | Reasoning is removed at the top level, in each choice, and in `delta` and `message`, under the names `reasoning_content`, `reasoning` and `thinking` | "N8" (two tests) |
| N9 | Data is always written out again from what was parsed | "N9" |
| N10 | An event that cannot be read ends the stream with an error; it is neither passed on nor left out | "F10, N10" |
| What remained of F12 | A released package's provenance, the lists in an evaluation and the lists in a creator set are bounded | "F12 remainder" |
| N12 | A long description in a blocking concern is shortened to fit | "N12" |
| Not raised by the reviewer | Keyboard symbols used in place of letters inside a word are read as those letters when a ruled-out term is looked for | "a ruled-out word written with keyboard symbols…" |

Not changed, and accepted as limits: what remains of F8 (a figure can still be written so that it reads as a time of day; it then reads as one to the reader as well); N7 (the mock evaluator sees redacted text; eligibility and ranking do not depend on it); N11 and N13 (by design); a missing fee or unknown consent leaves a creator eligible (synthetic fixtures only).
