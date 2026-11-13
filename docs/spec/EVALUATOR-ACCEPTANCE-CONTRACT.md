# Evaluator acceptance contract

**Status: PROPOSED.** Written on 2026-11-13 from the owner's policy on OD-21 (`docs/decisions/OD-21-EVALUATOR-POLICY.md`), under `docs/spec/directives/KIC-01-GATE-RECONCILIATION-INSTRUCTION-2026-11-13.md`. It is not in force until the owner approves it. It was written against the code at commit `c83b0cbd0134eb224552b73e52a43b7111cde721` and changes nothing in that code.

This contract replaces, for acceptance purposes, the two claims the earlier reviews tested the evaluator against: "(e) a draft failing a mandatory constraint cannot become approvable" and "(f) the mandatory constraints do what they say", read as claims that a ruled-out word or an unbacked figure cannot reach approval in any form a reader can read. Five reviews showed the code does not meet that reading and that pattern rules cannot. Their findings are not withdrawn or declared fixed: they are section 5.

## 1. What the evaluator is

The owner's words:

> The KIC evaluator is a deterministic, pattern-based screening mechanism, supporting mandatory editorial review.
>
> It is not a comprehensive semantic, linguistic or adversarial detector. It must not claim to identify every disguised prohibited term, unsupported numerical assertion or misleading commercial claim.

Terms used below:

| Term | Meaning |
|---|---|
| Screening | The deterministic checks made by `analyseDraft` in `src/evaluation/signals.ts`, with `terms.ts` and `characters.ts`. Its result is a list of failures, each naming a rule |
| Eligible | **No screening rule failed. Nothing more.** It does not mean accurate, lawful, compliant with any commercial or platform rule, approved, or fit to publish |
| Scoring | The scores, ranking and preference returned through the evaluator transport (`evaluator.ts`, `jev.ts`). Today a deterministic stand-in. Advice to the editor; outside this contract's requirements except where stated |
| The editor | The person who holds the operator key. Reads every draft in full and decides. Mandatory |
| Canonical form | What `canonicalText` in `src/util/runtime.ts` returns: compatibility-composed, without control or invisible characters |

Scope: `src/evaluation/**`, and the places where a screening result is used: the approval checks in `src/workflow/service.ts`, assembly in `src/workflow/assemble.ts`, the comparison document, the operator tool's display, and the MCP tool that evaluates.

## 2. Requirements

Each is meant to be testable by someone with the repository and no other knowledge. "Must" is a requirement. Where a requirement incorporates a table from the code, the table is data (which character is read as which letter, which words are number words); the rule that uses it is stated here.

### EC-1 Deterministic and local

| | Requirement |
|---|---|
| 1.1 | For the same brief, planned call to action, draft and length limit, screening returns the same failures, in the same order, with the same text, on every call and in every process |
| 1.2 | Screening reads nothing but its arguments: no network, no model, no clock, no random source, no environment variable, no file |
| 1.3 | Whether a draft is eligible does not depend on any score, on the scoring transport, or on anything in the stored evaluation. It is computed from the brief and the draft |

### EC-2 The documented rules, applied consistently

The complete catalogue. A draft is ineligible if and only if at least one of these fails.

| Rule | Fails when |
|---|---|
| `empty-body` | The body has no text |
| `over-length` | Body plus hashtags exceed the configured length limit |
| `unsupported-claim` | A claim marked as needing evidence cites no reference |
| `unknown-evidence-reference` | A claim cites a reference that is not in the brief |
| `unlisted-statistic` | A figure of section 3, P8, is in the body or hashtags |
| `must-avoid-term` | A term the brief rules out is found in the body or a hashtag, as section 3, P1 to P7, defines "found" |
| `suspicious-characters` | Any part of the draft (body, hashtags, hook, call to action, claims) is not in canonical form; or contains a character outside the allowed list; or has a picture in the same word as a letter or a digit |

| | Requirement |
|---|---|
| 2.1 | Each rule fails whenever its condition holds, whatever else the draft contains and whichever other rules fail. One part of a draft cannot excuse another |
| 2.2 | Every failure names its rule and gives a reason a person can act on |
| 2.3 | Every rule reads the canonical form of the text |
| 2.4 | The same screening, on the text as it then stands, is applied at evaluation, when an approval is requested, when it is confirmed, and at assembly. A stored result is never trusted in place of it |
| 2.5 | A draft that does not differ from another in anything screening reads gets the same result |

### EC-3 The explicitly specified patterns

**These, and only these, are what screening is required to detect.** Section 5 lists what it is not required to detect.

| | Pattern | Detail |
|---|---|---|
| P1 | A ruled-out term written plainly | As a whole word or phrase, in any letter case. The words of a term of several words may be joined, hyphenated or spaced. The last word also matches with these endings: one or two letters, the plural "-s" only; three letters, "-s", "-ed", "-ing" (with the last consonant doubled where the word ends consonant, vowel, consonant) and "-es" only after s, x, z, ch or sh; four letters or more, "-s", "-es", "-ed", "-ing", "-d" after a final "e", with or without a doubled last consonant, "-ing" with a final "e" dropped, and "-ied", "-ies" for a final "y" after a consonant. A longer, different word does not match. A listed contraction ("can't", "we'll"; the list is `CONTRACTION` in `terms.ts`) is a word of its own: it matches only itself |
| P2 | The same, with accents or look-alike letters | Accents are ignored. A letter in the table `CONFUSABLE` is read as the plain letter it resembles; the sharp s, thorn and eth are read both ways |
| P3 | The same, with stand-in symbols or digits for letters | A character in the table `SYMBOL_READING`, the upright stroke and the digit one (each read once as "i" and once as "l") is read as its letter, anywhere in a word: inside it, at its edges, and at the joints of a word joined by hyphens, dashes or slashes. A word is read with the marks at its edges kept, with its ordinary opening and closing punctuation left off, and with every mark at its edges left off; a run of one repeated symbol is read both as one letter and as that letter repeated. **Exception:** a word, or a part of a joined word, written the way a number is written (digits, the separators `. , : / – -` between digits, a closing `%` or `+`, sentence punctuation around it) is a number and is not read as letters, unless it is a single digit set apart among single letters or stand-in symbols |
| P4 | A term spelled out as single letters | Set apart by spaces or by dots ("A I", "R. O. I.", "s c a m"), found anywhere along the run |
| P5 | A capital I for a lower-case L, and the reverse | A lower-case L beside a capital is also read as a capital I; a capital I after small letters is also read as a lower-case L |
| P6 | A term in a hashtag | As a word of the tag, where the tag is cut at an underscore, where a small letter meets a capital, and where a letter meets a digit; a term of four letters or more anywhere inside the tag; a shorter term at the start or the end of the whole tag, or as a run of capitals inside it that a small letter follows (the run whole, or without its last capital) |
| P7 | A term that is not made of words | One with a sign in its name ("C++") or with no letter or digit at all is looked for exactly as written, in any letter case |
| P8 | An unbacked figure | (a) Every number written in the digits 0 to 9 in the body or a hashtag, unless a claim that cites a reference of the brief contains it and that reference contains it. Not counted in the body: clock times in the listed forms; "B2B"-shaped terms, "Q1" to "Q4", "24/7"; the identifiers ISO, IEC, SOC, RFC and COVID with a number; a year after a word that only introduces a date, in the listed forms; "By" and a year opening a sentence; a span of years that runs forward. In a hashtag every digit counts. (b) Any numeral that is not one of the digits 0 to 9. (c) A quantity written in words **in the shapes listed in `SPELLED_QUANTITY`**: a number phrase with "percent", "in" or "out of", "times" or "fold"; "twice as", "double the"; "half of", "a third of" and the like; "halved", "doubled"; a magnitude ("two million", "hundreds of", "a dozen"); a fraction of a thing |
| P9 | A claim without its evidence | A claim the draft marks as needing evidence that cites no reference, or one not in the brief |
| P10 | Unsupported text | Text not in canonical form; a character outside the list in `characters.ts`; a picture in the same word as a letter or a digit |
| P11 | No text, or too much | An empty body; a post over the length limit |

Ruled-out terms are looked for in the body and the hashtags, which are what is published. They are not looked for in the hook, the call to action or the claims, which the editor sees and which are not published as such.

### EC-4 The draft is preserved exactly

| | Requirement |
|---|---|
| 4.1 | Screening and scoring do not change the draft. After an evaluation, every stored field of every draft is byte for byte what it was |
| 4.2 | What the editor is shown, and what the editor's signature covers, is the stored text of the draft: not a folded, normalised, reduced or redacted form of it. The forms screening reads internally are never stored in place of the text or shown as the text |
| 4.3 | Redaction applies only to the copy sent to the scoring transport. It does not affect screening, the stored draft, or what the editor sees |
| 4.4 | A finding that quotes the draft quotes it as it is, cut to a stated length. A character outside the allowed list is named by its code point, not reproduced |

### EC-5 No implication of compliance

| | Requirement |
|---|---|
| 5.1 | No output of the evaluator, no tool result or tool description, no comparison document, no operator display and no document in this repository states or implies that a draft which passes screening is accurate, compliant, approved or fit to publish |
| 5.2 | No such text claims that screening finds every disguised ruled-out term, every unsupported figure or every misleading claim |
| 5.3 | Passing is reported only as the absence of failures. Every evaluation carries a statement of its limitations |
| 5.4 | Scores, ranking and preference are presented to the editor as advice, unsigned and outside what the signature covers |

### EC-6 Editorial controls are preserved

| | Requirement |
|---|---|
| 6.1 | The evaluator records no decision, holds no key and has no path to approve, release, publish, send or spend |
| 6.2 | A draft with a screening failure cannot have an approval requested, cannot have one confirmed, and cannot be assembled or released as approved, at the text it then has |
| 6.3 | A draft that has not been evaluated cannot be approved |
| 6.4 | Passing screening approves nothing. Approval is the editor's signed decision over a digest of exactly what the operator tool showed |
| 6.5 | Nothing in a stored evaluation can make a draft approvable or approved: eligibility is recomputed, and only the signed decision log says what is approved |
| 6.6 | Revision binding is untouched: a revision is made once per signed instruction, and a revised draft is screened and evaluated as a new draft |

### EC-7 Fails safely

| | Requirement |
|---|---|
| 7.1 | Text that is not in canonical form, or that contains a character outside the allowed list, makes the draft ineligible, with a reason. It is never passed unread and never silently altered |
| 7.2 | Screening does not throw for any draft and brief that satisfy the data contracts in `src/contracts/` |
| 7.3 | The time screening takes grows no faster than in proportion to the length of the draft. At the largest sizes the contracts allow (a body of 8,000 characters, 8 hashtags, 40 ruled-out terms) it finishes within the bound the repository's own timing test sets, 1,500 ms a draft on the hardware the tests run on |
| 7.4 | What is kept of a result is bounded: at most 200 failures, each reason at most 400 characters. Eligibility rests on every failure found, not on how many are kept |
| 7.5 | If scoring fails or returns no score for a draft, no evaluation is stored, and a draft without an evaluation cannot be approved |
| 7.6 | There is no live path to a JEV service. Nothing in `src/evaluation/` opens a network connection |
| 7.7 | Nothing secret-shaped is sent to the scoring transport: what would be sent is redacted, and the request is refused if a secret-shaped value remains |

## 3. Honest text that is refused

Screening errs towards refusing. These refusals of honest text are known and accepted; the reviewer of this contract is asked to assess them, and the register (`docs/security/RISK-AND-INTERNATIONALISATION-REGISTER.md`) records them.

| | Refused | Why |
|---|---|---|
| F1 | Any character outside the allowed list: a name or a quotation in another script, an emoji that is not listed, a flag, a skin tone, emoji joined into one | P10. The list is a prototype constraint, not product policy (owner instruction, section 5) |
| F2 | An emoji written against a word, with no space | P10 |
| F3 | Any number that is not in a cited reference, however ordinary | P8 is strict by design |
| F4 | A word that can be read as a ruled-out one: "A1" or "Al" where "AI" is ruled out; single letters in a row ("Plan A I think") | P3, P4, P5 |
| F5 | An inflection of a different word: "scared" where "scar" is ruled out | P1 |
| F6 | A hashtag that starts or ends with a short ruled-out word ("#Winter" for "win"), or in which a run of capitals spans two words ("#SaaSOps" for "so") | P6 |

Required of every such refusal: it names the rule and the term or character, so that the draft can be revised. No rate of false positives is required or promised.

## 4. How this contract is to be verified

By independent review of the code and tests at an exact commit. For each requirement the reviewer says: satisfied, with the evidence; not satisfied, which is a violation; or not verified. A behaviour listed in section 5 is a limitation, not a violation. A behaviour that contradicts a requirement of section 2 and is not in section 5 is a violation, whether or not a test covers it.

## 5. Known limitations, accepted and not remediated

The owner's words: "These findings are accepted as documented limitations of pattern screening, not declared remediated." Each of these passes screening today. None is required to be detected. Sources are the review records in `docs/review/`; E-numbers are those of `harness/state/GATE_STATE.md`.

| | Limitation | Example that passes | Source |
|---|---|---|---|
| L1 | Quantities written in words outside the shapes of P8(c) | "Nine of ten clients renewed", "Forty clients renewed", "Revenue grew fourfold", "Cut costs in half" | E1; rated high by its reviewer |
| L2 | A letter repeated for emphasis | "FREEEE", "scammm" | E2; rated high |
| L3 | A letter masked with a star or an underscore | "sc*m", "fr_e" | E3 |
| L4 | A word hyphenated across a line break | "guar-" at a line's end, "antee" on the next | E4 |
| L5 | Digit substitutions outside `SYMBOL_READING`: 9, 6 and 2 for letters | "9uarantee" | E5 |
| L6 | A word written the way a number is written (the exception in P3) | "8357" for "best", "4.1" for "AI", "101" for "lol" | E6 |
| L7 | Contraction ambiguity: a word that reads as a listed contraction is read only as that contraction | "he'\|\|" for "hell", "w3'll" for "well", "it's-free" for "it" | E10 |
| L8 | Endings outside P1: a three-letter term with "-es" after a letter that is not a hissing sound; some endings of three-letter terms that end in "e" | "feees" for "fee"; "used" for "use" | E7, E11 |
| L9 | A term looked for as written (P7) when it is spaced; a contraction joined to another word by an underscore | "C ++"; "can't_lose" | E7 |
| L10 | Two ordinary letters drawn to look like one; brackets for "c" | "rn" for "m", "vv" for "w" | Threat model |
| L11 | A term of several words where one word needs a closing "!" read as a letter and another needs it left off | — | Threat model |
| L12 | A short term run together inside a lower-case hashtag | "#my_aitool" | Regression review of `184f687` |
| L13 | A figure dressed as a date; a comparison without a number; a claim the model did not mark as needing evidence | "in 1950."; "far faster than rivals" | Threat model |
| L14 | Pictures that show a figure or are a flag on most devices, among those allowed | the first-place medal, the calendar, the chequered flag | E9 |
| L15 | Anything that depends on meaning: a synonym, a rephrasing, an implication, a misleading but literally true claim, a claim that is false | "costs nothing" where "free" is ruled out | By design |

This list is what is known. It is not claimed to be complete: every review so far has added to it.
