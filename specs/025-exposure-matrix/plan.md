# Implementation Plan: Exposure Matrix

**Branch**: `025-exposure-matrix` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/025-exposure-matrix/spec.md`

## Summary

Rebuild the Exposure page from a flat one-row-per-hostname list into a one-row-per-Worker matrix
(research.md §1-§3), closing GitHub issue #421. Zero backend change — both data sources already
exist: `GET /api/exposure/inventory` (pivoted client-side into entry-point columns) and the
just-shipped `GET /api/workers/:worker_name/detail` (specs/023, reused lazily for the row-expand
ROUTES/EFFECTIVE POLICY panels). A new page-specific table replaces `FindingsTable` on this one page
only, because `FindingsTable` hardcodes its status column leftmost while the design anchors status
rightmost (research.md §3) — reused as-is: `ExposureStatusBadge`, `EmptyState`, `LoadingSkeleton`,
`useRescan`/`RescanButton` (specs/024), `AlertBanner`. Row-detail action controls are visual only
in this feature (user-confirmed scope boundary, spec.md Assumptions) except "View in Cloudflare,"
which reuses the Worker Detail endpoint's existing `cloudflareUrl`.

## Technical Context

**Language/Version**: TypeScript (strict), Deno 2.9+

**Primary Dependencies**: React — no new dependency. Extracts (does not add) a shared
`RoutePolicy` component from `WorkerDetailPage.tsx` (research.md §4).

**Storage**: N/A — no schema change, no new persisted state; reuses two already-existing, unchanged
API responses (research.md §1-§2).

**Testing**: Playwright — extends `tests/e2e/exposure-inventory.spec.ts` (research.md §9) with matrix
structure, row-expand, jump-to-row, and search scenarios; existing specs/024 re-scan scenarios in
that file continue to apply unchanged.

**Target Platform**: Browser (React SPA) — no Worker-side change beyond none (both consumed endpoints
are already deployed and unchanged).

**Performance Goals**: N/A beyond spec.md SC-002/SC-003 (qualitative, "under 10 seconds"/"under 5
seconds" of interaction).

**Constraints**: Row-detail action controls MUST NOT call any Cloudflare-mutating endpoint in this
feature (spec.md FR-006, user-confirmed) — the one exception, "View in Cloudflare," is an outbound
link to Cloudflare's own dashboard, not a mutation. Must not change the underlying detection logic
or scheduled-scan cadence (spec.md FR-013).

**Scale/Scope**: 1 new page-specific table component (replacing `FindingsTable` on this one page), 1
extracted shared component (`RoutePolicy`), 1 rebuilt page (`ExposureInventory.tsx`), 1 updated
import (`WorkerDetailPage.tsx`), 1 extended e2e spec file.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I/II (Access-only auth, JWT validation)**: No change — no new route, no new auth logic,
  reuses two already-gated endpoints as-is. PASS.
- **Principle III (single Worker, shared audit logic)**: No change — this feature adds no new
  evaluation logic anywhere; both endpoints it calls already run through the existing shared
  `runEvaluation`/`buildWorkerDetail` paths, untouched. PASS.
- **Principle IV/V (Deno-only, one config file)**: No new tooling/dependency/config file. PASS.
- **Principle VI (strict TypeScript, test-first, Playwright)**: New page-specific table component and
  extracted `RoutePolicy` are exercised through this page's own Playwright coverage (research.md §9),
  consistent with this codebase's existing convention (specs/024 precedent) of not unit-testing
  presentational React components in isolation. PASS.
- **Principle VII (never publicly reachable)**: Unaffected. PASS.
- **Principle VIII (least-privilege secrets)**: No new secret, no new scope — reuses existing
  `CF_API_TOKEN` usage inside `buildWorkerDetail`, already read-only. PASS.
- **Principle IX (every mutation audited)**: N/A — this feature performs zero Cloudflare-mutating
  actions. The row-detail action controls are explicitly visual-only in this feature (user-confirmed,
  spec.md Assumptions); "View in Cloudflare" is an outbound link, not a mutation, so nothing here
  writes to `audit_log`. Any future feature that wires a real mutation to these controls will need
  its own Constitution Check against this principle at that time.
- **Principle X (English-only, Conventional Commits)**: PASS by convention.

No violations. Proceeding to Phase 0.

**Post-design re-check** (after research.md/data-model.md/quickstart.md): research.md §3's finding
that `FindingsTable` cannot be reused without either reproducing issue #420's status-position defect
or modifying a widely-shared component was the only design-phase surprise — resolved by scoping a
new, page-specific table to this one page (not a `FindingsTable` change), which keeps this feature's
blast radius contained to the Exposure page alone. No new Constitution concerns. Still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/025-exposure-matrix/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── checklists/requirements.md
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory (research.md §1-§2 — no API surface changes, both endpoints already exist
and are unchanged; same precedent as spec 024).

### Source Code (repository root)

```text
app/pages/
├── ExposureInventory.tsx      # rebuilt: matrix table (new page-specific component below) +
│                                #   toolbar (search, jump-to-row chips, RescanButton) + lazy
│                                #   row-expand fetch of GET /workers/:name/detail
└── WorkerDetailPage.tsx        # updated: imports RoutePolicy from its new shared location
                                 #   instead of its own private copy (no behavior change)

app/components/
├── ExposureMatrixTable.tsx    # new: page-specific table (worker rows, entry-point columns,
│                                #   coverage column, status anchored rightmost) — not
│                                #   FindingsTable (research.md §3)
└── RoutePolicy.tsx             # new: extracted from WorkerDetailPage.tsx (research.md §4),
                                 #   reused by both pages

tests/e2e/
└── exposure-inventory.spec.ts  # extended: matrix structure, row-expand, jump-to-row, search
                                 #   scenarios — existing specs/024 re-scan scenarios unaffected
```

**Structure Decision**: Existing single-Worker + React SPA structure, unchanged — this feature adds
no backend surface. `app/components/` gets two new files: `ExposureMatrixTable.tsx` (page-specific,
named for what it renders rather than genericized, since research.md §3 explicitly decided against
generalizing `FindingsTable` in this feature) and `RoutePolicy.tsx` (a genuine extraction of
existing, already-shared-in-spirit logic, not new logic).

## Complexity Tracking

*No Constitution Check violations — this section is not applicable.*
