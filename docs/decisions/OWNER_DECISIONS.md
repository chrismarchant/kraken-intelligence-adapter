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
| OD-9 | Where the editor confirms decisions and releases a programme | Keep both in a separate operator tool that holds the signing key and its ledger (as built: a command-line tool). Decide whether a client instance also needs an operator-facing confirmation page, and who the editor is authenticated as | Let the agent relay a code typed by the editor (rejected by independent review: an agent that can read the operator channel could self-approve) | A usable editorial surface for a real pilot | OPEN |
| OD-10 | Reasoning effort and spend for generation | "low" was used for the recorded run (about 39,000 completion tokens for 8 steps). Confirm "low" as the default, or ask for a quality comparison against "medium" first | Provider default (roughly double the reasoning tokens on the one prompt measured) | Cost per campaign | OPEN |
| OD-11 | A further independent review of the approval controls | Commission one more review of commit `187f029` or later, limited to the editorial-decision path, by a reviewer other than this session's agents if one is available (Codex, the Mistral bot once fixed, or a person). Three review rounds in this session each found new defects; the last fixes are tested but unreviewed | Accept the current state for pilot use on synthetic and internal material only | Any reliance on signed approvals with a real client | OPEN |

## Notes for the owner (not decisions)

- **OD-1** remains open. This session built the parts that do not depend on it. The KIC MCP server and the model shim were exercised with the CopilotKit agent class on its own; they are designed for complete OpenBot too, but nothing has been run inside OpenBot. The tenant package passes OpenBot's validator and has not been loaded by a running OpenBot.
- **OD-2**: read access to `aeh` was refused again in this session. The harness was built from first principles and may duplicate it.
- **OD-3**: no live JEV transport exists in the code. Activation needs new code, a passed security gate and your authorisation.
- **OD-4**: the repository is still public, has no `main`, and has no branch protection. No pull request can be opened until a base branch exists.
- **OD-5**: two independent reviews were run and recorded against commit SHAs. The Mistral Code Review Bot's block-content fix is absent from its default branch; Codex is unavailable.
- **OD-6**: the published price for "Mistral Large" is $0.50 per million input tokens and $1.50 per million output tokens. The page does not say whether that applies to Large 4 or how reasoning tokens are billed. No spend ceiling has been set.

Full reasoning: `docs/gates/KIC-00-REPORT.md` §I and `docs/gates/KIC-01-ASSESSMENT.md`.
