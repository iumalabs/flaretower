# Implementation Plan: Overview Dashboard Redesign

**Branch**: `027-overview-dashboard-redesign` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/027-overview-dashboard-redesign/spec.md`

## Summary

Closes GitHub issue #419. Three independent additions to the Overview page, all reusing existing
data and query patterns rather than introducing new capability classes: (1) a header context row
whose zone/Worker counts and last-scan time are derived from already-populated tables (one new
`evaluatedAt` field on an existing query, zero new Cloudflare calls) plus a real, honestly-labeled
scan cadence and an account-wide re-scan action that fires the six already-existing per-module
evaluate endpoints; (2) findings rows gain their real `reason` text via an additive JOIN from each
source's alerts table to its findings table (both already share `run_id`), plus a visual-only
contextual action label; (3) a 14-day exposure trend chart computed on the fly from real historical
findings, bounded to ~2 D1 queries per source (34 total) via a seed-plus-window-replay strategy
(research.md §5) rather than the naive 238-query approach — a deliberate, user-confirmed choice to
use real data with a bounded cost rather than fabricate figures or build new snapshot
infrastructure.

## Technical Context

**Language/Version**: TypeScript (strict), Deno 2.9+

**Primary Dependencies**: React — no new dependency.

**Storage**: D1 — no schema change. Every new field/endpoint reads existing tables
(`*_findings`/`*_alerts`, already populated by all six modules' existing `evaluate()` steps).

**Testing**: Playwright extends `tests/e2e/overview.spec.ts`; a new `tests/unit/audit-trend.test.ts`
covers the seed-plus-window-replay day-bucketing arithmetic directly (research.md §6), given its
correctness (seeding, day-boundary snapshotting, missing-data handling) is meaningful arithmetic
worth unit-level coverage beyond e2e mocks.

**Target Platform**: Browser (React SPA) + one new Worker route (`GET /api/audit/trend`) and two
additive field changes to existing routes — no new Cloudflare API integration.

**Performance Goals**: Trend computation bounded to ~34 D1 queries total (2 per source × 17
sources), not 238 (research.md §5) — spec.md SC-005 requires this not be user-noticeable regardless
of evaluation history length.

**Constraints**: No fabricated data anywhere (FR-003/FR-005/FR-009/FR-010) — every displayed figure
must trace to real, already-persisted or already-computed data, or show an explicit absence state.
No new Cloudflare-mutating capability beyond the account-wide re-scan, which itself only calls six
already-existing, already-safe evaluate endpoints (FR-012). No change to acknowledge semantics or
existing pagination envelopes (FR-007/FR-013).

**Scale/Scope**: 1 new backend module (`worker/modules/audit/trend.ts`) + 1 new route, 2 additive
fields on existing responses (`PostureSummaryEntry.evaluatedAt`, `UnifiedAlert.reason`), 1 rebuilt
page (`OverviewPage.tsx`), 1 new frontend hook (`useMultiRescan`), 1 extended e2e spec file, 1 new
unit test file.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I/II (Access-only auth, JWT validation)**: No change — the new `GET /api/audit/trend`
  route sits behind the same JWT-validation middleware every other `/api/*` route already does; no
  new auth logic. PASS.
- **Principle III (single Worker, shared audit logic)**: No change — `trend.ts` reads the same
  `AUDIT_SOURCES` registry and reuses `changes.ts`'s existing per-cutoff query helper (exported for
  reuse, not duplicated); the account-wide re-scan calls the exact same `POST .../evaluate` routes
  the scheduled handler and every per-module page already trigger — no new or divergent evaluation
  logic anywhere. PASS.
- **Principle IV/V (Deno-only, one config file)**: No new tooling/dependency/config file. PASS.
- **Principle VI (strict TypeScript, test-first, Playwright)**: Covered by extending
  `tests/e2e/overview.spec.ts` plus a dedicated unit test for the trend day-bucketing arithmetic
  (research.md §6) — this codebase's established pattern of unit-testing non-trivial arithmetic
  separately from e2e (e.g. `workers-dashboard-summary.test.ts` from specs/026). PASS.
- **Principle VII (never publicly reachable)**: Unaffected. PASS.
- **Principle VIII (least-privilege secrets)**: No new secret, no new Cloudflare API scope — every
  new query reads D1 tables the existing token scope already populated; the re-scan action calls
  already-existing evaluate endpoints under their own existing scope requirements. PASS.
- **Principle IX (every mutation audited)**: N/A for the read-side additions (header counts,
  findings reason, trend chart) — pure reads. The account-wide re-scan performs zero *new* kinds of
  mutation (it fires six calls to endpoints that already exist and already aren't separately
  `audit_log`-recorded today, per specs/024's plan.md Principle IX note, for the same reason: these
  are FlareTower's own read-only detection runs, not Cloudflare account-state changes).
- **Principle X (English-only, Conventional Commits)**: PASS by convention.

No violations. Proceeding to Phase 0.

**Post-design re-check** (after research.md/data-model.md/quickstart.md): research.md §5's
seed-plus-window-replay strategy was the key design-phase decision — re-confirmed it keeps D1 load
in the same order of magnitude as this page's other two endpoints (17 queries each today), not a
new order of magnitude, satisfying FR-011/SC-005 without new snapshot infrastructure. No new
Constitution concerns. Still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/027-overview-dashboard-redesign/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── checklists/requirements.md
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory for the two additive field changes (non-breaking, same precedent as
specs/026's `totalRouteCount`) — but the new `GET /api/audit/trend` route is a genuinely new
endpoint, so its shape is fully specified in data-model.md instead of a separate contracts file,
consistent with how specs/001-018's simpler single-endpoint features documented new routes directly
in data-model.md rather than a dedicated `contracts/` directory.

### Source Code (repository root)

```text
worker/modules/audit/
├── summary.ts            # PostureSummaryEntry gains evaluatedAt (research.md §1)
├── inbox.ts               # UnifiedAlert gains reason via LEFT JOIN (research.md §3)
├── changes.ts             # buildLatestPerEntityQuery exported for reuse by trend.ts
├── trend.ts               # new — computeTrend(): seed + window-replay per source (research.md §5)
└── routes.ts               # new GET /api/audit/trend; existing summary/alerts routes' JSON
                             #   serialization includes the two new fields

app/lib/
└── use-multi-rescan.ts    # new — fires all six evaluate endpoints (research.md §2)

app/pages/
└── OverviewPage.tsx        # rebuilt: header context row, FindingRow shows reason + contextual
                             #   action, new ExposureTrendChart sub-component

tests/e2e/
└── overview.spec.ts        # extended: header context, findings reason, multi-rescan, trend chart

tests/unit/
└── audit-trend.test.ts     # new — seed/window-replay/day-boundary/missing-data arithmetic
```

**Structure Decision**: Existing single-Worker + React SPA structure, unchanged — one new backend
module (`trend.ts`) alongside the existing `audit/` sub-modules (`summary.ts`, `inbox.ts`,
`changes.ts`), following that directory's established one-concern-per-file convention. No new page
files — `OverviewPage.tsx` is rebuilt in place, matching how specs/025/026 rebuilt their target
pages in place rather than introducing parallel "v2" files.

## Complexity Tracking

*No Constitution Check violations — this section is not applicable.*
