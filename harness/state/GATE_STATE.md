# Gate state

| Gate | Status | Evidence |
|---|---|---|
| KIC-00 Foundation and feasibility | **Report presented. Awaiting owner approval.** | `docs/gates/KIC-00-REPORT.md` |
| KIC-01 Runtime proof | **Bounded feasibility assessment presented (owner-authorised 2026-11-13). Implementation not authorised.** OD-1 reopened: complete OpenBot with licensed Intelligence is the preferred candidate. Conditions C1–C3 open. | `docs/gates/KIC-01-ASSESSMENT.md` |
| KIC-02 Model and skills integration | Not authorised. | — |
| KIC-03 Comparative intelligence | Not authorised. | — |
| KIC-04 Commercial campaign preparation | Not authorised. | — |
| KIC-05 Template deployment proof | Not authorised. | — |
| KIC-06 Kraken integration | Deferred by directive; needs separate authorisation. | — |

## Standing restrictions

| Item | State |
|---|---|
| JEV execution | **Disabled.** Credential present in the session environment; no decision endpoint called. |
| CopilotKit Intelligence | Permitted under a legitimate licence (owner clarification 2026-11-13). Not yet configured: no project key in the environment. Its memory and learned skills are never authoritative for contracts, permissions or approved skills. |
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
| X9 | Full OpenBot boot not proven: no Intelligence project key; no pgvector or Docker daemon in the session environment | OD-7 |
| X10 | Mistral Large 4 through OpenBot's model client fails as shipped; shim proven for non-streamed calls only | KIC-01 C2 |
| X11 | Licence for a client-owned derived deployment not confirmed by CopilotKit | OD-8 |

Owner decisions: `docs/decisions/OWNER_DECISIONS.md`.
