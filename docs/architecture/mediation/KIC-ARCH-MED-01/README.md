# KIC-ARCH-MED-01 — Architecture mediation

Requested by the Project Owner on 2026-11-13 (`docs/spec/directives/KIC-ARCH-MED-01-2026-11-13.md`). **For owner review. Nothing here is accepted, and nothing here was implemented.**

## The answer

Do not add OpenDuet, OpenDots or OpenMuse. The capabilities the directive hoped they would bring — persistent tasks, proactive work, specialist agents with hand-off, approvals, audit — are already in OpenBot's own core. Inside OpenBot, "OpenDuet" and "OpenDots" are display skins that add no capability. As separate repositories, OpenDuet is a diverged fork of an old OpenBot, and OpenDots and OpenMuse are separate single-owner applications that would each be a second runtime. Channels is a messaging layer with no publishing, useful later and only for notification and conversation.

Keep OpenBot, unmodified and pinned to a release, as the workspace. Keep this repository's MCP server as the one boundary, with editorial decisions signed outside OpenBot. Keep every external business action with Kraken.

Two things stand between this and a working system, and neither is architecture: OpenBot has never been run by this programme, and the licence a client-owned production instance needs is not confirmed.

## Documents

| | Document | Contents |
|---|---|---|
| D1 | [Current architecture baseline](D1-current-baseline.md) | What exists in this repository, checked against code |
| D2 | [Ecosystem capability matrix](D2-ecosystem-capability-matrix.md) | OpenBot, OpenDuet, OpenDots, OpenMuse and Channels, from source |
| D3 | [Gap and opportunity report](D3-gap-and-opportunity.md) | Sixteen ranked findings; redundancy check |
| D4 | [Recommended target architecture](D4-target-architecture.md) | Diagram, ownership table, options A–C, future interface |
| D5 | [Decision package](D5-decision-package.md) | Thirteen proposed records; who decides each |
| D6 | [Phased roadmap](D6-roadmap.md) | Phases 0–3 with dependencies, acceptance, risks, effort |
| D7 | [Proof-of-integration plan](D7-proof-of-integration-plan.md) | Seven demonstrations, safety limits, pass criteria |

## Handback

| # | Question | Answer |
|---|---|---|
| 1 | What the existing architecture already does correctly | One typed boundary (the MCP server) in front of all campaign work. No capability to publish, spend or contact. Editorial decisions signed by a key the agent runtime does not hold — nothing in the five projects offers this. Budgets enforced before a model is called. One instance per client. Learned and remembered content never authoritative. (D3, last section) |
| 2 | What was overlooked | Mostly inside OpenBot itself: tasks, routines, event triggers, proactive check-ins, hand-off between Bots, per-Bot grants, an approval gateway, an append-only audit. Also three constraints: every project requires CopilotKit Intelligence; OpenBot's personal and team editions differ sharply (memory, channels, isolated agents, learned-skill approval); nobody in the ecosystem provides exactly-once external effects. (D2, D3 findings 2, 3, 5, 10) |
| 3 | What should be adopted | OpenBot's native capabilities, by configuration: specialist Bots with per-Bot grants; routines and check-ins that propose and never decide; OpenBot's approvals as a second line for tool permissions; its audit. Skins as a display choice. Channels later, narrowly. Three patterns from the excluded projects where useful. (D4) |
| 4 | What should stay excluded | OpenDuet the fork; OpenDots standalone; OpenMuse — as runtimes and as imported code. Remote Bots (their own tools bypass OpenBot's approval policy). Any decision or release over a channel. A separate control plane. Live JEV. (D5 P4, P5) |
| 5 | What architectural changes are required | None to the structure. Additions by configuration (specialists, routines) once OpenBot runs; two new contracts later (receipt, feedback event); instance defaults; pin to a release tag. The foundation decision still has to be made. (D4, D5) |
| 6 | What can be done now without violating gates | Documents and corrections; proposals in the instance template; a read-only audit of OpenTag; the licence questions for CopilotKit; scratch experiments. Not: tenant-package changes, new contracts, running OpenBot on a paid licence, any channel. (D5, last two sections) |
| 7 | Decisions for the owner | In order: licence and edition (P7, OD-8); foundation (P1, OD-1) with the environment and key (OD-7); one owner of business actions (P2); exclusions (P4); a further review of the approval path (OD-11); channels (P5); port and feedback (P8, P9); wording, name, plan decision (P10–P12). (D5) |
| 8 | Recommended next instruction | Authorise Phase 0 and the Phase 1 proof (D7) at a pinned OpenBot release, by providing an Intelligence key or local evaluation licence and an environment with Docker, and by putting the licence questions to CopilotKit in writing. Commission the approval-path review from a reviewer outside this programme's sessions. |

## Four points where the directive and the records differ

Recorded, not resolved. Each is a decision in D5.

| | Directive | Records | Handled as |
|---|---|---|---|
| Name | "Kraken Intelligence Core" | "Kraken Intelligence Companion" | Nothing renamed (P11) |
| Origin | An intelligence architecture "developed primarily from OpenBot" | No OpenBot code here; OpenBot never run; foundation decision open | Reported as it is (D1) |
| Safeguards | "Exactly-once business-action safeguards" | Kraken does not claim exactly-once external execution | Kraken's wording used (P10) |
| Execution | OpenBot as the foundation for execution | This side prepares; Kraken executes | OpenBot does agent work; Kraken owns business actions (P2) |

## How this was done, and its limits

- Five read-only source audits, one per project, run in parallel by separate agents; the claims that drive the recommendation were re-read by the orchestrator. The baseline was checked against this repository's code and ledgers.
- **Nothing upstream was built, installed or run.** Every upstream statement is about source and documents, not behaviour.
- OpenTag was not available to audit. The server side of CopilotKit Intelligence and its licence text are not public in these repositories.
- The diagrams were checked by reading; they were not rendered.
- Upstream moves quickly. These findings are as of the commits named in D2.
- The documents name Proteus and Metis and describe programme structure. This repository is public (OD-4).
- Independent review of this package: see `docs/review/` for the record bound to the commit that added it.
