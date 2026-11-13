# Durable checkpoints

Newest first. Never contains credentials.

## Orchestrator checkpoint — 2026-11-13 (mediation KIC-ARCH-MED-01 presented; five review rounds on KIC-01)

```
WORKSTREAM_ID: ORCH
BRANCH: claude/adoring-edison-4wlees (no base branch exists; no pull request possible)
CURRENT_GATE: none accepted. KIC-01 evidence presented. Mediation KIC-ARCH-MED-01 presented for owner review.
COMPLETED:
  KIC-01, since the last checkpoint: global-stop hook installed and verified in nested live sessions (AEH-3);
     batch drafting (KIC-D9); fourth review of 187f029 and fifth of 765ae20, both changes-requested,
     all findings fixed and tested (765ae20, 8e4696c, dfa7458). Final code commit 8e4696c/dfa7458 is NOT reviewed.
     Operator side of the live run NOT repeated: the permission layer refused an agent session the operator key.
  Mediation: directive recorded; five read-only source audits (OpenBot f8af37a, OpenDuet, OpenDots, OpenMuse,
     Channels 0.12.0); D1-D7 written; independent review of the package at ee303a2: approved with corrections,
     all applied (tasks only from check-ins; check-ins read-only; grants and routines are manual per instance;
     approvals are per-person; an OpenBot instance must be confined to be prepare-only). Corrected package not re-reviewed.
     Nothing upstream was built or run. Nothing was imported. tenant-package/ and src/ untouched by the mediation.
OPEN: OD-1..OD-19. C1, C3. Review requirement for KIC-01 not met (gate stop on REV-1).
NEXT_ACTION: wait for the owner. Do NOT implement anything from the mediation: it is a proposal.
  Permitted without a decision (D5): corrections to the documents; a read-only audit of OpenTag;
  drafting the licence questions for CopilotKit; proposals in the instance template.
  Most unblocking owner actions: OD-8/OD-15 (licence and edition), OD-1 with OD-7 (key and an environment
  with Docker), OD-11 (review by someone outside these sessions).
  To resume: read docs/harness/RESTART.md; run `npm ci && npm run check`; `node harness/scripts/aeh.mjs status`.
REFERENCES: docs/architecture/mediation/KIC-ARCH-MED-01/README.md, docs/spec/directives/KIC-ARCH-MED-01-2026-11-13.md,
  docs/gates/KIC-01-EVIDENCE.md, docs/review/, docs/decisions/OWNER_DECISIONS.md
```

## Orchestrator checkpoint — 2026-11-13 (autonomous session: KIC companion built, three review rounds)

```
WORKSTREAM_ID: ORCH
BRANCH: claude/adoring-edison-4wlees (no base branch exists; no pull request possible)
CURRENT_GATE: none accepted. KIC-01 evidence presented. Session authorisation of 2026-11-13 is used up.
COMPLETED:
  A  Mistral normalising shim, hardened; live with OpenBot's model client and the CopilotKit agent class.
     Full OpenBot boot NOT attempted beyond KIC-00: no Intelligence key, no pgvector (local stop, once).
  B  KIC MCP server (12 tools; none publishes; none records a decision), typed contracts, gateway,
     mock JEV evaluator, bounded workflow, signed and chained editorial decisions, operator tool, release.
  C  Synthetic campaign recorded from live Mistral Large 4 and replayed offline; live agent runs
     end to end with operator confirmation and release.
  D  Harness: task ledger, gates, three stop levels, commit-bound reviews, secret scan, CI (4 green runs).
  Reviews: 983487d (two reviews), aad2196, 075b358: all changes-requested; every finding fixed and tested.
  Final code commit 187f029 is NOT independently reviewed (three rounds was the session's limit).
OPEN: OD-1..OD-11. C1, C3. Review requirement for KIC-01 not met (gate stop on REV-1). Exceptions in GATE_STATE.md.
NEXT_ACTION: wait for the owner. Do NOT start new implementation: the session authorisation has ended.
  Runnable without the owner (harness queue): AEH-3 (install hook, needs a live session to verify),
  KIC-D9 (batch drafting). Everything else waits on OD-1, OD-7, OD-8, OD-9.
  To resume: read docs/harness/RESTART.md; run `npm ci && npm run check`; `node harness/scripts/aeh.mjs status`.
REFERENCES: docs/gates/KIC-01-EVIDENCE.md, docs/review/, docs/architecture/kic-companion.md,
  docs/security/THREAT-MODEL.md, harness/state/reviews.json, harness/state/tasks.json
```

## Orchestrator checkpoint — 2026-11-13 (OD-1 reopened; KIC-01 assessment presented)

```
WORKSTREAM_ID: ORCH
BRANCH: claude/adoring-edison-4wlees
CURRENT_GATE: KIC-00 not formally accepted. KIC-01 bounded assessment presented; implementation NOT authorised.
COMPLETED: owner clarification recorded (Intelligence is to be reused under licence);
  OpenBot deps installed and personal edition configured in scratch;
  Mistral Large 4 through OpenBot's model client: fails as shipped, passes with a flattening shim (non-streamed);
  extension mechanisms, JEV adapter route, licence pages read; docs/gates/KIC-01-ASSESSMENT.md
OPEN: C1 (boot on a free Intelligence project), C2 (streaming shim), C3 (licence confirmation).
  OD-1 formal acceptance, OD-7, OD-8, and OD-2..OD-6 from KIC-00.
NEXT_ACTION: wait for the owner. With OD-7 cleared: run C1 and C2 in scratch, two-day timebox, no product code.
  Do NOT strip or modify OpenBot. JEV stays disabled.
REFERENCES: docs/gates/KIC-01-ASSESSMENT.md, docs/decisions/OWNER_DECISIONS.md
```

## Orchestrator checkpoint — 2026-11-12 (KIC-00 report presented)

```
WORKSTREAM_ID: ORCH
BRANCH: claude/adoring-edison-4wlees (first commit in the repository; no base branch exists)
CURRENT_GATE: KIC-00 presented, NOT accepted. KIC-01 not authorised.
COMPLETED: environment inventory; Kraken harness read (read-only, 5a76dea);
  jev-router read (9dd0413); OpenBot audited at 804aa69 (nothing imported);
  Mistral Large 4 verified live (chat, tool call, json_schema);
  CopilotKit runtime 1.85.0 constructs with InMemoryAgentRunner and no Intelligence (scratch only);
  KIC-00 report, authority matrix, decision register, stage-0 harness files
OPEN: OD-1..OD-6. Exceptions X1..X8 in GATE_STATE.md.
NEXT_ACTION: wait for the owner on OD-1 (foundation). Do NOT write product code.
  On OD-1 approval: start KIC-01a (spike, one-day timebox), KIC-02a and AEH-1 in parallel.
  On OD-2: read aeh before building any harness file beyond stage 0.
REFERENCES: docs/gates/KIC-00-REPORT.md, docs/decisions/OWNER_DECISIONS.md
```

## Template

```
WORKSTREAM_ID:
BRANCH:
CURRENT_GATE:
COMPLETED:
OPEN:
NEXT_ACTION:
REFERENCES:
```
