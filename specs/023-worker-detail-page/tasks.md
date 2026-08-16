# Tasks: Worker Detail Page

**Input**: Design documents from `/specs/023-worker-detail-page/` **Prerequisites**: plan.md,
spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

Tests are included per constitution Principle VI (test-first, Playwright for user-facing flows).

## Phase 1: Setup

Not applicable — extends existing modules/pages within the existing structure. Nothing to
scaffold.

## Phase 2: Foundational

Not applicable — User Story 1 below is itself the foundation (the endpoint, the page, and
navigation all have to exist for *any* story's acceptance scenarios to be reachable); User Stories
2 and 3 are additive fields on that same endpoint/page, not a separate prerequisite layer.

---

## Phase 3: User Story 1 - Investigate a flagged Worker from its exposure status (P1) 🎯 MVP

**Goal**: Clicking a Worker row on the Workers dashboard opens a detail page listing every one of
that Worker's routes with its own exposure status; returning preserves the dashboard's prior
page/sort/filter state.

**Independent Test**: From the Workers dashboard, click any Worker row. Land on a detail page
showing that Worker's routes/hostnames with their individual exposure status, matching what
Exposure inventory shows for the same Worker today (spec.md's own Independent Test).

- [x] T001 [US1] Add `getWorkerHostnames(db, workerName)` to
      `worker/modules/workers-access-exposure/routes.ts` (not `inventory.ts` as originally
      planned — that file is pure Cloudflare-API-client code with no D1 access; the D1 read
      belongs beside `exposureRoutes.get("/inventory")`, which already does the identical query)
      — same query, narrowed `WHERE run_id = ? AND worker_name = ?`, same
      `NO_HOSTNAMES_MARKER_HOSTNAME` filtering (research.md §1)
- [x] T002 [US1] Create `worker/modules/workers-dashboard/detail.ts`: `buildWorkerDetail(env,
      workerName)` — calls T001, maps to `routes[]` (contracts/api.md shape, `policy: null` for
      every route at this point — Phase 4 fills it in), `recent_changes: []` (Phase 5 fills it
      in), `environment` via `classify.ts`'s `classifyEnvironment()`, `cloudflare_url` assembly
      (research.md §4); returns a not-found sentinel when the Worker has zero rows (marker or
      real) in the latest run
- [x] T003 [US1] Add `GET /:worker_name/detail` to `worker/modules/workers-dashboard/routes.ts`:
      calls T002, `404 { "error": "worker not found in latest evaluation run" }` on the not-found
      sentinel (contracts/api.md)
- [x] T004 [P] [US1] Unit tests in new `tests/unit/workers-dashboard-detail.test.ts`: routes with
      correct per-hostname status, the zero-routes case (`routes: []`, marker filtered), the
      not-found case (depends on T001-T003)
- [x] T005 [US1] Create `app/pages/WorkerDetailPage.tsx`: renders `worker_name`, `environment`,
      the routes list (status badge + hostname + reason per route, reusing `ExposureStatusBadge`),
      not-found and zero-routes empty states, "Open in Cloudflare" outbound link, a "back to
      Workers" affordance
- [x] T006 [US1] Extend `app/App.tsx`: lift `WorkersDashboardPage`'s `page`/`sortKey`/`sortDir`
      state up as props (data-model.md's Frontend navigation state section); add
      `selectedWorker: string | null` state and a `"worker-detail"` `PAGES` entry rendering
      `WorkerDetailPage`; a callback clears `selectedWorker` and restores `page` to `"workers"`
- [x] T007 [US1] Extend `app/pages/WorkersDashboardPage.tsx`: accept lifted
      page/sortKey/sortDir + `onSelectWorker` as props instead of local `useState`; each row
      becomes clickable, calling `onSelectWorker(worker_name)` (depends on T006)
- [x] T008 [P] [US1] New `tests/e2e/worker-detail.spec.ts`: click-through from Workers dashboard,
      routes/status rendering matching Exposure inventory, not-found state (mocked 404), zero-
      routes state — quickstart.md Scenarios 1 and 4.1-4.2 (depends on T005-T007)
- [x] T009 [US1] Extend `tests/e2e/workers-dashboard.spec.ts`: row click navigates to the detail
      page; navigating back preserves the dashboard's page/sort/filter state (FR-011) — quickstart.md
      Scenario 1 step 3 (depends on T006, T007)

**Checkpoint**: User Story 1 fully functional and independently shippable — a Worker's routes and
their status are visible from one click, with no policy or recent-changes detail yet.

---

## Phase 4: User Story 2 - See what's actually protecting each route (P2)

**Goal**: Each route covered by an Access application shows that application's policy in plain
language (ALLOW/REQUIRE/DENY lines); a route with no covering application, or a permissive one,
says so explicitly.

**Independent Test**: Open the detail page for a Worker with at least one route covered by an
Access application. Confirm the policy's rules render in the same plain-language format as Zero
Trust's own policy detail panel (spec.md's own Independent Test).

**Depends on**: Phase 3 (T002's `buildWorkerDetail`, T005's page).

- [x] T010 [US2] `worker/db/migrations/0014_exposure_findings_add_covering_app_ids.sql`:
      `ALTER TABLE exposure_findings ADD COLUMN covering_app_ids TEXT` (data-model.md)
- [x] T011 [US2] Extend `HostnameEvaluation` in
      `worker/modules/workers-access-exposure/types.ts`: add `coveringAppIds: string[]`
- [x] T012 [US2] Extend `evaluateHostname()` in
      `worker/modules/workers-access-exposure/evaluate.ts`: populate `coveringAppIds` from the
      `covering` array already computed in every branch (`[]` for the not-evaluated/no-coverage
      cases, `covering.map(a => a.id)` for warning/safe) (depends on T011)
- [x] T013 [P] [US2] Unit tests in `tests/unit/evaluate.test.ts`: `coveringAppIds` populated
      correctly in every `evaluateHostname()` branch (depends on T012)
- [x] T014 [US2] Extend `runEvaluation()`'s `INSERT INTO exposure_findings` statements in
      `worker/modules/workers-access-exposure/routes.ts`: bind
      `JSON.stringify(h.coveringAppIds)` for the new column (depends on T010-T012)
- [x] T015 [US2] Extend `buildWorkerDetail()` (`worker/modules/workers-dashboard/detail.ts`):
      collect+dedupe `covering_app_ids` across this Worker's routes, one
      `WHERE app_id IN (...)` query against the latest `zt_app_findings` run, populate each
      route's `policy` field (`app_id`/`app_name`/`app_domain`/`policy_rules`), fall back to
      `policy: null` when an id isn't found in the latest ZT run, add an `unavailable` entry with
      `source: "policy"` on query failure (data-model.md) (depends on T002, T010)
- [x] T016 [P] [US2] Unit tests in `tests/unit/workers-dashboard-detail.test.ts`: policy populated
      for covered routes, `null` for uncovered/critical routes, graceful fallback when an app_id
      is absent from the latest ZT run, `unavailable` on join failure (depends on T015)
- [x] T017 [US2] Extend `app/pages/WorkerDetailPage.tsx`: render `policy_rules` as ALLOW/REQUIRE/
      DENY lines per route (reusing the same rendering approach as
      `app/pages/ZeroTrustInventory.tsx`'s policy-detail panel), an explicit "no policy covers
      this route" state when `policy` is `null` (depends on T005, T015)
- [x] T018 [US2] Extend `tests/e2e/worker-detail.spec.ts`: policy-rendering scenario (covered
      route shows rules, uncovered route shows explicit no-coverage state) — quickstart.md
      Scenario 2 (depends on T017)

**Checkpoint**: User Stories 1 and 2 both independently verified — routes, status, and effective
policy are all visible; recent changes still pending.

---

## Phase 5: User Story 3 - See recent changes scoped to this one Worker (P3)

**Goal**: A "recent changes" list on the detail page shows entries scoped to this Worker only,
with explicit empty and unavailable states.

**Independent Test**: Open the detail page for a Worker with at least one recent change recorded.
Confirm the change appears in a list scoped to that Worker, and that a Worker with no recent
changes shows an explicit empty state (spec.md's own Independent Test).

**Depends on**: Phase 3 (T002's `buildWorkerDetail`, T005's page).

- [x] T019 [US3] Extend `buildWorkerDetail()` (`worker/modules/workers-dashboard/detail.ts`):
      call `fetchAccountAuditLog()` (research.md §3, same 7-day window as
      `buildWorkersDashboard()`), filter with `filterWorkersRelevant()` narrowed to this Worker's
      own hostname set (from T001's result — `filterWorkersRelevant`'s existing `Set<string>`
      parameter needs no signature change, just this new call site), add an `unavailable` entry
      with `source: "recent_changes"` on fetch failure (depends on T002)
- [x] T020 [P] [US3] Unit tests in `tests/unit/workers-dashboard-detail.test.ts`: changes filtered
      to the requested Worker's hostnames only, empty-vs-unavailable distinction (depends on T019)
- [x] T021 [US3] Extend `app/pages/WorkerDetailPage.tsx`: render the recent-changes list (reusing
      `WorkersDashboardPage.tsx`'s existing `RecentChangesPanel` rendering approach/empty/
      unavailable states, including the `recent-changes-unavailable` `data-testid` convention)
      (depends on T005, T019)
- [x] T022 [US3] Extend `tests/e2e/worker-detail.spec.ts`: recent-changes scenario (scoped list,
      explicit empty state, explicit unavailable state) — quickstart.md Scenario 3 and 4.3
      (depends on T021)

**Checkpoint**: All three user stories independently functional — the full spec.md feature set is
complete.

---

## Phase 6: Polish & Cross-Cutting

- [x] T023 Run `deno fmt --check`, `deno lint`, full-tree `deno check`, `deno task test` — zero
      regressions across the whole suite, not just this feature's new tests
- [x] T024 Run the full Playwright suite (`deno run -A npm:playwright test`) — zero regressions
- [ ] T025 Run `quickstart.md`'s manual scenarios against a real Cloudflare account (real-account
      dependency — leave unchecked here until actually run, per this project's established
      convention for every prior feature)

## Dependencies & Execution Order

- **Phase 3 (US1)**: T001 → T002 → T003 → T004. T005 independent of T001-T004 (can start once the
  contract shape is settled). T006 → T007. T008 depends on T005-T007. T009 depends on T006, T007.
- **Phase 4 (US2)**: T010, T011 parallelizable; T012 depends on T011; T013 depends on T012; T014
  depends on T010-T012; T015 depends on T002 (Phase 3) and T010; T016 depends on T015; T017
  depends on T005 (Phase 3) and T015; T018 depends on T017.
- **Phase 5 (US3)**: T019 depends on T002 (Phase 3); T020 depends on T019; T021 depends on T005
  (Phase 3) and T019; T022 depends on T021.
- **Phase 6 (Polish)**: depends on every prior phase.

Phases 4 and 5 do not depend on each other — either can be built first, or in parallel by two
developers, once Phase 3 lands.

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001-T009 (routes/status visible via click-through, state preserved on return)
2. **STOP and VALIDATE**: quickstart.md Scenario 1
3. Deploy/demo if ready — a Worker's routes and status are already more than today's flat table
   offers, an independent improvement even before policy/recent-changes land.

### Incremental Delivery

1. Phase 3 (US1) → verify → Phase 4 (US2) and/or Phase 5 (US3) → verify → Phase 6 (Polish)
