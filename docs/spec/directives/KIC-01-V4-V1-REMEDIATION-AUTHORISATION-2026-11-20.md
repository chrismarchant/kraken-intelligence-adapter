# Owner authorisation of 2026-11-20: remediation of R1 findings V4 and V1 under KIC-01

Stored as given. On 2026-11-20 the owner set a session goal, "complete as much of this build as you can in 4 hours". The orchestrator found the KIC-01 gate stop in force, no owner decision recorded since `04d6d18`, and an empty runnable queue, and put three questions to the owner in the session. The questions, the options offered and the owner's answers follow, verbatim.

## 1. The gate stop

**Question.** KIC-01 is still under its gate stop, which only you can clear. What does this 4-hour goal authorise for product code?

| Option | Description as offered |
|---|---|
| **V4 then V1 only (Recommended)** | You authorise clearing the KIC-01 stop for this session. I remediate V4 (wording) and then V1 (safe rendering of failure reasons) through the Mistral runner with tests, leave the R2-approved files untouched, and re-raise the stop at the end for your decision. |
| Preparation only | The stop stays. No product path changes. I revise the proposed evaluator contract, document the numeric and Unicode policies, finish the KIC-01A/01B split proposal, and keep any candidate patches outside the product tree as proposals. |
| All code-side findings | As the first option, plus the code-side remedies for V2, V5, V7 and V8 where the reviewer named code as the fix. Larger change set; more review needed. |

**Answer: "V4 then V1 only (Recommended)".**

## 2. The delegate budget

**Question.** The Mistral runner refuses to work without a budget you set, and the only one defined is the spent proof budget. What ceiling do I record for this window?

| Option | Description as offered |
|---|---|
| **20 calls / 120k tokens (Recommended)** | Up to 20 calls and 120,000 output tokens on mistral-large-4-0. The proof used 500 tokens for a 23-line file, so this leaves room for retries on real TypeScript changes. |
| 10 calls / 60k tokens | A tighter ceiling: enough for V4 and V1 if each lands within one or two attempts. |
| No budget | No delegation this session. I will not write product code myself, so code work stops and only documents and harness records move. |

**Answer: "20 calls / 120k tokens (Recommended)".**

## 3. Review

**Question.** KIC-01 requires an independent review bound to each new commit. Opus needs your escalation under the routing policy. Who reviews remediation commits in this window?

| Option | Description as offered |
|---|---|
| **Opus, 2 launches (Recommended)** | You grant an escalation for two Opus reviewer launches: one review of the remediation and one re-review if it requests changes. Recorded in the ledger with this answer as the owner reference. |
| Haiku check only | A Haiku-pinned read-only check. Cheaper, but I would record it as a light check, not as the independent review the gate requires. |
| No review this session | Commits are recorded as unreviewed and the gate stays not ready until you commission a review. |

**Answer: "Opus, 2 launches (Recommended)".**

## What this authorises, and what it does not

- Clearing the gate stop on KIC-01 for this session; changes to product code for **V4 and V1 of review R1 only**, written by the delegate model through `harness/scripts/delegate.mjs`; a delegate budget of 20 calls and 120,000 output tokens; two launches of an Opus reviewer.
- It does not accept KIC-01 or any other gate. It does not authorise V2, V3 or V5 to V9, changes to `src/workflow`, `src/gateway` or `src/limits.ts` (the lines review R2 approved), KIC-02, OpenBot, JEV, a merge or a deployment. The contract `docs/spec/EVALUATOR-ACCEPTANCE-CONTRACT.md` remains proposed and not accepted.
- The stop is raised again at the end of the session, for the owner's decision.
