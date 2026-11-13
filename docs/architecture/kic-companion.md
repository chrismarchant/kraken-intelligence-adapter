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
| `src/workflow/signing.ts` | Ed25519 signing and verification of editorial decisions. |
| `src/workflow/assemble.ts` | Builds the programme package from validly approved material only, and exports it. |
| `src/store/` | One JSON file per campaign. All writes go through `update`, serialised per campaign by an in-process mutex and a lock file, written to a temporary file, flushed and renamed. |
| `src/mcp/` | The MCP server and its stdio and HTTP entry points. |
| `src/cli/operator.ts` | The editor's tool. The only place a decision is recorded. |

## Limits (defaults in `src/limits.ts`)

| Limit | Default |
|---|---|
| Narratives per campaign | 5 |
| Posts per campaign | 24 |
| Draft variants per post | 4 |
| Revision passes per draft | 2 |
| Model calls in flight | 3 |
| Model steps per campaign | 80 |
| Completion tokens per campaign | 400,000 (checked against a step's nominal allowance before it starts) |
| Time per model call | 180 s, then cancelled |
| Provider requests per model call | 6, all retries included |
| Decisions waiting for the editor | 25 |
| Lifetime of a decision request | 30 minutes |

A step that retries a cut-off answer can use up to twice its nominal allowance on that retry, so the token limit can be overshot by one step's worth. It cannot be overshot repeatedly: the next step is refused.

## Configuration

Agent-facing server (`npm run mcp:http` or `mcp:stdio`):

| Variable | Meaning |
|---|---|
| `KIC_DATA_DIR` | Campaign store and exports. Default `./data`. |
| `KIC_OPERATOR_DIR` | **Required.** Where decision notices are written for the editor. Must be outside the data and working directories. |
| `KIC_DECISION_PUBLIC_KEY_FILE` | **Required** (or `KIC_ALLOW_UNSIGNED_DECISIONS=1` for development only). The operator's public key. |
| `KIC_MODEL_MODE` | `live` (default) or `fixture`. |
| `KIC_MODEL_BASE_URL`, `KIC_MODEL`, `MISTRAL_API_KEY` | Model endpoint (https, or http on loopback), model name, key. |
| `KIC_REASONING_EFFORT` | `low`, `medium` or `high`. |
| `KIC_EVALUATOR` | Only `mock-jev` is accepted. |
| `KIC_MCP_HOST`, `KIC_MCP_PORT`, `KIC_MCP_TOKEN` | HTTP endpoint. A token of at least 24 characters is required unless `KIC_MCP_ALLOW_UNAUTHENTICATED=1` on loopback. |
| `KIC_MCP_ALLOWED_HOSTS`, `KIC_MCP_ALLOWED_ORIGINS` | Extra Host names and browser Origins to accept. |

Operator tool: the same data and operator directories, plus `KIC_OPERATOR_KEY_FILE` (the private key).

## Deployment requirements that code cannot enforce

1. The operator's private key must be readable only by the editor's tool: a different operating-system user, container or machine from the agent runtime and from the MCP server.
2. The operator channel directory should likewise be unreadable by the agent runtime. If it is readable, the agent can see notices and one-time codes, but still cannot record a decision without the key.
3. The campaign store must not be writable by the agent runtime's own tools. A writer could not forge an approval, but could delete or corrupt records.
4. The MCP HTTP endpoint should be reachable only from the workspace that uses it.

## With OpenBot

Intended shape, **not yet run**: OpenBot unmodified; `tenant-package/` selected with `TENANT_PACKAGE_DIR`; the KIC MCP server added by URL with id `kic` and granted to the Campaign Assistant; `OPENAI_BASE_URL` pointing at the shim and `COPILOTKIT_OPENAI_API=chat`. The editor confirms decisions with the operator tool. Whether OpenBot should carry an operator-facing confirmation surface is an open owner decision (OD-9).

Automatic approval of learned skills must stay off, and nothing learned or remembered by Intelligence is authoritative for contracts, permissions or approved skills.

## With Kraken

None. `ProvisionalPublishCommand` is KIC's own provisional shape; its schema cannot express an executable command, and `translation.contract` is always null. A translator to Kraken's accepted contract is deferred to KIC-06.
