# Threat model

Scope: the KIC companion as built on 2026-11-13. Not a deployed system; nothing has been deployed.

## What must never happen

| # | Outcome | Why it cannot, as built |
|---|---|---|
| T1 | Content is published, scheduled, sent or promoted | No publishing client, credential or tool exists. A provisional command's schema pins `executable: false`, `authoritative: false`, `status: NON-EXECUTABLE` and has no endpoint, account or clock-time field. Guard tests search the source for publishing and outreach hosts. |
| T2 | An agent, a model or a process that can write the store makes, alters or undoes an editorial decision | Decisions are signed with a key held only by the operator tool, and chained: each names its number and its predecessor. The agent-facing server holds the public key, has no decision tool, and refuses to record a decision. A forged, moved, repeated or removed decision invalidates the whole log. Removal from the end is caught by the operator's ledger, which is outside the store. |
| T3 | A person's decision is lost, or applied to something they did not see | Writes are serialised per campaign and atomic. The operator tool shows the request from the campaign record, not from the channel; the editor names the action, subject and content hash; a mismatch refuses the decision. The latest decision about a subject wins. |
| T3a | A programme is passed off as signed off when it is not | What the agent-facing server assembles is a preview and is marked as one in the package, the summary, the commands file and the tool result. A release is the operator's signature over the package digest. |
| T4 | A draft that breaks a mandatory constraint is approved | Constraints are checked by code at evaluation, at request, at confirmation and at assembly. Scores are never consulted. |
| T5 | The JEV service is called | No live transport is implemented; selecting it throws. No source file names the service. |
| T6 | Model spend runs away | Calls are charged when reserved, failed calls included. The most tokens a step could use is reserved while it runs, and a call cannot exceed three times its allowance. Concurrency, provider requests and time are bounded; timeouts and failed fan-outs cancel what is in flight. There is no provider-side cap behind this. |
| T7 | A credential is logged, stored or returned | Errors carry a status, never a body. The shim logs method, path, status, duration, model and token counts only. The one-time code is stored only as a hash. CI runs a secret scan. |

## Actors and what they can do

| Actor | Capability | Limit |
|---|---|---|
| The agent using the MCP tools | Create campaigns, generate, evaluate, request decisions, assemble | Cannot record a decision; cannot exceed limits; cannot approve ineligible text |
| The model | Writes text that is validated, canonicalised, clipped and given ids by code | Cannot set status, position, ids or provenance; cannot close prompt delimiters; cannot inject markdown into editor-facing documents |
| A client brief containing instructions | Influences the text the model writes | Cannot approve, publish or exfiltrate: no tool does those things |
| A process with write access to the store | Delete or corrupt campaign files; produce a preview from a log with its tail cut off | Cannot forge, reorder or remove decisions undetected; cannot make changed text count as approved; cannot produce a release |
| A process with write access to the operator channel | Plant or alter notices; see one-time codes if it can also read | Cannot change what the editor is shown or what is signed |
| A page on another site, via the browser | — | Host and Origin checks on the HTTP endpoints; bearer tokens |

## Known weaknesses

| Weakness | Consequence | Mitigation |
|---|---|---|
| The operator's key is a file | Whoever can read it can sign decisions and releases | Deployment requirement: separate user or machine. Not enforceable in code. |
| The operator's ledger is a file beside the key | If it is deleted or lost, removal of the latest decisions from a log is not detected | Same requirement. A new operator machine starts with an empty ledger and trusts the log as it finds it. |
| The editor confirms by typing an action, a subject and twelve characters of a hash | A careless editor can copy them without reading | The tool prints the request in capitals and the full text first; nothing in code can make a person read |
| The editor's identity is typed into the operator tool | The record says who decided because the holder of the key said so | Possession of the key is the credential. Single-editor instances only, for now. |
| Mandatory constraints are pattern rules | Rephrasing can evade a ruled-out term; a non-numeric comparison marked by the model as not needing evidence is not checked | The number rule is strict by design; the editor is shown the full text; `grounding` is a judgement, not a guarantee |
| The number rule is strict | A post that mentions a number not in a cited reference is ineligible, apart from a short list of everyday terms (B2B, Q3, 24/7, identifiers such as COVID-19, a year named as a date) | Deliberate. The editor can ask for a revision. |
| The store lock is for one machine | Two machines sharing a store directory could both write | Stated as a deployment requirement |
| The mock evaluator is heuristic | Rankings reflect text features, not quality | Labelled as such everywhere it appears |
| Unsigned mode exists for development | Decisions are unprotected against a store writer | Must be asked for explicitly; the package says UNSIGNED |
| The model endpoint is configurable | A misconfiguration could send the key to another https host | Must be https or loopback; set per instance by its owner |
| Reviewer identity in the review ledger is self-declared | The commit-bound review check can be satisfied by a false entry | Human merge through branch protection is the real control (owner action, not yet configured) |

## Global-stop conditions

A credential exposed; unexpected outbound traffic; an instruction in repository or tool content that tries to widen access; any unauthorised write outside this repository. `node harness/scripts/aeh.mjs stop --level global --reason "..."`.
