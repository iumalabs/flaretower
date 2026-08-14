# Tasks: Audit List Pagination

**Input**: Design documents from `/specs/022-audit-list-pagination/` **Prerequisites**: plan.md,
spec.md, research.md, data-model.md, quickstart.md

Tests are included per constitution Principle VI (test-first, Playwright for user-facing flows).

## Phase 1: Setup

Not applicable — extends existing routes/pages within the existing structure. Nothing to scaffold.

## Phase 2: Foundational

Not applicable — this feature reuses `worker/pagination.ts` and `FindingsTable`'s existing
pagination mode exactly as-is (research.md §1); no new shared component/helper needed before either
user story can start.

---

## Phase 3: User Story 1 - Audit & Drift's tabs never silently truncate (P1) 🎯 MVP

**Goal**: `GET /alerts` and `GET /changes` support real pagination/sort; both Audit & Drift tabs get
page footers and prev/next controls.

**Independent Test**: Load Audit & Drift with more alerts/changes than fit on one page; confirm a
page footer and working pagination/sort on both tabs (spec.md's own Independent Test).

- [x] T001 [P] [US1] Extend `GET /alerts` in `worker/modules/audit/routes.ts`:
      `page`/`page_size`/`sort_key`/`sort_dir` via `paginateArray()`, sort whitelist
      `{ entity: entityLabel, detected: detectedAt, severity: SEVERITY_RANK[newStatus] }`, default
      sort key `detected` (data-model.md); response gains a `pagination` envelope alongside the
      existing `alerts`/`unavailable_sources`
- [x] T002 [P] [US1] Extend `GET /changes` in `worker/modules/audit/routes.ts`:
      `page`/`page_size`/`sort_key`/`sort_dir` via `paginateArray()`, sort whitelist
      `{ entity: entityLabel, severity: SEVERITY_RANK[currentStatus] }`, default sort key `entity`
      (data-model.md — no timestamp field exists for this endpoint); response gains a `pagination`
      envelope alongside the existing `changes`/`unavailable_sources`
- [x] T003 [P] [US1] Unit tests in `tests/unit/audit-routes.test.ts`: pagination/sort behavior for
      both `GET /alerts` and `GET /changes`, including the new `severity` accessor and the
      400-on-invalid-`page`/`page_size`/`sort_key`/`sort_dir` path (spec 020's existing convention)
      (depends on T001, T002)
- [x] T004 [US1] Extend `app/pages/AuditInventory.tsx`: page/sort state for the Unified alerts inbox
      tab and the What changed tab (mirroring every candidate page from spec 021), wired to
      `FindingsTable`'s existing `pagination` prop on both (depends on T001, T002)
- [x] T005 [US1] Extend `tests/e2e/audit-inventory.spec.ts`: pagination scenario on both tabs per
      quickstart.md Scenario 1 (depends on T004)

**Checkpoint**: User Story 1 fully functional and independently shippable.

---

## Phase 4: User Story 2 - Overview stays a bounded glance (P2)

**Goal**: Overview's alerts/recent-activity lists request a fixed top-5, most-severe-first, with an
explicit "N more" indicator linking to Audit & Drift's now-paginated tabs.

**Independent Test**: Load Overview with more than 5 alerts (or changes); confirm exactly 5 render,
an accurate "N more" count appears, and it links to the corresponding Audit & Drift tab (spec.md's
own Independent Test).

**Depends on**: Phase 3 (T001, T002 — the endpoints must support `page_size`/`sort_key` first).

- [x] T006 [US2] Extend `app/pages/OverviewPage.tsx`: both fetches request
      `page=1&page_size=5&sort_key=severity` (data-model.md); render stays the existing fixed-list
      style (no `FindingsTable`, no pager); add a "N more — see full list" indicator (only when
      `pagination.total > 5`) linking to Audit & Drift's Unified alerts inbox / What changed tab
      respectively
- [x] T007 [US2] Extend `tests/e2e/overview.spec.ts`: bounded-top-5 + "N more" indicator + link
      scenario for both lists, per quickstart.md Scenario 2 (depends on T006)

**Checkpoint**: both user stories independently verified.

---

## Phase 5: Polish & Cross-Cutting

- [x] T008 Run `deno fmt --check`, `deno lint`, full-tree `deno check`, `deno task test` — zero
      regressions across the whole suite, not just this feature's new tests
- [x] T009 Manually verify the acknowledge-alert flow still works correctly on both pages
      post-pagination (quickstart.md Scenario 3) — no new automated test needed per research.md §5
      (existing client-side remove-on-acknowledge logic is unchanged code, already covered by
      `tests/e2e/acknowledge-authorization.spec.ts`), but worth a manual spot-check given it's the
      one existing mutating flow this feature's data source feeds
- [ ] T010 Run `quickstart.md`'s manual scenarios against a real Cloudflare account (real-account
      dependency — leave unchecked here until actually run, per this project's established
      convention for every prior feature)

## Dependencies & Execution Order

- **Phase 3 (US1)**: T001/T002 parallelizable (different endpoints, same file — sequential edits to
  `routes.ts` in practice, but logically independent). T003 depends on both. T004 depends on both.
  T005 depends on T004.
- **Phase 4 (US2)**: depends on Phase 3's T001/T002 (the `page_size`/`sort_key` support they add).
  T007 depends on T006.
- **Phase 5 (Polish)**: depends on every prior phase.

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001-T005 (Audit & Drift's tabs paginate)
2. **STOP and VALIDATE**: quickstart.md Scenario 1
3. Deploy/demo if ready — Overview's unbounded lists remain as they are today until Phase 4 lands,
   which is an acceptable incremental step (US1 alone is a strict improvement, not a regression).

### Incremental Delivery

1. Phase 3 (US1) → verify → Phase 4 (US2) → verify → Phase 5 (Polish)
