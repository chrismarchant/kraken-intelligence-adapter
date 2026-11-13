# Client instance template — proposal

Status: **proposed, not executed.** No infrastructure has been provisioned and nothing has been deployed. Deployment is gate KIC-05 and needs the owner's authorisation. This document describes the shape an instance would take so that the gate can be planned.

## One instance, one client

Each client gets its own copy of everything below. Nothing is shared between clients: no database, no service, no credential, no operator key.

| Part | What runs | Holds |
|---|---|---|
| Workspace | OpenBot at a pinned upstream release (pending OD-1), or the minimal fallback | Conversations. With OpenBot, threads and memory live in that client's Intelligence project. |
| KIC MCP server | `node src/mcp/http.ts` | The campaign store and exports. The operator's **public** key. |
| Model shim | `node src/shim/server.ts`, key-injection mode | The client's model provider key. The workspace is given only the shim's client token. |
| Operator tool | `node src/cli/operator.ts`, run by the editor | The operator's **private** key, its ledger, and the released packages (`releases/` beside the key). Reads the operator channel. |
| PostgreSQL with pgvector | Only if the workspace is OpenBot | OpenBot's own tables |

## Separation that the instance must provide

These are the deployment requirements in `docs/architecture/kic-companion.md`, stated as checks for the KIC-05 gate:

1. The operator's private key and its ledger file are readable and writable only by the editor's account. The MCP server, the shim and the workspace cannot read it. **Test:** from each of those processes' accounts, reading the key file fails.
2. The operator channel directory is writable by the MCP server and readable by the editor's account, and is neither readable nor writable by the workspace or its tool sandbox. It also holds the server's spend account (`server-spend.state`): anything that can write it can reset the instance's spending. **Test:** from the workspace's account, creating a file in the directory fails.
3. The campaign store is writable only by the MCP server and the operator tool.
4. The MCP endpoint and the shim listen on a private interface, each behind its bearer token. **Test:** a request without the token is refused; a request with a foreign `Host` is refused.
5. No outbound connection is possible from the instance except to the model provider and, with OpenBot, to that client's Intelligence project. **Test:** record egress during a campaign run and compare with that list.

## Configuration that belongs to the client

Kept outside the template's source, in the instance:

- `tenant-package/` — the Bot, its skills, branding and model name.
- The instance's environment file — directories, tokens, model endpoint, reasoning effort. No secret is committed anywhere.
- The operator key pair, created on the editor's machine with `operator.ts init`.

## Versions, upgrade and rollback

- The template is released as a tagged version of this repository. An instance records the tag it runs.
- Contracts carry a schema name and version (`kic.programme-package/v0`, `schemaVersion`). A release that changes a stored shape must ship a migration for campaign files and say so in its notes. None exists yet because nothing has been released.
- **Upgrade:** stop the MCP server; copy the data directory aside; switch to the new tag; `npm ci`; `npm run check`; start. Run the offline demo (`node src/cli/demo.ts`) as a smoke test.
- **Rollback:** stop; switch back to the previous tag; restore the copied data directory; start. Campaign files written by a newer version may not be readable by an older one, which is why the copy is taken first. If decisions were recorded after the copy was taken, the operator tool will report the restored campaigns as rolled back, because its ledger remembers the later decisions. That is the control working. To carry on from the restored state, the editor runs `new-ledger --accept-current-state` after moving the old ledger aside, which accepts every decision log as it then stands; the decisions made after the copy are gone and must be made again.
- With OpenBot, its own upgrade follows upstream's documented release-and-upgrade procedure, at a pinned release. The pinned release is changed deliberately, never by tracking the upstream branch.

## What KIC-05 would have to demonstrate

| Acceptance item | How |
|---|---|
| Reproducible deployment | Two instances built from the same tag and different environment files behave identically on the offline demo |
| Independent configuration | The two instances use different tenant packages, tokens and operator keys |
| Secrets isolation | The five checks above pass on each; a decision signed for one instance is refused by the other |
| Versioned template, upgrade and rollback | An upgrade and a rollback are carried out on one instance with its campaigns intact |
| No multi-tenant dependency | Stopping or deleting one instance has no effect on the other |

## Not decided

Where instances run, who operates them, how the editor is authenticated beyond holding the key (OD-9), and whether OpenBot is the workspace (OD-1).
