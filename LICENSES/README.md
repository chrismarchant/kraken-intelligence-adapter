# Licences and provenance

## Third-party source code in this repository

None. No upstream source file has been copied into this repository.

## Packages

92 packages are installed for production use (`@modelcontextprotocol/sdk`, `zod` and their dependencies). All declare MIT, ISC or BSD licences. The full list is in [`third-party.md`](third-party.md).

Development-only: `typescript` (Apache-2.0) and `@types/node` (MIT). Not shipped.

## Upstream audited, not imported

| Upstream | Revision | Licence | Use here |
|---|---|---|---|
| `CopilotKit/OpenBot` | `804aa69617cd96628895125c8d7d6bff04fdc8a3` | MIT, © 2026 CopilotKit | Read, and its tenant-package validator and model client were run in scratch space. `tenant-package/` follows its file format; the content is our own. |
| `@copilotkit/runtime` | 1.85.0 | MIT | Used in scratch experiments only. Not a dependency of this repository. |
| CopilotKit Intelligence | — | Separately licensed | Not used. No licence held. See `docs/gates/KIC-01-ASSESSMENT.md` §8. |

## Rule for imports

Before any upstream file or package is added: confirm its licence permits the use, record the source revision and path here, and keep the upstream notice with the file. If a licence is unclear, stop and escalate.
