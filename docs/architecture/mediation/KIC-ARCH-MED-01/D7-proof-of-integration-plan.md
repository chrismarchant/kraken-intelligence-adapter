# D7 — Minimal proof-of-integration plan

Mediation KIC-ARCH-MED-01. A plan only. It has not been run, and it cannot be run until the prerequisites below exist. It is the practical content of Phase 1 in D6.

## Purpose

Show, on synthetic data and with nothing irreversible, that the recommended shape works: OpenBot unmodified in front, the KIC MCP server as the boundary, decisions signed by the operator, and every external business action left to Kraken.

## Safety limits (apply to every step)

1. Synthetic brief only (`fixtures/campaigns/synthetic-harbourline.brief.json`). No client data.
2. No tool that publishes, schedules, sends or spends is granted to any Bot. This is checked before the run and again after it.
3. The "external action" in step 4 writes to a sandbox target inside the instance. It does not leave the machine.
4. JEV stays disabled. The mock evaluator only.
5. OpenBot's source is not modified. A diff against the pinned tag is part of the evidence.
6. The operator tool is run by a person, or by a separate process the agent session does not control. An agent session does not handle the operator key.
7. Spend ceilings are set low for the run (instance ceiling on calls and tokens).
8. A global stop halts the run.

## Prerequisites

| Need | Why | Decision |
|---|---|---|
| An Intelligence project key, or a local evaluation licence | OpenBot does not start without Intelligence | OD-7, P7 |
| An environment with Docker, or a Postgres that ships the `vector` extension | OpenBot's first migration creates the extension | OD-7 |
| OpenBot at a pinned release tag | Upstream main changes daily | P1 |
| P1 accepted, P2 confirmed | The proof assumes both | Owner |
| For step 5 only: team edition, OpenTag audited, a test workspace | Slack and Teams are off in the personal edition | P5, P7 |

## Steps, evidence and pass criteria

| # | Demonstrates | What is done | Evidence captured | Passes when |
|---|---|---|---|---|
| 0 | Foundation | Start OpenBot at the pinned tag with the tenant package, the shim and the KIC MCP server attached by URL. Apply instance settings: automatic skill approval off, ask-before-change on, telemetry off. | Start-up log (no credentials); the settings as OpenBot reports them; `git diff` of OpenBot's tree against the tag | OpenBot serves its interface; the Bot lists the KIC tools; the diff is empty |
| 1 | A persistent specialist agent | Define a "Checker" Bot in the tenant package, granted only the read, evaluate and compare tools. Restart OpenBot. Ask the Checker to draft a post. | The Bot's grants from OpenBot; the transcript; OpenBot's audit rows | The Bot exists after the restart with the same grants, and is refused the drafting tool by OpenBot, not by its own judgement |
| 2 | Delegated work through OpenBot | The campaign assistant creates the synthetic campaign, generates narratives, and hands evaluation to the Checker. | OpenBot's hand-off record; KIC's audit trail for the campaign; model calls and tokens from KIC's spend account | The hand-off is recorded; the Checker's result returns to the assistant; spend is within the ceilings |
| 3 | A durable task with recovery | Start batch drafting for a 24-post synthetic programme as an OpenBot task. Stop the OpenBot server during the second batch. Restart. | KIC's budget before and after; OpenBot's task and work-item rows; the list of posts without drafts after each step | After the restart the task continues or is re-run; no post is drafted twice beyond the variant limit; no reservation is left unsettled in KIC; total spend is within the ceiling. **Expected and acceptable:** the interrupted model call is charged at its worst case |
| 4 | A permissioned external action | A sandbox target: a small MCP server inside the instance that appends a line to a local file and has no network access. Grant it to one Bot with "always ask". The Bot asks to write a one-line status note; a person allows it once in OpenBot. Then repeat and deny. | OpenBot's approval request and decision rows; its audit rows; the sandbox file | Exactly one line is written, after the allow; nothing is written after the deny; both decisions are in OpenBot's audit. **This shows OpenBot's tool-permission gate. It is not an editorial decision and not a business action** |
| 5 | A channel conversation, where supported | *Only if P5 is approved and the prerequisites hold.* A linked test user asks the assistant, through the channel, what is waiting. The assistant answers and names a request id. The user then tries to approve through the channel. | The link record; the exchange; KIC's decision log | The question is answered; the attempt to approve changes nothing in KIC's decision log. **If the prerequisites do not hold, this step is reported as not run. An in-app conversation is not a substitute and will not be reported as one** |
| 6 | An auditable receipt | The editor, with the operator tool: `show`, `confirm` for the narrative and each post; `review`; `release`; `verify`. | The tool's output; the released package; the `verify` result | Every decision in the package carries a valid signature; `verify` accepts the package and the commands file; every command is `NON-EXECUTABLE`; the release was made by a person |
| 7 | A structured feedback event | Hand a synthetic receipt for one released command to the boundary, with outcome `unknown`, followed by a feedback event that refers to it. | The stored records; the campaign as shown afterwards | Both are stored against the right programme and shown; no rule, prompt, skill or decision changed. *This step needs the two contracts in D4, which are designs. It runs only if P8 and P9 are approved and a gate authorises implementing them; otherwise it is reported as not run* |

## What the proof will not show

- Anything about a real client, a real editor's judgement, or audience response.
- That specialists produce better campaigns than one assistant. Step 2 shows that hand-off works, not that it helps.
- Production readiness, or behaviour under more than one person.
- A hand-off to Kraken. Kraken is not contacted.
- Publishing of any kind.

## Reporting

Each step is reported as passed, failed, or not run with the reason. Outputs are stored with the commit they were run on. An independent review of the proof's evidence is recorded against that commit before the owner is asked to accept Phase 1.

## Estimated effort

4–8 working days once the prerequisites exist, the same figure as Phase 1 in D6, of which step 0 is the largest unknown.
