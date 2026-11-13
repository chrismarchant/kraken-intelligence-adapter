# A1 — OpenTag, and OpenBot at its release tag

Addendum to mediation KIC-ARCH-MED-01, written after the owner's direction of 2026-11-13 ("Do not infer release capabilities from upstream main"; "Permit read-only OpenTag/Channels assessment").

**Source inspection only. Nothing was built, installed or run.** Two independent read-only audits covered the same ground: one of OpenTag and of OpenBot `v1.0.2` against main, one inside the re-review of the corrected package. Where the orchestrator re-read a point in source it says "re-read".

| Subject | Commit | Date |
|---|---|---|
| OpenBot, release tag `v1.0.2` | `cca9f60` | 2026-11-11 |
| OpenBot, main (what D2 was written from) | `f8af37a` | 2026-11-12 |
| OpenTag, main | `aa3d26c` | 2026-10-13 |

## Part 1 — OpenBot `v1.0.2` against main

### The capabilities the recommendation relies on are present at the tag

Checked at `v1.0.2` by both audits; the files are byte-identical to main unless noted.

| Capability | At `v1.0.2` |
|---|---|
| CopilotKit Intelligence required at start | Present, same |
| Editions: what the personal edition lacks and has fixed on | Present, same (re-read) |
| Learned skills approved automatically by default in the personal edition | Present, same |
| Approval kinds, their defaults, and an admin's two ways to close one (team edition) | Present, same (re-read) |
| Capability switches for browser, network, computer and password manager (team edition) | Present |
| Action policy with deny rules; default allows everything | Present (re-read) |
| Network policy for the Bot computer; private-address floor | Present (re-read) |
| Check-in read-only restriction | Present, same |
| Tasks start only from a check-in | Present, same |
| Routines: run as their creator, 15-minute floor, 10-minute grace, need a worker or cron | Present, same core behaviour |
| Hand-off between Bots, needing a grant | Present, same |
| Tenant package: Bots and skill grants only; no tool grants, no routines | Present, file identical |
| OpenTag pairing; direct Slack settings refused | Present, same |
| Audit table append-only by trigger | Present |
| Model through an OpenAI-compatible endpoint (`OPENAI_BASE_URL`, `COPILOTKIT_OPENAI_API`) | Present |
| Private runtime methods used for headless turns | Present |

### What differs

| Point | At `v1.0.2` | On main | Consequence |
|---|---|---|---|
| **Attaching a custom MCP server** | An admin adds it with one stored credential used for everybody. The address must be https, and may not be an address literal, `localhost` or an internal name (re-read). No loopback option | Adding by address with OAuth; a loopback override (`OPENBOT_ALLOW_LOOPBACK_MCP`); allow-listing by address | **The KIC MCP server cannot be attached over loopback to an unmodified `v1.0.2`.** It would need TLS and a hostname. Whether a hostname that resolves to a private address is then reachable was not determined. This is a new risk to the first proof and to the instance design, which assumes a private interface |
| Skin names | `openbot`, `openduet`, `opendots`, `openmuse` | `openmuse` renamed `openfuse` | Naming only |
| REST API specification (`api/openapi.yaml`) | Absent | Present | D2's statement about a published REST specification is true of main only |
| Goals linked to routines; goals that end when met | Absent | Present (two migrations) | Not relied on |
| Database | Migrations to 0088 | 0089 to 0091 added | A release cannot be upgraded to main's schema by this programme |
| Version | `v1.0.2` is the latest tag; D2 said 1.0.1, from main's package file | — | Corrected: the tag to pin is `v1.0.2` unless a later one exists when Phase 0 runs |

Between the tag and main, 56 files under the server differ. Those not read in detail: the conversation-channel routes, the setup checklist, and parts of the proactive code.

### What "closing" an action means, exactly (re-read)

| Admin setting | What a person sees | Can the Bot do it? |
|---|---|---|
| Members choose (the default) | Allow once, for this conversation, always; or deny | Yes, after any allow, and permanently after "always" |
| Ask every time | Allow once, or deny | **Yes, after one click** |
| Members do it themselves | "I did it myself" or "Don't do it" | **No. "The Bot never does it."** |

Only the last is a block, and it exists only in the team edition: in the personal edition the team settings are not read. Actions are recognised by the name of the tool or button, so a posting action under another name is not caught; a deny rule in the action policy is the control that does not depend on names.

### Confinement at the tag, summarised

| Control | Team edition | Personal edition |
|---|---|---|
| No Bot computer | Possible: none is configured unless one is set. Which tools are then offered was not read | **Not possible: a computer is mandatory**, shared with the person |
| Browser, network and password-manager capabilities off | Possible, by an admin | **Not possible: fixed on** |
| Kinds set to "Members do it themselves" | Possible | **Not possible: not read** |
| Network policy for the Bot computer | Possible; cannot stop a raw socket | **Not read: allow all** |
| Action policy deny rules | Possible | Appears possible through the environment variable; no edition gate in the files read; not traced on every path |

**A personal-edition instance cannot be confined to preparation by configuration**, except perhaps through the action policy, which is unproven. For a client instance this points to the team edition, which needs an identity provider and a production Intelligence licence (OD-8, OD-15).

## Part 2 — OpenTag at `aa3d26c`

Channels integration is deferred by the owner. This is the read-only assessment that was permitted.

| Question | Finding |
|---|---|
| What it is | Two processes: a Node runtime (CopilotKit runtime 1.70.1 with one Channels SDK channel, 0.9.2) and a Python agent. MIT. Version 0.4.1, about 209 commits, June to October 2026 |
| Does it need CopilotKit Intelligence? | **Yes, enforced.** It refuses to start without an Intelligence key, and creates its channel with no adapters of its own. The defaults point at the hosted service |
| Who holds the Slack or Teams credentials? | **Intelligence.** They are entered there, not in OpenTag; the repository reads no Slack or Teams token. Messages arrive at an address hosted by Intelligence and reach OpenTag over an outbound connection |
| Can it run with only the client's own Slack or Teams credentials? | **No**, at this commit. Whether a self-hosted Intelligence could stand in is not determinable from the repository |
| Does it match what OpenBot `v1.0.2` expects? | **No.** OpenBot expects a sender context entry, an answer that says who clicked, an "always" option, and two endpoints for proactive posts and membership. None is in this commit, and OpenBot's own code answers "Update OpenTag…" in exactly these cases. Where a compatible OpenTag lives was not found: the clone has only this branch |
| Who may answer an approval card? | Anyone who can see it, unless the agent named an approver, which it does only for an action in one person's own connected account |
| What survives a restart? | No database. A paused approval is held in the agent's memory and is lost when the agent restarts |
| Identity | The Slack or Teams person as reported by the platform. No linking to an internal user, no allow-list of people, channels or workspaces. (OpenBot adds link codes on its side.) |
| Delivery | No statement of guarantees in the repository. Two runtimes on one channel race for a delivery |
| Social publishing | None in the code. An operator could attach third-party app toolkits that include social apps |
| Telemetry | None in the repository itself; the packages it depends on were not read. All message traffic passes through Intelligence by design |

**For the deferred decision (OD-14):** at the commits read, Slack or Teams for an OpenBot instance means messages and credentials passing through CopilotKit Intelligence, and an OpenTag that the public repository does not yet appear to provide in the form OpenBot expects. Neither fits a client-owned instance without further answers from the vendor.

## Not determined

- Whether anything described here works when run.
- Whether a hostname resolving to a private address satisfies OpenBot's rule for a custom MCP server in practice.
- Which tools an OpenBot team instance offers with no computer configured.
- Whether OpenBot's action policy is consulted on every outbound path.
- Whether CopilotKit Intelligence can be self-hosted for OpenTag's channel path, and on what terms.
- Where an OpenTag compatible with OpenBot `v1.0.2` is published.
