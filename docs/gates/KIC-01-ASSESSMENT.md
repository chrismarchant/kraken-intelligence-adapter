# KIC-01 — Full OpenBot feasibility assessment (OD-1 reopened)

Date: 2026-11-13. Status: **bounded assessment presented; foundation decision not accepted; no implementation started.**

Basis: owner clarification of 2026-11-13 — a client-owned OpenBot deployment may run under a CopilotKit Intelligence licence held by that client, so Intelligence is to be reused, not removed. This supersedes the recommendation in `KIC-00-REPORT.md` §C.

Marks: **[V]** verified by a command run in this session, **[R]** read in upstream source or a vendor page, **[N]** not verified.

Upstream: `CopilotKit/OpenBot` @ `804aa69`. Nothing imported into this repository.

## Summary

| Question | Finding |
|---|---|
| 1. Starts and operates on the free development licence | **[N] Not proven here.** Blocked by two things outside the agent's authority or environment (below). Dependencies install cleanly [V]. |
| 2. Mistral Large 4 without substantial modification | **Not as shipped; small fix proven.** OpenBot's model client rejects Large 4's response [V]. A response-normalising shim fixes it for non-streamed tool calls [V]; streaming [N]. |
| 3. Workspace, conversation state, tools, memory end to end | **[N]** Needs the running application and an Intelligence project. |
| 4. KIC skills through existing extension mechanisms | **Yes, by design [R].** Tenant package plus MCP-by-URL; no fork of application code needed. |
| 5. JEV through a bounded adapter with fixtures | **Yes [R].** A fixture-backed MCP server added by URL. Live JEV stays disabled. |
| 6. Unnecessary components | Most of the enterprise surface can be left switched off by configuration rather than deleted [R]. |
| 7. Operational complexity versus minimal primitives | Materially higher, but mostly bought, not built. |
| 8. Production licence assignable to an independent client deployment | **[N] Not answered by the published terms.** Needs a written answer from CopilotKit. |

## 1. Runtime readiness

Done [V]:
- `bun install`: 1,366 packages in under 6 seconds, 1.7 GB.
- Personal edition applied with the upstream script (`OPENBOT_EDITION=personal`, single user, no sign-in, one built-in Bot).
- Local PostgreSQL 16 started; database created.

Blocked:

| Blocker | Detail | Who can clear it |
|---|---|---|
| Intelligence project key | The server refuses to start without one. Obtaining it requires `npx copilotkit login`, a personal account sign-in. No Intelligence variable is present in this environment. | Owner: create a free project and add its key and URLs as environment secrets (OD-7). |
| pgvector | The single schema migration fails on a stock PostgreSQL; upstream requires the pgvector extension. No Docker daemon runs in this environment, the package is not in the configured repositories, and building it from source was refused by the session's permission layer. | Owner: a host or environment with Docker, or approval to build pgvector (OD-7). |

Free-licence limits that matter [R]: the hosted free tier allows 1,000 interactions per organisation per month; the self-hosted Developer Edition is "free for non-production use with a renewable 30-day license", and local self-hosting is described as a preview for macOS with Docker Desktop. A Linux cloud container is therefore best pointed at the **hosted** free project.

## 2. Mistral Large 4

OpenBot reads `OPENAI_BASE_URL`, `OPENAI_API_KEY` and a model name that "travels verbatim", and uses Chat Completions for non-OpenAI endpoints [R]. So configuration alone should select Mistral.

Test [V]: the same `@ai-sdk/openai` client that OpenBot's runtime resolves, pointed at `https://api.mistral.ai/v1`, model `mistral-large-4`, one tool.

| Run | Result |
|---|---|
| As shipped | **Failed: "Invalid JSON response" (type validation).** Large 4 returns `content` as an array of `thinking` and `text` blocks; the client expects a string. |
| With a shim that flattens the blocks to text | **Passed.** Two steps, one tool call executed, final text returned; 261 output tokens of which 204 reasoning. |

Consequence: a small normalising gateway between OpenBot and Mistral is required. This is the natural job of the "LLM gateway" in the target architecture and keeps OpenBot's source untouched. Still to prove: streamed responses, which is what the workspace uses.

## 3. Intelligence functionality

Not exercised. From source and vendor pages [R]: threads, memory, Automatic Learning, analytics and channels are served by Intelligence; all five are included on every plan including the free one.

Governance points to settle before use:
- Automatic Learning **proposes skills**. The team edition requires a human to approve each one; the personal edition has an "approve new skills automatically" setting. That setting must be off, and learned skills must never be treated as approved KIC skills or contracts.
- Memory is conversational context only. Approved programmes, decisions and approvals are recorded by KIC in its own store.

## 4. KIC skills through OpenBot's extension mechanisms

Mechanisms found [R]:

| Mechanism | What it gives KIC |
|---|---|
| Tenant package (`agents.yaml`, `skills.yaml`, `model.yaml`, `brand.yaml`, `knowledge.yaml`) selected by `TENANT_PACKAGE_DIR` | A client's Bots, skills, model and branding as a directory outside application code — the separation the template model needs. |
| Skills: named instructions invoked with `/`, each declaring the tools it needs | Upstream states a skill "adds no capability"; it can only use tools the Bot was granted. |
| MCP servers added by URL, granted per Bot | Typed tools from our own server. |
| Approvals, CEL policy (deny first, fail closed), audit | Human confirmation and a record for anything that writes. |
| Fork release workflow (`docs/upstream-upgrades.md`, `.openbot-upstream.json`, `release-policy.json`) | A supported way to track upstream from a derived distribution, with upgrade compatibility checks. |

Proposed shape: **KIC is a tenant package plus one KIC MCP server.** The MCP server owns the typed work — brief schema, narrative and draft generation calls, evaluation, programme assembly, approval records, provisional command fixtures — with input and output schemas and fixtures. OpenBot skills are thin instructions that call those tools. OpenBot application source is not modified.

This shape is also foundation-neutral: the same MCP server works behind the minimal-primitives fallback.

Not yet verified [N]: how well OpenBot's chat surface presents a side-by-side candidate comparison and an explicit approve/reject step. It ships generative-UI and human-in-the-loop hooks, but a campaign comparison view may need a custom component.

## 5. JEV adapter

`jev-router` is a zero-dependency MCP server over stdio [R]. OpenBot adds remote MCP servers by URL. The bounded adapter is therefore the evaluator tools inside the KIC MCP server, backed by deterministic fixtures, with the live JEV path compiled out behind a disabled flag until its security and redaction gate passes. No JEV endpoint was called in this assessment.

## 6. Components not needed for a single-client instance

Leave off by configuration; delete nothing until the application has run:

| Component | Treatment |
|---|---|
| SSO, SCIM, team administration, people directory | Off under personal edition or single-user mode. Revisit if a client needs several editors. |
| Desktop app, mobile app, browser extension and recorder | Not built or shipped. |
| Helm chart, SPIRE workload identity, supervisor, per-Bot computer containers | Not deployed; single compose stack. |
| Sixteen `agent-*` framework adapters | Not started; built-in Bot only. |
| Slack, Teams, voice (Twilio), dictation channels | Not configured. |
| Composio and Arcade app brokers | Not configured; KIC needs only its own MCP server. |
| Browser automation ("computer") | To be confirmed whether the personal edition can run without it. KIC must not hold a logged-in LinkedIn browser. |

## 7. Operational complexity

| | Complete OpenBot | Minimal primitives |
|---|---|---|
| Processes per client | API server, web app, worker, PostgreSQL with pgvector, model shim, KIC MCP server; plus Intelligence (hosted, or self-hosted on Kubernetes) | One server, one web app |
| External dependency | CopilotKit Intelligence, with usage reporting over the internet on PAYG | None |
| Code we maintain | Tenant package, MCP server, shim | Everything, including threads, memory, UI |
| Upstream churn | High: the pinned commit was hours old and the changelog is 600 KB. Needs pinned releases and a deliberate upgrade cadence. | Low |
| Size | 750k lines we do not write but must be able to diagnose | Small |

## 8. Licensing and operating cost

Published terms read on 2026-11-13 [R]. The pages say "interaction", not "event".

**CopilotKit Intelligence**

| Plan | Terms |
|---|---|
| Free | Hosted: 1,000 interactions per organisation per month. Self-hosted Developer Edition: non-production only, renewable 30-day licence. All features. |
| Pay as you go | $49 per month "once per organization", first 10,000 interactions included, then "graduated rates" — **the rates are not published**. Hosted or self-hosted at the same price. "Requires a connected deployment that reports usage counts for billing." No annual commitment. |
| Annual | Custom. Required for offline operation; adds SSO and organisation access controls. |

An interaction is "one request your agent completes successfully"; tool, model and sub-agent calls inside it are not counted separately; failed requests and development, staging, test and demo usage are free. So a fan-out campaign run costs a handful of interactions, not dozens.

**OpenBot for Business** (a different product line): up to $29 per active user per month, plus 5% of model spend above $5,000 per month; it "covers CopilotKit Intelligence to run OpenBot for Business". The same page says "Building agents into your own product requires a separate Intelligence license."

**Open questions for CopilotKit, in writing, before any production use:**
1. Does a client running a Sales Crusader-derived distribution of the MIT OpenBot source under the client's own $49 PAYG Intelligence organisation comply, or does that use require OpenBot for Business per-user pricing?
2. Is each client its own "organization" for billing, and may Sales Crusader provision it on the client's behalf?
3. What are the graduated overage rates?
4. Does a client pilot count as production?

Neither page addresses deployment for third-party client organisations. Until answered, item 8 is **not confirmed**.

Indicative per-client running cost if PAYG applies: $49 per month for Intelligence, plus hosting for five small services and a database, plus Mistral usage (unit prices still unverified).

## 9. Required modifications

1. Model shim for Mistral Large 4 block content, including streaming.
2. KIC tenant package (Bot, skills, brand, model).
3. KIC MCP server (typed skills, evaluator with fixtures, programme store, provisional command fixtures).
4. Possibly one custom comparison/approval component.
5. Deployment template: compose file trimmed by configuration, environment template, pinned upstream release.

No change to OpenBot application source is currently foreseen.

## 10. Revised estimate (working days, after the blockers in §1 are cleared)

| Package | Estimate |
|---|---|
| Full-application boot, end-to-end conversation, tool, memory check on the free project | 1–2 |
| Mistral shim with streaming, verified inside OpenBot | 1 |
| KIC MCP server and tenant package: brief, narrative fan-out, drafts | 3–4 |
| Evaluator with fixtures, comparison and selection flow | 2–3 |
| Programme package, approval records, provisional command fixtures | 1–2 |
| Deployment template and second-instance isolation check | 1–2 |
| **Controlled pilot, cumulative** | **9–14** |

The minimal-primitives route was estimated at 8–11 days for a narrower product without memory, learning, analytics, audit or approvals. The complete application costs a few more days up front and returns considerably more product.

## 11. Recommendation

**Adopt the complete OpenBot application, unmodified, as the candidate foundation — conditionally.** Extend it only through a tenant package, a KIC MCP server and a model shim. Keep the minimal-primitives route as the fallback; because KIC's logic lives in the MCP server, switching foundations later does not discard it.

The recommendation becomes firm only when three things are shown:

| Condition | Evidence required |
|---|---|
| C1 | The application boots on a legitimately obtained free Intelligence project and completes a conversation with a tool call and a recalled memory. |
| C2 | Mistral Large 4 works through the shim with streaming inside OpenBot. |
| C3 | CopilotKit confirms in writing which licence a client-owned derived deployment needs. |

If C1 or C2 fails within the two-day timebox, or C3 returns per-user OpenBot for Business pricing that the commercial model cannot carry, fall back to minimal primitives.
