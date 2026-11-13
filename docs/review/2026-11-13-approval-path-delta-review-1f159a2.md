# Independent delta review of the approval path — commit 1f159a2

The reviews that approved the claims about editorial decisions covered commit `2537386`. Three rounds of remediation of other parts of the system have followed, and they touched files the approval path rests on. This review asks whether that approval still stands.

| | |
|---|---|
| Reviewed commit | `1f159a20109bb0759c54fdc262abd95aa2800294` (a detached worktree at that commit) |
| Reviewer | Independent agent, Opus tier, no authoring involvement, had not seen the code before (`independent-review-agent-19`). Not a reviewer of any earlier commit |
| Scope | `git diff 2537386 1f159a2 -- src`, read for its effect on four claims: an attacker with every MCP tool, the campaign store and the model's output, but without the operator's key, directories or terminal, cannot (a) create, alter, undo or bring back an editorial decision without detection; (b) make the editor sign something other than what their terminal showed; (c) obtain a released package containing anything the editor was not shown; (d) exceed the model budget or the instance ceilings |
| Tests it ran | `npm run check`: exit 0; 262 product and 83 harness tests. Nine regression test files run one by one, all passing. Four probes of its own, using the repository's in-memory test harness |
| Verdict | **approved, with one follow-up.** "Nothing changed between 2537386 and 1f159a2 breaks or weakens claims (a) to (d)." |

**This record is a transcription by the orchestrator, condensed from the reviewer's report.** It is a delta review: it relies on the reviews of `55a66f2` and `2537386` for the code that did not change.

## What did not change

Byte-identical between the two commits: the operator tool (`src/cli/operator.ts`), signing (`src/workflow/signing.ts`), the operator's ledger (`src/workflow/ledger.ts`), the decision contract (`src/contracts/decision.ts`), the spend account (`src/workflow/spend.ts`). In `src/util/runtime.ts` only two functions were added; `canonicalText`, `canonicalJson`, `displaySafe` and `fitToWidth` are untouched. In the workflow service, `confirmDecision`, `checkDecision`, `settledByLog`, `requestDigest` and what a request covers are unchanged; in assembly, the reading of approvals, the package and release digests and the release itself are unchanged.

## What changed, and its effect on the claims

| Change | Effect |
|---|---|
| `clip`, and model text brought to settled canonical form | Applied once, when model output is written into the record. Everything after it reads the stored string, so the text shown cannot differ from the text hashed or released. None |
| Evaluation: duplicates refused, a repeat that matches the latest is a no-op, an evaluation of the same drafts replaces the earlier one | Evaluation is advice and outside the digest. A decision still needs an evaluation that names the draft, as before, and replacement cannot leave an evaluated draft unevaluated. None |
| Decision requests: a limit over a campaign's life; the proposed reason and the instruction settled into canonical form | Stored before the digest is computed and shown from the record. None |
| Export: old previews removed | Only directories named as previews, under the programme's own directory, never through a link. Releases are written by the operator elsewhere. None |
| The lock rewritten; a record must be an ordinary file | The update sequence is unchanged: a displaced writer writes nothing. Under this attacker the store's lock is not what (a) rests on; the signed chain and the ledger are. None |
| Contract bounds | No canonical form or digest changed. See the follow-up |
| The evaluator's rules | Eligibility is still recomputed on the current text when a decision is requested, when it is confirmed and at assembly. None on (b) or (c) |
| The MCP server | Still no tool that records a decision or releases. None |
| Usage figures validated and capped | No truthful figure is under-counted: a single answer cannot use more than twice the request's allowance, and the cap is three times. (d) held |

## Attacks re-run at `1f159a2`

| Attack | Result |
|---|---|
| Changing the hook, call to action, hashtags, claims, the brief, the plan, or the post a draft belongs to, between a request and its confirmation | refused: the subject changed |
| Changing the stored request's instruction or action | refused: the request does not match |
| Confirming from the agent side | refused |
| Removing the last decision from the log | detected by the ledger at the next confirmation |
| Reordering decisions; splicing in another campaign's decision | the log fails verification; assembly refused |
| Bringing back a replaced approval | refused, by the existing regression tests and two further arrangements |
| Editing text after evaluation; removing all evaluations; planting a draft no evaluation covers | refused: ineligible, or not evaluated |
| Text that a second canonical pass would still change | the draft is ineligible; clipped text is canonical and within its length |
| Ten concurrent steps against a campaign limit of six calls and an instance limit of seven, with and without failures | six calls made, six charged, the rest refused |
| Usage reported as a fraction, zero, negative, a string, missing, or 1e12 | charged the figure rounded up, the whole allowance, or the cap |
| An ineligible draft holding direction controls, invisible characters and tag characters, shown by the operator tool | every such character written out as an escape. The allowed-character rule is not a precondition for safe display |

## Follow-up

| # | Severity | Finding |
|---|---|---|
| 1 | low; no claim affected | The new bounds apply when a record is read as well as when it is written. A record written by the code at `2537386` holding an evaluation with more than 200 failures would no longer parse, and the campaign would be unreadable to the operator tool. It fails closed and nothing can be forged. Not shown that any record is like that; no instance exists |

## Not covered

The lock's mutual exclusion under real concurrent processes (its own reviewer); the HTTP transport, the shim and creator ranking; whether the evaluator's rules catch every disguised term (not one of these four claims); the operator tool run with a key (forbidden by the brief).
