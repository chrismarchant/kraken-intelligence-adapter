# D3 — Architecture gap and opportunity report

Mediation KIC-ARCH-MED-01. Findings are ranked by how much they change the decision. Evidence is in D1 (this repository) and D2 (upstream); labels are as in D2. Nothing here was established by running OpenBot or any of the other projects. This version includes the corrections from both independent reviews of the package (`docs/review/2026-11-13-mediation-review-ee303a2.md`, `docs/review/2026-11-13-mediation-re-review-177a8c4.md`) and the release-tag and OpenTag audits in A1.

## Summary

The four projects add far less than their descriptions suggest. OpenDuet and OpenDots inside OpenBot are presentation only. OpenDuet as a repository is a diverged fork; OpenDots and OpenMuse are separate single-owner applications; Channels is a messaging layer with no publishing. None of the four should be added as a runtime.

OpenBot itself has more than the earlier baseline recorded — routines, event triggers, read-only check-ins, hand-off between Bots, per-Bot grants, an approval gateway, an append-only audit — but **less of it is usable for this product than a first reading suggests**: tasks start only from a check-in, check-ins cannot write, and tool grants and routines are set by a person in each instance, not by the tenant package.

Three constraints apply to all five projects: the dependency on CopilotKit Intelligence, the difference between OpenBot's two editions, and the absence of any exactly-once guarantee. And one risk is specific to putting a general agent platform in front of a prepare-only product: OpenBot's Bots can browse, sign in and act unless an instance is configured so that they cannot.

## Findings

### 1. The baseline is not what the directive assumes (risk, high)

No OpenBot-derived runtime exists in this programme. This repository is a standalone preparation service; OpenBot has never been run here; the foundation decision is open (D1). Planning that assumes a working OpenBot-based intelligence layer would be planning on something that has not been built or proven.

### 2. All five depend on CopilotKit Intelligence; the licence tier and the data location are undecided (risk, high)

Every project refuses to run conversations without Intelligence (V). OpenBot's README states that Kubernetes or production use needs "a production Intelligence license beyond evaluation" and that "OpenBot for Business includes Intelligence for use with OpenBot" (V). Managed Intelligence needs no separate licence token (V) and presumably keeps conversation threads in the vendor's service, which sits uneasily with a client-owned instance. Self-hosting Intelligence on Kubernetes with a production licence is the documented production route and OpenBot's Helm chart bundles it; only the local evaluation on macOS, with its 30-day renewable licence, is described as not for production (V, D). OpenBot for Business is offered as early access. Which plan a client-owned production instance needs is **not verified**. This is OD-8, and it now gates more than before: memory, Slack and Teams, team Bots and isolated computers all sit behind the edition and licence.

### 3. OpenBot's two editions are different products for governance purposes (gap, high)

| | Personal edition | Team edition |
|---|---|---|
| Sign-in, roles, per-person identity | No | Yes |
| Memory | No | Yes |
| Slack and Teams | No | Yes |
| Isolated computer per Bot | No | Yes |
| Learned skills | Approved automatically unless switched off | Approved by a person or an admin |
| An admin who can close a kind of action for everybody | No | Yes |

The earlier assessment worked with the personal edition. The standing rule "automatic skill approval stays off" is the **opposite of the personal edition's default** (V), and in the personal edition nobody but the one user can tighten anything.

### 4. "Prepares only" would depend on OpenBot settings that nothing yet specifies (risk, high)

OpenBot is a general agent platform. In both editions the cloud browser, the cloud network and a password manager are on (V). The six kinds of consequential action — including posting and sending — ask first, but are "open by default": a person can answer "always" (V). The start script can provision app connectors through a third-party broker (S). So a Bot with a browser in which someone is signed in to LinkedIn could post, after one approval that can be made permanent. Checking that "no publishing tool is granted" would not catch this, because the browser is the tool.

This repository's guarantee that it cannot publish is unaffected: it has no such capability. But an instance that puts OpenBot in front of it would not be prepare-only unless it is made so. What was then read at the release tag (A1): in the team edition an instance can run with no Bot computer at all, an admin can switch off the browser, network and password-manager capabilities, and can set a kind of action to "Members do it themselves", which is the only setting under which the Bot never does it ("Ask every time" still lets a person allow it once). **In the personal edition none of this is available**: a computer is mandatory, the capabilities are fixed on, and team settings are not read. None of it has been run. This is the largest risk in the recommended option; the first proof tests it (D7 step 0d), and the simplest safe arrangement is no Bot computer, since campaign preparation needs no browsing.

### 5. Skins add nothing to the architecture (finding, decisive for Option B)

"A skin adds no endpoint" (V). The OpenDuet and OpenDots experiences inside OpenBot are per-person display preferences over OpenBot's own data. They can be offered to an editor at no architectural cost, and they cannot be the mechanism by which a capability is adopted.

### 6. What OpenBot offers natively, and how much of it this product can use (opportunity, medium)

| Capability | Use for campaign preparation | Limit found in source |
|---|---|---|
| Routines | "Every Monday, list the campaigns with posts awaiting a decision and open the requests" | A routine runs as the person who created it, with their grants, so it can call KIC's tools. It is created in the interface, not in the tenant package. A firing more than ten minutes late is skipped. |
| Event triggers | "When a brief changes, re-interpret it" | Not examined beyond the trigger kinds. |
| Proactive check-ins | Notice stalled work | **Read-only, enforced, failing closed.** A check-in cannot open a decision request (that tool writes), cannot hand off, and cannot see a tool server an admin connected for everybody. At most it could read campaign state, and only if KIC is connected per person. |
| Tasks | A tracked piece of work | **Start only from a check-in item**, and then ask before every change. Not a general "run this batch as a task" mechanism. |
| Hand-off between Bots, per-Bot grants | A strategist, a drafter, a checker, each limited to some tools | The tenant package defines Bots and their skills but **does not grant tools**; a person grants them in each instance. Isolated workspaces need the team edition. |
| Approval gateway | A second control on which tools a Bot may call | Per-person switch; open-by-default kinds; not signed (finding 12). |
| Append-only audit with export | A workspace record beside the signed decision log | — |
| One-time link codes | Identity for channels | — |

The honest summary: routines and hand-off are usable; check-ins and tasks are of little use here; nothing is "configuration only".

### 7. OpenDuet the repository must not be adopted (exclusion)

It is a hard fork of an old OpenBot with colliding migrations and no upgrade path (S). Upstream has already absorbed its task model and check-in window. What remains fork-only — pages, a morning brief, mail triage, reply chips, a Gmail and Calendar connector — is personal-assistant functionality that campaign preparation does not need.

### 8. OpenDots standalone must not be adopted as a runtime (exclusion); two of its ideas are worth keeping

A separate single-owner application with its own store, no sign-in and no agent-to-agent delegation (S). Its shared Spaces and pages do not exist in OpenBot and are not needed here: the campaign record is the shared document. Worth keeping as **patterns**: an approval that stores the exact tool, connection and arguments and executes only that, once; and stopping a running turn when a permission changes.

### 9. OpenMuse must not be adopted as a runtime (exclusion); its recovery patterns are the best in the set

It shares nothing with OpenBot and would be a second runtime, store, scheduler and permission system (S). It also ships a live transport for the JEV decision service (off by default), which conflicts with the standing rule that a build contains none.

| OpenMuse pattern | Here today |
|---|---|
| Reviewed action bound to a content hash, expiring, claimed once | Present, and stronger: signed, chained, operator-held key |
| `outcome_unknown` instead of retry when an external write is uncertain | Missing, and not needed yet: this repository performs no external write. It is the right model for a receipt from Kraken (finding 13) |
| Lease, compare-and-swap checkpoint, guard before each side effect | Present for model steps (reserve, call, settle) |
| Page-watch monitors with backoff and auto-pause | Missing; not needed for preparation |

### 10. Channels is a messaging layer; through OpenBot it can also carry tool approvals (opportunity, limited; a decision is needed)

It contains no social publishing (S), so it is not a route to LinkedIn. OpenBot reaches Slack and Teams through OpenTag, described in OpenBot's source as CopilotKit's open-source front on the Channels SDK (V). The read-only audit of OpenTag (A1) found that it requires CopilotKit Intelligence, that Intelligence holds the Slack and Teams credentials, and that the public repository at the commit read does not implement what OpenBot `v1.0.2` expects of it.

Two different things must not be confused. The Channels SDK's own choice prompt is held in memory by default and is unsupported on the managed path (S). But through OpenTag, an **OpenBot tool approval can be answered by a card in Slack or Teams and is recorded durably in OpenBot's approvals service** (V). So adopting channels means deciding whether a Bot's tool permissions may be granted from a chat message.

Editorial decisions and releases are unaffected whichever is chosen: they are made with the operator tool, which signs, and never over a channel.

### 11. Nobody in the ecosystem provides exactly-once external effects (alignment)

OpenBot's own schema comment says a reclaimed item "may already have called a tool and spent money" (V). Channels names its managed transport at-least-once (S). OpenMuse gives at-most-once writes with an explicit unknown state (S). This agrees with Kraken's accepted position that it does not claim exactly-once external execution. The directive's phrase "exactly-once business-action safeguards" should be read as: one authoritative owner of each business action, idempotency keys, and unknown outcomes surfaced rather than retried.

### 12. OpenBot's approval layer is a per-person, unsigned control (gap, medium)

"Extra vigilant" is each person's own switch and is off by default (V). An admin can set a kind to "Ask every time" or "Members do it themselves", and add team rules, in the team edition only. Per OpenBot's documentation, a remote Bot's own tools are outside the policy (D). Decisions are rows and audit entries, not signatures. For this programme: built-in Bots only; team rules rather than personal switches where the edition allows; and the signed decision log as the sole authority for editorial decisions.

### 13. There is no feedback path, and there cannot be one until Kraken defines a receipt (gap, medium)

Learning from execution needs an outcome record. This repository has none because it executes nothing, and Kraken has not accepted a contract. D4 defines the shape this side would accept, as a proposal.

### 14. Bot model spend has no ceiling and no owner (gap, medium)

This repository caps its own model calls per campaign and per instance. The Bots' own conversation with the model goes through the shim; OpenBot records usage but does not limit it. When this was first written nothing capped it. The approval-path security review found the same gap, and the shim now limits spend in key-injection mode (commit `12a7626`: a cap per request, a concurrency limit, a persistent ceiling). The figure for the ceiling is the owner's (OD-6).

### 15. Upstream is moving very fast, on private interfaces, ahead of its releases (risk, medium)

OpenBot: at least 200 commits in five days, 85% from one author; three unreleased migrations on main; headless turns reach into five private runtime methods "restated by hand" (V). Channels: three minor versions in under three weeks. A client instance must pin a released tag — `v1.0.2` is the latest — and treat each upgrade as a tested change. The capabilities relied on were re-checked at that tag (A1). The less of OpenBot's inside this programme touches, the cheaper each upgrade is.

### 16. OpenBot is an MCP client, not an MCP server (constraint, medium)

OpenBot has an AG-UI endpoint, and on main a published REST API specification that is absent at `v1.0.2` (S), but nothing can call it through the standard tool interface. So OpenBot is not the stable interface a future intelligence provider such as Metis would plug into. The KIC MCP server can be: OpenBot is one client of it today, and another intelligence could be a second.

### 17. Telemetry defaults send usage data to the vendor (gap, low)

SDK telemetry is on by default in OpenDots, OpenMuse and the Channels core, and present in OpenBot (S). A client-owned instance should set the documented opt-out variables.

### 18. The `vector` extension requirement is narrower than recorded (correction, low)

OpenBot's first migration creates the extension and a later one drops it (V). The database role must be able to create and drop it during migration, but OpenBot does no local vector search.

### 19. At the release tag, the KIC MCP server cannot be attached over a private interface (risk, high for the first proof)

At `v1.0.2` OpenBot accepts a custom MCP server only over https at a hostname that is not an address literal, `localhost` or an internal name; an admin adds it, with one stored credential used for everybody (S, re-read). The loopback override exists only on unreleased main. This programme's design assumed the MCP endpoint would sit on a private interface behind a token. Attaching it to an unmodified `v1.0.2` needs TLS and a name, and it is not known whether OpenBot will then reach a name that resolves to a private address. The first step of the proof has to settle this; if it cannot be done without modifying OpenBot, the foundation is not usable at this release.

## Redundancy check

| Would-be duplicate | Already provided by | Verdict |
|---|---|---|
| A second task engine (OpenMuse, OpenDots) | OpenBot's work queue; this repository's own steps | Do not add |
| A second scheduler | OpenBot routines | Do not add |
| A second conversation store | CopilotKit Intelligence, through OpenBot | Do not add |
| A second permission system for tools | OpenBot grants and approval gateway | Do not add |
| A second approval system for **editorial decisions** | Does not exist anywhere in the ecosystem; this repository's signed log is the only one | Keep |
| A second budget control | OpenBot records model usage; it has no ceiling | Keep this repository's; add one for the Bots' own spend |
| A Kraken-owned control plane beside OpenBot | The KIC MCP server already is the boundary | Do not build a new one |

## What the existing architecture already gets right

1. The work is behind one typed boundary (the MCP server), so the workspace in front of it can change, or be absent, without the work changing.
2. No capability to publish, spend or contact exists on this side, and the provisional command cannot express an executable action.
3. Editorial decisions are signed by a key the agent runtime does not hold. Nothing in the five projects offers this.
4. Budgets are enforced before a model is called, per campaign and per instance.
5. One instance per client, with no shared service. OpenBot's "one deployment is one tenant" fits this.
6. Learned skills and remembered context are never authoritative.
