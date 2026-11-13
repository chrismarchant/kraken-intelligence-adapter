# Threat model

Scope: the KIC companion as built on 2026-11-13. Not a deployed system; nothing has been deployed.

## What must never happen

| # | Outcome | Why it cannot, as built |
|---|---|---|
| T1 | Content is published, scheduled, sent or promoted | No publishing client, credential or tool exists. A provisional command's schema pins `executable: false`, `authoritative: false`, `status: NON-EXECUTABLE` and has no endpoint, account or clock-time field. Guard tests search the source for publishing and outreach hosts. |
| T2 | An agent, a model or a process that can write the store makes, alters or undoes an editorial decision | Decisions are signed with a key held only by the operator tool, and chained: each names its number and its predecessor. The agent-facing server holds the public key, has no decision tool, and refuses to record a decision. A forged, moved, repeated or removed decision invalidates the whole log. Removal from the end is caught by the operator's ledger, which is outside the store. |
| T3 | A person's decision is lost, or applied to something they did not see | Writes are serialised per campaign and atomic. The operator tool shows the request from the campaign record, not from the channel, and prints stored text with control, invisible and direction characters written out as visible codes, so that stored text cannot rewrite the screen. The editor gives back the whole digest of the request, which covers its action, subject, revision instruction and a content hash. That hash covers every stored field of the draft or narrative except status and provenance, the planned post, and the whole brief; the tool displays the planned post, the claims, what the brief rules out and its references. A mismatch refuses the decision, and a decision is void if any of those changes afterwards. The latest decision about a subject wins. |
| T3a | A programme is passed off as signed off when it is not, or is released without being read | What the agent-facing server assembles is a preview and is marked as one in the package, the summary, the commands file and the tool result. A release is the operator's signature over the package digest. Before releasing, `review` shows the brief's constraints, the plan and every approved post and prints a release digest; `release` must be given that digest and refuses a programme that no longer produces it. Releases are written beside the operator key, not in the data directory, and `verify` checks one later. |
| T4 | A draft that breaks a mandatory constraint is approved | Constraints are checked by code at evaluation, at request, at confirmation and at assembly. Scores are never consulted. |
| T5 | The JEV service is called | No live transport is implemented; selecting it throws. No source file names the service. |
| T6 | Model spend runs away | Calls are charged when reserved, failed calls included. The most tokens a step could use is reserved while it runs, and a call cannot exceed three times its allowance; an answer that reports no usage is charged at its allowance. The same charges are kept in the instance's own account, a file outside the campaign store, which also holds ceilings for the whole instance and a limit on the number of campaigns: resetting a campaign record or starting a new campaign buys nothing. Concurrency, provider requests and time are bounded; timeouts and failed fan-outs cancel what is in flight. There is no provider-side cap behind this, and the instance ceilings are provisional defaults until the owner sets a spend ceiling (OD-6). |
| T7 | A credential is logged, stored or returned | Errors carry a status, never a body. The shim logs method, path, status, duration, model and token counts only. The one-time code is stored only as a hash. CI runs a secret scan. |

## Actors and what they can do

| Actor | Capability | Limit |
|---|---|---|
| The agent using the MCP tools | Create campaigns, generate, evaluate, request decisions, assemble | Cannot record a decision; cannot exceed limits; cannot approve ineligible text |
| The model | Writes text that is validated, canonicalised, clipped and given ids by code | Cannot set status, position, ids or provenance; cannot close prompt delimiters; cannot inject markdown into editor-facing documents |
| A client brief containing instructions | Influences the text the model writes | Cannot approve, publish or exfiltrate: no tool does those things |
| A process with write access to the store | Delete or corrupt campaign files; produce a preview from a log with its tail cut off; change the brief, plan or drafts, which voids the decisions made on them; change the unsigned evaluation shown to the editor as advice | Cannot forge, reorder or remove decisions undetected; cannot make changed text, a changed brief or a changed plan count as approved; cannot put control characters in front of the editor; cannot reset the instance's spend account; cannot produce a release |
| A process with write access to the operator channel | Plant or alter notices; see one-time codes if it can also read | Cannot change what the editor is shown or what is signed |
| A page on another site, via the browser | — | Host and Origin checks on the HTTP endpoints; bearer tokens |

## Known weaknesses

| Weakness | Consequence | Mitigation |
|---|---|---|
| The operator's key is a file | Whoever can read it can sign decisions and releases | Deployment requirement: separate user or machine. Not enforceable in code. |
| The operator's ledger is a file beside the key | If it is lost, the tool stops. Starting a new one (`new-ledger --accept-current-state`) trusts every decision log as it then stands, so decisions removed before that moment are not detected | Same deployment requirement as the key. Restoring a data directory from a backup older than the ledger is reported as a rollback, correctly; recovering from that is the same explicit command. |
| The editor confirms by pasting a digest | A careless editor can paste it without reading | The tool prints the request in capitals and the full text first; nothing in code can make a person read |
| The approval controls have not survived a review unbroken | Three independent reviews each found a new way to obtain or resurrect an approval. The last fixes are tested but not independently reviewed | Stated in the evidence; a fourth review is an owner decision (OD-11). Until then, treat signed approvals as strong evidence, not proof. |
| The editor's identity is typed into the operator tool | The record says who decided because the holder of the key said so | Possession of the key is the credential. Single-editor instances only, for now. |
| Mandatory constraints are pattern rules | Rephrasing can evade a ruled-out term; a non-numeric comparison marked by the model as not needing evidence is not checked | The number rule is strict by design; the editor is shown the full text; `grounding` is a judgement, not a guarantee |
| The number rule is strict, with narrow exemptions | A post that mentions a number not in a cited reference is ineligible, apart from a short list: B2B, Q3, 24/7, the identifiers ISO, IEC, SOC, RFC and COVID with a number, a year after a word that only introduces a date ("in 2026", "since 2021"), "By 2027" opening a sentence, and a span of years that runs forward. A figure can still be dressed as a date ("in 1950.") | Deliberate. The editor is shown the full text and can ask for a revision. |
| Evaluations are not signed | A writer to the store can change the ranking and score shown to the editor | The line is labelled as advice, unsigned and outside the digest. Eligibility is recomputed by code from the brief and the draft, both of which the digest covers. |
| The spend account and the releases are files | Whoever can write the operator directory can reset the account; whoever can write the release directory can alter exported files | Same deployment requirement as the operator channel and the key. `verify` detects an altered release or commands file. A step that never settles stays charged at its worst case, so a crash costs allowance, never the reverse. |
| The instance ceilings have no reset | An instance that reaches its lifetime ceiling on calls or tokens stops generating until its owner raises the ceiling | Provisional, pending OD-6 |
| Terminal safety was tested against rules, not terminals | The escaping removes every control, format and default-ignorable character; no real terminal emulator or bidirectional renderer was used in tests | Stated |
| The store lock is for one machine | Two machines sharing a store directory could both write | Stated as a deployment requirement |
| The mock evaluator is heuristic | Rankings reflect text features, not quality | Labelled as such everywhere it appears |
| Unsigned mode exists for development | Decisions are unprotected against a store writer | Must be asked for explicitly; the package says UNSIGNED |
| The model endpoint is configurable | A misconfiguration could send the key to another https host | Must be https or loopback; set per instance by its owner |
| Reviewer identity in the review ledger is self-declared | The commit-bound review check can be satisfied by a false entry | Human merge through branch protection is the real control (owner action, not yet configured) |

## Global-stop conditions

A credential exposed; unexpected outbound traffic; an instruction in repository or tool content that tries to widen access; any unauthorised write outside this repository. `node harness/scripts/aeh.mjs stop --level global --reason "..."`.
