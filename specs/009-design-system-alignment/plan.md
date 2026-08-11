# Implementation Plan: Design System & App Shell Alignment

**Branch**: `009-design-system-alignment` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-design-system-alignment/spec.md`

## Summary

Bring the SPA's visual layer into alignment with `docs/design.zip` (the
constitution's designated source of truth), which a cross-check found had
drifted substantially: unloaded fonts, no favicon, no logo, a nav bar
structurally unlike the design's sidebar pattern, ad-hoc per-page card
layouts instead of the design's shared sortable/filterable data-table
pattern, inconsistent border-radius usage, plain-text loading/empty
states, and no cross-module Overview page. The technical approach is
frontend-only: fix `app/styles/tokens.css` and `app/index.html`, build a
small set of shared presentational components (`Sidebar`, `FindingsTable`,
`AlertBanner`, `EmptyState`, `LoadingSkeleton`), adopt them across all 7
existing module pages, and add a new Overview page that is a thin client
over three endpoints Module 7 (Audit & Drift) already exposes
(`GET /api/audit/summary`, `/alerts`, `/changes`) — no new backend
endpoints, no schema changes, no changes to any module's detection logic.

## Technical Context

**Language/Version**: TypeScript (strict mode), targeting the existing
Deno 2 / Cloudflare Workers runtime.

**Primary Dependencies**: React 19 (already in use, no new UI framework),
Vite 8 + `@cloudflare/vite-plugin` (existing build pipeline, unchanged).
No new runtime dependency is required — `deno.json`'s import map does not
need a new entry for this feature. Self-hosted IBM Plex Sans/Mono font
files are a new static asset, not an npm dependency.

**Storage**: N/A for new state — the Overview page reads existing D1 data
exclusively through Module 7's existing endpoints; no new tables, no new
columns, no migration.

**Testing**: `deno test` (unit, for any pure logic such as the per-module
badge-count rollup) and Playwright (`deno task test:e2e`) for every
user-facing flow touched, per constitution Principle VI — filter-chip
interaction, row expansion, and the Overview page are new user-facing
flows and each requires new e2e coverage; existing e2e specs for the 7
module pages must keep passing after their layout changes.

**Target Platform**: Browser SPA served by the Worker's static-assets
binding, same as every existing page.

**Project Type**: Web application (existing single-Worker structure: a
Hono `/api/*` backend plus a React SPA, both already present — this
feature only adds to the SPA side).

**Performance Goals**: No new performance target beyond the existing
pages' — the Overview page fetches 3 already-fast, already-indexed
summary endpoints, not raw per-module inventories.

**Constraints**: Constitution Principle VII (never publicly reachable)
and Principle VIII (no token in the UI) are unaffected — this feature
touches no auth, no secrets, no API-token handling. Self-hosting fonts
rather than pulling them from Google Fonts' CDN at runtime keeps the SPA
free of a new third-party runtime dependency for a self-hosted security
tool, consistent with the project's existing "no external dependency for
core function" posture (see research.md).

**Scale/Scope**: 7 existing module pages migrated to one shared table
pattern, 1 new Overview page, ~5 new shared components, 1 corrected
token value, font loading + favicon added to `app/index.html`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| I. Access-only gate | N/A | No identity/auth code touched. |
| II. Defense-in-depth JWT validation | N/A | No `/api/*` auth path touched. |
| III. Single Worker, shared audit logic | Pass | No audit/evaluation logic is touched; the Overview page is a presentation layer over Module 7's existing shared `computePostureSummary`/`queryUnifiedAlerts`/`computeChanges` — it does not introduce a second, divergent computation of the same data (this is the whole point of FR-016/FR-017). |
| IV. Deno-only local toolchain | Pass | No new toolchain; self-hosted font files are static assets, not a package-manager dependency. |
| V. One configuration file | Pass | No new config file; font/build config, if any, stays inside the existing `deno.json` and `vite.config` entries already present. |
| VI. Strict TypeScript, test-first, Playwright | Pass (gate for implementation) | All new components are strict TS; new Playwright coverage is required for the filter-chip, row-expansion, and Overview flows (FR/SC above already encode this). |
| VII. Never publicly reachable | N/A | `wrangler.jsonc`'s `workers_dev: false` is untouched by a frontend-only feature. |
| VIII. Least-privilege secrets | N/A | No token/secret handling touched. |
| IX. Every mutation is audited | N/A | This feature adds no new mutating actions — existing acknowledge actions and their audit-log writes are reused unchanged (FR-019 forbids touching them). |
| X. English-only, Conventional Commits | Pass (gate for implementation) | Enforced same as every prior feature in this repo. |
| Design System section | Pass (this feature's entire purpose) | Closes the drift this section exists to prevent; token/spacing values continue to live only in `app/styles/tokens.css`, status semantics stay shape+color everywhere, component patterns are taken from `docs/design.zip` rather than invented. |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/009-design-system-alignment/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
app/
├── index.html                      # + favicon <link>, self-hosted font <link>/@font-face
├── styles/
│   └── tokens.css                  # fix --surface-2; add --text-metric; zero border-radius stays implicit (no token needed — components just stop using border-radius)
├── assets/
│   └── fonts/                      # NEW — self-hosted IBM Plex Sans/Mono woff2 files
├── components/
│   ├── ExposureStatusBadge.tsx     # existing — rename usage stays, drop its own border-radius
│   ├── Logo.tsx                    # NEW — the SVG mark, dark/mono/tile variants as props
│   ├── Sidebar.tsx                 # NEW — replaces App.tsx's inline nav bar
│   ├── AlertBanner.tsx             # NEW — account/module-scope critical banner
│   ├── EmptyState.tsx              # NEW — icon + heading + description + CTA
│   ├── LoadingSkeleton.tsx         # NEW — shimmer skeleton rows
│   └── FindingsTable.tsx           # NEW — shared sortable/filterable/expandable table
├── pages/
│   ├── OverviewPage.tsx            # NEW — reads GET /api/audit/{summary,alerts,changes}
│   ├── ExposureInventory.tsx       # migrated onto FindingsTable
│   ├── DnsInventory.tsx            # migrated onto FindingsTable
│   ├── ZeroTrustInventory.tsx      # migrated onto FindingsTable
│   ├── PagesInventory.tsx          # migrated onto FindingsTable
│   ├── StorageInventory.tsx        # migrated onto FindingsTable
│   ├── SecurityPostureInventory.tsx # migrated onto FindingsTable
│   └── AuditInventory.tsx          # migrated onto FindingsTable (its own per-module table stays; unified inbox view already exists and is reused, not replaced)
└── App.tsx                         # nav replaced by <Sidebar>; PAGES gains an "overview" entry

tests/
├── unit/
│   └── nav-badge-counts.test.ts    # NEW — pure rollup logic (PostureSummaryEntry[] -> per-module critical count), if extracted as testable pure function
└── e2e/
    ├── overview.spec.ts            # NEW
    ├── findings-table-filter.spec.ts # NEW — filter chips + row expansion, generalized across at least 2 module pages
    └── (existing 7 module e2e specs) # updated only where selectors changed due to the table migration
```

No backend (`worker/`) source directories are touched by this feature —
confirmed by Technical Context and the Constitution Check table above.

**Structure Decision**: Existing single-Worker web-application layout
(`worker/` backend, `app/` frontend SPA, `tests/{unit,e2e}/`) is reused
as-is; this feature only adds files under `app/` and `tests/`.

## Complexity Tracking

*No Constitution Check violations — table not needed.*

## Post-Design Constitution Re-Check

*Performed after Phase 1 (data-model.md, contracts/components.md,
quickstart.md) were written.*

The Phase 1 design confirms rather than changes the Phase 0 assessment:
`data-model.md` introduces zero persisted entities (only client-side view
models and already-existing backend types consumed as-is), and
`contracts/components.md` confirms zero new API endpoints — the Overview
page is a pure consumer of Module 7's existing, shared
`computePostureSummary`/`queryUnifiedAlerts`/`computeChanges` (Principle
III stays satisfied by construction, not by discipline). No principle
newly at risk; the Constitution Check table above stands unchanged.
