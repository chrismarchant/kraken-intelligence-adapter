# KIC-01 gate split — proposal for the owner's decision

**Status: PROPOSED. Not in force.** Prepared on 2026-11-13 under `docs/spec/directives/KIC-01-GATE-RECONCILIATION-INSTRUCTION-2026-11-13.md`, section 4.

**Nothing has been changed to make this proposal true.** The gate map (`harness/config/gates.json`) still has one gate, KIC-01, which is BLOCKED with a gate stop. KIC-01A and KIC-01B do not exist in the harness. No gate is accepted or ready for acceptance because this document exists.

## 1. Why split

KIC-01 is named "Runtime proof". Under that name two different things were built or attempted, and they stand very differently:

| | What | Where it stands |
|---|---|---|
| The standalone companion | The KIC MCP service, the campaign workflow, screening, the editorial approval path, the model gateway, the shim, spend control, the stores, the harness | Built, tested, reviewed in twenty-six agent reviews. Does not depend on OpenBot |
| The OpenBot integration proof | OpenBot booted on a licensed Intelligence project, with Mistral Large 4 through the shim, the KIC server attached, persistence, memory and confinement shown | **Never run.** Blocked on things only the owner can supply. C1, C2 and C3 are the conditions on the foundation decision OD-1 |

As one gate, the first cannot be decided until the second is done, and the second cannot start. The split lets the owner decide each on its own evidence. It does not lower any requirement: every condition of KIC-01 is carried into one of the two parts, and nothing is dropped.

## 2. KIC-01A — standalone companion acceptance (proposed)

### Scope

The owner's words: "standalone MCP service, campaign preparation, deterministic screening under OD-21, editorial workflow, signing, provisional non-executable commands, persistence, gateway and spend controls."

| In scope | Code |
|---|---|
| Standalone MCP service: 12 tools over stdio and HTTP | `src/mcp/` |
| Campaign preparation: brief, narratives, plan, drafts, revision, comparison | `src/workflow/`, `src/skills/`, `src/contracts/` |
| Deterministic screening under OD-21 | `src/evaluation/`, against `docs/spec/EVALUATOR-ACCEPTANCE-CONTRACT.md` |
| Editorial workflow and signing: decision requests, the operator tool, the signed decision log, the ledger, release and `verify` | `src/workflow/`, `src/cli/operator.ts` |
| Provisional, non-executable commands | `src/contracts/command.ts`, `src/workflow/assemble.ts` |
| Persistence: the stores and their locking | `src/store/` |
| Gateway and spend controls: the Mistral adapter, fixtures, the campaign budget, the instance spend account, the shim and its ceiling | `src/gateway/`, `src/workflow/spend.ts`, `src/limits.ts`, `src/shim/` |
| The harness that binds reviews to commits | `harness/`, `.github/` |

Not in scope: anything that needs OpenBot (KIC-01B); a live JEV; publishing, outreach, advertising, spend on a client's behalf; channels; Kraken integration; an editor's surface other than the command-line tool; creator sources (ranking exists on labelled synthetic fixtures only); real clients, real keys, real data.

A question for the owner: the ledger lists KIC-02 (model and skills), KIC-03 (comparative intelligence) and KIC-04 (campaign preparation) as "not authorised as gates; parts built under the session authorisation". The scope above includes those parts. Either KIC-01A's acceptance covers what was built of them, or they stay separate gates to be decided later (decision D4 below).

### Acceptance criteria (proposed)

From the owner's instruction, made checkable. "Satisfactory" is the owner's judgement of a recorded verdict; the orchestrator does not make it.

| # | Criterion | How it is checked |
|---|---|---|
| A-1 | A satisfactory independent review of the evaluator against the revised contract | A review record bound to the code commit, with a verdict the owner finds satisfactory, and the contract approved by the owner |
| A-2 | A satisfactory independent review of the R2 delta | A review record bound to the code commit, for `git diff e30451c c83b0cb -- src/workflow src/gateway src/limits.ts`, with its own verdict |
| A-3 | Reconciled review coverage for every capability in scope | A coverage matrix by capability: the last review with an approving verdict, its commit, what changed since, the review of that change. No capability in scope rests on a statement made inside a review whose verdict was changes-requested |
| A-4 | Tests pass at the code commit | `npm run check` exit 0 in a clean checkout of that commit |
| A-5 | CI passes at the code commit | The workflow run for that commit |
| A-6 | Security checks pass | The secret scan; the record check; no live JEV path; no credential in the repository. (GitHub's secret scanning has not been consulted so far.) |
| A-7 | Limitations and residual risks are explicitly recorded | The evaluator contract, section 5; the risk and internationalisation register; the threat model |
| A-8 | The standing restrictions held | No merge, deployment, provisioning, real key, client data, publishing or external communication |

What acceptance of KIC-01A would **not** mean: that OpenBot is adopted; that any licence is settled; that the companion may be used with a real client (OD-11 stays open); that screening guarantees anything about content (OD-21); that the character list is product policy; that anything may be merged (no base branch exists: OD-4).

### Migration of existing evidence

Where each criterion stands on the evidence already recorded, at code commit `c83b0cb`. This table is filled from the ledger; it is not a claim that a criterion is met.

| # | Existing evidence | State |
|---|---|---|
| A-1 | Five full reviews of the evaluator against the earlier requirement: changes requested. Regression review at `c83b0cb`: approved with findings, for regression only. The review against the revised contract | **Pending**: commissioned on 2026-11-13, not yet reported |
| A-2 | Reviewers 22 and 23 examined the delta inside reviews whose verdicts were changes-requested. The separate delta review | **Pending**: commissioned on 2026-11-13, not yet reported |
| A-3 | The coverage matrix of the acceptance package, section 4, brought up to date in `docs/gates/KIC-01-RECONCILIATION-DECISION-PACKAGE.md` | **Pending** the two reviews |
| A-4 | 289 of 289 product tests and 83 of 83 harness tests at `c83b0cb`, in a clean detached checkout and independently by three reviewers | Evidence exists |
| A-5 | CI run 58 on `c83b0cb`: success | Evidence exists |
| A-6 | Secret scan clean; record check ok; no network import in the evaluator (review of `e30451c`) | Evidence exists; GitHub's own scanning not consulted |
| A-7 | `docs/spec/EVALUATOR-ACCEPTANCE-CONTRACT.md`; `docs/security/RISK-AND-INTERNATIONALISATION-REGISTER.md`; `docs/security/THREAT-MODEL.md`; GATE_STATE A1 to A26, E1 to E11, B1 to B4 | Recorded |
| A-8 | Acceptance package, section 10 | Held, with one exception recorded there: the agent session ran the operator tool with throwaway keys in two early live runs, before the rule against it |

Tasks in the ledger that would move to KIC-01A: `KIC-B1`, `KIC-B2`, `KIC-C1`, `KIC-C4`, `KIC-01-C2` (the shim, outside OpenBot), `KIC-D1`, `KIC-D2`, `KIC-D4`, `KIC-D6`, `KIC-D7`, `KIC-D9`, `REV-1`.

## 3. KIC-01B — OpenBot integration proof (proposed)

### Scope

The owner's words: "selected OpenBot release, CopilotKit Intelligence, identity, persistence, Mistral Large 4 streaming and tool execution through the shim, MCP attachment, runtime confinement and licensing."

### Requirements, all unfulfilled

Carried over from KIC-01 unchanged.

| | Requirement | State |
|---|---|---|
| C1 | OpenBot boots on a legitimately obtained Intelligence project and completes a conversation with a tool call and a recalled memory | **Not met. Never run** |
| C2 | Mistral Large 4 works through the shim, streaming and with tools, **inside OpenBot** | **Not met as defined.** Shown outside OpenBot only |
| C3 | CopilotKit confirms in writing which licence a client-owned deployment needs | **Not met.** Nothing has been sent |
| — | The tests the owner requires of the selected release before production adoption: runtime, model streaming, persistence, tool execution, confinement | **None run** |

### Prerequisites

| Decision | What is needed | Standing |
|---|---|---|
| OD-7 | An environment with Docker, or a Postgres with the vector extension; an Intelligence project key | Open. None is in the session's environment (checked by presence only) |
| OD-8 | The licence answer from CopilotKit. Draft questions exist, unsent: `docs/decisions/LICENCE-QUESTIONS-COPILOTKIT.md` | Open. The owner's to seek |
| OD-15 | Personal or team edition for a client instance. Confinement points to the team edition, which needs an identity provider | Open |
| OD-20 | How the KIC MCP server is attached to OpenBot `v1.0.2`, which accepts a custom server only over https at a hostname | Open |

Also bearing on it, and not prerequisites named by the owner: spend figures (OD-6); whether the external assessment (OD-11) must come before the proof.

### Evidence that would carry over

Preparation only. None of it shows a requirement met.

| Evidence | What it is |
|---|---|
| `docs/gates/KIC-01-ASSESSMENT.md` | The feasibility assessment and the conditions C1 to C3 |
| `docs/architecture/mediation/KIC-ARCH-MED-01/` | The mediation; D7 is the proof-of-integration plan |
| `docs/security/CONFINEMENT-TEST-MATRIX.md` | The confinement tests to run on an instance (rows marked S, D, P and N) |
| `docs/gates/evidence/shim-live-2026-11-13-final.txt` | The shim working with the model client library OpenBot's main branch resolves, outside OpenBot |
| `tenant-package/` | Passed the validator of OpenBot's main-branch checkout; never loaded by OpenBot |
| `docs/deployment/INSTANCE-TEMPLATE.md` | Proposed deployment requirements |

Tasks that would move to KIC-01B: `KIC-01-C1`, `KIC-01-C2b`, `KIC-01-C3`, `KIC-D3` (the editor's surface inside the workspace).

**No OpenBot deployment, integration or provisioning is authorised**, by this proposal or by its approval. Starting KIC-01B needs its prerequisites and a separate instruction.

## 4. How the two would relate

| | Proposed |
|---|---|
| Order | KIC-01B uses the MCP server and the shim, so it depends on KIC-01A's code. Whether it may start before KIC-01A is accepted is for the owner (decision D3) |
| OD-1 | The foundation decision stays provisional and conditional on C1 to C3, which all sit in KIC-01B. Accepting KIC-01A leaves OD-1 exactly where it is |
| OD-11 | Stays open across both. Real-client use is barred until it is done, whichever part is accepted |
| Later gates | KIC-05 (template deployment) and KIC-06 (Kraken integration) keep their present status. Anything that depends on a workspace depends on KIC-01B |
| The existing stop | The gate stop on KIC-01 stays until the owner clears or retires it. If the split is approved, the orchestrator would ask how the owner wants it carried: onto both parts, or onto each as the owner decides |

## 5. What approving the split would change in the harness

Not done. Listed so the owner can see the size of it. It would be a change to the gate mechanism's configuration and needs an instruction.

- `harness/config/gates.json`: KIC-01 retired or kept as a parent; two entries added. KIC-01A with KIC-01's present paths and its review requirement. KIC-01B with no code paths of its own beyond `tenant-package/**` and any integration scratch, and its review requirement.
- `harness/state/tasks.json`: each task's gate changed as listed above. Their history and evidence lines stay.
- `harness/state/GATE_STATE.md`: two rows in place of one, with the disposition of each recorded separately.
- No change to code, tests, contracts or the review ledger. Existing review entries stay bound to KIC-01 and to their commits; the coverage matrix says which part each serves.

## 6. Decisions requested of the owner

| # | Decision |
|---|---|
| D1 | Approve, change or reject the split of KIC-01 into KIC-01A and KIC-01B |
| D2 | Approve, change or reject the acceptance criteria A-1 to A-8 for KIC-01A, including what "satisfactory" means for A-1 and A-2 |
| D3 | Whether KIC-01B may start, once its prerequisites exist, before KIC-01A is accepted |
| D4 | Whether KIC-01A's acceptance would cover what was built of KIC-02, KIC-03 and KIC-04, or those remain separate gates |
| D5 | Whether the KIC-01 implementation authorisation, given "for the 2026-11-13 session only", is ended (the orchestrator treats it as ended) |
| D6 | How the existing gate stop is carried if the split is approved |
