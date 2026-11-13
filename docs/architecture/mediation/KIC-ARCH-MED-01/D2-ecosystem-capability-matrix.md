# D2 — CopilotKit ecosystem capability matrix

Mediation KIC-ARCH-MED-01. Source audit of five projects on 2026-11-13.

## Method and what the labels mean

Each project was audited from a shallow clone of its public repository by a separate read-only audit, one per project; Channels was audited from its published packages and its public documentation. **Nothing was built, installed or run.** No statement below says that anything works at runtime.

| Label | Meaning |
|---|---|
| **S** | Read in source by an audit (file and line recorded in the audit report) |
| **V** | Read in source by an audit and re-read by the orchestrator |
| **D** | Stated in the project's own documentation; code not read |
| **M** | Marketing page only |
| **—** | Not present in source |
| **?** | Not verified |

| Project | Commit audited | Last commit | Size |
|---|---|---|---|
| OpenBot | `f8af37a` | 2026-11-12 | 4,037 files |
| OpenDuet | `edb9126` | 2026-11-10 | 2,366 files (2,336 are a vendored OpenBot) |
| OpenDots | `46eaf96` | 2026-11-10 | 208 files |
| OpenMuse | `a4944f4` | 2026-10-26 | 231 files |
| Channels | packages `@copilotkit/channels-*` 0.12.0 (as resolved by OpenBot's lockfile); docs.copilotkit.ai | — | — |

The earlier assessment pinned OpenBot at `804aa69`. That commit is 8 commits and about five hours behind `f8af37a`, with no migration, schema or dependency change between them (S). The earlier findings still hold.

## What each project is

| | OpenBot | OpenDuet | OpenDots | OpenMuse | Channels |
|---|---|---|---|---|---|
| What it is | A multi-user workspace platform for agents ("Bots"): server, Postgres, work queue, computers, approvals, audit | **A hard fork of OpenBot**: a vendored copy of OpenBot at about version 0.2.0 with 254 upstream files modified and 247 added (S) | A separate single-owner starter application on the CopilotKit runtime (S) | A separate single-owner personal-agent application with its own task engine (S) | An SDK for connecting an agent to messaging platforms, plus a managed runner inside CopilotKit Intelligence (S, D) |
| Relationship to OpenBot | — | Fork. Its migrations 0061–0067 collide by number with different upstream migrations; no upgrade path between them (S) | No OpenBot package dependency. Optional per-agent computers are built from OpenBot's computer and supervisor source at a pinned revision (S) | None. An OpenBot adapter exists as an unwired stub pinned to an old revision (S) | OpenBot does not import it. OpenBot reaches Slack and Teams through **OpenTag**, a separate CopilotKit service that was not available to audit (S, ?) |
| Inside OpenBot today | — | A skin (12 files, UI only). Its task model and check-in window were ported into OpenBot's core (V) | A skin (UI only). Spaces, pages, page chats and the pause-everything switch are left out "because OpenBot has nothing behind them" (V) | A skin, renamed "OpenFuse" on 2026-11-12 (S) | Not used directly (S) |
| Licence | MIT (V) | MIT (V) | MIT (V) | MIT (V) | MIT packages (S) |
| CopilotKit Intelligence | **Required.** The server throws at start without it; "has no other mode" (V) | **Required**, same check; the start script also stops unless the licence status is valid (S) | **Required** for any conversation; enforced in seven places (V) | **Required**; the server refuses to start without the key (V) | **Required** through the public runtime API; a path without it relies on an internal interface and your own durable state (S) |
| Self-stated status | Version 1.0.1 | "early development", 0.1.0 | "alpha", 0.1.0 | "0.1.0-alpha" | 0.x; marketing says Slack and Teams are "generally available" (M) |
| Activity | 200 commits in 5 days, 85% by one author; about 1,457 test files (S) | 83 commits in 3 weeks, about 95% one author; README now redirects to OpenBot (S) | 74 commits in 6 weeks; little since 15 October; README redirects to OpenBot (S) | 144 commits in 6 weeks; none after 2026-10-26 (S) | Three minor versions (0.9 → 0.12) across the four repositories' lockfiles in about 2.5 weeks (S) |
| Users and tenancy | One deployment is one tenant. Team edition: sign-in, roles. Personal edition: one user, no sign-in (S) | As OpenBot; defaults to single user (S) | One owner, one static token, no users or roles (S) | One owner, one shared key (S) | Workspace-level; no tenancy model in the SDK (S) |

**A skin, in OpenBot's own words:** "They draw OpenBot's existing data; a skin adds no endpoint" (`app/src/skins/types.ts`, V). A skin is chosen per person in Settings and stored as an account preference. No environment variable, tenant-package key or build flag selects one (S). Adopting a skin changes how OpenBot looks to one person and nothing else.

## Capability matrix

Classification for this programme, last column: **Native** = in OpenBot's core today; **Skin** = presentation of a native capability; **Integrate** = needs wiring to something outside OpenBot; **Adapt** = exists elsewhere and would have to be rebuilt or ported; **Absent/unverified**.

| Capability | OpenBot | OpenDuet (fork) | OpenDots (standalone) | OpenMuse | Channels | For this programme |
|---|---|---|---|---|---|---|
| Agent runtime | CopilotKit runtime 1.85.0; built-in Bots in the server or remote AG-UI agents; 14 framework harness images (S) | Inherited at runtime 1.77.0 (S) | CopilotKit runtime 1.75.0, one agent object per "Dot" per request (S) | CopilotKit runtime 1.70.1, one agent (S) | Drives any AG-UI agent (S) | Native |
| Durable work queue | Postgres `work_items`, leased, `(kind, key)` idempotency, attempt cap (S) | Inherited, modified (S) | SQLite `tasks`, one at a time, in-process (S) | One JSONB table, leases, compare-and-swap (S) | — | Native |
| Scheduled routines | Cron, minimum 15 minutes; a late firing is skipped, not replayed; needs a second process or external cron to fire (S) | Inherited (S) | Repeat interval on owner-created tasks only (S) | — (roadmap) | — | Native |
| Event triggers ("goals") | Webhook, GitHub, Linear, Sentry, PagerDuty, email, Slack (S) | Inherited (S) | — | — | Inbound messages only | Native |
| Proactive check-ins | Background read-only sweep that raises suggestions; silent by default (S) | The origin of it; plus a morning brief that is triggered by opening the app, not by a clock (S) | — | "Ideas" from regex rules (S) | — | Native |
| Tasks with their own thread and status | `bot_tasks`, status derived from the queue and approvals (S) | The origin of it (S) | — | Task engine with plan, evidence, statuses (S) | — | Native (Skin: OpenDuet "Tasks" screen) |
| Recovery after interruption | Re-run, at most twice; **no mid-turn checkpoint**. True resume only at a human-wait point, from a stored continuation (S) | Same (S) | Marked interrupted; owner re-runs by hand (S) | Re-claim on expired lease; resume is a fresh model run with saved state; guard before each side effect (S) | Managed delivery: ordered packets, explicit "uncertain" result (S) | Native, with limits; Adapt (OpenMuse pattern) if finer recovery is wanted |
| Exactly-once external effects | **Not claimed.** A reclaimed item "may already have called a tool and spent money" (V) | Not claimed | Approved MCP action claimed once (S) | Not claimed; external writes at-most-once with an explicit `outcome_unknown` (S) | Not claimed; at-least-once managed transport (S) | Kraken's remit |
| Specialist agents | Bots with per-Bot grants, skills, workspace, optional isolated computer (team edition) (S) | One Bot shipped (S) | "Dots": rows of name, instructions, switches, Space grants (S) | — | — | Native |
| Agent-to-agent delegation | Typed hand-off on the durable queue, depth and per-run caps, needs a grant; sub-agent = same Bot run again (S) | Inherited (S) | **—** (README: "further work") | **—** | — | Native |
| Shared knowledge and documents | Memory and memory sources (team edition); knowledge in the tenant package (S, ?) | Pages ("Make"), fork only (S) | Spaces and Markdown pages with per-agent grants (S) | PDF artifacts (S) | — | Adapt (not needed for campaign preparation; the campaign store is the shared record) |
| Per-agent tool permissions | Grants per Bot; skills list their tools (S) | Inherited | Per-agent switches; per-tool approval on MCP connections; live revocation (S) | Compiled-in tools, environment flags (S) | — | Native |
| Human approval of tool actions | Server-side gateway; fixed action kinds always ask; layered rules, strictest wins; optional model reviewer; decisions in tables and audit (S). Defaults: "ask before every change" off, model reviewer off (V). **A remote Bot's own tools "don't go through this policy"** (V) | Inherited, with the model reviewer on by default (S) | Page review and MCP write approval, web app only; unsigned (S) | Four action kinds, content-hash bound, expiring (S) | Initiator-only choice prompt; in memory by default; not supported on the managed path (S) | Native for tool permissions. **Not a substitute for the signed editorial decision** |
| Agent computer and browser | Chromium, shell, workspace per Bot; Docker or Kubernetes sandbox; all self-hosted; egress filter (S, ?) | Inherited | Search by default; optional read-only browser; optional per-agent computer from OpenBot's images (S) | Read-only agent browser with human takeover; Docker computer; optional paid hosted desktop with no approval gate (S) | — | Native |
| Memory | Team edition: local tables mirrored to Intelligence. **Personal edition: none** (V) | Inherited (S) | One global list of owner-typed notes (S) | Explicit facts only (S) | Per-run grants (S) | Native (team edition only) |
| Automatic learning | In Intelligence; OpenBot stores settings and approvals. Team edition: a person or admin approves. **Personal edition: proposals are approved automatically by a sweep unless switched off** (V) | No approval step in the fork (S) | Routing only (S) | — | — | Native, and governed: see D3 |
| MCP | Client only, Streamable HTTP; pinned catalogue plus add-by-address with OAuth (S). **OpenBot is not an MCP server** (S) | Inherited | Client only (S) | Client, one fixed endpoint (S) | — | Native (as client) |
| Messaging channels | Slack and Teams through OpenTag (team edition only; switched off in the personal edition); SMS through Twilio; mobile push; inbound email as a trigger (S). OpenTag itself not audited (?) | Inherited; README defers to OpenBot | Slack through the managed runner; "still needs connected-service verification" by its own README (S) | — | Slack and Teams adapters read; Discord, Telegram, WhatsApp packages exist, code not read (S, ?) | Integrate |
| Social publishing | — (LinkedIn appears only as an example hostname in approval rules) (S) | — | — | — | **—** (no LinkedIn or X code in any package) (S) | Kraken's remit |
| Identity across channels | One-time link code, 10 minutes, one outside account to one user (S) | Inherited | All allowed Slack users map to the one owner (S) | — | `provider:tenant:actor` for humans; docs warn against linking by email or name (S) | Integrate |
| Audit | `audit_events`, append-only by database trigger, redaction, initiator recorded; OTLP log export (S) | Inherited | Computer audit only, trimmed (S) | Mutable rows (S) | — | Native |
| Cross-device | Web, desktop (Tauri), mobile (Expo) apps present; not read (?) | Mobile-shaped web frame | Web and mobile claimed (D) | One Expo codebase; no push; polling (S) | — | Unverified |
| Deployment | Docker Compose, Helm chart (bundles Intelligence as a subchart, which needs a licence token), single image; Postgres with the `vector` extension available at migration time (created in migration 0000, dropped in 0010) (S) | Local quick start only; no image or deploy guide (S) | `docker compose`; Node 24 (S) | Local, or a Render blueprint (S) | Long-running worker; managed path needs Intelligence (D) | — |
| Telemetry to CopilotKit | Product telemetry opt-in on servers; SDK telemetry present (S, ?) | SDK telemetry at 100% sample rate by default (S) | On by default (S) | On by default at sample rate 1 (S) | On unless disabled (S) | To be switched off in a client instance |
| Other | Reaches into five private methods of the CopilotKit runtime for headless turns, with request shapes "restated by hand" (V) | — | MCP bearer tokens stored in plain text (S) | **Ships a live transport for the JEV decision service**, off by default (S) | — | See D3 |

## CopilotKit Intelligence licensing, as OpenBot's README states it (V)

| Where it runs | Licence |
|---|---|
| A laptop, personal use | A free local licence |
| Kubernetes evaluation | A free trial licence, on request |
| Kubernetes or production | "a production Intelligence license beyond evaluation" |

The Intelligence licence text is not in any of the repositories. Pricing seen on the public pricing page (M): a free plan with a hosted allowance; pay-as-you-go at a monthly fee per organisation with an included number of interactions; annual plans with custom pricing, the only ones with offline operation. Self-hosted Intelligence is documented as "a preview … not a production installation" (D). What a client-owned production instance must buy is **not verified** and remains owner decision OD-8.

## Editions of OpenBot (V, `server/src/edition.ts`)

| Capability | Personal edition | Team edition |
|---|---|---|
| Sign-in and roles | No (one fixed admin user) | Yes |
| Memory | **No** | Yes |
| Slack and Teams | **No** | Yes |
| Team Bots | **No** | Yes |
| Isolated computer per Bot | **No** | Yes |
| Learned-skill approval | **Automatic by default** | By a person or an admin |
| Proactive check-ins, routines, custom approval rules | Yes | Yes |

## Not verified

- Runtime behaviour of anything. Tests and CI status of all five.
- OpenTag: source, licence, deployment, and whether it needs a hosted CopilotKit service.
- The server side of CopilotKit Intelligence, its licence text, plan limits and what each tier gates.
- The Discord, Telegram and WhatsApp adapters; the umbrella `@copilotkit/channels` package.
- OpenBot's CEL policy evaluation, egress filter, secret masking, grant resolution, sign-in and SCIM, desktop and mobile apps, and the 14 agent harnesses, beyond file headers and schema.
- Whether OpenBot's built-in agent at 1.0.1 tolerates Mistral Large 4's response shape without the shim. (The shim was proven with runtime 1.85.0 in the earlier session, outside OpenBot.)
- Licences of transitive dependencies in the four repositories.
