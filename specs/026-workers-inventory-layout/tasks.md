---

description: "Task list for Workers Inventory Layout"

---

# Tasks: Workers Inventory Layout

**Input**: Design documents from `/specs/026-workers-inventory-layout/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Playwright e2e coverage is explicitly called for by plan.md (Testing section) and the
project's Definition of Done — included below, extending the existing
`tests/e2e/workers-dashboard.spec.ts`.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Existing single-Worker + React SPA structure (see plan.md Project Structure) —
`worker/modules/workers-dashboard/`, `app/components/`, `app/pages/`, `tests/e2e/` at repository
root.

---

## Phase 1: Setup

No project initialization needed — existing Deno/React project, no new dependency or config.
Nothing to do in this phase.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared-component and backend pieces the user stories build on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T001 [P] Add an optional `statusPosition?: "left" | "right"` prop to `FindingsTableProps` in
  `app/components/FindingsTable.tsx` (data-model.md), default `"left"`. When `"right"`, render the
  status-pill column block (currently always emitted before `columns.map(...)` in both the header
  row and each data row) after the caller's columns instead of before — no other logic changes.
  Confirm every existing caller (which omits the prop) renders byte-for-byte identically to before
  (research.md §1).
- [X] T002 [P] Add `totalRouteCount: number` to `AccountSummary` in
  `worker/modules/workers-dashboard/types.ts`; compute it in `buildAccountSummary()`
  (`worker/modules/workers-dashboard/routes.ts`) as `workers.reduce((sum, w) => sum + w.routeCount,
  0)` (research.md §2 — `workers` there is already the complete, unpaginated array); serialize it as
  `total_route_count` in the `GET /api/workers/dashboard` JSON response alongside the existing
  summary fields.

**Checkpoint**: `FindingsTable`'s new capability and the backend's new field are both ready — user
story implementation (Phase 3+) can now proceed.

---

## Phase 3: User Story 1 - Scan status at a glance, consistent with every other module (Priority: P1) 🎯 MVP

**Goal**: The Workers inventory table's exposure/status column is last (rightmost), matching the
design's stated anchor rule, with zero effect on any other page.

**Independent Test**: Open Workers and confirm status is the last column; open another
`FindingsTable`-using page and confirm its status column is unchanged (quickstart.md Scenario 1).

### Implementation for User Story 1

- [X] T003 [US1] In `app/pages/WorkersDashboardPage.tsx`, pass `statusPosition="right"` to the
  `<FindingsTable>` call (T001) — no other change to `COLUMNS` or row data needed, since the column
  set already matches the design (research.md §1).

### Tests for User Story 1

- [X] T004 [P] [US1] In `tests/e2e/workers-dashboard.spec.ts`, add a column-order scenario asserting
  the exposure/status pill renders after every operational column (Worker/Env/Routes/Requests
  24h/Errors/CPU/Last deploy) in a row. In `tests/e2e/dns-inventory.spec.ts` (or another
  `FindingsTable`-using spec), add a regression scenario confirming its status column still renders
  first, unaffected by `statusPosition`'s default (FR-002/SC-002, quickstart.md Scenario 1).

**Checkpoint**: User Story 1 is fully functional and independently testable — the column reorder
alone already closes the headline finding of GitHub issue #420.

---

## Phase 4: User Story 2 - Orient on and narrow the Workers list from the header (Priority: P2)

**Goal**: The page header shows a subtitle, description, Worker-name search, environment filter, and
a control that surfaces the existing Recent changes panel.

**Independent Test**: Confirm subtitle/description render; search narrows the table; the environment
filter narrows the table; both combine; the activity control scrolls to Recent changes
(quickstart.md Scenario 2).

### Implementation for User Story 2

- [X] T005 [US2] In `app/pages/WorkersDashboardPage.tsx`, replace the current
  `"{count} deployed · generated {ISO timestamp}"` line with a subtitle in the design's format
  (`"{deployed} deployed · {routes} routes · {environments} environments"`, using T002's
  `total_route_count` and `Object.values(deployed_by_environment).filter(n => n > 0).length` —
  research.md §2) and add a one-line page description beneath it (FR-003/FR-004).
- [X] T006 [P] [US2] Add a free-text search input to the header toolbar that narrows
  `data.workers` to name matches, client-side, on the currently-loaded page (FR-005, research.md
  §3) — same pattern as specs/025's Exposure matrix search.
- [X] T007 [P] [US2] Add an environment filter (`All` / `Production` / `Preview`) to the header
  toolbar that narrows `data.workers` by `environment`, client-side, combined with T006's search
  filter (FR-006, spec.md Edge Cases — both apply together).
- [X] T008 [US2] Add a "Recent activity" control to the header toolbar that scrolls the existing
  `RecentChangesPanel` into view (add a stable `id` to that panel as the scroll target) — reuses
  already-rendered data, no new fetch (FR-007, research.md §4).

### Tests for User Story 2

- [X] T009 [US2] In `tests/e2e/workers-dashboard.spec.ts`, add scenarios: subtitle and description
  render with correct counts; search narrows the table and an empty search returns the full list;
  the environment filter narrows the table; search + environment filter combine correctly; a
  no-match search shows an explicit no-matches state; the recent-activity control brings the Recent
  changes panel into view (quickstart.md Scenario 2).

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 - A complete metric-tile row, not three-out-of-four (Priority: P3)

**Goal**: The CPU P99 metric tile shows a context line, matching the other three tiles.

**Independent Test**: Confirm all four tiles show a value and a context line (quickstart.md
Scenario 3).

### Implementation for User Story 3

- [X] T010 [US3] In `app/pages/WorkersDashboardPage.tsx`, add `context="slowest 1% of requests"` to
  the CPU P99 `<MetricCard>` call (FR-008, research.md §5) — no `MetricCard` component change needed,
  it already supports `context`.

### Tests for User Story 3

- [X] T011 [P] [US3] In `tests/e2e/workers-dashboard.spec.ts`, add a scenario asserting all four
  metric tiles show both a value and a context line, including CPU P99 (quickstart.md Scenario 3).

**Checkpoint**: All three user stories work independently and together.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T012 [P] Run `deno fmt` and `deno lint` across all changed files.
- [X] T013 Run the full Playwright suite (`deno task test:e2e`) — required before push per this
  project's standing convention, not just `workers-dashboard.spec.ts`. Port 8787 was occupied by an
  unrelated concurrent session's dev server on this shared machine, so this run used a scratch-only,
  uncommitted `playwright.config.local.ts` on an alternate port (deleted afterward). 150/151 passed —
  the one failure is the same pre-existing, unrelated clock-skew flake already noted in specs/024's
  and specs/025's tasks.md, confirmed untouched by this feature's diff.
- [X] T014 Walk through quickstart.md Scenarios 1-3 manually against `deno task dev` to confirm the
  feature works end-to-end. Done via `deno task dev` + Chrome, with `window.fetch` patched in-page
  (no live Cloudflare account in this environment) — confirmed the status column renders rightmost,
  the header toolbar (subtitle/description/search/env filter/recent-activity) works, and all four
  metric tiles show a context line.
- [X] T015 Confirm no other consumer of `AccountSummary`/the `GET /api/workers/dashboard` response
  shape (e.g. `WorkerDetailPage.tsx`, if it reads dashboard-level summary data) is broken by the
  additive `total_route_count` field — additive JSON fields are non-breaking, but verify directly.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None — no tasks.
- **Foundational (Phase 2)**: T001 and T002 are independent (different files: `FindingsTable.tsx`
  vs. `worker/modules/workers-dashboard/`) — both `[P]`. BLOCKS Phase 3 and Phase 4 (T003 needs T001;
  T005 needs T002).
- **User Story 1 (Phase 3)**: Depends on T001. T003 is a one-line change; T004 depends on T003.
- **User Story 2 (Phase 4)**: Depends on T002 (for T005) and, for layout purposes, benefits from
  T003 already having landed (same file, header region) — sequence T005-T008 after T003 to avoid
  same-file churn, even though they don't functionally depend on it. T006 and T007 are independent
  of each other (different toolbar controls) but both touch the same toolbar region — sequence their
  edits. T008 is independent of T006/T007.
- **User Story 3 (Phase 5)**: Depends on Phase 2 only (no dependency on US1/US2) — could be built in
  any order relative to them, sequenced last here only because it's lowest priority.
- **Polish (Phase 6)**: Depends on Phases 3, 4, and 5 all being complete.

### Parallel Opportunities

- T001 and T002 run in parallel (Phase 2, different files/layers).
- T004's two scenarios (Workers column order + another page's regression check) touch different
  spec files and can be written in parallel.
- T006 and T007 are conceptually independent but touch the same toolbar region in the same file —
  sequence rather than truly parallelize.
- T010 and T011 (US3) have no dependency on US1/US2 implementation tasks and can proceed in parallel
  with Phase 3/4 work once Phase 2 is done.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (`FindingsTable` prop + backend field).
2. Complete Phase 3: User Story 1 (column reorder).
3. **STOP and VALIDATE**: Run quickstart.md Scenario 1 manually; run T004's Playwright coverage,
   including the other-page regression check.
4. This alone closes GitHub issue #420's headline, highest-visibility finding.

### Incremental Delivery

1. Foundational → column reorder (US1, MVP) → validate → deployable alone.
2. Add US2 (header toolbar) → validate → closes the remaining orientation/navigation gap.
3. Add US3 (CPU P99 context) → validate → closes the last visual-consistency item.
4. Polish (fmt/lint/full e2e/quickstart walkthrough/additive-field regression check) → ready for PR.

---

## Notes

- No contract tests, no new endpoints — the one backend change is an additive field on an existing
  response shape (research.md §2).
- The Recent changes panel's presence/content/casing is explicitly out of scope — do not modify
  `RecentChangesPanel`'s content or styling as part of any task above beyond adding the scroll-target
  `id` in T008 (research.md §6).
- Every new control added by this feature (search, environment filter, recent-activity scroll) is
  read-only/navigational — do not wire any of them to a Cloudflare-mutating call (FR-011).
- [P] tasks touch different files or independent regions; sequence same-file/same-region task pairs
  as called out above.
- Commit after each task or logical group; stop at either checkpoint to validate independently.
