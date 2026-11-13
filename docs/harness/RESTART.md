# Restart recovery

For a new session after a crash, timeout or hand-off. The container is ephemeral: only what was committed and pushed survives.

## 1. Orient (read-only)

```
cat harness/state/GATE_STATE.md
sed -n 1,40p harness/state/CHECKPOINTS.md        # newest block first
git log -5 --oneline
git status
cat docs/decisions/OWNER_DECISIONS.md
ls harness/state/GLOBAL_STOP 2>/dev/null          # exists = global stop active
```

## 2. Check the harness

```
node harness/scripts/aeh.mjs status
node harness/scripts/aeh.mjs check-records
node harness/scripts/aeh.mjs next
npm run test:harness
```

## 3. Global stop first

If `harness/state/GLOBAL_STOP` exists, stop. Report its reason (it holds reason, time, who). Do not delete it, edit it or work around it. Only the Human Owner clears it: `node harness/scripts/aeh.mjs clear --level global --by <name> --reason "..."`. Read-only work is still allowed.

## 4. Reconcile ledger against git

The order of authority is: owner decisions, verified source, GitHub evidence, checkpoints, memory, recollection.

- Branch in the checkpoint matches `git branch --show-current`, and the commits it names exist (`git cat-file -t <sha>`).
- Every `done` task has evidence or a commit you can point to; every `in_progress` task has uncommitted or recent work, or is a stale claim. For a stale claim, set it back to `todo` in `tasks.json` and say why in the next checkpoint.
- `git status` shows uncommitted work: inspect it (`git diff --stat`), then commit it or discard it deliberately. Never assume it is complete.
- Disagreements you cannot settle from source are escalated, not guessed.

## 5. Resume or re-stop

- Resume: take a task from `aeh next` (runnable only). Set it `in_progress`, work inside its gate's paths (`check-gates --base <ref>` before committing).
- Re-stop a task that cannot proceed: `aeh stop --level local --task ID --reason "..."`. Re-stop a gate: `aeh stop --level gate --gate ID --reason "..."`. Anything endangering safety, credentials or scope: `aeh stop --level global --reason "..." --by <name>`.
- Before an unattended window: `aeh readiness --hours N --max-spend X`. Do not start it unless it reports READY.

## 6. Before ending a session

1. `node harness/scripts/aeh.mjs checkpoint --workstream ... --gate ... --completed ... --open ... --next ... --refs ...`
2. Update `tasks.json` statuses and evidence, `GATE_STATE.md`, and the decision register as needed.
3. `node harness/scripts/aeh.mjs check-records`, `node harness/scripts/secret-scan.mjs`, `npm run test:harness`.
4. Commit and push the branch (never `main`).
