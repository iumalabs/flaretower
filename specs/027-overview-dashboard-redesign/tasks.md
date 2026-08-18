---

description: "Task list for Overview Dashboard Redesign"

---

# Tasks: Overview Dashboard Redesign

**Input**: Design documents from `/specs/027-overview-dashboard-redesign/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Playwright e2e coverage is explicitly called for by plan.md (Testing section) and the
project's Definition of Done; the trend chart's day-bucketing arithmetic additionally gets a
dedicated unit test (research.md §6) given its non-trivial correctness surface.

**Organization**: Tasks are grouped by user story. Each story's backend piece is independent of the
other two (different files: `summary.ts` for US1, `inbox.ts` for US2, a new `trend.ts` for US3) —
they only converge in the shared `OverviewPage.tsx` rebuild, one integration task per story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Existing single-Worker + React SPA structure (see plan.md Project Structure) — `worker/modules/
audit/`, `app/lib/`, `app/pages/`, `tests/e2e/`, `tests/unit/` at repository root.

---

## Phase 1: Setup

No project initialization needed — existing Deno/React project, no new dependency or config.
Nothing to do in this phase.

---

## Phase 2: Foundational

No cross-story blocking infrastructure — each story's backend piece touches a different file
(`summary.ts`, `inbox.ts`, a new `trend.ts`) and is independent of the other two. Nothing to do in
this phase; proceed directly to the user stories.

---

## Phase 3: User Story 1 - Know when the account was last checked, and check it again on demand (Priority: P1) 🎯 MVP

**Goal**: The header shows real zone/Worker counts, last-scan time, real cadence, and an
account-wide re-scan control.

**Independent Test**: Open Overview; confirm the header's counts, last-scan time, and cadence are
real; trigger re-scan and confirm every panel refreshes (quickstart.md Scenario 1).

### Implementation for User Story 1

- [X] T001 [P] [US1] In `worker/modules/audit/summary.ts`, add `evaluatedAt: string | null` to
  `PostureSummaryEntry` (select `evaluated_at` in the existing latest-run query, no new query) and
  add `accountScope: { zoneCount, workerCount }` to `PostureSummaryResult` (two targeted
  `COUNT(DISTINCT ...)` queries against `dns_findings`/`exposure_findings`'s latest runs —
  data-model.md). Update `worker/modules/audit/routes.ts`'s `GET /api/audit/summary` JSON
  serialization to include `evaluated_at` per module and `account_scope: { zone_count,
  worker_count }` at the top level.
- [X] T002 [P] [US1] Create `app/lib/use-multi-rescan.ts`: a hook that fires all six
  `POST /<module>/evaluate` endpoints via `Promise.allSettled` (research.md §2), exposing combined
  `pending`/per-module `errors`/`trigger()`, calling the caller's `onSuccess()` once every settled
  call has resolved regardless of individual outcomes (spec.md Edge Cases — one module's failure
  must not hide the other five's success).
- [X] T003 [US1] Rebuild `app/pages/OverviewPage.tsx`'s header: subtitle showing
  `{zoneCount} zones · {workerCount} workers` (from T001), "last scanned {relative time} ago" (max
  `evaluatedAt` across modules with `hasData`, or an explicit "never scanned" state per spec.md Edge
  Cases), a static real-cadence string ("runs hourly," research.md §1), and a RE-SCAN button wired to
  `useMultiRescan` (T002) with combined pending/error display.

### Tests for User Story 1

- [X] T004 [P] [US1] In `tests/e2e/overview.spec.ts`, add scenarios: header shows real zone/Worker
  counts and last-scan time; a never-evaluated account shows the explicit "never scanned" state;
  RE-SCAN shows in-progress state and can't be re-triggered mid-run; after it completes, panel data
  reflects fresh results; one module's evaluate failure doesn't hide the other five's success
  (quickstart.md Scenario 1).

**Checkpoint**: User Story 1 is fully functional and independently testable — the header context row
alone already closes the first of GitHub issue #419's three gaps.

---

## Phase 4: User Story 2 - Understand each finding without leaving the page (Priority: P1)

**Goal**: Each finding row shows its real reason text and a contextual (visual-only) action label,
alongside the unchanged Acknowledge control.

**Independent Test**: Open Overview with open findings across modules; confirm each row's real
reason renders, Acknowledge still works exactly as before (quickstart.md Scenario 2).

### Implementation for User Story 2

- [X] T005 [P] [US2] In `worker/modules/audit/inbox.ts`, add `reason: string` to `UnifiedAlert` via a
  `LEFT JOIN` from each source's alerts table to its findings table on `run_id` +
  `findingIdentityColumns` (research.md §3), falling back to `"reason unavailable"` when the join
  finds no match (source's own `findingsTable` row was superseded/pruned). Update
  `worker/modules/audit/routes.ts`'s `GET /api/audit/alerts` JSON serialization to include `reason`.
- [X] T006 [US2] In `app/pages/OverviewPage.tsx`, implement a small module→label lookup
  (research.md §4) deriving a contextual action label from `alert.module`/`alert.kind`/
  `alert.new_status` (e.g. a specific label for `exposure`, a generic `"Review"` fallback for every
  other module) — visual only, no click handler performing a mutation (spec.md FR-008).
- [X] T007 [US2] Update `FindingRow` in `app/pages/OverviewPage.tsx` to render the finding's real
  `reason` as its explanatory sentence and T006's contextual action label alongside the existing
  Acknowledge button — Acknowledge's own markup/behavior/handler stays byte-for-byte unchanged
  (FR-007).

### Tests for User Story 2

- [X] T008 [P] [US2] In `tests/e2e/overview.spec.ts`, add scenarios: each finding row shows its real
  reason text (not a slug); a contextual action label renders per finding and performs no network
  call when clicked; Acknowledge still removes the row from the list exactly as before; a long
  reason string wraps without breaking the row layout (quickstart.md Scenario 2).

**Checkpoint**: User Stories 1 AND 2 both work independently — together they close two of GitHub
issue #419's three gaps.

---

## Phase 5: User Story 3 - See whether exposure is trending better or worse (Priority: P2)

**Goal**: A 14-day trend chart renders real, bounded-cost historical data above the Scan log panel.

**Independent Test**: Open Overview; confirm the trend chart shows 14 real days, explicit "no data"
for days before the account's history, and the page still loads promptly (quickstart.md Scenario 3).

### Implementation for User Story 3

- [X] T009 [US3] In `worker/modules/audit/changes.ts`, export `buildLatestPerEntityQuery` (currently
  private) for reuse by `trend.ts`'s seed query — no behavior change to `changes.ts` itself.
- [X] T010 [US3] Create `worker/modules/audit/trend.ts`: `computeTrend(db, days = 14)`
  (data-model.md) — per source, in parallel via `Promise.allSettled`: one seed query (T009's
  exported helper, bound to the window start) plus one window query (`evaluated_at >= ?`, ascending);
  replay the window's rows in memory over the seed map, snapshotting a status tally at each of the 14
  UTC-midnight boundaries (research.md §5); merge all seventeen sources' per-day tallies, marking a
  day `hasData: false` only when **every** source has nothing for it (FR-010).
- [X] T011 [US3] Add `GET /api/audit/trend` to `worker/modules/audit/routes.ts` (data-model.md),
  calling `computeTrend` and serializing `{ days: [{ date, has_data, counts }], unavailable_sources
  }`.
- [X] T012 [P] [US3] Create `tests/unit/audit-trend.test.ts`: seed-map initialization, window-row
  replay updating an entity's status correctly, day-boundary snapshot timing (a status change exactly
  at a boundary lands on the correct side), a source with no rows in the window still using its seed
  value, and the merge-across-sources `hasData: false` rule (a day is only "no data" when every
  source lacks it, not just one).
- [X] T013 [US3] Create an `ExposureTrendChart` component (or inline section in
  `app/pages/OverviewPage.tsx`) that fetches `GET /api/audit/trend` and renders the 14-day stacked
  critical/warning/safe bars, with an explicit "no data" treatment for days marked as such.

### Tests for User Story 3

- [X] T014 [P] [US3] In `tests/e2e/overview.spec.ts`, add scenarios: the trend chart renders 14 days
  of real data; a mocked account younger than 14 days shows explicit "no data" for the earlier days;
  a trend-fetch failure degrades gracefully (doesn't block the rest of the page from rendering)
  (quickstart.md Scenario 3).

**Checkpoint**: All three user stories work independently and together — GitHub issue #419 is fully
closed.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T015 [P] Run `deno fmt` and `deno lint` across all changed/new files.
- [X] T016 Run the full Playwright suite (`deno task test:e2e`) and the full unit suite
  (`deno task test`) — required before push per this project's standing convention.
- [X] T017 Walk through quickstart.md Scenarios 1-3 manually against `deno task dev` to confirm the
  feature works end-to-end, including timing the page load per SC-005.
- [X] T018 Confirm `unavailable_sources` reporting stays consistent across all three endpoints
  (`summary`, `alerts`, `trend`) — a source failure in the new trend query must be reported the same
  shape as the existing two endpoints already use, per this module's established convention
  (FR-010/spec.md Edge Cases — a never-evaluated module is excluded from calculations, not folded in
  as zero).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None — no tasks.
- **Foundational (Phase 2)**: None — no tasks; proceed directly to user stories.
- **User Story 1 (Phase 3)**: T001 and T002 are independent (`[P]`, different files). T003 depends on
  both. T004 depends on T003.
- **User Story 2 (Phase 4)**: T005 has no dependency on Phase 3. T006 is independent of T005
  (different concern, same file it'll later combine with). T007 depends on T005 and T006, and
  touches the same `OverviewPage.tsx` region T003 touches — sequence after T003 to avoid same-file
  churn, though it has no functional dependency on it. T008 depends on T007.
- **User Story 3 (Phase 5)**: T009 has no dependency on Phase 3/4. T010 depends on T009. T011 depends
  on T010. T012 depends on T010 (tests the same logic, can be written in parallel with T011 once
  T010 lands). T013 depends on T011, and touches `OverviewPage.tsx` — sequence after T007. T014
  depends on T013.
- **Polish (Phase 6)**: Depends on Phases 3, 4, and 5 all being complete.

### Parallel Opportunities

- T001 and T002 (Phase 3) run in parallel — different files.
- T005 can run in parallel with all of Phase 3 — different file (`inbox.ts` vs. `summary.ts`/
  `use-multi-rescan.ts`).
- T009 can run in parallel with all of Phase 3 and Phase 4 — different file (`changes.ts`).
- T012 (unit tests) can run in parallel with T011 once T010 is done — independent verification of
  the same logic, not the route wiring.
- The three stories' *backend* tasks (T001/T002, T005, T009/T010/T011/T012) are almost entirely
  parallelizable across each other; only the three stories' `OverviewPage.tsx` integration tasks
  (T003, T007, T013) must be sequenced against each other since they share one file.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 3: User Story 1 (header context row + account-wide re-scan).
2. **STOP and VALIDATE**: Run quickstart.md Scenario 1 manually; run T004's Playwright coverage.
3. This alone closes the first of GitHub issue #419's three gaps and gives operators the account-wide
   re-scan convenience.

### Incremental Delivery

1. Header context row (US1, MVP) → validate → deployable alone.
2. Add US2 (findings-row reason + contextual action) → validate → closes the inbox's core content
   gap.
3. Add US3 (trend chart) → validate → closes the remaining, lowest-priority gap.
4. Polish (fmt/lint/full test suites/quickstart walkthrough/cross-endpoint consistency check) →
   ready for PR.

---

## Notes

- No fabricated data anywhere — every task above sources its output from real, already-persisted or
  already-computed data, or an explicit absence state (FR-003/FR-005/FR-009/FR-010). Do not
  hardcode example figures (a fictional account name, an invented cadence, fake trend numbers) as
  part of any task here.
- The findings-row contextual action labels (T006) are visual only — do not wire any of them to a
  real mutation beyond the existing, unchanged Acknowledge action (FR-008).
- The account-wide re-scan (T002) introduces no new mutation capability — it only fires the six
  already-existing evaluate endpoints (FR-012).
- [P] tasks touch different files; sequence same-file task pairs (the three `OverviewPage.tsx`
  integration tasks) as called out above.
- Commit after each task or logical group; stop at any checkpoint to validate independently.
