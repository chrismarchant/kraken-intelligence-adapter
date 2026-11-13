# OD-21 — what the evaluator is required to do: decision record

| | |
|---|---|
| Decision | OD-21, the evaluator's rules against disguised text |
| Raised | 2026-11-13, by the orchestrator, after five independent reviews in a row requested changes to those rules (`docs/gates/KIC-01-ACCEPTANCE-PACKAGE.md`, section 6) |
| Owner's ruling | 2026-11-13, in `docs/spec/directives/KIC-01-GATE-RECONCILIATION-INSTRUCTION-2026-11-13.md`, section 1 |
| Status | **Policy adopted by the owner "for the proposed revised acceptance contract".** The contract written from it (`docs/spec/EVALUATOR-ACCEPTANCE-CONTRACT.md`) is a proposal and awaits the owner's approval. No gate is accepted by this |

## The policy, in the owner's words

> The KIC evaluator is a deterministic, pattern-based screening mechanism, supporting mandatory editorial review.
>
> It is not a comprehensive semantic, linguistic or adversarial detector. It must not claim to identify every disguised prohibited term, unsupported numerical assertion or misleading commercial claim.
>
> Its required behaviour is to:
>
> - Apply its documented deterministic rules consistently.
> - Detect the explicitly specified prohibited patterns.
> - Preserve the exact draft content presented to the editor.
> - Report findings without implying that passing screening establishes factual or commercial compliance.
> - Preserve existing editorial signing, revision binding and release controls.
> - Fail safely for invalid or unsupported input according to the documented contract.
>
> Record the known bypass classes, including written-out quantities, repeated letters, masked terms, line-break hyphenation, digit substitutions and contraction ambiguities.
>
> These findings are accepted as documented limitations of pattern screening, not declared remediated.
>
> Do not weaken existing tests, remove detections or alter implementation to achieve approval.

## What the policy changes, and what it does not

| | Before | Under the policy |
|---|---|---|
| What the evaluator is required to do | As the earlier reviews tested it: a ruled-out word or an unbacked figure cannot reach approval in any form a reader can read | Apply a documented set of deterministic rules, detect a specified set of patterns, preserve the draft, imply nothing about compliance, leave the editorial controls intact, fail safely |
| The open findings of the five reviews | Defects that blocked approval | **Documented limitations of pattern screening. Accepted. Not remediated and not declared so** |
| The control against unacceptable content being released | Read as the evaluator | The editor, who is shown every word and signs a digest of exactly what was shown. Screening supports that review; it does not replace it |
| The code | — | **Unchanged.** No test is weakened, no detection removed |
| The review record | — | **Unchanged.** Every changes-requested verdict stands as recorded against the requirement it tested |

## How each of the owner's six requirements is made explicit

| Owner's requirement | Contract section |
|---|---|
| Apply its documented deterministic rules consistently | EC-1 (deterministic and local), EC-2 (the rule catalogue, applied consistently) |
| Detect the explicitly specified prohibited patterns | EC-3 (patterns P1 to P11) |
| Preserve the exact draft content presented to the editor | EC-4 |
| Report findings without implying that passing screening establishes factual or commercial compliance | EC-5 |
| Preserve existing editorial signing, revision binding and release controls | EC-6 |
| Fail safely for invalid or unsupported input according to the documented contract | EC-7 |

## The bypass classes the owner named, and where they are recorded

| Class named by the owner | Contract limitation | Example |
|---|---|---|
| Written-out quantities | L1 | "Nine of ten clients renewed" |
| Repeated letters | L2 | "FREEEE" |
| Masked terms | L3 | "sc*m" |
| Line-break hyphenation | L4 | "guar-" / "antee" |
| Digit substitutions | L5, L6 | "9uarantee"; "8357" for "best" |
| Contraction ambiguities | L7 | "he'\|\|" for "hell" |

The contract records nine more (L8 to L15, and the honest text that is refused, F1 to F6). The list is what is known, not a claim of completeness.

## What still needs the owner

1. Approval of the contract as the acceptance requirement for the evaluator, or changes to it.
2. Whether the character list stays as it is for now (recorded as a temporary prototype constraint: `docs/security/RISK-AND-INTERNATIONALISATION-REGISTER.md`).
3. The decision on the review of the evaluator against this contract, when it has reported (`harness/state/GATE_STATE.md`).

## Consequences to keep in view

- A client or an editor must not be told that screening guarantees the absence of ruled-out words or unbacked figures. The instance template and any editor guidance must say what screening is.
- The editor's reading is the control. An instance in which drafts are approved without being read has no control against the limitations in section 5 of the contract. OD-9 (where the editor confirms) and OD-11 (the external assessment) bear on this.
- A future live evaluator (JEV) would be scoring, not screening. It stays disabled (OD-3).
