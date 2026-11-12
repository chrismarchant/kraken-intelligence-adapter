# Gate state

| Gate | Status | Evidence |
|---|---|---|
| KIC-00 Foundation and feasibility | **Report presented. Awaiting owner approval.** | `docs/gates/KIC-00-REPORT.md` |
| KIC-01 Independent runtime proof | Not authorised. Blocked on OD-1. | — |
| KIC-02 Model and skills integration | Not authorised. | — |
| KIC-03 Comparative intelligence | Not authorised. | — |
| KIC-04 Commercial campaign preparation | Not authorised. | — |
| KIC-05 Template deployment proof | Not authorised. | — |
| KIC-06 Kraken integration | Deferred by directive; needs separate authorisation. | — |

## Standing restrictions

| Item | State |
|---|---|
| JEV execution | **Disabled.** Credential present in the session environment; no decision endpoint called. |
| CopilotKit Intelligence | Not used, not configured. |
| Upstream code imported | None. |
| Infrastructure provisioned | None. |
| Global stop | Not raised. |

## Open exceptions

| ID | Item | Unblocks when |
|---|---|---|
| X1 | `aeh` and `mistral-code-review-bot` not inspected (access refused in session) | OD-2 |
| X2 | "DeepSeek Harness" repository not identified | OD-2 |
| X3 | No operational independent review service (Mistral bot suspended upstream; Codex credential rejected) | OD-5 |
| X4 | Repository has no `main`, no protection, no CI; no pull request can be opened | OD-4 |
| X5 | Model unit prices unverified | OD-6 |
| X6 | Founding directive not yet stored verbatim in `docs/spec/directives/` (to be added from the owner's original file, not retyped) | owner supplies the file, or asks the agent to commit the session text |
| X7 | Transitive licence scan of CopilotKit / AG-UI dependencies not done | before any import, in KIC-01 |
| X8 | Sub-agent tiers, Docker daemon, GitHub Actions not exercised | first use |

Owner decisions: `docs/decisions/OWNER_DECISIONS.md`.
