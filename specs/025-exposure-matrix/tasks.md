---

description: "Task list for Exposure Matrix"

---

# Tasks: Exposure Matrix

**Input**: Design documents from `/specs/025-exposure-matrix/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Playwright e2e coverage is explicitly called for by plan.md (Testing section) and the
project's Definition of Done — included below, extending the existing
`tests/e2e/exposure-inventory.spec.ts`.

**Organization**: Tasks are grouped by user story. No backend work exists (research.md §1-§2 — both
endpoints already exist, unchanged); this is a pure frontend feature, but most tasks touch the same
1-2 files (`ExposureMatrixTable.tsx`, `ExposureInventory.tsx`) sequentially rather than in parallel,
since this is one page rebuilt incrementally rather than six independent pages (contrast with
specs/024).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Existing single-Worker + React SPA structure (see plan.md Project Structure) — `app/components/`,
`app/pages/`, `tests/e2e/` at repository root.

---

## Phase 1: Setup

No project initialization needed — existing Deno/React project, no new dependency or config
(plan.md Technical Context). Nothing to do in this phase.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The client-side pivot logic every user story's rendering depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T001 Define `WorkerMatrixRow`/`EntryPointCell` types and a `buildMatrixRows(inventory)` pure
  function (data-model.md) in `app/pages/ExposureInventory.tsx` (or a co-located helper if it grows
  large): groups each Worker's `hostnames` by `kind` into `customDomain`/`workersDev`/`previewUrl`
  cells (worst status + full hostname list per cell, research.md §7), computes the `coverage`
  fraction/label (research.md §5) and `overallStatus` per Worker, and handles a Worker with zero
  hostnames as an explicit "not applicable" row (FR-011).

**Checkpoint**: The derived row data every story needs is ready — user story implementation
(Phase 3+) can now proceed.

---

## Phase 3: User Story 1 - See every Worker's full exposure surface at a glance (Priority: P1) 🎯 MVP

**Goal**: The Exposure page shows one row per Worker, with a separate status per entry-point type, an
access-coverage summary, and overall status anchored as the rightmost column.

**Independent Test**: Open the Exposure page against Workers with varying entry-point combinations;
confirm each Worker is exactly one row with a distinct status per entry-point column and one overall
status on the right (quickstart.md Scenario 1).

### Implementation for User Story 1

- [X] T002 [US1] Build `ExposureMatrixTable` component in `app/components/ExposureMatrixTable.tsx`:
  renders columns Worker → Custom domain → workers.dev → Preview URL → Access coverage → Status
  (status rightmost, NOT reusing `FindingsTable`'s hardcoded-leftmost status column — research.md
  §3), consuming `WorkerMatrixRow[]` (T001) as its row data; reuses `ExposureStatusBadge` for pills,
  `EmptyState`/`LoadingSkeleton` for loading/empty states.
- [X] T003 [US1] In `ExposureMatrixTable.tsx`, render each entry-point cell's "not present" state
  (FR-002) when `EntryPointCell.present` is `false`, and the worst-status-plus-count summary (e.g.
  "2 custom domains") when a Worker has more than one hostname of that kind (FR-010, research.md
  §7).
- [X] T004 [US1] In `ExposureMatrixTable.tsx`, render a zero-HTTP-route Worker's row with an explicit
  "not applicable" state across its entry-point and coverage columns (FR-011), distinct from
  "not evaluated" and "protected."
- [X] T005 [US1] Rebuild `app/pages/ExposureInventory.tsx` to render `ExposureMatrixTable` (T002)
  instead of `FindingsTable`, using `buildMatrixRows` (T001) on the existing
  `GET /api/exposure/inventory` response; update the page title/heading text to "Exposure matrix"
  (FR-012); keep the existing `AlertBanner` and `useRescan`/`RescanButton` wiring unchanged in
  substance (T014 in Phase 5 repositions the re-scan control's toolbar placement).

### Tests for User Story 1

- [X] T006 [P] [US1] In `tests/e2e/exposure-inventory.spec.ts`, add matrix-structure scenarios: one
  row per Worker (not per hostname), a distinct status per entry-point column, the "not present"
  state for a missing entry-point type, the access-coverage summary, the multi-hostname-same-kind
  summarized cell, and the zero-route Worker's "not applicable" row (quickstart.md Scenario 1).

**Checkpoint**: User Story 1 is fully functional and independently testable — the matrix structure
alone already closes the core value of GitHub issue #421.

---

## Phase 4: User Story 2 - Drill into one Worker's routes and policy without leaving the page (Priority: P2)

**Goal**: Clicking a Worker's row expands it in place to show its routes, effective Access policy in
plain language, and visual-only (except "View in Cloudflare") contextual action controls.

**Independent Test**: Expand a Worker's row; confirm routes and plain-language policy render inline
without navigation, and that a second Worker's row expands/collapses independently (quickstart.md
Scenario 2).

### Implementation for User Story 2

- [X] T007 [US2] Extract the existing private `RoutePolicy` component and its `VERB_COLOR` map out of
  `app/pages/WorkerDetailPage.tsx` into a new `app/components/RoutePolicy.tsx` (research.md §4) —
  same props and rendering, no behavior change; update `WorkerDetailPage.tsx`'s import to the new
  shared location.
- [X] T008 [US2] In `ExposureMatrixTable.tsx` (or `ExposureInventory.tsx`), implement a lazy fetch of
  `GET /api/workers/:worker_name/detail` the first time a Worker's row is expanded, caching the
  result in component state per Worker so re-expanding the same row doesn't re-fetch (research.md
  §2); show a brief per-row loading state while the first fetch for that Worker is in flight.
- [X] T009 [US2] Render the ROUTES panel in the expanded row detail: each route from T008's fetch
  with its own status indicator and a short note, per the design's per-route layout.
- [X] T010 [P] [US2] Render the EFFECTIVE POLICY panel in the expanded row detail using the extracted
  `RoutePolicy` component (T007) with the expanded Worker's route policy data from T008 — including
  the issue-#416 distinction between "no Access application covers this route" (critical) and
  "policy details unavailable right now" (transient cross-module miss).
- [X] T011 [US2] Implement the derived ACTIONS panel (data-model.md's `RowAction`): visual-only
  controls computed from the row's own entry-point status data (research.md §6 — e.g. a critical
  `workersDev` cell contributes a "Disable workers.dev" control), plus the one real "View in
  Cloudflare" action linking to `cloudflareUrl` from T008's fetch.

### Tests for User Story 2

- [X] T012 [P] [US2] In `tests/e2e/exposure-inventory.spec.ts`, add row-expand scenarios: expand/
  collapse toggles independently per row, routes and effective-policy panels render with real data,
  the no-covering-policy state renders explicitly (not blank), action controls are present and
  correctly labeled per the row's finding, clicking a non-"View in Cloudflare" action performs no
  mutation, and "View in Cloudflare" links to the expected URL (quickstart.md Scenario 2).

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 - Navigate and narrow a large Worker list quickly (Priority: P3)

**Goal**: Severity-count chips jump to the first matching row, a search box narrows the table by
Worker name or hostname, and the existing re-scan control is reachable from the new toolbar.

**Independent Test**: Click a severity count and confirm the view scrolls to that severity's first
row; separately, search and confirm the table narrows; separately, trigger re-scan and confirm it
behaves like every other module (quickstart.md Scenario 3).

### Implementation for User Story 3

- [X] T013 [US3] Add severity-count chips to the matrix toolbar that, on click, scroll the first
  matching-severity row into view and briefly highlight it (FR-007, research.md §8).
- [X] T014 [P] [US3] Add a free-text search box to the toolbar that narrows visible rows to Workers
  whose name or any hostname case-insensitively matches, client-side, with an explicit "no matches"
  state when nothing matches (FR-008, research.md §8).
- [X] T015 [P] [US3] Reposition the existing `useRescan`/`RescanButton` wiring (already present per
  specs/024) into the new toolbar layout alongside the search box and severity chips (FR-009) — same
  hook/component, no behavioral change, just placement.

### Tests for User Story 3

- [X] T016 [US3] In `tests/e2e/exposure-inventory.spec.ts`, add jump-to-row, search (narrow +
  no-matches), and re-scan-in-new-toolbar scenarios (quickstart.md Scenario 3) — the existing
  specs/024 re-scan success/failure scenarios in this file continue to apply and should still pass
  unmodified.

**Checkpoint**: All three user stories work independently and together.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T017 [P] Run `deno fmt` and `deno lint` across all changed/new files.
- [X] T018 Run the full Playwright suite (`deno task test:e2e`) — required before push per this
  project's standing convention, not just `exposure-inventory.spec.ts`. Port 8787 (this suite's
  hardcoded default) was occupied by an unrelated concurrent session's dev server on this shared
  machine, so this run used a scratch-only, uncommitted `playwright.config.local.ts` on an alternate
  port (deleted afterward). 147/148 passed — the one failure
  (`pages-inventory.spec.ts`: "last build recency clamps a future timestamp to '0s ago'") is the
  same pre-existing, unrelated clock-skew flake already noted in specs/024's tasks.md, confirmed
  untouched by this feature's diff.
- [X] T019 Walk through quickstart.md Scenarios 1-3 manually against `deno task dev` to confirm the
  feature works end-to-end. Done via `deno task dev` + Chrome, with `window.fetch` patched in-page to
  stand in for a live Cloudflare account (none available in this environment) — confirmed the matrix
  structure, row-expand (routes/effective policy/actions), and the search box all render and behave
  correctly.
- [X] T020 Confirm `WorkerDetailPage.tsx`'s existing Playwright coverage still passes unmodified after
  T007's `RoutePolicy` extraction — a regression check on a page this feature doesn't otherwise touch.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None — no tasks.
- **Foundational (Phase 2)**: T001 has no dependencies. BLOCKS Phase 3, 4, and 5 (every story's
  rendering consumes `buildMatrixRows`'s output).
- **User Story 1 (Phase 3)**: Depends on Phase 2. T002→T003→T004 are sequential (same file); T005
  depends on T002 (imports `ExposureMatrixTable`); T006 depends on T002-T005 being in place to test
  against.
- **User Story 2 (Phase 4)**: Depends on Phase 2 (needs `WorkerMatrixRow`) and T005 (needs the
  rebuilt page to attach row-expand to). T007 (RoutePolicy extraction) is independent of T008-T011
  and can run in parallel with them. T008→T009→T011 are sequential (same file, same state); T010
  depends on T007 (the component it renders) and T008 (the data it needs) but is otherwise
  independent of T009/T011.
- **User Story 3 (Phase 5)**: Depends on Phase 2 and T005. T013/T014/T015 are independent of each
  other (different toolbar pieces) but all touch the same toolbar region, so sequence edits even
  though they're conceptually parallel.
- **Polish (Phase 6)**: Depends on Phases 3, 4, and 5 all being complete.

### Within Each User Story

- Implementation before its own tests are meaningful, but per this project's Definition of Done,
  tests should be written alongside implementation, not deferred to the end.
- Story complete before moving to the next priority — though US2 and US3 both only depend on
  Foundational + US1's T005, not on each other, so they could be built in either order if desired.

### Parallel Opportunities

- Nothing in Phase 2 (single task).
- T006 (US1 tests) can start once T002-T005 land.
- T007 (RoutePolicy extraction) can run in parallel with T008-T011 (different files: T007 touches
  `WorkerDetailPage.tsx` + a new `RoutePolicy.tsx`; T008-T011 touch `ExposureMatrixTable.tsx`).
- T010 can run in parallel with T009/T011 once its own dependencies (T007, T008) are met.
- T014 and T015 can run in parallel with each other (different toolbar concerns), sequenced after
  T013 touches the same toolbar region.
- T017 (fmt/lint) can run in parallel with nothing else in Phase 6 — it's the fastest task and should
  run first, but has no meaningful parallel partner.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (`buildMatrixRows`).
2. Complete Phase 3: User Story 1 (the matrix structure itself).
3. **STOP and VALIDATE**: Run quickstart.md Scenario 1 manually; run T006's Playwright coverage.
4. This alone closes the structural core of GitHub issue #421.

### Incremental Delivery

1. Foundational → matrix structure (US1, MVP) → validate → deployable alone (a real improvement over
   today's flat list even without row-expand or the new toolbar).
2. Add US2 (row-expand routes/policy/actions) → validate → the page now matches the design's
   drill-in depth.
3. Add US3 (jump-to-row, search, toolbar re-scan) → validate → closes the remaining usability gap.
4. Polish (fmt/lint/full e2e/quickstart walkthrough/WorkerDetailPage regression check) → ready for PR.

---

## Notes

- No contract tests, no new models/entities, no backend tasks — confirmed zero API surface change
  (research.md §1-§2, plan.md Constitution Check Principle III).
- The row-detail ACTIONS panel is visual only in this feature except "View in Cloudflare" — do not
  wire any other control to a real Cloudflare-mutating call as part of any task above (user-confirmed
  scope boundary, spec.md Assumptions).
- `FindingsTable` and `AlertBanner` are intentionally untouched by every task above (research.md §3
  and spec.md's explicit scope boundary) — do not modify either as part of any task here.
- [P] tasks touch different files or independent regions; sequence same-file/same-region task pairs
  as called out above.
- Commit after each task or logical group; stop at either checkpoint to validate independently.
