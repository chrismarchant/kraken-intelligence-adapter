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

## Additional requirements if the workspace is OpenBot — proposed by mediation KIC-ARCH-MED-01

**Proposals. None has been tried: there is no instance.** OpenBot is a general agent platform: its Bots can browse, sign in and act. An instance is prepare-only only if it is arranged to be. What is said about OpenBot here was read in its source at release tag `v1.0.2` and not run; `docs/security/CONFINEMENT-TEST-MATRIX.md` sets out what stands behind each control, and the first proof (D7 step 0) is where they are tested.

| # | Requirement | How it would be checked |
|---|---|---|
| 6 | OpenBot runs at a named release tag (`v1.0.2` at the time of writing), with its source unmodified | `git diff` against the tag is empty |
| 7 | **Team edition.** The personal edition cannot be confined by configuration: its Bot computer is mandatory, its browser, network and password-manager capabilities are fixed on, and it approves learned skills automatically by default | The edition as OpenBot reports it |
| 8 | **No Bot computer.** Campaign preparation needs no browsing | The Bot is offered no browser, shell or file tool |
| 9 | Built-in Bots only. No remote Bots: their own tools are outside OpenBot's approval policy | The Bot list |
| 10 | Each Bot holds only the KIC tools it needs. Grants are given by an admin in the instance (the tenant package does not grant tools) and are written down in the instance's runbook | The grants as OpenBot reports them, compared with the runbook |
| 11 | Nothing a Bot could use to act outside: no saved site logins; no publishing, messaging, mail or payment app connected; no app-broker key set | The password store, the connections list and the environment file |
| 12 | If a Bot computer is ever wanted: the browser, network and password-manager capabilities off, and the posting, sending, sharing and paying kinds of action set to **"Members do it themselves"**. "Ask every time" is not enough: a person can still allow the action once | The confinement test in the matrix, passing because of the control and not because of a network refusal |
| 13 | Learned skills are approved by a person | The learning settings; a proposal stays pending |
| 14 | Vendor telemetry is off (`COPILOTKIT_TELEMETRY_DISABLED`, `DO_NOT_TRACK`) | The environment file; recorded egress (check 5) |
| 15 | The model shim runs in key-injection mode with a model allow-list and a spend ceiling (`SHIM_ALLOWED_MODELS`, `SHIM_SPEND_FILE`, `SHIM_MAX_TOTAL_REQUESTS`, `SHIM_MAX_TOTAL_COMPLETION_TOKENS`); the spend file is outside the workspace's reach. The mechanism is built and tested; the figures are the owner's (OD-6) | A run that reaches the ceiling is refused |
| 16 | The KIC MCP endpoint is reachable by OpenBot. **At `v1.0.2` OpenBot accepts a custom MCP server only over https at a hostname, not at a loopback or private address, with one stored credential used by every Bot.** This conflicts with check 4 above as written and is unresolved | D7 step 0a |
| 17 | Routines, if used, are fired by a second process or a cron job, as upstream requires; anything that must not be missed has its own check, because a firing more than ten minutes late is skipped | A routine fires after a restart |
| 18 | Conversations hold nothing that the client has not agreed may be stored by the Intelligence service in use | Policy, and the licence answer (OD-8) |
| 19 | The KIC server's export directory (`KIC_EXPORT_DIR`) is outside the data directory and not writable by any agent process. The default puts it inside the data directory, which is not acceptable for an instance | The directory's owner and mode; an attempt to write to it as the agent's user fails |

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

Where instances run, who operates them, how the editor is authenticated beyond holding the key (OD-9), and whether OpenBot is the workspace (OD-1: decided provisionally, conditional on licensing, runtime verification and confinement).
