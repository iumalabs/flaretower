# Implementation Plan: Clone API Token Permissions

**Branch**: `011-clone-token-permissions` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-clone-token-permissions/spec.md`

## Summary

A purely client-side tool, behind FlareTower's existing Access gate, that lets an operator paste a
Cloudflare API token's permission-policy JSON (as shown in Cloudflare's own token-creation
dashboard) and get back a human-readable checklist, a reusable JSON payload for creating a matching
new token, and a diff between two pasted payloads — entirely without FlareTower ever calling the
Cloudflare API to read or create tokens itself (research.md §1: even Cloudflare's own
permission-group-name lookup endpoint sits in the same sensitive "API Tokens" scope tier this
feature exists to avoid). No new Worker routes, no new D1 tables, no new npm dependency.

## Technical Context

**Language/Version**: TypeScript (strict), React 19, Deno 2 runtime — unchanged.

**Primary Dependencies**: None new. A small hand-rolled parse/diff module (research.md §3) — the
comparison need is narrow enough (two known-shaped objects, set/map comparison) that an npm
deep-diff library isn't warranted.

**Storage**: N/A — nothing this feature handles is ever persisted (spec.md FR-007). No D1 changes.

**Testing**: `deno test` for the pure parse/normalize/diff functions (Constitution Principle VI,
test-first — these are the easiest kind of function in this codebase to unit-test exhaustively,
being pure and side-effect-free); Playwright for the new page (paste → checklist/ payload output;
paste-two → diff output; malformed input → clear error).

**Target Platform**: Browser SPA only. This is the first FlareTower feature that touches zero files
under `worker/` — no new `/api/*` route, no new Cloudflare API call, no new D1 migration.

**Project Type**: Existing single-Worker web application — one new page, one new nav entry, two new
small frontend-only TypeScript modules.

**Performance Goals**: N/A — client-side parsing of a few-KB JSON payload, not a
performance-sensitive path.

**Constraints**: MUST NOT call any Cloudflare API endpoint for this feature, for any reason (spec.md
FR-005) — including the tempting-looking `GET /user/tokens/permission_groups` convenience endpoint
(research.md §1). MUST NOT persist pasted input anywhere (FR-007). MUST NOT add a new npm dependency
for JSON diffing (research.md §3).

**Scale/Scope**: One new page (`TokenToolsPage`), one new sidebar nav entry, one new pure parse/diff
module, one small curated static permission-group-name lookup table (research.md §2) — no backend
changes at all.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                     | Applies?                                      | Assessment                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Access-only gate                           | N/A                                           | No identity/auth code touched.                                                                                                                                                                                                                                                                               |
| II. Defense-in-depth JWT validation           | N/A                                           | No new `/api/*` route at all — the new page sits behind the SPA's existing Access-gated shell, same as every other page.                                                                                                                                                                                     |
| III. Single Worker, shared audit logic        | N/A                                           | No evaluation/audit logic touched — no Cloudflare data is fetched or evaluated by this feature.                                                                                                                                                                                                              |
| IV. Deno-only local toolchain                 | Pass                                          | No new dependency of any kind.                                                                                                                                                                                                                                                                               |
| V. One configuration file                     | Pass                                          | No new config file class.                                                                                                                                                                                                                                                                                    |
| VI. Strict TypeScript, test-first, Playwright | Pass (gate for implementation)                | The parse/diff module is pure and gets exhaustive unit tests written alongside; the new page gets Playwright coverage for paste/checklist/payload/diff/error states.                                                                                                                                         |
| VII. Never publicly reachable                 | Pass                                          | Unaffected — `workers_dev: false` untouched; the new page is reachable only through the existing Access-gated SPA shell.                                                                                                                                                                                     |
| VIII. Least-privilege secrets                 | Pass — and this is the feature's entire point | FlareTower's own Cloudflare API credential gains zero new scope (spec.md FR-006) — confirmed by design: this feature never calls the Cloudflare API, not even the read-only permission-groups lookup endpoint, which sits in the same sensitive scope tier as full token read/write access (research.md §1). |
| IX. Every mutation is audited                 | N/A                                           | FlareTower performs no Cloudflare-account mutation here — the operator always creates/modifies the actual token themselves, directly in Cloudflare's dashboard (spec.md FR-005, Assumptions). Nothing for `audit_log` to record.                                                                             |
| X. English-only, Conventional Commits         | Pass                                          | Unaffected.                                                                                                                                                                                                                                                                                                  |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/011-clone-token-permissions/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
app/
├── lib/
│   ├── token-permissions.ts               # NEW — parse/normalize/diff pure functions (contracts/parser.md)
│   └── cloudflare-permission-groups.ts     # NEW — curated static permission-group id -> human name lookup (research.md §2)
├── pages/
│   └── TokenToolsPage.tsx                  # NEW — paste-in UI: checklist + reusable-payload output (US1), compare mode (US2)
├── App.tsx                                 # extended: new "token-tools" entry in PAGES
└── nav-items.ts                            # extended: new NAV_ITEMS entry

tests/
├── unit/
│   └── token-permissions.test.ts           # NEW
└── e2e/
    └── token-tools.spec.ts                 # NEW
```

No `worker/` changes, no D1 migrations — confirmed by the Constitution Check and Technical Context
above; this is the first FlareTower feature with zero backend touch points at all.

**Structure Decision**: Reuses the existing single-Worker web-application layout (`worker/`
completely untouched). A new top-level page + nav entry follows the exact pattern established by
every prior module page and the Design System's Overview page — no new source directory.

## Complexity Tracking

_No Constitution Check violations — table not needed._
