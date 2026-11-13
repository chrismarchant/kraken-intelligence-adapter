# KIC-00 — Foundation, Independence and Feasibility: report

Date: 2026-11-12. Author: master orchestrator session. Status: **presented for owner approval; not accepted.**

Every statement is marked by how it was established: **[V]** verified by a command run in this session, **[R]** read in a source file, **[N]** not verified.

---

## A. Engineering environment inventory

### Repositories

| Item | State |
|---|---|
| `kraken-intelligence-adapter` | [V] Empty: no commits, no default branch. Push access to branch `claude/adoring-edison-4wlees` only. **Public.** |
| `Kraken` (private) | [V] Attached read-only, cloned at `5a76dea`. Documentation and governance only (76 files, no product code). Nothing was or will be written to it. |
| `jev-router` (public) | [V] Cloned read-only at `9dd0413`. MIT. |
| `aeh` (private) | **[N] Not inspected.** Attaching it was refused by this session's permission layer. Its existence matters: it may already contain the harness this directive asks for. |
| `mistral-code-review-bot` (public) | **[N] Not inspected** here (same refusal). State known only second-hand from Kraken's records. |
| `mistral-code-router` (public) | [N] Not inspected. Referenced by Kraken as the coding-delegation plugin. |
| OpenBot upstream | [V] Cloned to scratch at `804aa69617cd96628895125c8d7d6bff04fdc8a3` (2026-11-12). Nothing imported. |

### Models

| Capability | State |
|---|---|
| Mistral API | [V] Reachable; credential injected by the session proxy. |
| Mistral Large 4 | [V] Catalogue ids `mistral-large-4` and `mistral-large-4-0`. Live chat completion succeeded. |
| Tool calling (Large 4) | [V] `tool_choice: any` returned a well-formed function call. |
| Structured output (Large 4) | [V] `response_format: json_schema, strict` returned valid JSON. |
| Large 4 behaviour to design for | [V] It is a reasoning model: content arrives as a `thinking` block then a `text` block, and reasoning consumed 517 of 553 completion tokens on a trivial prompt. A 200-token cap produced no answer at all. Token budgets and parsers must allow for this. |
| GLM 5.3 / 5.3 Flash, DeepSeek 4.1 Flash | [V] Listed in the Mistral catalogue as `zai-glm-5-3`, `zai-glm-5-3-flash`, `deepseek-v4-1-flash-1017`. [N] Not called. |
| Unit prices (any model) | [N] Not verified. No cost figure in this report is a quote. |
| OpenAI / Codex | [V] **Unavailable.** The injected OpenAI key is rejected (`invalid_api_key`). Not retried. |
| Claude orchestrator | [V] This session. Sub-agents can be started on Opus, Sonnet, Haiku and Fable tiers [N: none started yet]. "Fable 5.1" is not offered; the substitute for sub-orchestration is a same-tier fork or Sonnet. |
| JEV decision model | [V] Not called. One reachability request was made to the service's root address during KIC-00; no decision endpoint was contacted, and none will be until the gate in §G is passed. |

### Tools and services

| Capability | State |
|---|---|
| Node 22, npm, pnpm, Python 3.13, Docker CLI, Chromium + Playwright | [V] Installed. Docker daemon [N]. Bun (OpenBot's toolchain) [N] not installed. |
| GitHub | [V] MCP tools available, scoped to this repository. No `gh` CLI. Repository settings (default branch, protection) cannot be changed by the agent [R: Kraken record of the same limit]. |
| CI | [N] None exists in this repository. GitHub Actions is presumed available. |
| Mistral Code Review Bot | [R] Per Kraken's records: controlled test **failed** (bot posts the model's block content as the comment body; GitHub 422); trigger suspended; fix waits in an unmerged pull request on the bot repository. **Not operational.** |
| Mistral router plugin (coding delegation) | [N] Not installed in this session. Direct API calls work as a substitute. |
| Claude-Mem | [N] Not installed. Git-native state is used instead. |
| Deployment and project-tracking connectors | [V] Present in the session. [N] Not exercised; nothing provisioned. |

---

## B. Reusable harness assessment (from Kraken's practice)

Kraken's repository holds a working method, not a framework: about 60 lines of operating instructions, three 21-line governance agent definitions, two state files, two CI workflows and a secret scanner. That is the right size.

Generalisable without any Kraken dependency:

1. **Session-start reconciliation** — read gate state, read latest checkpoint, compare with `git log`, then act.
2. **Order of authority** — approved spec and amendments > verified source and contracts > GitHub evidence > checkpoints > memory tools > model recollection.
3. **Two durable state files** — a gate ledger (status, evidence, open exceptions, owner actions) and an append-only checkpoint log with a fixed block format ending in `NEXT_ACTION`.
4. **Governance roles as read-only sub-agents** on a cheap model, each with one durable record, a fixed report format and a five-part veto (requirement, deficiency, evidence, remediation, escalation).
5. **Evidence vocabulary** — implemented / tested / reviewed / accepted are different states; a model's report of success is not evidence.
6. **Review ledger bound to commit SHAs**, including what the reviewer skipped.
7. **Controlled test before a check becomes mandatory**, and supply-chain inspection plus commit pinning for third-party Actions.
8. **CI as the enforcement floor** — secret scan, spec hash, required records present.
9. **Bounded review loops** — Kraken closed a three-round review cycle explicitly instead of looping.

Not to be imported: Kraken's execution-state model, contracts, data-store decisions, provider material, and its specific gate numbering.

What Kraken's harness lacks and the directive requires: a **Continuity Guardian** role (Kraken has three roles, not four), **machine-enforced stop conditions** (Kraken's are instructions plus CI), a **task/dependency ledger** a scheduler can read, and the **Decision Readiness Gate**.

`aeh` must be read before any of this is built. If it already implements these, adopt it.

---

## C. OpenBot technical assessment

Upstream `CopilotKit/OpenBot` @ `804aa69`, version 1.0.1, root licence MIT (© 2026 CopilotKit).

### Size and shape [V]

| Workspace | Files | TypeScript lines |
|---|---|---|
| `server` | 1,254 | 422,675 |
| `app` | 1,282 | 253,576 |
| `extension` | 210 | 63,012 |
| `shared`, `toolkit`, `supervisor`, `worker`, `agent-bot` | 186 | 23,751 |

Plus desktop (Tauri), mobile, a Helm chart, SPIRE identity, sixteen `agent-*` framework adapters, 106 database tables, and SSO/SCIM/team/admin/audit/billing subsystems. This is a multi-user enterprise workspace product, not a lightweight template.

### Licensing [V]

- Application source: MIT.
- npm dependencies checked: `@copilotkit/runtime`, `react-core`, `shared`, `learning`, `license-verifier`, `channels-core`, `channels-intelligence`, `@ag-ui/client`, `@ag-ui/core` — all declare MIT.
- **CopilotKit Intelligence** (durable threads, memory, learning, governance) is a separate service under a separate licence. Free tier for local use with a 30-day renewable local licence; trial licence for Kubernetes evaluation; paid licence for production [R: upstream README].
- [N] Full transitive licence scan of `bun.lock` (≈425 KB) not done. Required before any code is imported.

### Intelligence coupling [V/R]

- The server **refuses to start** without `INTELLIGENCE_API_URL`, `INTELLIGENCE_GATEWAY_WS_URL` and an Intelligence API key (`server/src/config.ts`, `runtimeCapabilities`): "CopilotKit Intelligence is required and is not configured."
- The source states there is no other mode: "`RuntimeCapabilities` has exactly one mode … there is no not-in-Intelligence-mode branch to write here" (`server/src/index.ts`, near line 895).
- Conversation threads live in Intelligence, not in OpenBot's Postgres. 75 non-test server files, 22 app files and 11 toolkit files reference it.
- No in-memory or local fallback runner is wired anywhere in OpenBot.

### The primitives underneath are independent [V]

`@copilotkit/runtime@1.85.0` was installed in a scratch directory. Its v2 entry point exports `CopilotRuntime`, `InMemoryAgentRunner`, `BuiltInAgent` and `createCopilotEndpoint`, and `new CopilotRuntime({ agents, runner: new InMemoryAgentRunner() })` **constructs with no Intelligence configuration**. So the answer to the go/no-go splits in two:

| Question | Answer |
|---|---|
| Does the **OpenBot application** run without Intelligence? | **No**, by design, and removing it means replacing thread storage across a 420k-line server. |
| Do the **MIT primitives OpenBot is built on** (CopilotKit runtime v2, React core v2, AG-UI) run without Intelligence? | **Constructs: yes [V]. End-to-end chat, tools and UI: to be proven in KIC-01.** |

Caveats found in the runtime package, to be closed in KIC-01: it enables telemetry by default (`COPILOTKIT_TELEMETRY_DISABLED=true` opts out) and depends on `@scarf/scarf`, `@segment/analytics-node` and `@copilotkit/license-verifier`; the in-memory runner is not durable; thread listing needs an identity callback.

### Recommendation

**Option A, narrowed: do not clone-and-strip the OpenBot application. Build the KIC workspace directly on the same MIT primitives (CopilotKit runtime v2 + React core v2 + AG-UI), and lift individual MIT-licensed OpenBot UI components only where one saves real work, each with provenance recorded.**

Reasons: stripping 750k lines to reach a single-instance campaign tool is a large reconstruction of exactly the kind the directive rules out; the product's deployment model (one client-owned instance, no tenancy) makes most of OpenBot's server irrelevant; and independence from Intelligence is native on the primitives but an invasive rewrite in the application.

Fallback if KIC-01 fails: **Option B** — AG-UI protocol with a minimal own React chat surface and no CopilotKit packages. The agent coordinator, skills and gateway are unaffected by this choice because they sit behind AG-UI.

---

## D. AEH architecture proposal

**Option C: compose existing tools behind a small set of files.** No new framework, no service, no database.

"DeepSeek Harness" could not be assessed: no repository was identified. A URL is needed (§I, OD-2).

```
harness/
  config/models.json        role → verified model id, with verification date and substitute
  policies/AUTHORITY.md     permission matrix, reserved decisions, stop conditions
  state/GATE_STATE.md       gate ledger, exceptions, owner actions
  state/CHECKPOINTS.md      append-only checkpoint log
  state/tasks.json          work packages: id, owner, deps, gate, status, stop flags   (stage 1)
  state/REVIEWS.md          review ledger bound to commit SHAs                          (stage 1)
  plugins/                  one small adapter contract per capability                   (stage 2)
  scripts/                  gate-check, readiness-check, secret-scan, review-binding    (stage 1–2)
.claude/agents/             spec-guardian, gatekeeper, review-coordinator, continuity-guardian
```

| Concern | Mechanism | Enforced by |
|---|---|---|
| Kernel | Claude Code session + sub-agents + git worktrees | existing tooling |
| Plugin contract | Each adapter declares `capability`, `verify` command, `invoke`, `permissions`, `fallback`. A capability is usable only after `verify` has passed and the result is recorded in `models.json` or the gate ledger. | script |
| Local stop | `status: blocked` on one task | scheduler skips it and its dependants |
| Gate stop | gate row not `ACCEPTED` | `gate-check` script in CI fails pull requests that touch paths owned by a later gate |
| Global stop | file `harness/state/GLOBAL_STOP` present | a Claude Code `PreToolUse` hook denies write and execute tools; CI fails |
| Review binding | `REVIEWS.md` row must name the head SHA and a reviewer that is not the author | CI script; required check once controlled-tested |
| Reserved decisions | protected `main`, human merge | GitHub branch protection (owner must configure) |
| Continuity | checkpoint block at each stop; session start reconciles ledger, checkpoint and `git log` | Continuity Guardian + required-records CI check |
| Decision Readiness Gate | `readiness-check` lists open owner decisions, tasks they block, runnable fallback queue, spend and time envelope; refuses to pass with an empty queue | script, run before an unattended window |

Staging, so the harness never delays the product proof: **stage 0** (this commit) is instructions and two state files; **stage 1** lands with KIC-01 (CI, task ledger, review ledger, guardians); **stage 2** before the first KIC-02 merge (hooks, plugin contracts, readiness check). Extraction to another repository is copying `harness/` and `.claude/agents/`.

---

## E. Product architecture proposal

One deployable instance per client: one Node process, one data directory, one environment file.

```
web (React, CopilotKit react-core v2)          client-specific: config/, branding/, extensions/
        │  AG-UI over HTTP/SSE
server (Hono)
  ├─ coordinator        bounded skill pipeline; limits on parallelism, tokens, time, revision passes
  ├─ gateway/           provider-neutral chat interface (messages, tools, json_schema) → Mistral adapter
  ├─ skills/            versioned catalogue: manifest + input/output JSON Schema + fixtures
  ├─ evaluation/        Evaluator interface → deterministic mock | rubric evaluator | JEV adapter (disabled)
  ├─ evidence/          CreatorEvidence interface → labelled fixtures (SocialCrawl/Naano later)
  ├─ store/             file-backed (SQLite if needed): briefs, programmes, candidates, decisions, approvals
  └─ commands/          provisional publishing-command fixtures
```

- **Skills for the first proof:** `campaign-brief`, `narrative-fanout`, `linkedin-draft`, `post-evaluate`, `programme-assemble`. The creator and performance skills are deferred with fixtures only.
- **Evaluation boundary:** generation and evaluation are separate calls with separate prompts; scores are stored with criteria, rationale, evidence references and a confidence, and are displayed as model judgements, never as measurements.
- **Provisional command schema:** `kic.provisional-publish-command/v0`, every document carrying `"authoritative": false, "executable": false`, and no field that names an endpoint, credential or schedule trigger. Kraken's contract replaces it; KIC keeps a translator, not the schema.
- **No execution authority:** the runtime holds no publishing, advertising or outreach credential and has no tool that could use one.
- **Template versioning:** semver-tagged releases; client configuration and extensions live outside `src/` so an upgrade is a tag change.

---

## F. Model and delegation plan

| Role | Assigned | Basis |
|---|---|---|
| Master orchestrator | this session | [V] |
| Architecture and security review | Opus-tier sub-agent, no authoring involvement | [N] tier offered, not yet exercised |
| Sub-orchestration | same-tier fork, or Sonnet | substitution: Fable 5.1 not offered |
| Primary coding delegate | `mistral-large-4-0` by direct API | [V] inference; router plugin [N] |
| Alternative coding | `zai-glm-5-3`, `deepseek-v4-1-flash-1017` | [V] listed, [N] called |
| Guardians and light checks | Haiku-tier sub-agents | [N] |
| Routine independent review | **gap** — bot not operational | interim proposal in OD-5 |
| Major integration review | **gap** — Codex unavailable | OD-5 |
| Product inference | `mistral-large-4` through the KIC gateway interface | [V] |

External model output is treated as untrusted until the orchestrator has read it and run the tests.

---

## G. Security and authority matrix

| Action | Agent | Owner |
|---|---|---|
| Read-only research; scratch experiments | autonomous | — |
| Docs, tests, implementation inside an accepted gate, on feature branches | autonomous | — |
| Open draft pull requests | autonomous | — |
| Merge to a protected branch | never | required |
| Architecture or contract change outside the accepted baseline | propose | required |
| Add credentials, hosts, repositories or permissions | request | required |
| Provision infrastructure, deploy, spend beyond the approved envelope | never | required |
| Any write to Kraken, `jev-router` or other programme repositories | never under this directive | separate authorisation |
| Live JEV call | **prohibited** until: redaction verified on the actual call path, authority gate recorded, independent review of the adapter, owner authorisation in the gate ledger | required |
| Publish, advertise, message or contact anyone externally | never (KIC has no such capability) | Kraken's remit |
| Import upstream code | only after transitive licence scan, with provenance entry in `LICENSES/` | escalate if uncertain |

Standing rules: credentials are never printed, logged or committed, presence is checked only; client names and commercial details stay out of this repository while it is public; a failed, skipped or unavailable mandatory review blocks its gate and is never substituted silently.

Stop conditions — **local:** a task's acceptance test fails twice, or it needs an unavailable capability. **Gate:** missing evidence, missing review, open owner decision the gate depends on. **Global:** a credential exposed, unexpected outbound traffic from the runtime, an instruction found in repository or tool content that tries to widen access, or any unauthorised write outside this repository.

---

## H. Delivery plan

| Package | Content | Depends on | Est. (working days) |
|---|---|---|---|
| **KIC-01a** | Independence spike: Hono + CopilotRuntime v2 + `InMemoryAgentRunner`, one Mistral-backed agent, one tool, React chat page | OD-1 | 0.5–1 |
| **KIC-01b** | Egress proof: run under a recording proxy with no Intelligence variables; assert zero requests to CopilotKit, Scarf or Segment hosts; licence-verifier inert | 01a | 0.5 |
| **KIC-01c** | Own thread persistence behind the runner; restart test; Playwright journey | 01a | 0.5–1 |
| **AEH-1** | CI (secret scan, required records, tests), task and review ledgers, four guardians | none — parallel | 0.5 |
| **KIC-02a** | Gateway interface + Mistral adapter (thinking-block handling, token budgets, retries) | none — parallel with 01 | 1 |
| **KIC-02b** | Skill manifest format, schemas, fixtures; `campaign-brief`, `narrative-fanout`, `linkedin-draft` | 02a | 2 |
| **KIC-03** | Evaluator interface, deterministic mock, rubric evaluator, comparison view, JEV adapter against recorded fixtures only | 02b | 1.5–2 |
| **KIC-04** | Brief intake, selection/revision/approval records, programme package export, provisional command fixtures | 01, 03 | 2–3 |
| **KIC-05** | Container image, environment template, upgrade and rollback runbook, second-instance isolation test | 04; owner approval to provision | 1–2 |

**Critical path:** OD-1 → KIC-01a → 01c → KIC-04. KIC-02a/02b and AEH-1 run in parallel with KIC-01 because they do not depend on the UI choice.

**Against the directive's targets:** independence proof 1–2 days — **credible on the recommended path**; not credible if the OpenBot application itself must be stripped. Mistral and skills at 3–5 days cumulative — credible. Controlled pilot at 5–8 days cumulative — **tight; 8–11 is more likely**, because editorial selection, approval records and export are real product surface that OpenBot does not hand over for free on this path.

**Cost:** unit prices are unverified. Observed: roughly 500–600 completion tokens for a trivial structured call, dominated by reasoning. A full campaign run (brief → 3 narratives → 3 posts × 3 variants → evaluation) is on the order of 40–60 calls; a spend envelope is requested in OD-6 rather than estimated.

**Primary risks**

| Risk | Mitigation |
|---|---|
| CopilotKit v2 UI features turn out to be gated at runtime without Intelligence | KIC-01a is timeboxed to one day; fallback is Option B behind the same AG-UI boundary |
| Telemetry or licence check egress from the runtime in a client-owned instance | KIC-01b is a pass/fail gate |
| No operational independent reviewer | OD-5; gates needing review stay blocked rather than downgraded |
| JEV expectation mismatch (see OD-3) | evaluator interface with mock first |
| Reasoning-token cost and latency of Large 4 in fan-out | explicit per-run token and time ceilings; cheaper model for evaluation passes if quality holds |
| Private Kraken or client detail leaking into a public repository | OD-4 |

---

## I. Owner decision register

Only decisions that block or redirect work. Detail and status are tracked in `docs/decisions/OWNER_DECISIONS.md`.

| ID | Decision | Recommendation | If deferred |
|---|---|---|---|
| **OD-1** | Foundation for the workspace | Build on the MIT CopilotKit runtime v2 / React core v2 / AG-UI primitives; do not strip the OpenBot application. Alternatives: strip OpenBot (large, licence-entangled); no CopilotKit at all (Option B). | KIC-01 cannot start. KIC-02a and AEH-1 can. |
| **OD-2** | Access to `aeh` and `mistral-code-review-bot`; URL for "DeepSeek Harness" | Grant read access to both for this programme. | AEH is built from Kraken's pattern and may duplicate `aeh`. |
| **OD-3** | JEV's role | JEV is a decision model: it scores, chooses and ranks; it does not write. Generation fan-out is Mistral's job; JEV becomes one optional evaluator. JEV stays disabled; state which gate governs activation (Kraken's open redaction item, or a KIC-specific one). | No effect on KIC-01–04: the mock evaluator is used. |
| **OD-4** | Repository visibility and settings | Make the repository private before any client or commercial content lands; create `main`, make it default, protect it. The agent cannot do either. | Work continues on the feature branch with no pull request possible (no base branch), and commercial content is withheld. |
| **OD-5** | Independent review mechanism | Interim: an independent Opus-tier agent with no authoring context, recorded per commit SHA; restore the Mistral bot when its fix is merged and controlled-tested; Codex or an approved alternative before KIC-06. | Gates that require independent review stay blocked. |
| **OD-6** | "Sales Crusader LLM gateway" and spend | Name the gateway service and its interface, or approve calling the Mistral API directly behind KIC's own provider-neutral interface. Set a spend ceiling for KIC-01 to KIC-04. | KIC-02a proceeds against Mistral directly, flagged as provisional. |
