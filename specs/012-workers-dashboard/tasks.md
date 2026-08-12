---

## description: "Task list for Workers Dashboard implementation"

# Tasks: Workers Dashboard

**Input**: Design documents from `/specs/012-workers-dashboard/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md), [quickstart.md](./quickstart.md)

**Tests**: Included and REQUIRED (constitution Principle VI).

**Organization**: By user story (US1 P1, US2 P1, US3 P2). Foundational phase covers the nav split,
since it's the cross-cutting trigger for this page's existence.

---

## Phase 1: Foundational (Blocking Prerequisites)

- [x] T001 [P] Extend `app/nav-items.ts`: split the existing merged `exposure` entry into two —
      `workers` (icon path from the design's separate "Workers" NAV row) and `exposure` (icon path
      unchanged, now standalone) — updating the file's own top-of-file comment to reflect that the
      merge decision has been reversed per this spec, not left stale.
- [x] T002 [P] Extend `app/components/Sidebar.tsx`'s `SidebarBadge` to carry an optional neutral tone
      (distinct from the hardcoded `var(--status-critical)` red every existing badge uses) — the
      Workers nav item's badge is a deployed-Worker *count*, not a problem count, and MUST NOT render
      in the critical-red color every other module's badge uses for that reason.
- [x] T003 Add a `workers` entry to `app/App.tsx`'s `PAGES` array, routed to a not-yet-built
      `WorkersDashboardPage` (stub component acceptable at this stage; built out in US1).
- [x] T004 Create `worker/modules/workers-dashboard/types.ts`
      (`WorkerDashboardRow`, `AccountSummary`, `RecentChangeEntry` per data-model.md) and mount
      `/api/workers/*` in `worker/index.ts`'s Hono app, gated by the existing `accessAuth`
      middleware. Stub router until US1.

**Checkpoint**: Nav split visible, badge styling supports both tones, routing mount point exists.

---

## Phase 2: User Story 1 - Full Workers inventory with exposure status (Priority: P1) 🎯 MVP

**Goal**: Every deployed Worker listed once, with environment, route count, last-deploy time, and its
existing exposure status rolled up from Module 1.

**Independent Test**: quickstart.md Scenario 1.

### Tests for User Story 1

- [x] T005 [P] [US1] Unit test in `tests/unit/workers-dashboard-classify.test.ts`: environment
      classification (production when any hostname is an enabled custom domain or non-preview
      workers.dev; preview when only Preview URL hostnames are active — research.md §2) and
      exposure-status rollup (worst-of-hostnames: critical > warning > safe/not_evaluated —
      data-model.md).
- [x] T006 [P] [US1] Playwright e2e test in `tests/e2e/workers-dashboard.spec.ts` (mocked
      `GET /api/workers/dashboard`): every Worker appears exactly once with correct environment and
      exposure status; sidebar shows separate "Workers" and "Exposure" items with independent badge
      counts; empty-account state renders explicitly (spec.md Edge Cases).

### Implementation for User Story 1

- [x] T007 [P] [US1] Implement `worker/modules/workers-dashboard/classify.ts`: pure
      `classifyEnvironment()` and `rollUpExposureStatus()` functions per research.md §2 and
      data-model.md. No network or D1 access (constitution Principle III).
- [x] T008 [US1] Implement `GET /api/workers/dashboard` in `worker/modules/workers-dashboard/routes.ts`:
      reuse Module 1's `buildWorkerInventory()` (`worker/modules/workers-access-exposure/inventory.ts`)
      for the Worker/hostname list, read the latest `exposure_findings` run from D1 for the rollup,
      and return `workers[]` with `requests_24h`/`errors_24h`/`cpu_p50_ms` as `null` and `summary`
      with analytics fields as `null` (US2 fills these in) and `recent_changes: []` (US3 fills this
      in). Depends on T004, T007.
- [x] T009 [P] [US1] Build `app/components/MetricCard.tsx` — the shared metric-card component
      (label, value, optional context line, optional "not available" state) per research on the
      design's repeated metric-card row pattern (plan.md's Structure Decision) — reused by specs
      013-018, so keep it presentational/generic, not Workers-specific.
- [x] T010 [US1] Build `app/pages/WorkersDashboardPage.tsx`: fetch `GET /api/workers/dashboard`,
      render the inventory table (Worker, Env, Routes, Last Deploy, Exposure columns — reusing
      `ExposureStatusBadge` unchanged for the Exposure column), the metric-card row (using
      `MetricCard`, showing "not available" wherever a field is `null`), and an explicit empty state.
      Replace the stub from T003.
- [x] T011 [US1] Wire `routes.ts` into the `/api/workers` mount from T004.

**Checkpoint**: User Story 1 fully functional and independently testable — MVP.

---

## Phase 3: User Story 2 - Real operational metrics (Priority: P1)

**Goal**: Per-Worker and account-wide requests/errors/CPU figures, sourced from real Cloudflare data,
degrading to an explicit "not available" state rather than a fabricated value on failure.

**Independent Test**: quickstart.md Scenario 2.

### Tests for User Story 2

- [x] T012 [P] [US2] Unit test in `tests/unit/workers-dashboard-analytics.test.ts` (mocked `fetch`):
      GraphQL Analytics response parsing into per-script requests/errors/CPU-P50 and account-wide
      CPU-P99, day-over-day `requests_24h_change_pct` computation from two windows, and the failure
      path (a rejected/malformed GraphQL response yields `null` fields, never a thrown error that
      blocks other Workers' rows).
- [x] T013 [P] [US2] Playwright e2e test: metric cards render real mocked figures including the
      day-over-day delta; with the analytics source mocked as failed, every Worker's per-row metric
      columns show "not available" while inventory/exposure columns are unaffected, and
      `unavailable` surfaces an `"analytics"` entry.

### Implementation for User Story 2

- [x] T014 [US2] Implement `worker/modules/workers-dashboard/analytics.ts`: GraphQL Analytics API
      client (`POST /client/v4/graphql`, `workersInvocationsAdaptive` dataset) per research.md §1 —
      one query for the trailing-24h window (per-script + account-wide `sum`/`quantiles`), one for
      the prior-24h window (for the day-over-day comparison). Returns `null` per-field on any parse
      or request failure, never throws past its own boundary (US1's T008 must keep working even if
      this fails entirely).
- [x] T015 [US2] Extend `routes.ts` (T008) to call `analytics.ts`, populate every Worker's
      `requests_24h`/`errors_24h`/`cpu_p50_ms` and `summary`'s analytics fields, and add an
      `"analytics"` entry to `unavailable[]` on a whole-source failure. Depends on T008, T014.
- [x] T016 [US2] Extend `WorkersDashboardPage.tsx` (T010): metric-card row shows real summary figures
      (deployed count + per-environment breakdown, requests with delta, error rate, CPU P99); each
      Worker row's Requests/Errors/CPU P50 columns show "not available" per data-model.md's `null`
      convention when the corresponding field is `null`.

**Checkpoint**: User Stories 1 and 2 both work independently — headline value delivered.

---

## Phase 4: User Story 3 - Workers-scoped recent changes (Priority: P2)

**Goal**: A right-side panel showing recent Cloudflare account changes relevant to Workers, sourced
from Cloudflare's real Audit Logs API — not this project's own finding-status digest (research.md §3).

**Independent Test**: quickstart.md Scenario 3.

### Tests for User Story 3

- [x] T017 [P] [US3] Unit test in `tests/unit/workers-dashboard-audit-log.test.ts` (mocked `fetch`):
      Cloudflare Audit Logs response parsing into `RecentChangeEntry[]`, and the
      Workers-relevance filter (script deploys, route/domain bindings, Access-application bindings on
      a Worker's route pass; DNS-only/Pages-only/unrelated entries are excluded).
- [x] T018 [P] [US3] Playwright e2e test: recent-changes panel shows only Workers-relevant mocked
      entries in reverse-chronological order; an explicit empty state when there are none.

### Implementation for User Story 3

- [x] T019 [US3] Implement `worker/modules/workers-dashboard/audit-log.ts`: Cloudflare Audit Logs API
      client (`GET /accounts/{account_id}/audit_logs`) + the Workers-relevance filter, per
      research.md §3. Write this as a standalone, cleanly reusable module — spec 018 (Audit
      dashboard) reuses it as-is rather than re-implementing.
- [x] T020 [US3] Extend `routes.ts` (T008/T015) to call `audit-log.ts` and populate
      `recent_changes[]`, adding an `"audit_log"` entry to `unavailable[]` on failure. Depends on
      T008, T019.
- [x] T021 [US3] Extend `WorkersDashboardPage.tsx` (T010/T016): render the recent-changes panel
      (actor, action, target, result, relative time) with its own empty state, independent of the
      inventory table's and metric row's own loading/empty states.

**Checkpoint**: All 3 user stories independently functional — Module 012 is feature-complete per
spec.md.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [x] T022 [P] Add this module's two new required token scopes (`Account Analytics Read`,
      `Audit Logs Read` — research.md §4) to the README's token-scope table, and a one-line note that
      spec 018 will reuse `audit-log.ts` rather than requesting a duplicate scope entry.
- [ ] T023 [P] Run all 5 quickstart.md scenarios end-to-end against a real scratch Cloudflare test
      account (real-account dependency, same as every prior module's equivalent task).
- [x] T024 [P] `deno fmt` + `deno lint` pass across the new `worker/modules/workers-dashboard/`,
      `WorkersDashboardPage.tsx`, and `MetricCard.tsx` files, plus the touched `nav-items.ts`,
      `Sidebar.tsx`, and `App.tsx`.

---

## Dependencies & Execution Order

Foundational (nav split + routing mount) blocks everything, since the page isn't reachable without
it. US1 creates the shared `routes.ts`/`WorkersDashboardPage.tsx`/`MetricCard.tsx` that US2 and US3
extend in place (not parallel forks of the same files — T008/T010 are each touched again by later
stories, so US2's and US3's implementation tasks are sequenced after US1's, not run concurrently with
them, even though US2 and US3 are independent of *each other* once US1 lands).

### Parallel Opportunities

T001/T002 in parallel (independent files); T005/T006, T012/T013, T017/T018 (`[P]`-marked tests within
each story) in parallel; T009 (MetricCard) parallel with T007/T008 within US1.

---

## Implementation Strategy

### MVP First (User Story 1)

Inventory + exposure rollup + nav split alone is already a real improvement over today's generic
findings table for this module — P1 on its own, independently shippable before either metric source
exists.

### Incremental Delivery

1. Foundational → nav split and routing mount ready.
2. US1 → MVP: full Workers inventory with exposure status, real page reachable via its own nav item.
3. US2 → adds real operational metrics (this spec's headline new value).
4. US3 → adds the Workers-scoped recent-changes panel, sourced from a new Audit Logs integration spec
   018 will reuse.

---

## Notes

- T008/T015/T020 are the one file (`routes.ts`) touched across all three user stories — review each
  extension with that in mind, same caveat as every prior module's equivalent shared-file task.
- T019's `audit-log.ts` is explicitly built for reuse by spec 018 — do not narrow its interface to
  only what this spec's own panel needs if a Workers-only shortcut would make spec 018's reuse harder.
- Run `quickstart.md` in full (T023) before considering Module 012 done — same real-account caveat as
  every prior module.
