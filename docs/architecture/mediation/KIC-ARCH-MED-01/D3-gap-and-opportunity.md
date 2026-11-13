# D3 — Architecture gap and opportunity report

Mediation KIC-ARCH-MED-01. Findings are ranked by how much they change the decision. Evidence is in D1 (this repository) and D2 (upstream); labels are as in D2. Nothing here was established by running OpenBot or any of the other projects.

## Summary

The four projects add far less than their descriptions suggest, and the reason is good news: **the capabilities that matter are already in OpenBot's core.** Tasks, proactive check-ins, routines, event triggers, agent-to-agent hand-off, per-agent permissions, approvals and an append-only audit are native to OpenBot. OpenDuet and OpenDots inside OpenBot are presentation only. OpenDuet as a repository is a diverged fork, OpenDots and OpenMuse are separate single-owner applications, and Channels is a messaging layer that OpenBot does not use directly. None of the four should be added as a runtime.

What was overlooked is therefore mostly inside OpenBot itself, together with three constraints that apply to all five: the dependency on CopilotKit Intelligence, the difference between OpenBot's two editions, and the fact that none of them claims or provides exactly-once external effects.

## Findings

### 1. The baseline is not what the directive assumes (risk, high)

No OpenBot-derived runtime exists in this programme. This repository is a standalone preparation service; OpenBot has never been run here; the foundation decision is open (D1). Planning that assumes a working OpenBot-based intelligence layer would be planning on something that has not been built or proven. Every later phase depends on first proving OpenBot boots with the three connecting parts (C1).

### 2. All five depend on CopilotKit Intelligence, and the licence tier decides what a client instance may do (risk, high)

Every project refuses to run conversations without Intelligence (V). OpenBot's README states that Kubernetes or production use needs "a production Intelligence license beyond evaluation" (V). Self-hosted Intelligence is documented as a non-production preview (D). The owner's earlier working figure was the pay-as-you-go plan; whether that plan is the production licence a client-owned, self-hosted instance needs is **not verified**. This is OD-8 and it now gates more than before: memory, Slack and Teams, team Bots and isolated computers all sit behind the edition and licence.

### 3. OpenBot's two editions are different products for governance purposes (gap, high)

| | Personal edition | Team edition |
|---|---|---|
| Sign-in, roles, per-person identity | No | Yes |
| Memory | No | Yes |
| Slack and Teams | No | Yes |
| Isolated computer per Bot | No | Yes |
| Learned skills | Approved automatically unless switched off | Approved by a person or an admin |

The earlier assessment worked with the personal edition. A client instance with more than one person, with channels, or with separated specialist agents needs the team edition, which needs an identity provider and the production licence. The standing rule "automatic skill approval stays off" is the **opposite of the personal edition's default** (V).

### 4. Skins add nothing to the architecture (finding, decisive for Option B)

"A skin adds no endpoint" (V). The OpenDuet and OpenDots experiences inside OpenBot are per-person display preferences over OpenBot's own data. They can be offered to an editor at no architectural cost, and they cannot be the mechanism by which a capability is adopted.

### 5. Capabilities previously overlooked, all native to OpenBot (opportunity, high)

| Capability | What it would do for campaign preparation | Condition |
|---|---|---|
| Tasks with their own thread and derived status | A campaign, or a batch of drafting, as a tracked piece of work the editor can open | Preparation only |
| Routines and event triggers | "Every Monday, check which campaigns have posts awaiting a decision and tell the editor"; "when a brief is updated, re-interpret it" | A routine may call only KIC's tools; it proposes and never decides |
| Proactive check-ins | The assistant notices stalled work and raises a suggestion | Read-only by design upstream (S) |
| Agent-to-agent hand-off with per-Bot grants | Specialists: a strategist that may plan, a drafter that may draft, a checker that may only read and evaluate | Each Bot is granted a subset of KIC's tools; team edition for isolated workspaces |
| Approval rules and gateway | A second, workspace-level control on which tools a Bot may call | Does not replace the signed editorial decision |
| Append-only audit with export | A workspace record beside KIC's signed decision log | — |
| One-time link codes for outside accounts | A sound basis for identity if channels are adopted | — |

### 6. OpenDuet the repository must not be adopted (exclusion)

It is a hard fork of an old OpenBot with colliding migrations and no upgrade path (S). Upstream has already absorbed its task model and check-in window. What remains fork-only — pages, a morning brief, mail triage, reply chips, a Gmail and Calendar connector — is personal-assistant functionality that campaign preparation does not need. Adopting it would mean maintaining a second, diverging copy of the platform.

### 7. OpenDots standalone must not be adopted as a runtime (exclusion); two of its ideas are worth keeping

It is a separate single-owner application with its own store, no sign-in and no agent-to-agent delegation (S). Its distinctive feature, shared Spaces and pages, does not exist in OpenBot and is not needed here: the campaign record is the shared document. Worth keeping as **patterns**: an approval that stores the exact tool, connection and arguments and executes only that, once; and revoking a running turn when a permission changes.

### 8. OpenMuse must not be adopted as a runtime (exclusion); its recovery patterns are the best in the set

It shares nothing with OpenBot and would be a second runtime, store, scheduler and permission system (S). It also ships a live transport for the JEV decision service (off by default), which conflicts with the standing rule that no live JEV path exists in a build. Worth keeping as **patterns**, already partly present in this repository:

| OpenMuse pattern | Here today |
|---|---|
| Reviewed action bound to a content hash, expiring, claimed once | Present, and stronger: signed, chained, operator-held key |
| `outcome_unknown` instead of retry when an external write is uncertain | **Missing, and not needed yet**: this repository performs no external write. It is the right model for the receipt Kraken returns (finding 12) |
| Lease, compare-and-swap checkpoint, guard before each side effect | Present for model steps (reserve, call, settle) |
| Page-watch monitors with backoff and auto-pause | Missing; not needed for preparation |

### 9. Channels is a messaging layer with weak approval semantics (opportunity, limited; risk if over-used)

It contains no social publishing (S), which settles one question: it cannot be a route to LinkedIn. OpenBot uses it only through OpenTag, which could not be audited (?). On the managed path, the interactive choice prompt is unsupported, and by default pending approvals are held in memory and lost on restart (S). The right use is narrow: tell an editor that a decision is waiting, and let them talk to the assistant. **An editorial decision or a release must never be taken over a channel**; it stays with the operator tool, which signs.

### 10. Nobody in the ecosystem provides exactly-once external effects (alignment)

OpenBot's own schema comment says a reclaimed item "may already have called a tool and spent money" (V). Channels names its managed transport at-least-once (S). OpenMuse gives at-most-once writes with an explicit unknown state (S). This agrees with Kraken's accepted position that it does not claim exactly-once external execution. The directive's phrase "exactly-once business-action safeguards" should be read, and recorded, as: one authoritative owner of each business action, idempotency keys, and unknown outcomes surfaced rather than retried.

### 11. OpenBot's approval layer does not cover everything, and is not signed (gap, medium)

A remote (brought-in) Bot's own tools "don't go through this policy" (V). The defaults are permissive: "ask before every change" is off (V). Decisions are rows and audit entries, not signatures. For this programme: use built-in Bots only, grant them only KIC's tools, and keep the signed decision log as the sole authority for editorial decisions.

### 12. There is no feedback path, and there cannot be one until Kraken defines a receipt (gap, medium)

Learning from execution needs an outcome record. This repository has none because it executes nothing, and Kraken has not accepted a contract. The gap is real but cannot be closed from this side alone. D4 defines the shape this side would accept, as a proposal.

### 13. Upstream is moving very fast, on private interfaces (risk, medium)

OpenBot: 200 commits in five days, 85% from one author; unreleased migrations on the main branch; headless turns reach into five private runtime methods "restated by hand" (V). Channels: three minor versions in under three weeks. A client instance must pin a released tag, never the main branch, and treat each upgrade as a tested change. The less of OpenBot's inside this programme touches, the cheaper each upgrade is, which is the argument for keeping every KIC capability behind the MCP boundary.

### 14. OpenBot is an MCP client, not an MCP server (constraint, medium)

Nothing outside can call OpenBot through a standard tool interface (S). So OpenBot cannot be the stable interface that a future intelligence provider such as Metis plugs into. The KIC MCP server can: OpenBot is one client of it today, and another intelligence could be a second.

### 15. Telemetry defaults send usage data to the vendor (gap, low)

SDK telemetry is on by default in OpenDots, OpenMuse and the Channels core, and present in OpenBot (S). A client-owned instance should set the documented opt-out variables. This belongs in the instance template.

### 16. The `vector` extension requirement is narrower than recorded (correction, low)

OpenBot's first migration creates the extension and a later one drops it with the only table that used it (S). The database role must be able to create and drop it during migration, but OpenBot does no local vector search. The environment blocker in OD-7 stands; its description is corrected.

## Redundancy check

| Would-be duplicate | Already provided by | Verdict |
|---|---|---|
| A second task engine (OpenMuse, OpenDots) | OpenBot's work queue and tasks | Do not add |
| A second scheduler | OpenBot routines | Do not add |
| A second conversation store | CopilotKit Intelligence, through OpenBot | Do not add |
| A second permission system for tools | OpenBot grants and approval gateway | Do not add |
| A second approval system for **editorial decisions** | Does not exist anywhere in the ecosystem; this repository's signed log is the only one | Keep |
| A second budget control | OpenBot records model usage; it has no per-campaign ceiling | Keep this repository's |
| A Kraken-owned control plane beside OpenBot | The KIC MCP server already is the boundary | Do not build a new one |

## What the existing architecture already gets right

1. The work is behind one typed boundary (the MCP server), so the workspace in front of it can change without the work changing.
2. No capability to publish, spend or contact exists on this side, and the provisional command cannot express an executable action.
3. Editorial decisions are signed by a key the agent runtime does not hold. Nothing in the five projects offers this.
4. Budgets are enforced before a model is called, per campaign and per instance.
5. One instance per client, with no shared service. OpenBot's "one deployment is one tenant" fits this.
6. Learned skills and remembered context are never authoritative.
