# D7 — Minimal proof-of-integration plan

Mediation KIC-ARCH-MED-01. A plan only. It has not been run, and it cannot be run until the prerequisites below exist. This version includes the corrections from the independent review of the package: the steps are now assigned to phases, and two steps were redesigned because OpenBot does not work the way the first draft assumed.

## Purpose

Show, on synthetic data and with nothing irreversible, that the recommended shape works: OpenBot unmodified in front, the KIC MCP server as the boundary, decisions signed by the operator, and every external business action left to Kraken.

The directive asks for seven demonstrations. They are steps 1 to 7; step 0 is the setup they rest on.

## Which steps belong to which phase

| Phase (D6) | Steps | Needs, beyond the prerequisites |
|---|---|---|
| 1 | 0, 3, 4, 6 | Nothing further |
| 2 | 1, 2, 5 | A gate that authorises changing `tenant-package/`; for step 5, P5 approved, team edition, OpenTag audited |
| 3 | 7 | P8 and P9 approved; a gate that authorises new contracts |

**Authorising "the Phase 1 proof" authorises steps 0, 3, 4 and 6 only.**

## Safety limits (apply to every step)

1. Synthetic brief only (`fixtures/campaigns/synthetic-harbourline.brief.json`). No client data. With a managed Intelligence key, conversation threads are stored by the vendor's service; nothing but synthetic material goes into a conversation.
2. No tool that publishes, schedules, sends or spends is granted to any Bot. Checked before the run and again after it.
3. **The instance is confined before any Bot runs:** no site logins are saved; the Bot's browser is signed in to nothing; no publishing, messaging, mail or payment app is connected; no app broker key is set, and the start script's connector provisioning is not used; where the edition has an admin, the posting, sending, sharing and paying kinds of action are closed for everybody. The configuration is recorded as evidence.
4. The "external action" in step 4 writes to a sandbox target inside the instance. It does not leave the machine.
5. JEV stays disabled. The mock evaluator only.
6. OpenBot's source is not modified. A diff against the pinned tag is part of the evidence.
7. The operator tool is run by a person, or by a separate process the agent session does not control. An agent session does not handle the operator key.
8. Spend ceilings are set for the run: this repository's instance ceiling on calls and tokens, **and** a ceiling on the Bots' own model usage at the shim or the provider.
9. A global stop halts the run.

## Prerequisites

| Need | Why | Decision |
|---|---|---|
| An Intelligence project key | OpenBot does not start without Intelligence. The local evaluation licence is a 30-day preview on macOS with Docker Desktop and is unlikely to fit a Linux environment | OD-7, P7 |
| An environment with Docker, or a Postgres that ships the `vector` extension | OpenBot's first migration creates the extension | OD-7 |
| OpenBot at a named release tag, with the capabilities used below re-checked at that tag | Upstream main changes daily and is ahead of its releases | P1 |
| P1 accepted, P2 confirmed | The proof assumes both | Owner |
| A spend ceiling | The proof makes live model calls, the Bots' own included | P14, OD-6 |
| A further review of the approval path | Step 6 relies on signed approvals | OD-11 |
| For step 5 only: team edition, OpenTag audited, a test workspace | Slack and Teams are off in the personal edition | P5, P7 |

## Steps, evidence and pass criteria

| # | Demonstrates | What is done | Evidence captured | Passes when |
|---|---|---|---|---|
| 0 | Foundation and confinement | Start OpenBot at the pinned tag with the tenant package, the shim and the KIC MCP server attached. A person grants the assistant the KIC tools. Apply instance settings: learned-skill approval off, telemetry off, the confinement in safety limit 3. Then ask the assistant to submit a sentence through its browser to a form on a page served inside the instance, standing in for a publishing site. No public site is used at any point. | Start-up log (no credentials); the settings and grants as OpenBot reports them; `git diff` of OpenBot's tree against the tag; the transcript and audit rows of the attempt; the stand-in page's own log | OpenBot serves its interface; the Bot lists the KIC tools; the diff is empty; **the submission does not succeed, and the record shows what stopped it**. If nothing in the instance can stop it, the proof stops here and that is the finding |
| 1 | A persistent specialist agent *(Phase 2)* | Define a "Checker" Bot and its skills in the tenant package. A person grants it only the read, evaluate and compare tools in the instance; the grant is recorded. Restart OpenBot. Ask the Checker to draft a post. | The Bot's grants from OpenBot before and after the restart; the transcript; OpenBot's audit rows | The Bot exists after the restart with the same grants, and is refused the drafting tool by OpenBot, not by its own judgement |
| 2 | Delegated work through OpenBot *(Phase 2)* | The campaign assistant creates the synthetic campaign, generates narratives, and hands evaluation to the Checker. | OpenBot's hand-off record; KIC's audit trail for the campaign; model calls and tokens from KIC's spend account and from the shim | The hand-off is recorded; the Checker's result returns to the assistant; spend is within both ceilings |
| 3 | Durable work with recovery | In an ordinary conversation, ask the assistant to draft a 24-post synthetic programme, which KIC does in batches of six. Stop the OpenBot server during the second batch. Restart, and ask it to continue. Separately, create a routine in the instance that drafts the next batch, let it fire, stop the server mid-run, and restart. *OpenBot's own "tasks" are not used: they can start only from a check-in item and then ask before every change.* | KIC's budget before and after; the list of posts without drafts after each step; OpenBot's work-item and routine-run rows | No post is drafted twice beyond the variant limit; no reservation is left unsettled in KIC; the conversation and the routine each complete the programme after the restart, by continuing or by being re-run; total spend is within the ceilings. **Expected and acceptable:** the interrupted model call is charged at its worst case; a routine firing that was missed by more than ten minutes is skipped upstream and has to be fired again |
| 4 | A permissioned external action | A sandbox target: a small MCP server inside the instance that appends a line to a local file and has no network access. A person grants it to one Bot. The Bot asks to write a one-line status note; a person allows it once in OpenBot. Then repeat and deny. Then check that "always allow" was not offered or was not taken. | OpenBot's approval request and decision rows; its audit rows; the sandbox file | Exactly one line is written, after the allow; nothing is written after the deny; both decisions are in OpenBot's audit. **This shows OpenBot's tool-permission gate. It is not an editorial decision and not a business action** |
| 5 | A channel conversation, where supported *(Phase 2)* | *Only if P5 is approved and the prerequisites hold.* A linked test user asks the assistant, through the channel, what is waiting. The assistant answers and names a request id. The user then tries to approve the post through the channel. Separately, the choice made in P5 about answering OpenBot's tool approvals from a channel card is applied and exercised. | The link record; the exchange; KIC's decision log; OpenBot's approvals rows | The question is answered; the attempt to approve changes nothing in KIC's decision log; tool approvals from the channel behave as P5 decided. **If the prerequisites do not hold, this step is reported as not run. An in-app conversation is not a substitute and will not be reported as one** |
| 6 | An auditable receipt | The editor, with the operator tool: `show`, `confirm` for the narrative and each post; `review`; `release`; `verify`. | The tool's output; the released package; the `verify` result | Every decision in the package carries a valid signature; `verify` accepts the package and the commands file; every command is `NON-EXECUTABLE`; the release was made by a person |
| 7 | A structured feedback event *(Phase 3)* | Hand a synthetic receipt for one released command to the boundary, with outcome `unknown`, followed by a feedback event that refers to it. | The stored records; the campaign as shown afterwards | Both are stored against the right programme and shown; no rule, prompt, skill or decision changed. *This step needs the two contracts in D4, which are designs. It runs only if P8 and P9 are approved and a gate authorises implementing them; otherwise it is reported as not run* |

## What the proof will not show

- Anything about a real client, a real editor's judgement, or audience response.
- That specialists produce better campaigns than one assistant. Step 2 shows that hand-off works, not that it helps.
- Production readiness, or behaviour under more than one person.
- That the personal edition can be governed: it has no admin, approves learned skills automatically by default, and leaves the approval switches to its one user. A proof on that edition shows less of the governance than a proof on the team edition.
- A hand-off to Kraken. Kraken is not contacted.
- Publishing of any kind.

## Reporting

Each step is reported as passed, failed, or not run with the reason. Outputs are stored with the commit they were run on. An independent review of the proof's evidence is recorded against that commit before the owner is asked to accept a phase.

## Estimated effort

Steps 0, 3, 4 and 6: 5–10 working days once the prerequisites exist, the same figure as Phase 1 in D6. Step 0 is the largest unknown.
