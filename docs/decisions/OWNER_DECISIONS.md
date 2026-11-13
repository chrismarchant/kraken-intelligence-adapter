# Owner decision register

Status values: OPEN, DECIDED (with date and the owner's words), WITHDRAWN. The absence of a response is not a decision.

| ID | Decision | Recommended | Alternatives | Blocks | Status |
|---|---|---|---|---|---|
| OD-1 | Workspace foundation | **Reopened 2026-11-13 by the owner.** Adopt the complete OpenBot application unmodified with licensed Intelligence, extended by tenant package + KIC MCP server + model shim, conditional on C1–C3 in `docs/gates/KIC-01-ASSESSMENT.md` | Minimal MIT primitives (fallback) | all implementation | OPEN — awaiting formal acceptance |
| OD-2 | Read access to `aeh` and `mistral-code-review-bot`; URL of "DeepSeek Harness" | Grant | Proceed from Kraken's pattern only | AEH beyond stage 0 | OPEN |
| OD-3 | JEV's role and governing gate | Evaluator only (it is a decision model, it does not generate); stays disabled; name the gate that governs activation | — | KIC-03 JEV adapter going live (not the mock) | OPEN |
| OD-4 | Repository visibility; `main`, default branch, protection | Private; create and protect `main` | Stay public with content restrictions | pull requests; any commercial content | OPEN |
| OD-5 | Independent review mechanism | Interim independent Opus-tier agent review bound to commit SHA; Mistral bot once fixed and controlled-tested; Codex or alternative before KIC-06 | Wait for the bot | every gate that requires independent review | OPEN |
| OD-6 | LLM gateway identity; spend ceiling for KIC-01..04 | Name the gateway, or approve direct Mistral API behind KIC's own interface; set a ceiling | — | KIC-02a (provisional without it) | OPEN |
| OD-7 | Means to run the full application | Create a free hosted Intelligence project and add its API URL, gateway URL and key as environment secrets; provide an environment with Docker (or approve building pgvector) | Run the proof on the owner's own machine | KIC-01 C1, C2 | OPEN |
| OD-8 | Licence confirmation | Put the four questions in the assessment §8 to CopilotKit in writing | Assume PAYG applies (not recommended) | production use; firm adoption of OD-1 | OPEN |

Full reasoning: `docs/gates/KIC-00-REPORT.md` §I and `docs/gates/KIC-01-ASSESSMENT.md`.
