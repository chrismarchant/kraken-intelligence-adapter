# D5 — Architecture decision package

Mediation KIC-ARCH-MED-01. **Every record below is a proposal.** None is accepted. No accepted decision is overwritten: where a proposal touches one, it says which and is recorded as a proposed amendment. This repository has had no architecture decision records until now; decisions were kept in the owner decision register (`docs/decisions/OWNER_DECISIONS.md`). If the owner accepts any of these, each becomes a numbered record under `docs/decisions/` and the register is updated.

## The owner's direction of 2026-11-13

Recorded verbatim in `docs/spec/directives/KIC-OWNER-DIRECTION-POST-ARCH-MED-01-2026-11-13.md`. The recommendation is provisionally accepted, subject to independent review of the corrected package (done: approved with corrections, applied here).

| Proposal | Outcome |
|---|---|
| P1 | **Decided, provisionally and conditionally:** OpenBot is the preferred, unmodified workspace candidate, conditional on licensing, runtime verification and confinement; the standalone KIC MCP service is the authoritative campaign-preparation boundary. Production adoption is not authorised until the selected release passes runtime, model streaming, persistence, tool-execution and confinement tests |
| P2 | **Decided:** Kraken is the sole authority for external commercial execution |
| P4 | **Decided:** standalone OpenDots, OpenDuet and OpenMuse runtimes are excluded from this programme. Their use elsewhere is not restricted by this |
| P5 | **Decided: deferred.** Read-only assessment of OpenTag and Channels permitted (done: A1) |
| P7 | **Reserved to the owner.** No paid service or external communication is to be initiated |
| P11 | **Decided:** "Kraken Intelligence Companion", without unnecessary renaming |
| P3, P6, P8 to P10, P12 to P14 | Open |

The proposals below are kept as written for the record, with corrections from the second review marked.

## How these proposals map to the decision register

| Proposal | Register entry |
|---|---|
| P1 | OD-1 (with OD-7) |
| P2 | OD-12 |
| P3, P6, P13 | None: within existing authority to record; applied only when an instance is deployed |
| P4 | OD-13 |
| P5 | OD-14 |
| P7 | OD-8 and OD-15 |
| P8, P9 | OD-16 |
| P10 | OD-17 |
| P11 | OD-18 |
| P12 | OD-19 |
| P14 | OD-6 |

## Who decides

| Class | Meaning |
|---|---|
| **Owner** | Reserved to the Human Owner: foundation, licence and spend, new external integrations, anything that changes the accepted separation or the editorial flow, anything in Kraken |
| **Delegated** | Permitted under the existing rules without a new decision: documentation, research, proposals, tests in scratch space |
| **Kraken** | Changes only through Kraken's own amendment process; nothing here changes it |

## Proposed records

### P1 — Foundation: OpenBot as workspace runtime, the KIC MCP server as the boundary

- **Decision proposed:** Adopt OpenBot, unmodified and pinned to a released tag, as the workspace and agent runtime of a client instance. Every campaign capability is reached through the KIC MCP server and no other way. Built-in Bots only.
- **Relation to existing records:** This is OD-1, restated with what the mediation found and with the same three conditions (C1 boot, C2 model through the shim inside OpenBot, C3 licence). It extends OD-1 in two respects: pin to a release tag, not a commit on the main branch; and exclude remote Bots, whose own tools are outside OpenBot's approval policy.
- **Evidence:** D2 (Intelligence requirement, approval scope, released versus main), D3 findings 1, 12, 15.
- **Class:** Owner. OD-1 remains open until the owner accepts it.

### P2 — One owner of business actions

- **Decision proposed:** No Bot, routine or tool in a client instance may carry out an action with an external business effect. OpenBot performs agent work inside the preparation boundary; Kraken alone owns execution state, permission to act, and external side effects.
- **What would make it true in an instance (corrected):** first, no Bot computer at all, which the team edition allows and campaign preparation does not need. Then: no tool with such an effect granted; no site logins saved; no publishing, messaging or payment app connected; no app broker provisioned. If a computer is ever wanted: the browser, network and password-manager capabilities off, and the posting, sending, sharing and paying kinds set to "Members do it themselves" — "Ask every time" is not enough, because a person can still allow the action once. These were read at `v1.0.2` and not run; the first proof must demonstrate them. **In the personal edition none is available**, so a personal-edition instance cannot be confined by configuration.
- **Relation to existing records:** Restates the founding separation and the hard rules in `CLAUDE.md`. Recorded because the directive describes OpenBot as the foundation for execution, which can be read otherwise.
- **Evidence:** D3 findings 4 and 11; D4 "A point the owner should confirm".
- **Class:** Owner, as a confirmation. If the owner intends otherwise, that is an amendment to the accepted separation and to Kraken's rule that the execution core acts.

### P3 — Skins are presentation and carry no architectural weight

- **Decision proposed:** The OpenDuet, OpenDots and OpenFuse experiences inside OpenBot may be offered to an editor as a display preference. No capability, proof or acceptance criterion may depend on a skin.
- **Evidence:** D2 ("a skin adds no endpoint").
- **Class:** Delegated to record; Owner if a skin is to become the product's default look for clients.

### P4 — Exclusions

- **Decision proposed:** Do not adopt as a runtime, and do not import code from: the OpenDuet repository (a diverged fork), OpenDots standalone, OpenMuse. Named patterns may be re-implemented where D3 says they are useful.
- **Additional reason for OpenMuse:** it ships a live transport for the JEV decision service; the standing rule is that a build contains none.
- **Evidence:** D2, D3 findings 7–9.
- **Class:** Owner.

### P5 — Channels: notify and converse only, later, after an audit

- **Decision proposed:** Channels may be added in Phase 2 through OpenBot's own route (OpenTag), in the team edition, for two purposes only: telling a person that a decision is waiting, and conversation with the campaign assistant. No editorial decision, release or authority for a business action is ever taken over a channel. Identity is by one-time link code, never by email or display name.
- **A second choice inside this one:** through OpenTag, OpenBot's own tool approvals can be answered from a card in Slack or Teams and are recorded in OpenBot's approvals service. Recommended: switched off, or accepted deliberately, not left as it falls.
- **Preconditions:** OpenTag audited (source, licence, deployment, hosted dependencies); licence tier settled (P7).
- **Evidence:** D2 (messaging row), D3 finding 10.
- **Class:** Owner. Activating a channel is a new external integration.

### P6 — Memory and learning are never authoritative; automatic approval is off

- **Decision proposed:** Confirm the standing rule and make it an explicit instance setting: automatic approval of learned skills is switched off (the personal edition's default is on); nothing remembered or learned by Intelligence is read by KIC as fact; a learned skill becomes a KIC skill only by a reviewed change to the versioned catalogue.
- **Relation to existing records:** Already accepted in substance (owner clarification of 2026-11-13).
- **Evidence:** D2 (editions), D3 finding 3.
- **Class:** Delegated to record; the instance setting is applied at KIC-05.

### P7 — Edition and licence for a client instance

- **Decision proposed (corrected):** Decide which OpenBot edition a client instance runs; obtain a written statement of the Intelligence licence that a client-owned production instance needs, including whether "OpenBot for Business" (offered as early access) is the route; and decide where conversation threads may be kept: the vendor's managed service, or Intelligence self-hosted on Kubernetes with a production licence, which is the documented production route. Only the local evaluation on macOS is described as not for production. The confinement findings point to the team edition for a client instance.
- **What the choice entails:**

| | Personal edition | Team edition |
|---|---|---|
| Fits | A single editor on one machine | More than one person, channels, separated specialists, memory |
| Needs | A free local licence (per OpenBot's README) | An identity provider; "a production Intelligence license beyond evaluation" |
| Loses | Memory, Slack and Teams, team Bots, isolated computers; learned skills auto-approved by default | — |

- **Relation to existing records:** Extends OD-8. The plan assumed when OD-8 was written is not confirmed by anything read.
- **Evidence:** D2 (licensing table, editions).
- **Class:** Owner. It is a paid dependency.

### P8 — The boundary is the port for any future intelligence, including Metis

- **Decision proposed:** Record the KIC MCP server and its versioned contracts as the interface any intelligence provider uses. Approve the six exchanges in D4 as the design direction. Implement none of them until a gate authorises it. Metis is not a dependency, is not started and is not merged.
- **Evidence:** D3 finding 16; D4.
- **Class:** Owner for the direction; implementation gated.

### P9 — Feedback and receipts

- **Decision proposed:** This side will accept two documents it does not yet have: an execution receipt from Kraken with an explicit unknown outcome, and a feedback event that is stored as evidence and changes nothing by itself. Both are designs until Kraken accepts a contract.
- **Evidence:** D3 findings 9, 13.
- **Class:** Owner for this side; **Kraken** for the receipt, through Kraken's amendment process. Nothing is proposed to Kraken by this document.

### P10 — Wording: no claim of exactly-once

- **Decision proposed:** In this programme's documents, do not use "exactly-once" for external actions. Say: one authoritative owner per business action, an idempotency key per action, and an unknown outcome surfaced to a person rather than retried.
- **Relation to existing records:** Aligns with Kraken's accepted position. The directive's phrase "exactly-once business-action safeguards" is read in that sense.
- **Evidence:** D3 finding 11.
- **Class:** Owner to confirm the reading; Delegated to apply in documents.

### P11 — Name

- **Decision proposed:** State which name stands: "Kraken Intelligence Companion" (this repository, its records, its package names) or "Kraken Intelligence Core" (the directive).
- **Class:** Owner. Nothing has been renamed.

### P12 — The plan as an editor decision

- **Decision proposed:** Add a recorded, signed editor decision on the programme plan, bound to the plan's hash and required at assembly. Today the plan is shown in full at release and each approved post is bound to its own planned post, but no decision is recorded on the plan itself.
- **Origin:** Fifth independent review (`docs/review/2026-11-13-fifth-review-765ae20.md`).
- **Class:** Owner. It adds a step to the editorial flow.

### P13 — Instance defaults

- **Decision proposed:** In the instance template and runbook: telemetry opt-out variables set; automatic approval of learned skills off; the settings in P2; tool grants per Bot recorded; team rules that ask, in the team edition (the "ask before every change" switch is each person's own and cannot be set for an instance); OpenBot pinned to a release tag, with the capabilities relied on re-checked at that tag; routines fired by a second process or cron as upstream requires.
- **Evidence:** D2, D3 findings 4, 12, 15, 17.
- **Class:** Delegated to propose in `docs/deployment/INSTANCE-TEMPLATE.md`; Owner at KIC-05 when anything is deployed.

### P14 — A ceiling on the Bots' own model spend

- **Decision proposed:** Set a spend ceiling (OD-6). The mechanism for the Bots' own usage now exists in the model shim (commit `12a7626`, following the approval-path security review): the owner sets its figures.
- **Evidence:** D3 finding 14.
- **Class:** Owner. Required before any live proof.

## Decisions requiring owner approval, in the order that unblocks most

| Order | Decision | Unblocks |
|---|---|---|
| 1 | P7 / OD-8 licence and edition | Everything that runs OpenBot for a client |
| 2 | P1 / OD-1 foundation, with OD-7 (an Intelligence key and an environment with the `vector` extension) and P14 / OD-6 (spend ceiling) | Phase 1 proof |
| 3 | P2 one owner of business actions (confirm) | The target architecture as drawn |
| 4 | P4 exclusions | Stops further evaluation of the three as runtimes |
| 5 | OD-11 a further review of the approval path, by a reviewer outside this programme's sessions | Reliance on signed approvals |
| 6 | P5 channels | Phase 2 |
| 7 | P8, P9 port and feedback direction | Phase 3 |
| 8 | P10, P11, P12 | Wording, name, editorial flow |

## Permitted now under existing authority

- These documents, and corrections to them.
- Updating `docs/deployment/INSTANCE-TEMPLATE.md` with the proposals in P13, marked as proposals.
- Scratch-space experiments that import nothing into the codebase.
- An audit of OpenTag from its public repository, read-only (done: A1).
- Drafting the questions for CopilotKit that P7 needs.

## Not permitted without a decision

- Adding specialist Bots to `tenant-package/`, or creating routines or grants in any instance.
- Any new contract in `src/contracts/`.
- Running OpenBot against a paid or production licence.
- Connecting any channel.
- Anything in Kraken.
