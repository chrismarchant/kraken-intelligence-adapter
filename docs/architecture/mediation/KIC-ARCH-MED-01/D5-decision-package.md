# D5 — Architecture decision package

Mediation KIC-ARCH-MED-01. **Every record below is a proposal.** None is accepted. No accepted decision is overwritten: where a proposal touches one, it says which and is recorded as a proposed amendment. This repository has had no architecture decision records until now; decisions were kept in the owner decision register (`docs/decisions/OWNER_DECISIONS.md`). If the owner accepts any of these, each becomes a numbered record under `docs/decisions/` and the register is updated.

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
- **Evidence:** D2 (Intelligence requirement, approval scope), D3 findings 1, 11, 13.
- **Class:** Owner. OD-1 remains open until the owner accepts it.

### P2 — One owner of business actions

- **Decision proposed:** No Bot, routine or tool in a client instance may carry out an action with an external business effect. OpenBot performs agent work inside the preparation boundary; Kraken alone owns execution state, permission to act, and external side effects. The agent computer is granted for reading.
- **Relation to existing records:** Restates the founding separation and the hard rules in `CLAUDE.md`. Recorded because the directive describes OpenBot as the foundation for execution, which can be read otherwise.
- **Evidence:** D3 finding 10; D4 "A point the owner should confirm".
- **Class:** Owner, as a confirmation. If the owner intends otherwise, that is an amendment to the accepted separation and to Kraken's rule that the execution core acts.

### P3 — Skins are presentation and carry no architectural weight

- **Decision proposed:** The OpenDuet, OpenDots and OpenFuse experiences inside OpenBot may be offered to an editor as a display preference. No capability, proof or acceptance criterion may depend on a skin.
- **Evidence:** D2 ("a skin adds no endpoint").
- **Class:** Delegated to record; Owner if a skin is to become the product's default look for clients.

### P4 — Exclusions

- **Decision proposed:** Do not adopt as a runtime, and do not import code from: the OpenDuet repository (a diverged fork), OpenDots standalone, OpenMuse. Named patterns may be re-implemented where D3 says they are useful.
- **Additional reason for OpenMuse:** it ships a live transport for the JEV decision service; the standing rule is that a build contains none.
- **Evidence:** D2, D3 findings 6–8.
- **Class:** Owner.

### P5 — Channels: notify and converse only, later, after an audit

- **Decision proposed:** Channels may be added in Phase 2 through OpenBot's own route (OpenTag), in the team edition, for two purposes only: telling a person that a decision is waiting, and conversation with the campaign assistant. No editorial decision, release or authority for a business action is ever taken over a channel. Identity is by one-time link code, never by email or display name.
- **Preconditions:** OpenTag audited (source, licence, deployment, hosted dependencies); licence tier settled (P7).
- **Evidence:** D2 (managed-path limits, in-memory approvals), D3 finding 9.
- **Class:** Owner. Activating a channel is a new external integration.

### P6 — Memory and learning are never authoritative; automatic approval is off

- **Decision proposed:** Confirm the standing rule and make it an explicit instance setting: automatic approval of learned skills is switched off (the personal edition's default is on); nothing remembered or learned by Intelligence is read by KIC as fact; a learned skill becomes a KIC skill only by a reviewed change to the versioned catalogue.
- **Relation to existing records:** Already accepted in substance (owner clarification of 2026-11-13).
- **Evidence:** D2 (editions), D3 finding 3.
- **Class:** Delegated to record; the instance setting is applied at KIC-05.

### P7 — Edition and licence for a client instance

- **Decision proposed:** Decide which OpenBot edition a client instance runs, and obtain a written statement of the Intelligence licence that a client-owned, self-hosted production instance needs.
- **What the choice entails:**

| | Personal edition | Team edition |
|---|---|---|
| Fits | A single editor on one machine | More than one person, channels, separated specialists, memory |
| Needs | A free local licence (per OpenBot's README) | An identity provider; "a production Intelligence license beyond evaluation" |
| Loses | Memory, Slack and Teams, team Bots, isolated computers; learned skills auto-approved by default | — |

- **Relation to existing records:** Extends OD-8. The owner's earlier working assumption (pay-as-you-go) is not confirmed by anything read.
- **Evidence:** D2 (licensing table, editions).
- **Class:** Owner. It is a paid dependency.

### P8 — The boundary is the port for any future intelligence, including Metis

- **Decision proposed:** Record the KIC MCP server and its versioned contracts as the interface any intelligence provider uses. Approve the six exchanges in D4 as the design direction. Implement none of them until a gate authorises it. Metis is not a dependency, is not started and is not merged.
- **Evidence:** D3 finding 14; D4.
- **Class:** Owner for the direction; implementation gated.

### P9 — Feedback and receipts

- **Decision proposed:** This side will accept two documents it does not yet have: an execution receipt from Kraken with an explicit unknown outcome, and a feedback event that is stored as evidence and changes nothing by itself. Both are designs until Kraken accepts a contract.
- **Evidence:** D3 findings 8, 12.
- **Class:** Owner for this side; **Kraken** for the receipt, through Kraken's amendment process. Nothing is proposed to Kraken by this document.

### P10 — Wording: no claim of exactly-once

- **Decision proposed:** In this programme's documents, do not use "exactly-once" for external actions. Say: one authoritative owner per business action, an idempotency key per action, and an unknown outcome surfaced to a person rather than retried.
- **Relation to existing records:** Aligns with Kraken's accepted position. The directive's phrase "exactly-once business-action safeguards" is read in that sense.
- **Evidence:** D3 finding 10.
- **Class:** Owner to confirm the reading; Delegated to apply in documents.

### P11 — Name

- **Decision proposed:** State which name stands: "Kraken Intelligence Companion" (this repository, its records, its package names) or "Kraken Intelligence Core" (the directive).
- **Class:** Owner. Nothing has been renamed.

### P12 — The plan as an editor decision

- **Decision proposed:** Add a recorded, signed editor decision on the programme plan, bound to the plan's hash and required at assembly. Today the plan is shown in full at release and each approved post is bound to its own planned post, but no decision is recorded on the plan itself.
- **Origin:** Fifth independent review (`docs/review/2026-11-13-fifth-review-765ae20.md`).
- **Class:** Owner. It adds a step to the editorial flow.

### P13 — Instance defaults

- **Decision proposed:** In the instance template: telemetry opt-out variables set; OpenBot's "ask before every change" on; OpenBot pinned to a release tag; routines fired by a second process or cron as upstream requires.
- **Evidence:** D2, D3 findings 11, 13, 15.
- **Class:** Delegated to propose in `docs/deployment/INSTANCE-TEMPLATE.md`; Owner at KIC-05 when anything is deployed.

## Decisions requiring owner approval, in the order that unblocks most

| Order | Decision | Unblocks |
|---|---|---|
| 1 | P7 / OD-8 licence and edition | Everything that runs OpenBot for a client |
| 2 | P1 / OD-1 foundation, with OD-7 (an Intelligence key and an environment with the `vector` extension) | Phase 1 proofs |
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
- An audit of OpenTag from its public repository, read-only.
- Drafting the questions for CopilotKit that P7 needs.

## Not permitted without a decision

- Adding specialist Bots or routines to `tenant-package/`.
- Any new contract in `src/contracts/`.
- Running OpenBot against a paid or production licence.
- Connecting any channel.
- Anything in Kraken.
