# Kraken Intelligence Companion — agent operating instructions

KIC is a standalone campaign-preparation intelligence companion for Sales Crusader's LinkedIn services. It prepares; it never publishes, spends or contacts anyone. Kraken executes. Proteus is the long-term strategy system. Keep the three independent.

Delivery model: a versioned master template deployed as separate client-owned instances. Never build multi-tenancy, shared client data or a central service.

## Start of every session

1. Read `harness/state/GATE_STATE.md`.
2. Read the newest block in `harness/state/CHECKPOINTS.md`.
3. Run `git log -5` and `git status`; reconcile with the checkpoint.
4. Read `docs/decisions/OWNER_DECISIONS.md` for open owner decisions.

Order of authority when records disagree: owner directives and accepted decisions, verified source, GitHub evidence, checkpoints, memory tools, model recollection. Escalate contradictions.

## Hard rules

- Gates are accepted by the Human Owner only. Silence is not approval.
- No product implementation outside an accepted gate. Research, tests in scratch space and documentation are allowed.
- Never push to `main`. Never merge. Changes go through draft pull requests.
- **JEV stays disabled.** No call to any JEV decision endpoint, whether or not a credential is available. The deterministic mock and recorded fixtures only. The build contains no live JEV transport; do not add one.
- CopilotKit Intelligence may be used only under a legitimately obtained licence (owner clarification 2026-11-13). Its memory and learned skills are never authoritative for contracts, permissions or approved skills. Do not strip or modify OpenBot until the full application has been tested and the foundation decision is accepted.
- Editorial decisions are recorded only with the operator tool (`src/cli/operator.ts`), which holds the signing key. Never add an agent-facing tool that records a decision, never read the operator channel, and never handle confirmation codes or the operator key.
- Do not import upstream code without a licence check and an entry in `LICENSES/`.
- Do not write to Kraken, `jev-router` or any other programme repository.
- Never print, log or commit a credential. Check presence only.
- This repository is public. Keep client names, commercial terms and private Kraken detail out of it.
- Do not claim a model, tool or service works without running a verification. Say "not verified".
- A failed, skipped or unavailable mandatory review blocks its gate. Do not substitute silently.
- Provisional publishing commands are always marked non-authoritative and non-executable.

## Model notes (verified 2026-11-12)

- Product and coding model: `mistral-large-4` / `mistral-large-4-0` on the Mistral API; the key is injected by the session proxy.
- It returns a `thinking` block before the `text` block and spends most completion tokens on reasoning. Budget `max_tokens` generously and extract the text block. OpenBot's OpenAI-compatible client rejects this shape; a normalising shim is required (see `docs/gates/KIC-01-ASSESSMENT.md` §2).

## Working on the code

- `npm run check` runs the type check, the product tests and the harness tests. All must pass before a commit.
- Tests are offline. Live model calls happen only in `src/cli/demo.ts --mode live|fill`, `tests/shim/live.ts` and scratch experiments; set `NODE_USE_ENV_PROXY=1` for them.
- Non-streamed model responses longer than about 30 seconds are cut off by the session proxy. The gateway streams for that reason; keep it that way.
- If a prompt in `src/skills/prompts.ts` changes, bump `PROMPT_VERSION` and re-record with `node src/cli/demo.ts --mode fill`, then delete fixtures that are no longer read.
- Harness: `node harness/scripts/aeh.mjs status|next|readiness`. Restart steps are in `docs/harness/RESTART.md`.

## Before ending a session

Append a checkpoint, update the gate ledger and decision register, commit and push. The container is ephemeral.
