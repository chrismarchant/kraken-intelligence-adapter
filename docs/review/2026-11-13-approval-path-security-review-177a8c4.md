# Approval-path security review — commit 177a8c4

Commissioned by the owner's direction of 2026-11-13, with eight areas to cover.

| | |
|---|---|
| Reviewed commit | `177a8c4671fa66d1a67b613f303d1cf573b8f766` (a detached worktree at that commit; its `src/` is that of `b8e0170`) |
| Reviewer | Independent agent, Opus tier, no authoring involvement, had not seen the code before |
| Attacker assumed | An agent that can call every MCP tool, read and write the campaign store at any moment, read all source, and holds the MCP token and the shim's client token. It has neither the operator's key, nor the operator's directories, nor the provider's key |
| Tests it ran | `npm run check`: 181 product and 83 harness tests passed. Five probes, offline or loopback only, one driving the real operator tool |
| Not covered | `shim/normalize.ts` in depth; the eligibility rules and evaluator; markdown and terminal escaping beyond what was already recorded; prompt injection; MCP SDK internals; a real terminal; the harness |
| Verdict | **changes-requested** |
| Remediation | Commits `5e4ee5d` and `12a7626` |

**This record is a transcription by the orchestrator, condensed from the reviewer's report.**

## Area by area

| # | Area | Result |
|---|---|---|
| 1 | Editorial signing | Sound, with a residual: the signatures hold, but which signed decision counted was chosen through unsigned status fields (F1, F2) |
| 2 | Key isolation | Sound, with residuals: the location of the public key file and of the operator's key, ledger and releases was not checked (F5, F6) |
| 3 | MCP arguments | Sound |
| 4 | Revision binding | **Defect** (F3) |
| 5 | Replay protection | Sound, with residuals: a request's expiry and attempt count in the store can be rewritten, but confirming still needs the channel code and the editor |
| 6 | Permission escalation | **Defect** (F1, F2) |
| 7 | Direct provider access | **Defect** (F4). The key does not leak; routes are a fixed allow-list; no MCP tool lets a caller choose the endpoint, model or allowance |
| 8 | Spend-limit bypass | Sound for this repository's own calls, with residuals (F8; prompt tokens are not limited) |

## Findings

| # | Severity | Finding and evidence |
|---|---|---|
| F1 | high | A superseded approval was brought back by flipping two status fields; the real operator tool then reviewed, released and verified it. (The same defect as the sixth review's F1, found independently.) |
| F2 | high | A replaced narrative selection was brought back the same way, and the programme was planned on it |
| F3 | medium | One request to revise yielded any number of revisions: "already revised" was detected by a status field, and the pass counter restarted from the original each time. Probe: four revisions from one signed instruction. Each spent budget; each still needed the editor's approval |
| F4 | medium | **The model shim gave the holder of its client token the provider key's spend with no ceiling**: no limit on calls, tokens, `max_tokens` or `n`; any model by default. Probe: 50 concurrent requests accepted, one asking for 100,000,000 tokens and 128 answers. The threat model's statement on spend did not mention this path |
| F5 | low | The decision public key file could sit in the agent-writable data directory; replacing it let the agent-facing server accept forged selections and revision requests until the operator's tool exposed the mismatch. Release was not affected |
| F6 | info | The operator tool did not check that its key, ledger and release directory lie outside the data directory (unproven; configuration) |
| F7 | info | Export directory creation could follow a planted link (unproven) |
| F8 | info | Two processes could both break a stale lock; and a provider reporting more than was reserved would be under-charged (unproven) |

## Remediation (added by the orchestrator)

| # | Change | Regression tests |
|---|---|---|
| F1, F2 | As for the sixth review's F1 | `tests/kic/sixth-review.test.ts` |
| F3 | One revision per draft, read from what exists and not from a status field | `tests/kic/security-review.test.ts` "one request to revise yields one revision" |
| F4 | In key-injection mode the shim allows one answer per request, caps the tokens a request may ask for (and supplies the cap when none is named), limits requests in flight, and keeps a persistent ceiling on requests and tokens. The process refuses to start without a model allow-list and a ceiling unless the ceiling is waived in so many words. **The figure for the ceiling is the owner's (OD-6)** | `tests/shim/spend.test.ts`; `tests/shim/security.test.ts` |
| F5, F6 | The public key is refused inside the data or working directory; the operator's key in the data directory or the channel; a release directory there; a data directory inside the operator's | `tests/kic/security-review.test.ts` |
| F7 | Exports are created one level at a time and never through a link | `tests/kic/security-review.test.ts` |
| F8 | Owner-checked lock; the excess is charged | `tests/kic/security-review.test.ts` |

Not changed, and stated in the threat model: prompt tokens are not limited; a store writer who deletes a revision can obtain another on the same instruction, within the budget, and each still needs the editor's approval; a request's expiry and attempt count are not signed.

The reviewer's probes were re-run by the orchestrator against the fix: the revived approval is not released; the repeated revision, the unbounded shim start-up and the misplaced public key are refused.
