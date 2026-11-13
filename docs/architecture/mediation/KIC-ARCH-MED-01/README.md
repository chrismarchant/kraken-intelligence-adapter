# KIC-ARCH-MED-01 — Architecture mediation

Requested by the Project Owner on 2026-11-13 (`docs/spec/directives/KIC-ARCH-MED-01-2026-11-13.md`).

**Status: provisionally accepted by the owner on 2026-11-13**, subject to independent review of the corrected package (`docs/spec/directives/KIC-OWNER-DIRECTION-POST-ARCH-MED-01-2026-11-13.md`). That review is done: approved with corrections, all applied in this version. **Nothing here was implemented, and OpenBot has not been run.** No gate is accepted by this.

## The answer

OpenBot, unmodified at release `v1.0.2`, is the preferred workspace candidate, conditional on licensing, runtime verification and confinement. This repository's MCP server is the authoritative campaign-preparation boundary, with editorial decisions signed outside OpenBot. Kraken is the sole authority for external commercial execution. Standalone OpenDuet, OpenDots and OpenMuse runtimes are excluded. Channels are deferred.

Inside OpenBot, "OpenDuet" and "OpenDots" are display skins that add no capability. As separate repositories, OpenDuet is a diverged fork of an old OpenBot, and OpenDots and OpenMuse are separate single-owner applications. OpenBot itself has more than the earlier baseline recorded — routines, hand-off between Bots with per-Bot grants, an approval gateway, an audit — though less of it fits this product than first appears.

Four things stand between this and a working system, and none is architecture:

1. OpenBot has never been run by this programme.
2. The licence a client-owned production instance needs is not confirmed.
3. It has not been shown that an OpenBot instance can be confined to preparation. Source at `v1.0.2` says the team edition can be (most simply by giving Bots no computer) and the personal edition cannot.
4. At `v1.0.2` the KIC MCP server cannot be attached over a private interface: the release accepts a custom server only over https at a hostname.

Until those are settled, what works is this repository without OpenBot.

## Documents

| | Document | Contents |
|---|---|---|
| D1 | [Current architecture baseline](D1-current-baseline.md) | What exists in this repository, checked against code |
| D2 | [Ecosystem capability matrix](D2-ecosystem-capability-matrix.md) | OpenBot, OpenDuet, OpenDots, OpenMuse and Channels, from source |
| D3 | [Gap and opportunity report](D3-gap-and-opportunity.md) | Nineteen ranked findings; redundancy check |
| D4 | [Recommended target architecture](D4-target-architecture.md) | Diagram, ownership table, options A–C and the no-OpenBot fallback, future interface |
| D5 | [Decision package](D5-decision-package.md) | Fourteen proposals; the owner's decisions on them; who decides the rest |
| D6 | [Phased roadmap](D6-roadmap.md) | Phases 0–3 with dependencies, acceptance, risks, effort |
| D7 | [Proof-of-integration plan](D7-proof-of-integration-plan.md) | Setup and seven demonstrations, assigned to phases; safety limits; pass criteria |
| A1 | [OpenTag, and OpenBot at its release tag](A1-opentag-and-release-tag.md) | What differs between `v1.0.2` and main; what closing an action means; OpenTag |

The confinement test matrix the owner asked for is `docs/security/CONFINEMENT-TEST-MATRIX.md`.

## Handback of the mediation

| # | Question | Answer |
|---|---|---|
| 1 | What the existing architecture already does correctly | One typed boundary (the MCP server) in front of all campaign work. No capability to publish, spend or contact. Editorial decisions signed by a key the agent runtime does not hold — nothing in the five projects offers this. Budgets enforced before a model is called. One instance per client. Learned and remembered content never authoritative. (D3, last section) |
| 2 | What was overlooked | Inside OpenBot: routines, event triggers, read-only check-ins, hand-off between Bots, per-Bot grants, an approval gateway, an append-only audit. Constraints: every project requires CopilotKit Intelligence; OpenBot's personal and team editions differ sharply; nobody provides exactly-once external effects; an OpenBot instance is prepare-only only if arranged to be; the release differs from main in how a tool server may be attached. (D2; D3 findings 2, 3, 4, 6, 11, 19; A1) |
| 3 | What should be adopted | From OpenBot, set up in each instance: specialist Bots with grants given by an admin; routines that propose and never decide; OpenBot's approvals as a second line for tool permissions; its audit. Skins as a display choice. Three patterns from the excluded projects where useful. Not check-ins or OpenBot's tasks. (D4) |
| 4 | What stays excluded | Standalone OpenDuet, OpenDots and OpenMuse runtimes (decided). Remote Bots. A Bot computer, in a client instance. Any decision or release over a channel. A separate control plane. Live JEV. (D5) |
| 5 | What architectural changes are required | None to the structure. An instance runbook (grants, no Bot computer, settings); figures for the two spend ceilings; a way to attach the MCP server to the release; two new contracts later (receipt, feedback event). (D4, D5) |
| 6 | What can be done now without violating gates | Documents and corrections; regression tests and fixes in this repository under the owner's continuity instruction; proposals in the instance template. Not: tenant-package changes, new contracts, running OpenBot on a paid licence, any channel, any external communication. (D5) |
| 7 | Decisions still open | Licence, edition and where conversations are kept (OD-8, OD-15, the owner's); the environment, key and identity provider (OD-7); spend figures (OD-6); a further review of the approval path if the current one does not approve (OD-11); the plan as an editor decision (OD-19); the future interface (OD-16); wording (OD-17); where the editor confirms (OD-9). (D5; `docs/decisions/OWNER_DECISIONS.md`) |
| 8 | Recommended next instruction | Seek the licence answer. Then authorise Phase 1 (D7 steps 0, 3, 4 and 6) on `v1.0.2`, team edition, no Bot computer, with an Intelligence key, an identity provider, an environment with Docker, and spend figures. Its first test is whether the KIC server can be attached to an unmodified release at all |

## Where the directive and the records differed, and how each was settled

| | Directive | Records | Outcome |
|---|---|---|---|
| Name | "Kraken Intelligence Core" | "Kraken Intelligence Companion" | **Decided:** Kraken Intelligence Companion |
| Origin | An intelligence architecture "developed primarily from OpenBot" | No OpenBot code here; OpenBot never run | Reported as it is (D1); OpenBot is now the preferred candidate, conditionally |
| Safeguards | "Exactly-once business-action safeguards" | Kraken does not claim exactly-once external execution | Kraken's wording used; OD-17 open |
| Execution | OpenBot as the foundation for execution | This side prepares; Kraken executes | **Decided:** Kraken is the sole authority for external commercial execution |

## How this was done, and its limits

- Read-only source audits by separate agents, one per project, then of OpenTag and of OpenBot at its release tag; the claims that drive the recommendation were re-read by the orchestrator. The baseline was checked against this repository's code and ledgers.
- **Nothing upstream was built, installed or run.** Every upstream statement is about source and documents, not behaviour. Statements about OpenBot were written from main and re-checked at `v1.0.2`; what differs is in A1.
- The server side of CopilotKit Intelligence and its licence text are not public in these repositories.
- The diagrams were checked by reading; they were not rendered.
- The documents name Proteus and Metis and describe programme structure. This repository is public (OD-4).
- Two independent reviews of this package are recorded: `docs/review/2026-11-13-mediation-review-ee303a2.md` (first draft: approved with corrections) and `docs/review/2026-11-13-mediation-re-review-177a8c4.md` (corrected package: approved with corrections; the recommendation held at both main and `v1.0.2`; the proof's confinement test was unsound and has been replaced). The present version, with the second set of corrections, has not itself been re-reviewed.
