# Review-bot reuse assessment

Date: 2026-11-13. Read-only. Subject: the public Mistral code-review bot repository (`chrismarchant/mistral-code-review-bot`). Nothing was copied into this repository. The shallow clone (`--depth 50`, LFS smudge skipped) was made in a session scratch directory because the sandbox refused a clone target outside the worktree.

## Findings

| Question | Finding |
|---|---|
| Default-branch head | `eacfae0da060a1e36eca1194c73798d194e0186e`, committed 2026-11-11 (`Add concurrency, retries/timeouts, and hunk-level chunking`). Branch `main`. History has three commits. |
| Block-content fix present? | **No.** `src/mistral.ts` types `message.content` as `string \| null` and passes it straight to `JSON.parse`. When the model returns a block array (`thinking` block then `text` block), `JSON.parse` of the coerced array fails, and the catch path stores the raw `content` value as `review_comment`. `src/bot.ts` interpolates `review.review_comment` into the review body and inline comments. A block array there is the 422 case. `git log -S thinking` over `src/` finds no commit that ever handled it, and the test file has no block-array case. |
| Invocation | `uses: chrismarchant/mistral-code-review-bot@<ref>` (node20 action, `action/index.js`). Env: `GITHUB_TOKEN`, `MISTRAL_API_KEY` (required); optional `MODEL` (default `mistral-large-latest`), `MISTRAL_API_ENDPOINT`, `LANGUAGE`, `PROMPT`, `MAX_PATCH_LENGTH`, `IGNORE_PATTERNS`, `INCLUDE_PATTERNS`, `TARGET_LABEL`, `MAX_CONCURRENCY`, `CHUNK_MAX_LINES`, `REQUEST_TIMEOUT_MS`, `RETRY_ATTEMPTS`, `RETRY_BASE_DELAY_MS`, `temperature`, `top_p`, `max_tokens`. Permissions: `contents: read`, `pull-requests: write`. Trigger documented: `pull_request` (`opened`, `reopened`, `synchronize`). It runs through the Probot GitHub-Actions adapter, which expects a pull-request event payload, so a `workflow_dispatch` run would not carry the payload it needs. |
| Bundle verifiable against source? | **Not verified.** `action/index.js` is a 6.6 MB committed `ncc` bundle (no source map, no `dist/`). The bundle's `json.reviews` handling matches the source and it was last changed in the same commit as the source. A rebuild from `package-lock.json` to compare bytes was attempted and refused by the sandbox permission layer, so equality was not tested. |
| Other observations | Requests use `response_format: json_object`, `temperature: 1`. Reviews each file's patch, not full-repository context. It has no notion of a commit-bound ledger. |

## Decision

The fix is absent from the default branch, so **no `mistral-review.yml` workflow was added**. It is not operational and must not be a required check. Per the owner decision register (OD-5), the interim independent review remains an Opus-tier agent review recorded in `harness/state/reviews.json` with `reviewer.kind` of `agent` or `model`.

## Conditions to revisit

1. Upstream handles block-structured content (extract the `text` block, ignore `thinking`) with a test.
2. A pinned commit rebuilds byte-identically from its lockfile, or the bundle is rebuilt in CI from source instead of being trusted.
3. The owner adds the `MISTRAL_API_KEY` secret and a controlled test PR passes.
4. The result is recorded as a review entry bound to the head SHA; the bot posting a comment is not by itself review evidence.
