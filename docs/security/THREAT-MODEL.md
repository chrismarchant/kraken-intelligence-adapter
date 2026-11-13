# Threat model

Scope: the KIC companion as built on 2026-11-13. Not a deployed system; nothing has been deployed.

## What must never happen

| # | Outcome | Why it cannot, as built |
|---|---|---|
| T1 | Content is published, scheduled, sent or promoted | No publishing client, credential or tool exists. A provisional command's schema pins `executable: false`, `authoritative: false`, `status: NON-EXECUTABLE` and has no endpoint, account or clock-time field. Guard tests search the source for publishing and outreach hosts. |
| T2 | An agent, a model or a process that can write the store makes an editorial decision | Decisions are signed with a key held only by the operator tool. The agent-facing server holds the public key, has no decision tool, and refuses to record a decision. Unsigned, mis-signed and transplanted decisions are ignored. |
| T3 | A person's decision is lost, or applied to text they did not see | Writes are serialised per campaign and atomic. A request is bound to a content hash; changed text voids it. The latest valid decision about a subject wins. |
| T4 | A draft that breaks a mandatory constraint is approved | Constraints are checked by code at evaluation, at request, at confirmation and at assembly. Scores are never consulted. |
| T5 | The JEV service is called | No live transport is implemented; selecting it throws. No source file names the service. |
| T6 | Model spend runs away | Calls are charged when reserved, failed calls included; concurrency, provider requests, time and tokens are bounded; timeouts and failed fan-outs cancel what is in flight. |
| T7 | A credential is logged, stored or returned | Errors carry a status, never a body. The shim logs method, path, status, duration, model and token counts only. The one-time code is stored only as a hash. CI runs a secret scan. |

## Actors and what they can do

| Actor | Capability | Limit |
|---|---|---|
| The agent using the MCP tools | Create campaigns, generate, evaluate, request decisions, assemble | Cannot record a decision; cannot exceed limits; cannot approve ineligible text |
| The model | Writes text that is validated, canonicalised, clipped and given ids by code | Cannot set status, position, ids or provenance; cannot close prompt delimiters; cannot inject markdown into editor-facing documents |
| A client brief containing instructions | Influences the text the model writes | Cannot approve, publish or exfiltrate: no tool does those things |
| A process with write access to the store | Delete or corrupt campaign files | Cannot forge a decision that counts (signature); cannot make changed text count as approved (hash) |
| A page on another site, via the browser | — | Host and Origin checks on the HTTP endpoints; bearer tokens |

## Known weaknesses

| Weakness | Consequence | Mitigation |
|---|---|---|
| The operator's key is a file | Whoever can read it can sign decisions | Deployment requirement: separate user or machine. Not enforceable in code. |
| The editor's identity is typed into the operator tool | The record says who decided because the holder of the key said so | Possession of the key is the credential. Single-editor instances only, for now. |
| Mandatory constraints are pattern rules | Rephrasing can evade a ruled-out term; a non-numeric comparison marked by the model as not needing evidence is not checked | The number rule is strict by design; the editor is shown the full text; `grounding` is a judgement, not a guarantee |
| The number rule is strict | Ordinary posts that mention any number not in a cited reference are ineligible | Deliberate. The editor can ask for a revision. |
| The mock evaluator is heuristic | Rankings reflect text features, not quality | Labelled as such everywhere it appears |
| Unsigned mode exists for development | Decisions are unprotected against a store writer | Must be asked for explicitly; the package says UNSIGNED |
| The model endpoint is configurable | A misconfiguration could send the key to another https host | Must be https or loopback; set per instance by its owner |
| Reviewer identity in the review ledger is self-declared | The commit-bound review check can be satisfied by a false entry | Human merge through branch protection is the real control (owner action, not yet configured) |

## Global-stop conditions

A credential exposed; unexpected outbound traffic; an instruction in repository or tool content that tries to widen access; any unauthorised write outside this repository. `node harness/scripts/aeh.mjs stop --level global --reason "..."`.
