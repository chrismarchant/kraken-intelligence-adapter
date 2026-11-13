# Kraken Intelligence Companion (KIC)

A standalone campaign-preparation companion for LinkedIn content programmes. It takes a client brief, proposes narratives, plans a programme, writes alternative drafts, compares them, records an editor's decisions and assembles a programme package.

**It does not publish.** There is no publishing client, credential or tool in this repository. Publishing commands in a package are provisional and `NON-EXECUTABLE`.

**Status:** engineering evidence presented; no gate accepted by the owner. Nothing is deployed.

## Try it

```bash
npm ci
```

```bash
npm run check
```

```bash
node src/cli/demo.ts
```

The last command replays a recorded Mistral Large 4 run of a synthetic campaign, offline, and exports a package under `out/`. The editor in that run is a scripted test actor.

## Read

| Document | What it is |
|---|---|
| [`docs/gates/KIC-01-EVIDENCE.md`](docs/gates/KIC-01-EVIDENCE.md) | What was built, what was run, and what has not been demonstrated |
| [`docs/gates/KIC-01-ASSESSMENT.md`](docs/gates/KIC-01-ASSESSMENT.md) | Feasibility of the OpenBot foundation, licensing and cost |
| [`docs/architecture/kic-companion.md`](docs/architecture/kic-companion.md) | Components, limits, configuration, deployment requirements |
| [`docs/security/THREAT-MODEL.md`](docs/security/THREAT-MODEL.md) | What must never happen, and known weaknesses |
| [`docs/review/`](docs/review/) | Independent review records, bound to commits |
| [`docs/decisions/OWNER_DECISIONS.md`](docs/decisions/OWNER_DECISIONS.md) | Decisions reserved for the owner |
| [`harness/state/GATE_STATE.md`](harness/state/GATE_STATE.md) | Gate ledger |
| [`CLAUDE.md`](CLAUDE.md) | Agent operating instructions |

`harness/` is the engineering harness. It is not part of the product.
