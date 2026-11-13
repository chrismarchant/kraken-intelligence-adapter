# Independent review of the mediation package — commit ee303a2

| | |
|---|---|
| Reviewed | `docs/architecture/mediation/KIC-ARCH-MED-01/` (README, D1–D7) and the directive summary, at commit `ee303a267d47e853025fe29f1af04dc6007d2e64` |
| Reviewer | Independent agent, Opus tier, no authoring involvement |
| Method | 42 factual claims checked against the upstream clones and this repository; internal consistency; whether anything authorised implementation, a dependency or spend; whether the proof plan could publish or contact anyone. `npm run check` run for test counts (181 and 83 pass). Nothing upstream was built or run |
| Not checked | OpenDots source; OpenDuet's file counts; OpenBot's private-runtime-method claim, telemetry defaults, link-code expiry, audit trigger, Helm chart, harnesses, desktop and mobile apps; the Discord, Telegram and WhatsApp adapters; whether the tenant package still validates at a release tag |
| Verdict | **approved-with-corrections.** The recommendation (OpenBot unmodified with this repository's MCP server as the boundary; OpenDuet, OpenDots and OpenMuse excluded as runtimes; business actions with Kraken) held up against source. The proof plan was **not fit to authorise as written** |
| Corrections | Applied in the commit that adds this record. **The corrected package has not been re-reviewed** |

**This record is a transcription by the orchestrator, condensed from the reviewer's report.** The orchestrator re-read each corrected point in OpenBot's source before changing the documents.

## Fact check

Of 42 claims: 31 confirmed (several with a nuance), 3 wrong, 6 overstated or incomplete, 2 not checked.

## Findings

| # | Severity | Where | Finding | Correction applied |
|---|---|---|---|---|
| 1 | high | D2, D3, D7 step 3 | OpenBot tasks can be started only from a check-in item (a database check constraint), and then ask before every change. "A batch of drafting as an OpenBot task" cannot be done as described | Tasks restated; D7 step 3 redesigned around an ordinary conversation and a routine |
| 2 | high | D4 ownership row 2, D6 Phase 2 | Check-ins run under a read-only restriction that fails closed: they cannot open a decision request, and cannot see a tool server an admin connected for everybody | Routines, not check-ins, propose; check-ins dropped from what is relied on |
| 3 | medium–high | D4, D5, D7 step 1 | The tenant package defines Bots and gives them skills; it deliberately does not grant MCP tools, and has no routine section. "By configuration in the tenant package" was wrong | Grants and routines are stated as manual steps in each instance, recorded as evidence |
| 4 | medium–high | D4, D5 P13, D7 step 0 | "Ask before every change" is each person's own switch, not an instance setting. Only the team edition has an admin who can close kinds of action | Restated; team rules and closed kinds for the team edition; the personal edition's limit stated |
| 5 | medium–high | D4 row 5, D5 P2, D7 | **Omission.** "The agent computer is granted for reading" named no mechanism. Cloud browser, network and password manager are on in both editions; posting and sending ask but can be allowed "always"; the start script can provision app connectors. A Bot with a signed-in browser could post. Checking grants would not catch it | New D3 finding 4; confinement settings in P2, P13 and D7's safety limits; D7 step 0 now tests confinement against a stand-in page and stops the proof if it fails |
| 6 | medium | D3, D4, D6 | The reason given for keeping decisions off channels mixed up the Channels SDK's in-memory prompt with OpenBot's route: through OpenTag, an OpenBot tool approval can be answered from a card and is recorded durably. OpenTag is described upstream as open-source | D3 finding 10 and P5 rewritten; a separate choice about tool approvals from a channel added |
| 7 | medium | D2, D3, D5 P7, D7 | **Omission.** The README row also says "OpenBot for Business includes Intelligence"; managed Intelligence needs no licence token, which means conversations are kept by the vendor; the local licence is a 30-day macOS preview | Added to D2, D3 finding 2, P7 and D7's prerequisites and safety limits |
| 8 | medium | D6 against D7 and D5 | Phase 1 included proof steps that need specialists (Phase 2) and new contracts (Phase 3); its decisions list was incomplete; authorising "the Phase 1 proof" would have covered all of them | Steps assigned to phases; Phase 1 is steps 0, 3, 4 and 6 only; decision lists aligned |
| 9 | medium | D4, D7 | The Bots' own model spend has no ceiling and no owner; the proof spends money while the spend-ceiling decision is open | New D3 finding 14, proposal P14, a prerequisite and a safety limit in D7 |
| 10 | medium | D2 | The audit read the main branch, but a release tag is recommended; three migrations on main are unreleased, including one a cited capability depends on | "Released versus main" section; a re-check at the tag added to Phase 0 |
| 11–15 | low | D1, D2, D4 | Harness line count mislabelled; "all findings fixed" overstated; the provisional command does carry one timestamp (approval time); "re-run at most twice" ambiguous; one quotation labelled as source when it is documentation; the commit rate is the clone depth | Corrected |
| 16 | low | D1, D5, README | The mapping from proposals to register entries was missing; "seven demonstrations" against eight steps | Mapping table added; setup step named |
| 17 | low | D3 | OpenBot does publish a REST API and an AG-UI endpoint; "nothing outside can call it" is true of MCP only | Qualified |
| 18 | low | D2, D3 | A commercial figure attributed to the owner in a public repository | Removed |

## Counter-arguments the reviewer raised

1. Being prepare-only depends on OpenBot settings the package did not specify — the largest unstated risk in the recommended option.
2. With managed Intelligence, client conversation content sits with the vendor.
3. A cheaper option was not compared: no OpenBot at all for a single-editor pilot. Given findings 1 to 4, much of what OpenBot was expected to add is less available than the first draft said.
4. A proof on the personal edition shows less of the governance than the plan implied.
5. No capability was found in the excluded projects that this product needs and OpenBot lacks. The exclusions stand.

All five are now in the documents: D3 findings 2, 4 and 6; D4's comparison with the no-OpenBot fallback and its conditional recommendation; D7's limits.
