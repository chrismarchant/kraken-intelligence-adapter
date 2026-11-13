# Autonomous Engineering Harness (AEH), minimum version

Engineering infrastructure, not product. Zero dependencies (Node 22 ESM). Provider-neutral. Prompts alone are not enforcement: every stop and binding below is a script that CI runs.

## Pieces and what enforces what

| Piece | Path | Enforces |
|---|---|---|
| Task ledger | `harness/state/tasks.json`, schema `harness/config/tasks.schema.json` | Work packages with deps, status, stops, evidence. `check-records` validates schema, unknown deps/gates, duplicate ids, cycles. |
| Gate map | `harness/config/gates.json` | Which paths each gate owns and its status. `check-gates` fails if a changed path belongs to a gate that is not `authorised`/`accepted`, or to no gate and is not an always-allowed docs path. With `--base`, the gate map is read from the BASE revision (`git show <base>:harness/config/gates.json`), so a change cannot authorise its own gate; a change to the map takes effect only after it is on the base (a human merge). The output names each gate whose status or paths changed in the diff and says it is not in effect; that notice alone does not fail the check. The diff uses `--no-renames`, so a moved file lists both its source and destination, and deleting a file under a blocked gate's path fails like adding one. If the base has no `gates.json` (first introduction) or there is no base (first push, empty-tree fallback), the head's map is used and the output says `FALLING BACK`. |
| CLI | `harness/scripts/aeh.mjs` | `status`, `next`, `stop`/`clear`, `check-gates`, `check-records`, `check-reviews`, `review add`, `readiness`, `checkpoint`. `--root`, `--json`; non-zero exit on failure. |
| Stops | `GLOBAL_STOP` file, task `stop`, gate `stop`; log `harness/state/STOP_LOG.jsonl` | Local: the task and all dependants (transitively) leave the runnable queue. Gate: gate status becomes `blocked`. Global: `next` returns nothing, every `check-*` fails, and the hook denies write/execute tools. Clearing needs `--by` and a reason and is logged. Clearing a GLOBAL stop additionally requires `--owner-reference <text>` (a directive file path, PR or issue URL); it is written to the stop log. This is a recorded attestation, not authentication: the script cannot verify who ran it. |
| Review binding | `harness/state/reviews.json`, schema `reviews.schema.json` | `check-reviews --commit <full sha>` considers every entry for that commit and gate. It FAILS if ANY of them has verdict `changes-requested`, `failed` or `unavailable`, or any `high`/`critical` finding that is `open`, `fixed` without a 40-character `remediationCommit` (treated as open), or `accepted`/`wontfix` without `ownerSignoff: { by, at, reference }` (all three non-empty; schema-validated). It passes only if there is also at least one qualifying entry: exact SHA, `independent: true`, reviewer id different from author id, verdict approve or approve-with-followups, existing report file. A passing review never outvotes a blocking one. Missing reviews fail. `review add --entry-file` can carry `ownerSignoff`; the `--finding` shorthand cannot. |
| Secret scan | `harness/scripts/secret-scan.mjs`, allowlist `harness/config/secret-scan-allowlist.txt` | Credential-shaped strings in tracked and untracked-not-ignored files. Prints path:line and rule only. A value that is exactly `proxy-injected` or `dummy` is ignored (never as a substring of a longer token). Also flags bare 32-character alphanumeric values on `*_KEY`/`*_TOKEN`/`*_SECRET` names or after `Bearer ` (rule `bare-32-char-secret`); inline `secret-scan:allow` and the allowlist (`path-glob | line-regex | justification`) suppress. |
| Global-stop hook | `harness/hooks/pre-tool-use.mjs` | Claude Code `PreToolUse` hook. Under a stop file it denies everything except `Read`, `Grep`, `Glob` (and a few harmless tools), and fails CLOSED there (empty or unparseable stdin, or an internal error, still denies); with no stop file it is silent (no output, exit 0, never prints `allow`) and fails open on any error. Wired for every tool in `.claude/settings.json` (a harness test checks the wiring); `harness/config/claude-settings.hooks.example.json` is the same block for other repositories. |
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
- The hook stops Claude Code sessions that load this repository's `.claude/settings.json`. It cannot stop a human, a process outside Claude Code, or a session started somewhere that does not load the project settings.
- A stop file only exists locally unless committed; CI sees it only if it is committed (it is gitignored by default). Raise the stop on the branch you want CI to refuse by committing the file deliberately.
- Reviews are self-reported ledger entries: the check proves the entry is well-formed and bound, not that the reviewer is truly a different principal, nor that the report is honest. The report file's content is not validated. `ownerSignoff` is likewise a self-declared field; only a human reading the ledger diff can confirm it is genuine.
- The secret scan is pattern based; it can miss secrets and cannot see history.
- Task `done` is not tied to evidence; `evidence[]` is not verified.
- The independent review service (OD-5) and reuse of the private `aeh` repository (OD-2) are open. See `REVIEW-BOT-ASSESSMENT.md`.

## Known limits

- **Reviewer identity and independence are self-declared** in `reviews.json` (`reviewer.id`, `author.id`, `independent`, `ownerSignoff`). The script does not verify them. Only a human merging through branch protection closes that gap.
- **The hook is installed and was verified live on 2026-11-13** (Claude Code 2.1.323, three nested headless sessions in a scratch copy: with no stop file a `Bash` call ran; with a stop file the same call was denied with the stop's reason; with a stop file a `Read` call ran). Under a stop an agent session cannot clear it, because `Bash`, `Write` and `Edit` are denied: the owner clears it from a terminal. Not verified: behaviour in the session that raises the stop itself, and in a session already running when the settings file changes.
- **Gate map on first push.** With no base revision, or a base that has no `gates.json`, `check-gates` falls back to the head's map and cannot detect a self-authorised gate. It says so in its output. After the map exists on the base, changes to it are not in effect until merged.
- **Clear is an attestation.** `--by` and `--owner-reference` are recorded, not authenticated. Anyone with shell access to the repository can run `aeh clear` or delete `GLOBAL_STOP`.
- The `check-gates` base is whatever CI passes in; a CI workflow change in the same pull request is only caught by human review.
