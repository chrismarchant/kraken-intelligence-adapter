# D1 — Current architecture baseline

**A dated snapshot. Superseded on the review state: `2537386` has since been approved by two agent review rounds; see `harness/state/GATE_STATE.md`.**

Mediation KIC-ARCH-MED-01. State of this repository at commit `dfa7458` on branch `claude/adoring-edison-4wlees`, 2026-11-13. Every statement was checked against the code or a ledger in this session; where something is design intent only, it says so.

## In one paragraph

What exists is a standalone campaign-preparation service with a governed editorial-approval path. It is **not** derived from OpenBot: it contains no OpenBot code, OpenBot has never been run by this programme, and the decision to adopt OpenBot as the workspace foundation (OD-1) is still open. The parts that would connect it to OpenBot — a model shim, an MCP server and a tenant package — are built and tested on their own. No gate has been accepted by the owner.

## Repository state

| Item | State |
|---|---|
| Branch | `claude/adoring-edison-4wlees`, 20 commits, pushed. No `main`, no pull request, repository public (OD-4). |
| Code | About 7,200 lines of TypeScript in `src/`; about 4,500 in `tests/`; about 850 in the harness scripts and hook, and about 880 in the harness tests. |
| Runtime dependencies | Two: `@modelcontextprotocol/sdk` 1.32.2 and `zod` 4.6.7. No CopilotKit package is a dependency. |
| Tests | 181 product tests and 83 harness tests pass at `dfa7458`; CI green on every push checked (runs 1–10, through `765ae20`). All offline. |
| Gates | None accepted. KIC-00 presented; KIC-01 evidence presented. |
| Independent review | Five rounds on the approval path, each returned changes-requested. Every high and medium finding was remediated with a regression test; a few informational items are recorded as not fixed (right-to-left letters, prompt tokens outside the budget, a stale-lock race on the spend account). The last fixes (`8e4696c`) are unreviewed. **No commit has an approving review.** |

## What is implemented (code present, tested)

| Capability | Where | Notes |
|---|---|---|
| Typed contracts | `src/contracts/` | Brief, narrative, plan, draft, evaluation, decision, programme package, provisional command. Strict schemas. |
| Model gateway | `src/gateway/` | Provider-neutral interface; streamed Mistral Large 4 adapter; recorded-fixture replay. Live against Mistral. |
| Campaign workflow | `src/workflow/service.ts` | Reserve → call → settle steps; bounded counts, concurrency, calls, tokens and time; batch drafting. |
| Evaluation | `src/evaluation/` | Deterministic eligibility rules in code; a deterministic stand-in shaped like the JEV decision model. **No live JEV transport exists.** |
| Editorial decisions | `src/workflow/signing.ts`, `ledger.ts`, `src/cli/operator.ts` | Ed25519-signed, chained decision log; operator-only key; operator ledger; request digest covering action, subject, content, planned post and brief; review-then-release. |
| Spend control | `src/workflow/spend.ts` | Per-campaign and per-instance ceilings in an account outside the campaign store. |
| MCP server | `src/mcp/` | 12 tools over stdio and HTTP. None publishes; none records a decision. |
| Model shim | `src/shim/` | Makes Mistral Large 4 usable by an OpenAI-compatible client such as OpenBot's. Live with streaming and tools. |
| Skills catalogue | `src/skills/` | Six implemented skills (brief, narratives, plan, drafts, revision, comparison); three deferred with no code path (creator discovery, audience evidence, performance learning). |
| Creator ranking | `src/creators/` | Typed contracts and a transparent ranking on synthetic fixtures only. |
| Engineering harness | `harness/` | Task ledger, gates, three stop levels, commit-bound reviews, secret scan, CI, installed global-stop hook. |

## What is design intent only (not run)

| Item | State |
|---|---|
| OpenBot as the workspace | Never booted here: no Intelligence project key, no pgvector in the session environment (OD-7). |
| `tenant-package/` | Passes OpenBot's own validator (run in scratch). Never loaded by a running OpenBot. |
| The shim and MCP server inside OpenBot | Exercised with the CopilotKit agent class and OpenBot's model client on their own, not inside the application. |
| Any user interface | None. The editor's surface is a command-line tool (OD-9). |
| Memory, automatic learning, routines, agent computers, channels | None implemented and none exercised. They exist only as observations about OpenBot in `KIC-01-ASSESSMENT.md`. |
| Deployment template | A proposal (`docs/deployment/INSTANCE-TEMPLATE.md`). Nothing deployed. |

## OpenBot-derived components

None in the codebase. Three things were shaped to fit OpenBot and nothing else was taken from it:

1. `tenant-package/` — configuration in OpenBot's tenant-package format.
2. `src/shim/` — written here; needed because OpenBot's model client rejects Mistral Large 4's block-structured responses.
3. The MCP server's HTTP transport — OpenBot attaches MCP servers by URL.

The earlier assessment pinned OpenBot at upstream commit `804aa69`. Upstream has moved since (`f8af37a` on 2026-11-12); see D2.

## Intelligence-to-execution interface, as it stands

One interface exists, and it is deliberately inert:

- `kic.provisional-publish-command/v0` (`src/contracts/command.ts`). Three literal guard fields (`status: "NON-EXECUTABLE"`, `authoritative: false`, `executable: false`); no endpoint, account or credential field and no scheduling time (the only timestamp is when the editor approved); relative sequence only. It is produced only inside a programme package, and a package counts only when the operator has released and signed it.
- The package (`kic.programme-package/v0`) carries the brief, the selected narrative, the plan, the approved posts, the signed decision log and provenance.

Nothing in this repository calls Kraken, and a read-only search of Kraken's repository found no reference to this repository, to OpenBot or to CopilotKit. There is no accepted execution contract for this side to conform to yet. The provisional command exists to be replaced by Kraken's contract when one is accepted; KIC-06 (Kraken integration) is deferred by directive.

## Accepted decisions and contracts

| Record | Status |
|---|---|
| Owner clarification of 2026-11-13: CopilotKit Intelligence may be used under a legitimately obtained licence; do not strip OpenBot before the full application is tested | **Accepted** (owner's words) |
| Hard rules in `CLAUDE.md`: prepares only; JEV disabled; decisions only through the operator tool; no multi-tenancy; no writes to Kraken | **In force** |
| Separation: KIC prepares, Kraken executes, Proteus sets long-term strategy | **In force** (founding directive) |
| OD-1 foundation (OpenBot unmodified + licensed Intelligence + tenant package + MCP server + shim) | **Open.** Recommended, conditional on C1–C3; never formally accepted |
| OD-2 … OD-11 | **Open** (`docs/decisions/OWNER_DECISIONS.md`) |
| OD-12 … OD-19 | **Open**, raised by this mediation (D5) |
| Architecture decision records | **None exist.** Decisions are kept in the owner decision register. D5 proposes the first records. |
| Kraken's contracts | Kraken's own; not changed and not copied here. Kraken states that it does not claim exactly-once external execution. |

## Safety, approval, memory and learning mechanisms today

| Mechanism | State |
|---|---|
| Approval | Enforced in code and signed (above). The only approval mechanism that exists. |
| Permissions | The MCP server exposes no tool that publishes, spends, contacts anyone or records a decision. HTTP endpoint needs a bearer token and checks Host and Origin. |
| Spend | Ceilings per campaign and per instance. |
| Memory | None beyond the campaign record. No conversational memory. |
| Learning | None. A "performance learning" skill is listed as deferred with no code. |
| Stops | Local, gate and global stops in the harness; the global stop is enforced by an installed hook in agent sessions. |

## Open items the mediation depends on

| Item | Why it matters here |
|---|---|
| OD-1 | Every option in D4 assumes or revisits it. |
| OD-7 (Intelligence key, an environment with pgvector) | No ecosystem capability can be proven at runtime without it. |
| OD-8 (licence confirmation) | Decides whether an OpenBot-derived, client-owned instance is permitted at all. |
| OD-9 (editor's surface) | OpenDuet, OpenDots and Channels all touch where a person approves. |
| OD-11 / review gate | The approval path has no approving review yet. |
| KIC-06 | Any real hand-off to Kraken waits on Kraken's own gates. |
