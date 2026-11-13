# KIC-01 autonomous session authorisation — 2026-11-13

**This is a summary, not the verbatim text.** The owner's instruction was given as a session goal; the verbatim text is in the session record.

The Human Owner authorised up to six hours of autonomous engineering on the feature branch, in four workstreams:

| Workstream | Authorised |
|---|---|
| A — OpenBot runtime | Boot pinned OpenBot if Intelligence credentials and pgvector are available; build an external Mistral response-normalisation shim; test streaming and tool calls. If blocked, record once and continue. |
| B — KIC MCP | Implement a standalone, testable MCP service with typed contracts, synthetic data and deterministic JEV mocks. No live publishing. |
| C — Commercial proof | Demonstrate a synthetic campaign end to end through API/CLI tests if OpenBot cannot run. Publishing commands NON-EXECUTABLE. |
| D — AEH | Reuse `aeh` and the review bot if accessible; add only essential CI, checkpoints, commit-bound review, restart recovery and enforceable stops. |

Not authorised: purchases, production deployment, credential changes, protected-branch merges, live JEV calls, publishing, outreach, advertising, or modification of Kraken, JEV or upstream repositories.

This authorises implementation inside workstreams A–D. It is **not** formal acceptance of KIC-00, of the foundation decision OD-1, or of any gate.
