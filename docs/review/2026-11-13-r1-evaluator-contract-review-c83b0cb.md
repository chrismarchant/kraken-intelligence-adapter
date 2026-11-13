# R1 — independent review of the evaluator at c83b0cb against the proposed acceptance contract

| | |
|---|---|
| Code commit reviewed | `c83b0cbd0134eb224552b73e52a43b7111cde721`. The reviewer's worktree was at the records-only commit `f01734c`; it confirmed the code there is identical to `c83b0cb` |
| Standard | `docs/spec/EVALUATOR-ACCEPTANCE-CONTRACT.md` (PROPOSED) as it stood at `f01734c`, with `docs/decisions/OD-21-EVALUATOR-POLICY.md` |
| Scope | The screening code in `src/evaluation/**` and its uses in the workflow service, assembly, the comparison document, the operator display and the MCP evaluate tool. Not the gate, the store, signing or the gateway except where they touch screening |
| Reviewer | Independent agent, Opus tier, no part in writing the code or the contract, had not seen either before (`independent-review-agent-26`). Commissioned inside this programme's sessions under the owner's reconciliation instruction of 2026-11-13; identity declared by the orchestrator. It was told it was not being asked to approve, and to find where contract and code disagree |
| Verdict | **changes-requested.** "Several section-2 requirements are contradicted by the code without being listed in section 5. The contract also makes false statements about the code, so as written it is not yet a sound standard." |

**This record is a transcription by the orchestrator, condensed from the reviewer's report. The verdict is the reviewer's and is given as it was given. No remediation has been undertaken: the owner's instruction forbids a repair cycle, and work was paused by the owner's audit instruction when this report arrived.**

## What holds

"The core controls. An ineligible or unevaluated draft cannot be requested, confirmed, assembled or released. A stored evaluation cannot make a draft approvable. Stored drafts are byte-identical after evaluation. There is no JEV path."

Satisfied, with evidence: EC-1.1 to 1.3 (3,000 seeded drafts, two calls each and two processes, identical); EC-2.1, 2.3, 2.5; P1, P2 (all 505 allowed letters fold to plain ones), P4, P5, P6, P7, P8(b), P8(c), P9, P10, P11; EC-4.1, 4.2, 4.3; EC-5.4; EC-6.1 to 6.6; EC-7.1, 7.2, 7.4 to 7.7; the 1,500 ms bound of EC-7.3 (worst 530 ms at the contract's maximum sizes).

## Violations

| # | Requirement | Severity | Finding | Minimum change the reviewer names |
|---|---|---|---|---|
| V1 | EC-4.4 | medium; **blocking** | Reasons reproduce text they should name or quote exactly. A claim containing Cyrillic letters that look like "AI", or a flag, is quoted into the reason and reaches the editor unescaped; digits of another script are reproduced; "1,053" is quoted as "1053" and spelled quantities are lower-cased; a claim cut at 200 units can leave half a character | **Code**: quote through one helper that writes characters outside the allowed list as code points and cuts by whole characters |
| V2 | P8(a) | low | "In a hashtag every digit counts" is not true of clock times: "#9am", "#12PM" raise nothing | Code, or contract wording |
| V3 | P3 | medium; **blocking until the contract wording is fixed** | The readings are applied to a whole text at once, not word by word or symbol by symbol as the contract says. "\|\|\|ega\|" (illegal), "fr€€ t!!p" (free tip), "$€€!!ng" (seeing) pass. Not in L1 to L15 | **Contract**: say the readings apply uniformly to the whole text; add the class to section 5 |
| V4 | EC-5.1, 5.2, 5.3 | medium; **blocking**, "because this is the owner's behaviour 4" | Text shown to editors and agents implies more than screening does. The operator tool prints "Passes the mandatory constraints checked by code." unqualified. The evaluation's limitations say nothing about screening missing disguised terms or figures. The skills catalogue, served by a tool, says look-alike characters make a draft ineligible (false for allowed ones) and that every figure must be in digits (while L1 passes). The instance template and README do not say what screening is. "Eligible" is defined nowhere an editor or agent sees it | **Code strings**: one limitation sentence in every evaluation and in the operator display; correct two catalogue lines |
| V5 | EC-2.4, second sentence | low | The comparison document shows the stored eligibility: after a store write a draft with a ruled-out word is shown "Eligible: yes". Approval is still refused | Code, or limit the sentence to the four control points |
| V6 | EC-2 "if and only if"; EC-3 "only these" | low; a defect of the contract | The code refuses more than P1 to P7 define: "flies" for "fly"; "We hit 101!" for "lol"; "b££r" for "beer"; "O'Neil" for "neil"; "example.com" for "com"; "v2.4.1" for "AI" | **Contract**: "at least", and describe these readings |
| V7 | EC-7.3 | low; not blocking | Time is quadratic on runs of number words, though within the bound | Keep only the absolute bound, or cap a repetition in the code |
| V8 | EC-2.2; section 3 | low | A refusal for text not in canonical form gives one reason for a double space, a trailing space, a tab, "…", "™" and a no-break space, and names no character. Normally unreachable: model text is put in canonical form when a draft is written | Code: name the first differing character |
| V9 | Statements of fact in the contract | low | The register it cites did not exist at the commit reviewed (it was committed afterwards, in `bc0b8c3`). "Each of these passes screening today" is false for L5, L6 and one L7 example: the term is missed but the draft is refused by the figure rule unless the digits are backed | **Contract**: correct both |

By the reviewer's account: V2, V3, V6, V7 and V9 need contract wording only. **V1 and V4 need small changes to output strings in the code**, and "both are required by the owner's own behaviours ('preserve the exact draft content', 'without implying compliance'), so rewording would weaken the contract."

## Limitations

Reproduced: L1 to L4, L7, L8 to L15; L5 and L6 with the correction in V9. New ways round the rules, not listed: the combined readings of V3; an allowed picture standing for a letter in a spelled-out run ("b ● s s"); a short term inside an all-capitals hashtag ("#HIGHROINOW"); spelled quantities with an accent, a stand-in or a per-cent sign ("Fifty perc€nt"); a figure passed off as a clock time or behind an identifier ("12 PM roles", "SOC 5000 customers").

## False positives and the character list

- Refused under the strict number rule: numbered lists, dates ("12 March"), prices ("£49"), ranges, phone numbers, "20°C", versions, "S3", "H1", "Web3", "G7", "1st". "This affects almost any commercial post."
- Refused as look-alikes: "Al Smith" (AI), "#Winter", "#SaaSOps", "v2.4.1". Reasons name the term but not the word that matched, which makes revising harder.
- Cannot be written: any non-Latin script; currency signs beyond € £ ¥ ¢ $; flags, skin tones, joined emoji, keycaps, and every emoji outside about 90; an emoji against a word, even after punctuation ("Done!🎉"). Hashtags are ASCII-only by the data contract, so "#Zürich" is impossible.
- On the list itself: the medal, calendar and chequered flag contradict the file's own statement that no listed picture is a figure or a flag.

## The contract itself

Faithful to the owner's six behaviours, and honest that section 5 is incomplete. But: false statements about the code (V2, V3, V6, V7, V9); circular definitions that cannot fail (P8(c) and the clock and date forms defined by the code's own lists; "secret-shaped" by the code's patterns; "a statement of its limitations" satisfied by any list); and two things presented as limitations of pattern matching that are not (the reliance on the drafting model's own flag for which claims need evidence; the three pictures on the list). "It cannot be accepted as written."

## Tests

`npm run check` exit 0: 289 of 289 and 83 of 83. Secret scan clean. Between `e30451c` and `c83b0cb` no evaluator test was weakened or removed. Gaps: no test covers the re-check at confirmation or at assembly, the byte-identity of drafts after evaluation, EC-4.4, or the comparison document's use of stored eligibility.

## Not verified by the reviewer

Timing on other hardware; a pass through the MCP tool in a live server process; the operator tool's display as run (read in code, since running it needs a key); random disguise sweeps of the size earlier reviews ran.

## Evidence

`docs/gates/evidence/review-26-r1-evaluator-c83b0cb/`.
