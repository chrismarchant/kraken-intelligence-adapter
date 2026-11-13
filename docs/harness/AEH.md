# Autonomous Engineering Harness (AEH), minimum version

Engineering infrastructure, not product. Zero dependencies (Node 22 ESM). Provider-neutral. Prompts alone are not enforcement: every stop and binding below is a script that CI runs.

## Pieces and what enforces what

| Piece | Path | Enforces |
|---|---|---|
| Task ledger | `harness/state/tasks.json`, schema `harness/config/tasks.schema.json` | Work packages with deps, status, stops, evidence. `check-records` validates schema, unknown deps/gates, duplicate ids, cycles. |
| Gate map | `harness/config/gates.json` | Which paths each gate owns and its status. `check-gates` fails if a changed path belongs to a gate that is not `authorised`/`accepted`, or to no gate and is not an always-allowed docs path. |
| CLI | `harness/scripts/aeh.mjs` | `status`, `next`, `stop`/`clear`, `check-gates`, `check-records`, `check-reviews`, `review add`, `readiness`, `checkpoint`. `--root`, `--json`; non-zero exit on failure. |
| Stops | `GLOBAL_STOP` file, task `stop`, gate `stop`; log `harness/state/STOP_LOG.jsonl` | Local: the task and all dependants (transitively) leave the runnable queue. Gate: gate status becomes `blocked`. Global: `next` returns nothing, every `check-*` fails, and the hook denies write/execute tools. Clearing needs `--by` and a reason and is logged. |
| Review binding | `harness/state/reviews.json`, schema `reviews.schema.json` | `check-reviews --commit <full sha>` passes only for an entry on exactly that commit, `independent`, reviewer id different from author id, verdict approve or approve-with-followups, existing report file, no open high/critical finding. `failed`, `unavailable` and missing reviews fail. |
| Secret scan | `harness/scripts/secret-scan.mjs`, allowlist `harness/config/secret-scan-allowlist.txt` | Credential-shaped strings in tracked and untracked-not-ignored files. Prints path:line and rule only. Placeholders `proxy-injected` and `dummy` are ignored; inline `secret-scan:allow` and the allowlist (`path-glob | line-regex | justification`) suppress. |
| Global-stop hook | `harness/hooks/pre-tool-use.mjs` | Claude Code `PreToolUse` hook. Under a stop file it denies everything except `Read`, `Grep`, `Glob` (and a few harmless tools); with no stop file it is silent and allows, and fails open on any error. Wiring example: `harness/config/claude-settings.hooks.example.json` (not wired into `.claude/settings.json` yet). |
| Readiness | `aeh readiness --hours N --max-spend X` | Decision Readiness Gate before an unattended window: lists OPEN owner decisions, blocked tasks and why, the runnable fallback queue. Fails on an empty queue, a missing envelope or a global stop. |
| Checkpoints | `aeh checkpoint ...` | Prepends a block to `harness/state/CHECKPOINTS.md` (newest first); refuses credential-shaped text. |
| Governance agents | `.claude/agents/*.md` | Read-only Claude Code sub-agents: spec-guardian, gatekeeper (five-part veto), review-coordinator, continuity-guardian. They check and record; they do not enforce by themselves. |
| CI | `.github/workflows/ci.yml` | typecheck, tests, harness tests, secret scan, `check-records`, `check-gates`. No secrets used. |

## CI and review binding timing

`check-reviews` runs in CI as a non-blocking informational step (`continue-on-error: true`). A review can only be recorded after the commit it covers exists, and recording it adds a commit. **It becomes a required check at merge time**, run against the reviewed head SHA by whoever merges, once branch protection exists (OD-4).

## Extracting to another repository

Copy `harness/` (without `harness/state/*` content you do not want) and `.claude/agents/`, plus `.github/workflows/ci.yml` if wanted. Edit only `harness/config/*.json` (gates, required records, allowlist) and reset `harness/state/*` (tasks, reviews, checkpoints). The scripts contain no project logic. Add `harness/state/GLOBAL_STOP` to `.gitignore`. Add a `test:harness` npm script.

## Not enforced yet

- Branch protection, human-only merge, required status checks: the owner must configure them (OD-4); nothing here can.
- The hook is not wired into `.claude/settings.json`; until it is, a global stop is enforced only in CI and by `next`. The hook also cannot stop a human or a process outside Claude Code.
- A stop file only exists locally unless committed; CI sees it only if it is committed (it is gitignored by default). Raise the stop on the branch you want CI to refuse by committing the file deliberately.
- Reviews are self-reported ledger entries: the check proves the entry is well-formed and bound, not that the reviewer is truly a different principal, nor that the report is honest. The report file's content is not validated.
- `check-gates` trusts the committed gate map: a change that edits `gates.json` to authorise a gate is itself only caught by human review (the `harness/**` path is owned by the `AEH` gate).
- The secret scan is pattern based; it can miss secrets and cannot see history.
- Task `done` is not tied to evidence; `evidence[]` is not verified.
- The independent review service (OD-5) and reuse of the private `aeh` repository (OD-2) are open. See `REVIEW-BOT-ASSESSMENT.md`.
