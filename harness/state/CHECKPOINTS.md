# Durable checkpoints

Newest first. Never contains credentials.

## Orchestrator checkpoint — 2026-11-13 (KIC-01 gate closure: review requirement met; acceptance package presented)

```
WORKSTREAM_ID: ORCH
BRANCH: claude/adoring-edison-4wlees (no base branch exists; no pull request possible; OD-4)
CURRENT_GATE: none accepted. KIC-01: acceptance package presented; STOPPED AT THE OWNER ACCEPTANCE BOUNDARY.
COMPLETED:
  Owner instruction of 2026-11-13 stored verbatim: docs/spec/directives/KIC-01-GATE-CLOSURE-INSTRUCTION-2026-11-13.md.
  Review of 12a7626: changes-requested (1 medium, shim). Remediated in 55a66f2.
  Review of 55a66f2 (independent-review-agent-9): approved with follow-ups. Follow-ups fixed in 2537386.
  Delta review of 2537386 (independent-review-agent-10): approved; five fixes closed; no regression.
  Evidence at 2537386: CI run 23 (43428556880) success; clean worktree npm run check exit 0 (202 product,
     83 harness tests); secret scan clean; check-reviews --gate KIC-01 ok. Later commits change records only.
  Live shim check (tests/shim/live.ts, pass-through mode), run 2026-11-13 on code identical to 2537386: all six
     cases passed. Output kept: docs/gates/evidence/shim-live-2026-11-13.txt. Key-holding mode: never run live.
  Independent audit of the acceptance package: accurate on commit, counts and checks; overstated on review
     coverage, C2, key handling and accepted weaknesses. Corrected (second version of the package; ledger table
     A1-A26). Record: docs/review/2026-11-13-audit-of-acceptance-package.md.
  Scope-completing reviews A and B commissioned at 2537386 for the parts the approving reviews did not cover.
     OUTCOME: see GATE_STATE.md, "Scope-completing reviews". If that section still says "not returned", they
     were lost with the session and must be commissioned again before the package's review claims are complete.
  Ledger: GATE_STATE.md "Review requirement for KIC-01: met at 2537386", with accepted findings A1-A11.
  REV-1 done; its gate stop replaced by OD-11 (kept OPEN by the owner: external approval-path security
     assessment before real-client use).
  Acceptance package: docs/gates/KIC-01-ACCEPTANCE-PACKAGE.md (options A accept in part, B hold, C ask for more).
LOCAL ONLY, NOT PART OF THE WORK: four branches worktree-agent-* with worktrees under .claude/worktrees/ hold
  early delegated commits (shim, harness) that were integrated by hand. They are not pushed and not reviewed.
OPEN: the owner's decision on KIC-01. Two questions for the owner: has the KIC-01 session authorisation lapsed
  (harness/config/gates.json still says "authorised" unless a gate stop is on); does OD-1 settle KIC-00. OD-11 (external assessment). OD-2..OD-10 as before, OD-15..OD-17,
  OD-19, OD-20. C1 (local stop: OpenBot never run), C3 (licence, owner).
NEXT_ACTION: WAIT FOR THE OWNER. Do not treat silence as acceptance. Nothing is queued that does not need an
  owner decision except keeping CI green. Do NOT merge, deploy, run OpenBot, handle a signing key, contact
  CopilotKit, change tenant-package/, or touch Kraken or JEV. Any change under src/ or tests/ creates a new
  commit that needs its own commit-bound review before it can stand in for 2537386.
  To resume: read docs/harness/RESTART.md; run `npm ci && npm run check`; `node harness/scripts/aeh.mjs status`.
REFERENCES: docs/gates/KIC-01-ACCEPTANCE-PACKAGE.md, harness/state/GATE_STATE.md,
  docs/review/2026-11-13-review-55a66f2.md, docs/review/2026-11-13-delta-review-2537386.md,
  docs/decisions/OWNER_DECISIONS.md (OD-11)
```

## Orchestrator checkpoint — 2026-11-13 (owner direction after the mediation; seven review rounds; confinement matrix)

```
WORKSTREAM_ID: ORCH
BRANCH: claude/adoring-edison-4wlees (no base branch exists; no pull request possible)
CURRENT_GATE: none accepted. Owner direction of 2026-11-13 recorded verbatim; mediation provisionally accepted.
COMPLETED:
  Owner decisions recorded: OD-1 (provisional, conditional), OD-12, OD-13, OD-14 (deferred), OD-18.
  Sixth review (b8e0170) and approval-path security review (177a8c4): both changes-requested; the same high
     finding (a replaced approval could be brought back through status fields). Remediated in 5e4ee5d + 12a7626:
     approvals and selection read from the signed log alone; post number signed; one revision per instruction;
     operator output behind a margin and wrapped; show prints all a digest covers; shim spend limits; key and
     release locations checked; owner-checked lock for spend account and ledger. 201 product + 83 harness tests.
  New independent review of 12a7626 commissioned; outcome in GATE_STATE.md.
  Mediation: re-review of the corrected package (177a8c4): approved with corrections, applied. A1 added
     (OpenBot v1.0.2 against main; OpenTag). D7's confinement test replaced.
  Confinement test matrix: docs/security/CONFINEMENT-TEST-MATRIX.md. Negative tests: tests/kic/confinement.test.ts.
  Drafts, not sent: licence questions for CopilotKit. Nothing was sent to anyone; no paid service started.
OPEN: OD-2..OD-11 (except as decided), OD-15..OD-17, OD-19, OD-20. C1 (local stop), C3.
NEXT_ACTION: see the work queue in the latest handback. Not blocked on the owner: act on the review of 12a7626;
  keep CI green. Blocked: every OpenBot runtime test (key, Docker, identity provider, OD-20); licensing (owner).
  Do NOT run OpenBot against a paid service, contact CopilotKit, change tenant-package/, or touch Kraken or JEV.
  To resume: read docs/harness/RESTART.md; run `npm ci && npm run check`; `node harness/scripts/aeh.mjs status`.
REFERENCES: docs/spec/directives/KIC-OWNER-DIRECTION-POST-ARCH-MED-01-2026-11-13.md,
  docs/security/CONFINEMENT-TEST-MATRIX.md, docs/architecture/mediation/KIC-ARCH-MED-01/ (README, A1),
  docs/review/ (sixth review, security review, mediation re-review), harness/state/GATE_STATE.md
```

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
