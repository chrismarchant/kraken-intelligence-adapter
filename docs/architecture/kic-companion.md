# KIC companion — architecture

One instance per client. One data directory, one model key, one operator key. No shared service, no tenancy.

```
 editor ──────────────────────────────┐                     agent workspace (OpenBot-derived, or any MCP client)
   │ operator tool (holds signing key) │                              │ MCP over HTTP or stdio
   ▼                                   │                              ▼
 operator channel  ◄── notices ────────┼──────────────  KIC MCP server (holds public key only)
 (outside the agent's reach)           │                    │  12 tools; none publishes; none records a decision
                                       │                    ▼
                                       └── signed ──►  campaign workflow ──► campaign store (one file per campaign)
                                           decisions        │
                                                            ├─► model gateway ──► [shim] ──► Mistral Large 4
                                                            ├─► evaluator ──► deterministic mock   (no live JEV transport)
                                                            └─► assembly ──► programme package + NON-EXECUTABLE commands
```

## Components

| Module | Responsibility |
|---|---|
| `src/contracts/` | The typed shapes of everything stored or exported. Strict: unknown fields are refused. |
| `src/gateway/` | `ModelGateway` interface. `MistralGateway` streams, retries transient failures, retries a cut-off answer once at double budget, caps provider requests, reports cost even on failure, and can be cancelled. `FixtureGateway` replays recorded output; a missing recording is an error. |
| `src/shim/` | Reverse proxy that makes Mistral Large 4's block-structured responses conform to what an OpenAI-compatible client expects. Needed by OpenBot; not needed by KIC's own gateway. See `model-shim.md`. |
| `src/skills/` | Versioned prompts, the shapes the model must return, and the skills catalogue. |
| `src/evaluation/` | `analyseDraft`: deterministic observations and mandatory constraints. `buildJevRequest`: one fan-out request in the decision model's shape, redacted, with the client's name removed. `MockJevTransport`: deterministic answers. `createJevTransport("jev")` throws. |
| `src/workflow/service.ts` | The campaign workflow. Every model-backed step runs in three phases: reserve (under the campaign lock: check, build requests, charge the calls), call (outside the lock, bounded concurrency, cancellable), settle (under the lock: record cost, re-check state, apply or discard). |
| `src/workflow/signing.ts`, `ledger.ts` | Ed25519 signing of editorial decisions as a chain (each names its number and its predecessor's digest), verification of the whole log, and the operator's ledger of each log's head. |
| `src/workflow/assemble.ts` | Builds a preview of the programme package from validly approved material only; `releaseProgramme` is the editor's signed sign-off; exports either. |
| `src/creators/` | Typed creator evidence and a transparent weighted ranking with mandatory eligibility. Runs on fixtures only; contacts no one. |
| `src/store/` | One JSON file per campaign. All writes go through `update`, serialised per campaign by an in-process mutex and a lock file that names its owner. A lock is taken over only when its owning process is gone. Writes go to a temporary file, are flushed and renamed. One machine only. |
| `src/store/lock.ts` | The same owner-checked lock for the small state files that processes share: the instance's spend account and the operator's ledger. |
| `src/mcp/` | The MCP server and its stdio and HTTP entry points. |
| `src/workflow/spend.ts` | The instance's own account of model spending, kept outside the campaign store: per-campaign charges, instance ceilings and the count of campaigns. Charged at a step's worst case before a model is called, corrected afterwards. |
| `src/cli/operator.ts` | The editor's tool: `init`, `list`, `show`, `confirm`, `decline`, `review`, `release`, `verify`, `new-ledger`. The only place a decision is recorded or a package released. It reads what a request is from the campaign record; prints stored text only behind a margin, with control and invisible characters and runs of spaces made visible and long lines broken by the tool; prints every value a request digest covers; and makes the editor give back the action, the subject and the whole request digest before it signs. `review` shows the brief's constraints, the plan and the approved posts and prints the release digest that `release` requires. `verify` checks a released package and the commands file beside it. |

## Limits (defaults in `src/limits.ts`)

| Limit | Default |
|---|---|
| Narratives per campaign | 5 |
| Posts per campaign | 24 |
| Draft variants per post | 4 |
| Revision passes per draft | 2 |
| Model calls in flight | 3 |
| Model steps per campaign | 80 |
| Campaigns per instance | 50 (provisional) |
| Model steps per instance | 2,000 (provisional, pending OD-6) |
| Completion tokens per instance | 10,000,000 (provisional, pending OD-6) |
| Posts drafted by one drafting step | 6 |
| Completion tokens per campaign | 400,000. A step reserves three times its nominal allowance while in flight, which is the most its calls can use. |
| Lifetime of an unsettled step's reservation | 30 minutes, then charged in full |
| Time per model call | 180 s, then cancelled |
| Provider requests per model call | 6, all retries included |
| Decisions waiting for the editor | 25 |
| Lifetime of a decision request | 30 minutes |

One call can use at most three times its allowance: once at the allowance, and once at double if the answer was cut off. That worst case is what a step reserves, so steps started together cannot overspend between them. A consequence of the default limits: one drafting step could reserve for at most eleven posts (11 × 12,000 × 3 = 396,000). Drafting therefore works in batches. Asked without named posts, `kic_generate_drafts` drafts the next posts that have none, at most six per call and fewer if the remaining calls or tokens cover fewer, and reports `slotsWithoutDrafts`; the caller asks again until that list is empty. Asked with named posts it drafts all of them or refuses. A 24-post programme is drafted in four calls under the default limits (tested with the scripted model, not run live).

## Configuration

Agent-facing server (`npm run mcp:http` or `mcp:stdio`):

| Variable | Meaning |
|---|---|
| `KIC_DATA_DIR` | Campaign store and exports. Default `./data`. |
| `KIC_OPERATOR_DIR` | **Required.** Where decision notices are written for the editor, and by default where the server keeps its spend account (`server-spend.state`). Must be outside the data and working directories. |
| `KIC_SPEND_FILE` | The spend account, if not in the operator directory. Must be outside the data and working directories. |
| `KIC_MAX_CAMPAIGNS`, `KIC_MAX_INSTANCE_MODEL_CALLS`, `KIC_MAX_INSTANCE_COMPLETION_TOKENS` | Instance ceilings, if not the defaults. |
| `KIC_DECISION_PUBLIC_KEY_FILE` | **Required** (or `KIC_ALLOW_UNSIGNED_DECISIONS=1` for development only). The operator's public key. |
| `KIC_MODEL_MODE` | `live` (default) or `fixture`. |
| `KIC_MODEL_BASE_URL`, `KIC_MODEL`, `MISTRAL_API_KEY` | Model endpoint (https, or http on loopback), model name, key. |
| `KIC_REASONING_EFFORT` | `low`, `medium` or `high`. |
| `KIC_EVALUATOR` | Only `mock-jev` is accepted. |
| `KIC_MCP_HOST`, `KIC_MCP_PORT`, `KIC_MCP_TOKEN` | HTTP endpoint. A token of at least 24 characters is required unless `KIC_MCP_ALLOW_UNAUTHENTICATED=1` on loopback. |
| `KIC_MCP_ALLOWED_HOSTS`, `KIC_MCP_ALLOWED_ORIGINS` | Extra Host names and browser Origins to accept. |

Operator tool: the same data and operator directories, plus `KIC_OPERATOR_KEY_FILE` (the private key). The tool keeps its ledger in `<key file>.ledger.json` and writes releases to `releases/` beside the key, or to `KIC_RELEASE_DIR`.

## Deployment requirements that code cannot enforce

1. The operator's private key **and its ledger file** must be readable and writable only by the editor's tool: a different operating-system user, container or machine from the agent runtime and from the MCP server. If the key is readable elsewhere, every control falls. If the ledger is deleted, the tool stops until a person restores it or starts a new one with `new-ledger --accept-current-state`, which trusts every decision log as it then stands.
2. The operator channel directory must be unwritable by the agent runtime and should be unreadable. It holds the server's spend account: an agent that can write it can reset the instance's spending. An agent that can read it can see one-time codes, and one that can write it can plant notices, but neither can record a decision (no key) or change what the editor is shown (read from the record).
3. The campaign store should not be writable by the agent runtime's own tools. A writer cannot forge, reorder or remove a decision without detection, cannot make changed text, a changed brief or a changed plan count as approved, and cannot reset the instance's spend account, but can delete or corrupt records, void decisions by changing what they rest on, and make a preview from a log with its tail removed. A preview is not a release. A consumer should accept only a package that `verify` accepts.
4. The store, the MCP server and the operator tool run on one machine.
5. The MCP HTTP endpoint should be reachable only from the workspace that uses it.

## With OpenBot

Intended shape, **not yet run**: OpenBot unmodified; `tenant-package/` selected with `TENANT_PACKAGE_DIR`; the KIC MCP server added by URL with id `kic` and granted to the Campaign Assistant by an admin (at `v1.0.2` OpenBot accepts a custom server only over https at a hostname: OD-20); `OPENAI_BASE_URL` pointing at the shim and `COPILOTKIT_OPENAI_API=chat`. The editor confirms decisions with the operator tool. Whether OpenBot should carry an operator-facing confirmation surface is an open owner decision (OD-9).

Automatic approval of learned skills must stay off, and nothing learned or remembered by Intelligence is authoritative for contracts, permissions or approved skills.

## With Kraken

None. `ProvisionalPublishCommand` is KIC's own provisional shape; its schema cannot express an executable command, and `translation.contract` is always null. A translator to Kraken's accepted contract is deferred to KIC-06.
