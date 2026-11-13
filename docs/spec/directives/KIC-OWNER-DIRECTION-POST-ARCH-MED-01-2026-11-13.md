# Owner direction following ARCH-MED-01 — 2026-11-13

**Verbatim text of the Project Owner's direction**, as given in the session after the mediation handback.

> KIC — Owner Direction Following ARCH-MED-01
>
> The architectural recommendation is provisionally accepted, subject to independent review of the corrected D1–D7 package.
>
> **Authorised decisions**
>
> 1. Retain OpenBot as the preferred, unmodified workspace candidate, conditional on licensing, runtime verification and confinement.
> 2. Retain the standalone KIC MCP service as the authoritative campaign-preparation boundary.
> 3. Confirm Kraken as the sole authority for external commercial execution.
> 4. Exclude standalone OpenDots, OpenDuet and OpenMuse runtimes from KIC. Their use elsewhere remains unrestricted by this decision.
> 5. Defer Channels integration. Permit read-only OpenTag/Channels assessment.
> 6. Use the name Kraken Intelligence Companion consistently, without undertaking unnecessary repository renaming.
>
> **Immediate priorities**
>
> Complete the sixth independent code review, OpenTag audit and OpenBot v1.0.2 release-tag comparison already underway.
>
> If the code review requests changes, remediate the findings and obtain a new independent review against the resulting exact commit.
>
> Commission an independent approval-path security review covering editorial signing, key isolation, MCP arguments, revision binding, replay protection, permission escalation, direct provider access and spend-limit bypass.
>
> Produce a confinement test matrix distinguishing application configuration, operating-system/container isolation, network restrictions, credential separation and server-side authorisation.
>
> The test matrix must include negative tests and must not claim enforcement where only a proposed control exists.
>
> **OpenBot acceptance**
>
> Do not authorise production adoption until the selected release has passed the actual runtime, Mistral streaming, persistence, tool-execution and confinement tests.
>
> Do not infer release capabilities from upstream main.
>
> CopilotKit licensing remains an owner-reserved decision. Do not initiate paid services or external communications.
>
> **Engineering continuity**
>
> Continue independently authorised KIC implementation, regression testing, CI, documentation and evidence generation.
>
> Do not modify Kraken or JEV repositories, enable live publishing or bypass mandatory reviews.
>
> Use local stops for unavailable credentials or infrastructure. Keep unrelated authorised work progressing.
>
> **Next handback**
>
> Report the sixth review outcome, exact reviewed SHA, OpenTag findings, release-tag differences, confinement test matrix, unresolved owner decisions and the next executable work queue.
>
> Distinguish independently verified results from source-inspected claims and proposed controls.

## How it is recorded

| Decision | Register entry | Status |
|---|---|---|
| 1 | OD-1 | Decided, provisionally and conditionally. Not production adoption |
| 2 | OD-1 (boundary) | Decided |
| 3 | OD-12 | Decided |
| 4 | OD-13 | Decided |
| 5 | OD-14 | Decided: deferred; read-only assessment permitted |
| 6 | OD-18 | Decided |

The provisional acceptance is subject to an independent review of the corrected package; that review's record is in `docs/review/`. Licensing (OD-8, OD-15) stays with the owner. No gate is accepted by this direction.
