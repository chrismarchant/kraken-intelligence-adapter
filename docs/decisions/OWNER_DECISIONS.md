# Owner decision register

Status values: OPEN, DECIDED (with date and the owner's words), WITHDRAWN. The absence of a response is not a decision.

| ID | Decision | Recommended | Alternatives | Blocks | Status |
|---|---|---|---|---|---|
| OD-1 | Workspace foundation | Build on MIT CopilotKit runtime v2 + React core v2 + AG-UI; lift individual OpenBot components only with provenance | (a) strip the OpenBot application; (b) AG-UI with own UI, no CopilotKit | KIC-01 | OPEN |
| OD-2 | Read access to `aeh` and `mistral-code-review-bot`; URL of "DeepSeek Harness" | Grant | Proceed from Kraken's pattern only | AEH beyond stage 0 | OPEN |
| OD-3 | JEV's role and governing gate | Evaluator only (it is a decision model, it does not generate); stays disabled; name the gate that governs activation | — | KIC-03 JEV adapter going live (not the mock) | OPEN |
| OD-4 | Repository visibility; `main`, default branch, protection | Private; create and protect `main` | Stay public with content restrictions | pull requests; any commercial content | OPEN |
| OD-5 | Independent review mechanism | Interim independent Opus-tier agent review bound to commit SHA; Mistral bot once fixed and controlled-tested; Codex or alternative before KIC-06 | Wait for the bot | every gate that requires independent review | OPEN |
| OD-6 | LLM gateway identity; spend ceiling for KIC-01..04 | Name the gateway, or approve direct Mistral API behind KIC's own interface; set a ceiling | — | KIC-02a (provisional without it) | OPEN |

Full reasoning: `docs/gates/KIC-00-REPORT.md` §I.
