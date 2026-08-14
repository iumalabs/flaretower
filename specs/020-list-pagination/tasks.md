# Tasks: List Pagination

**Input**: Design documents from `/specs/020-list-pagination/` **Prerequisites**: plan.md, spec.md,
research.md, data-model.md, contracts/api.md, quickstart.md

Tests are included per constitution Principle VI ("every feature MUST ship with tests before it is
considered done"). Task IDs are sequential; `[P]` marks tasks safe to run in parallel (different
files, no dependency on an incomplete task in the same phase); `[US1]`/`[US2]`/`[US3]` map to
spec.md's user stories.

## Phase 1: Setup

No new tooling/config/dependencies — this feature extends existing routes, an existing shared
component, and an existing fetch helper. Nothing to scaffold.

## Phase 2: Foundational (blocks US2 and US3 — NOT US1, which is fully independent)

- [x] T001 [P] Create `worker/pagination.ts`: LIMIT/OFFSET math from `page`/`page_size`, a
      `PaginationEnvelope` builder (`page`, `page_size`, `total`, `total_pages`), and a
      whitelisted-column sort-key validator (data-model.md, research.md §3)
- [x] T002 [P] Unit tests for `worker/pagination.ts` in `tests/unit/pagination.test.ts`:
      LIMIT/OFFSET math, envelope `total_pages` rounding, valid/invalid `page`/`page_size`
      rejection, sort-key whitelist accept/reject
- [x] T003 [P] Extend `app/components/FindingsTable.tsx`: add optional `pagination` prop
      (data-model.md's `FindingsTablePagination`) — page footer (current page, total pages, total
      count, prev/next with correct disabled state), sort delegates to `onSortChange` instead of
      local `toggleSort` when present, status-filter chips hidden when present (research.md §5);
      omitting the prop must leave all existing behavior unchanged

**Checkpoint**: shared pagination math + shared table UI exist and are unit-tested; ready for both
US2 (module dashboards) and US3 (position/total visibility, which reuses this same footer).

---

## Phase 3: User Story 1 - Audit log shows every event, never a silent subset (P1) 🎯 MVP

**Goal**: `GET /api/audit/log` returns every event in the 7-day window up to a defined safe cap,
with the true total and a capped indicator — no silent 100-event ceiling.

**Independent Test**: point the Audit log at an account/window with >100 events; confirm every event
is reachable and the total count is accurate (spec.md's own Independent Test for this story).

- [x] T004 [US1] Extend `fetchAccountAuditLog()` in `worker/modules/workers-dashboard/audit-log.ts`:
      follow Cloudflare's `page`/`per_page` pagination itself (research.md §1) up to
      `AUDIT_LOG_FETCH_CAP = 1000`; return `{ entries, truncated }` instead of a bare array
- [x] T005 [US1] Unit tests in `tests/unit/workers-dashboard-audit-log.test.ts`: multi-page
      follow-through, stop-on-short-page (end of data), stop-at-cap with `truncated: true`,
      stop-before-cap with `truncated: false`
- [x] T006 [US1] Update `fetchAccountAuditLog()`'s only other caller (Workers dashboard's Recent
      Changes panel, `worker/modules/workers-dashboard/routes.ts`) for the new
      `{ entries,
      truncated }` return shape — that panel only ever needs `entries`, so this is
      a destructure change, not a new capability there
- [x] T007 [US1] Extend `GET /log` in `worker/modules/audit/routes.ts`: forward
      `total:
      entries.length` and `truncated` (contracts/api.md)
- [x] T008 [US1] Unit tests in `tests/unit/audit-routes.test.ts`: `total`/`truncated` forwarded
      correctly, including the `unavailable: true` path (unaffected by this change)
- [x] T009 [US1] Extend `app/pages/AuditInventory.tsx`: show the true total event count; render a
      clearly-visible "capped" indicator when `truncated` is true (FR-012)
- [x] T010 [US1] Extend `tests/e2e/audit-inventory.spec.ts`: total-count assertion; capped-indicator
      scenario (mock >cap events) per quickstart.md Scenario 1/1c

**Checkpoint**: User Story 1 fully functional and independently shippable — no dependency on Phase 2
or any other story.

---

## Phase 4: User Story 2 - Long module dashboard tables stay usable at any account size (P2)

**Goal**: each of the six module dashboard tables paginates server-side once its result set exceeds
one page.

**Independent Test**: load each of the six dashboards with a result set exceeding one page (or force
it via a small `page_size`); confirm the table paginates instead of rendering every row.

**Depends on**: Phase 2 (T001–T003).

### Workers (flat, account-wide — simplest case; build first, use as the reference pattern)

- [x] T011 [P] [US2] Extend `GET /dashboard` in `worker/modules/workers-dashboard/routes.ts`
      (corrected from "GET /inventory" — that's this module's actual route name):
      `page`/`page_size`/`sort_key`/`sort_dir` via T001's helper; response gains `pagination`
      envelope
- [x] T012 [P] [US2] Unit tests for the paginated/sorted query in
      `tests/unit/workers-dashboard-inventory.test.ts`
- [x] T013 [US2] Extend `app/pages/WorkersDashboardPage.tsx`: page/sort state, pass to the fetch
      call and to `FindingsTable`'s `pagination` prop (depends on T011 for the API shape)
- [x] T014 [US2] Extend `tests/e2e/workers-dashboard.spec.ts`: pagination scenario per quickstart.md
      Scenario 2 (depends on T013)

### DNS (per-selected-zone scope — research.md §2)

- [x] T015 [P] [US2] Extend `GET /inventory` in `worker/modules/dns/routes.ts`:
      `page`/`page_size`/`sort_key`/`sort_dir` scoped to the existing `zone` param
- [x] T016 [P] [US2] Unit tests in `tests/unit/dns-routes.test.ts` (or `dns-inventory.test.ts` —
      match whichever already covers `GET /inventory`)
- [x] T017 [US2] Extend `app/pages/DnsInventory.tsx`: page/sort state per selected zone (reset on
      zone switch, matching the component's existing remount-on-zone-switch behavior), wire to
      `FindingsTable`'s `pagination` prop (depends on T015)
- [x] T018 [US2] Extend `tests/e2e/dns-inventory.spec.ts`: pagination scenario, including
      zone-switch resets to page 1 (depends on T017)

### Storage (three independent envelopes — research.md §2, data-model.md)

- [x] T019 [P] [US2] Extend `GET /inventory` in `worker/modules/storage/routes.ts`: three
      independent `bucket_*`/`kv_*`/`d1_*` param triplets and three `PaginationEnvelope`s
      (contracts/api.md)
- [x] T020 [P] [US2] Unit tests in `tests/unit/storage-routes.test.ts`: each of the three
      collections paginates/sorts independently of the other two
- [x] T021 [US2] Extend `app/pages/StorageInventory.tsx`: three independent page/sort states (one
      per `FindingsTable` instance), wire each to its own envelope (depends on T019)
- [x] T022 [US2] Extend `tests/e2e/storage-inventory.spec.ts`: pagination scenario per table
      (depends on T021)

### Security (verify row-unit, then apply the pattern — research.md §2 flagged this unconfirmed)

- [x] T023 [P] [US2] Confirm `app/pages/SecurityPostureInventory.tsx`'s current table shape is flat
      one-row-per-zone (per specs/017) with no additional grouping the DNS/Storage checks didn't
      already anticipate; note any deviation before continuing
- [x] T024 [P] [US2] Extend `GET /inventory` in `worker/modules/security/routes.ts` per T023's
      confirmed shape
- [x] T025 [P] [US2] Unit tests in `tests/unit/security-routes.test.ts`
- [x] T026 [US2] Extend `app/pages/SecurityPostureInventory.tsx` (depends on T024)
- [x] T027 [US2] Extend `tests/e2e/security-inventory.spec.ts` (depends on T026)

### Zero Trust (verify row-unit first — research.md §2 flagged this unconfirmed)

- [x] T028 [P] [US2] Confirm `app/pages/ZeroTrustInventory.tsx`'s current table shape (flat
      one-row-per-Access-application, or grouped/multi-table like Storage) before assuming a shape
- [x] T029 [P] [US2] Extend `GET /inventory` in `worker/modules/zero-trust/routes.ts` per T028's
      confirmed shape
- [x] T030 [P] [US2] Unit tests in `tests/unit/zero-trust-routes.test.ts`
- [x] T031 [US2] Extend `app/pages/ZeroTrustInventory.tsx` (depends on T029)
- [x] T032 [US2] Extend `tests/e2e/zero-trust-inventory.spec.ts` (depends on T031)

### Pages (verify row-unit first — research.md §2 flagged this unconfirmed)

- [x] T033 [P] [US2] Confirm `app/pages/PagesInventory.tsx`'s current table shape (flat
      one-row-per-Pages-project, per specs/015) before assuming a shape
- [x] T034 [P] [US2] Extend `GET /inventory` in `worker/modules/pages/routes.ts` per T033's
      confirmed shape
- [x] T035 [P] [US2] Unit tests in `tests/unit/pages-routes.test.ts`
- [x] T036 [US2] Extend `app/pages/PagesInventory.tsx` (depends on T034)
- [x] T037 [US2] Extend `tests/e2e/pages-inventory.spec.ts` (depends on T036)

**Checkpoint**: all six module dashboards paginate server-side; Workers (T011–T014) is the reference
implementation the other five modules' backend tasks mirror.

---

## Phase 5: User Story 3 - Operators always know where they are (P3)

**Goal**: confirm the shared pager footer (built in T003) correctly shows total/position and
disables prev/next at the boundaries, once real data flows through it via US2.

**Independent Test**: load any one paginated table (Workers, from US2, is sufficient) and confirm
current page, total pages/results, and prev/next are visible and correctly enabled/disabled without
consulting any other source (spec.md's own Independent Test).

**Depends on**: Phase 2 (T003 built the footer) and at least one module from Phase 4 wired to it.

- [x] T038 [US3] Add explicit first-page ("previous" disabled) and last-page ("next" disabled)
      assertions to each module's e2e pagination scenario from Phase 4 (T014, T018, T022, T027,
      T032, T037) rather than a new page — this story's behavior is a property of the shared footer
      (T003), not separate implementation
- [x] T039 [US3] Confirm total-count and current-position text is present and correct on every
      paginated table's first render (no page requested yet) across the same six e2e specs

**Checkpoint**: all three user stories independently verified.

---

## Phase 6: Polish & Cross-Cutting

- [x] T040 Run `deno fmt --check`, `deno lint`, full-tree `deno check`, `deno task test` — zero
      regressions across the whole suite, not just this feature's new tests
- [x] T041 Run `quickstart.md`'s manual scenarios against a real Cloudflare account (real-account
      dependency — leave unchecked here until actually run, per this project's established
      convention for every prior module). Verified 2026-08-14 via authenticated curl against
      production (`flaretower.iuma.dev`), covering every scenario's API-level assertions on real
      data: Scenario 1's real audit-log volume actually exceeded `AUDIT_LOG_FETCH_CAP` (1000),
      confirming `truncated: true` fires on genuine over-cap data, not just a mock (1c); every
      module's `*_pagination` envelope is present and correct (Workers 23/5pp, DNS's maksimyugai.com
      zone naturally spans 2 pages at 59 records, Storage buckets/kv/d1, Security
      zones/certificates/waf_custom_rules, Zero Trust applications naturally spans 2 pages at 94
      records, Pages); sort order is a true continuation across the page boundary for every module
      checked (verified boundary rows manually, e.g. Zero Trust's default "application" sort key —
      which sorts by `app_domain`, not the displayed `app_name` — correctly continues
      `playground.ai.cloudflare.com` → `portal.bee.synology.com` across pages 1→2); small,
      single-page result sets (Pages 6, Storage KV 9/D1 20, Security certs 8/WAF rules 10) report
      `total_pages: 1` as expected. NOT covered by this pass — genuinely requires a browser, not
      curl: Scenario 4's UI-interaction checks (row expand/collapse, keyboard sort-header
      activation, critical-row visual treatment persisting across pages) and visually confirming
      Scenario 3's "no pagination footer renders" — deferred to the `flaretower-qa` peer session's
      planned browser pass over all 6 dashboards.
- [x] T042 Update README's Status section with a one-paragraph entry for spec 020, matching the
      existing per-spec documentation pattern (specs 012–019 each have one)

## Dependencies & Execution Order

- **Phase 1 (Setup)**: none — skip.
- **Phase 2 (Foundational)**: T001–T003, parallelizable with each other. Blocks Phase 4 and 5. Does
  NOT block Phase 3 (US1 is fully independent of pagination infrastructure).
- **Phase 3 (US1)**: independent of everything else — can ship alone as the MVP slice.
- **Phase 4 (US2)**: depends on Phase 2. The six per-module groups (Workers/DNS/Storage/Security/
  Zero Trust/Pages) are independent of each other and parallelizable; within each group, the
  backend+test tasks `[P]` precede the frontend/e2e tasks that depend on the API shape they define.
- **Phase 5 (US3)**: depends on Phase 2 and at least one completed module from Phase 4.
- **Phase 6 (Polish)**: after all prior phases.

## Parallel Execution Examples

Phase 2, all three tasks (different files, no interdependency):

```
T001 worker/pagination.ts
T002 tests/unit/pagination.test.ts   # written alongside/after T001 per constitution VI, but
                                       # doesn't block T003 starting
T003 app/components/FindingsTable.tsx
```

Phase 4, the six modules' backend+test pairs, once Phase 2 is done:

```
T011+T012 (Workers)  T015+T016 (DNS)      T019+T020 (Storage)
T023-T025 (Security) T028-T030 (Zero Trust) T033-T035 (Pages)
```

Each group's frontend/e2e tasks (T013+T014, T017+T018, etc.) start once that group's own backend
task lands — they don't wait on the other five modules.

## Implementation Strategy

**MVP = Phase 3 (User Story 1) alone.** It's the highest-severity gap (silent data loss on a
security-relevant surface), fully self-contained, and shippable independently of the shared
pagination infrastructure Phase 2/4/5 need. Recommended sequence: Phase 3 first (ship it), then
Phase 2 (shared infra), then Phase 4's Workers group as the reference pattern for the remaining five
modules, then the rest of Phase 4 in any order (parallelizable), then Phase 5, then Phase 6.
