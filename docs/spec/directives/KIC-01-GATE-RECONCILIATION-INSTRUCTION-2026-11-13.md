# KIC-01 gate reconciliation and acceptance restructuring — owner instruction of 2026-11-13

Received from the Human Owner on 2026-11-13, after the handback that recorded KIC-01 as BLOCKED / NOT READY at code commit `c83b0cb`. Stored verbatim. **It authorises assessment, documentation and independent review only. It does not accept any gate, clear the gate stop, or authorise a change to product code.**

> KIC-01 — Owner Instruction: Gate Reconciliation and Acceptance Restructuring
>
> Authority: Human Owner
> Baseline code: "c83b0cbd0134eb224552b73e52a43b7111cde721"
> Baseline records: "e7767ab"
> Current gate: BLOCKED / NOT READY
>
> Mission
>
> Execute a bounded, evidence-led reconciliation of KIC-01's acceptance requirements.
>
> Resolve the evaluator's acceptance-contract ambiguity (OD-21), obtain independent review coverage for the outstanding 72-line delta (R2), and prepare a formal proposal to separate standalone KIC acceptance from OpenBot runtime integration.
>
> This instruction authorises assessment, documentation and independent review only. It does not authorise product-code changes, deployment, merging, gate acceptance or clearing the existing stop.
>
> 1. OD-21 — Evaluator acceptance contract
>
> Adopt the following owner policy for the proposed revised acceptance contract:
>
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
>
> Prepare the revised OD-21 decision record and an explicit evaluator acceptance contract.
>
> 2. Independent evaluator review — R1
>
> Commission one independent review of the evaluator at "c83b0cb" against the revised, documented contract.
>
> The reviewer must:
>
> - Evaluate the actual implementation and existing tests.
> - Confirm which requirements are demonstrably satisfied.
> - Distinguish known limitations from violations of the revised contract.
> - Check whether any existing behaviour contradicts the proposed contract.
> - Assess false-positive behaviour and the implications of the character allow-list.
> - Produce an explicit, scoped verdict with reproducible evidence.
>
> Do not instruct the reviewer to approve.
>
> If the revised contract cannot be satisfied without implementation changes, report the discrepancy as blocking. Do not remediate automatically.
>
> 3. R2 — Independent delta review
>
> Commission a separate, narrowly scoped review of:
>
> "git diff e30451c c83b0cb -- src/workflow src/gateway src/limits.ts"
>
> Review the 72 changed lines identified in the acceptance package:
>
> - 53 lines in "requestDecision".
> - 13 lines in gateway charging for failed requests.
> - Six comment lines.
>
> Verify that the delta preserves previously reviewed guarantees concerning editorial approval, signing integrity, revision binding, spend accounting, concurrency and MCP boundary behaviour.
>
> Issue a distinct verdict for this delta, independent of the evaluator's outcome.
>
> Do not substitute earlier statements that claims were held for an approving verdict.
>
> 4. Proposed gate restructuring
>
> Prepare a formal owner-decision proposal separating:
>
> KIC-01A — Standalone Companion Acceptance
>
> Scope: standalone MCP service, campaign preparation, deterministic screening under OD-21, editorial workflow, signing, provisional non-executable commands, persistence, gateway and spend controls.
>
> Acceptance requires:
>
> - A satisfactory independent evaluator review against the revised contract.
> - A satisfactory independent R2 delta review.
> - Reconciled review coverage for all required standalone capabilities.
> - Passing commit-bound tests, CI and security checks.
> - Explicit recording of limitations and residual risks.
>
> KIC-01B — OpenBot Integration Proof
>
> Scope: selected OpenBot release, CopilotKit Intelligence, identity, persistence, Mistral Large 4 streaming and tool execution through the shim, MCP attachment, runtime confinement and licensing.
>
> Preserve C1, C2 and C3 as unfulfilled requirements.
>
> Record OD-7, OD-8, OD-15 and OD-20 as prerequisites.
>
> No OpenBot deployment, integration or provisioning is authorised.
>
> Do not implement the split as an accepted gate structure. Submit it for owner approval.
>
> 5. Internationalisation decision
>
> Record the existing 694-character allow-list as a temporary prototype constraint, not an approved permanent commercial product policy.
>
> Document:
>
> - Excluded scripts and multilingual use cases.
> - Unsupported emoji and character sequences.
> - False-positive consequences.
> - Security rationale.
> - Options for a future Unicode-aware screening architecture.
>
> Do not broaden or replace the character policy in this phase.
>
> 6. Security and governance boundaries
>
> Preserve the following restrictions:
>
> - Kraken remains the sole authority for external commercial execution.
> - No publishing, outreach, advertising or client spending.
> - No real signing keys or client data.
> - No live JEV activation.
> - No Channels integration.
> - No changes to Kraken, Metis, Proteus or upstream repositories.
> - OD-11 remains open for an external approval-path security assessment before real-client use.
> - No licence purchases or external communications without owner approval.
>
> The existing KIC-01 gate stop remains active throughout.
>
> Documentation and review artefacts may be committed and pushed where permitted by the harness. Do not bypass permissions or alter the gate mechanism to make changes possible.
>
> 7. Required deliverables
>
> Produce:
>
> 1. OD-21 Decision Record — revised evaluator responsibilities and accepted limitations.
> 2. Evaluator Acceptance Contract — explicit, independently testable requirements.
> 3. R1 Independent Review Report — exact SHA, scope, evidence and verdict.
> 4. R2 Delta Review Report — exact SHA, diff coverage, evidence and verdict.
> 5. KIC-01A / KIC-01B Gate Split Proposal — scope, dependencies, acceptance criteria and migration of existing evidence.
> 6. Updated Risk and Internationalisation Register — known limitations and future remediation options.
> 7. Owner Decision Package — concise recommendations and any unresolved blockers.
>
> Update the existing evidence and task ledgers without overwriting historical findings.
>
> 8. Completion and stop condition
>
> The phase is complete when both independent reviews have reported, the proposed gate restructuring is documented, and the owner-decision package is ready.
>
> If either review requests changes, record the finding and its minimum remediation. Do not initiate another repair cycle.
>
> Do not mark KIC-01, KIC-01A or KIC-01B accepted or ready for acceptance solely because these deliverables exist.
>
> Do not start KIC-02, clear the gate stop, modify product code, merge or deploy.
>
> Deliver one consolidated handback containing the review verdicts, evidence references, proposed gate structure, unresolved risks and exact decisions requiring owner approval.
>
> Then stop at the owner-decision boundary.

## How the orchestrator reads it

- The code assessed stays fixed at `c83b0cbd0134eb224552b73e52a43b7111cde721`. Nothing under `src/`, `tests/`, `fixtures/` or `tenant-package/` is changed in this phase, whatever the reviews find.
- The owner's policy on OD-21 is adopted as stated, "for the proposed revised acceptance contract". The contract written from it is a proposal; so is the gate split. Neither is in force until the owner says so.
- The gate stop on KIC-01 stays. `harness/config/gates.json` is not edited. KIC-01A and KIC-01B are not added to the gate map.
- A review that requests changes is recorded with its minimum remediation. No repair cycle follows.
