# Tasks: Dashboard Panel Tabs

**Input**: Design documents from `/specs/021-dashboard-panel-tabs/` **Prerequisites**: plan.md,
spec.md, research.md, data-model.md, quickstart.md

Tests are included per constitution Principle VI ("Playwright for user-facing flows") — this feature
is entirely user-facing (layout only), so every page change gets e2e coverage. No unit tests:
`TabStrip` has no non-trivial logic worth isolating (plan.md Technical Context), matching this
project's existing practice for other trivial presentational components.

## Phase 1: Setup

Not applicable — this feature extends existing pages and adds one component within the existing
`app/` structure. Nothing to scaffold.

## Phase 2: Foundational (blocks both user stories)

- [x] T001 Create `app/components/TabStrip.tsx`: `TabEntry`/`TabStripProps` per data-model.md,
      chip-button visual style per research.md §2, `useState` defaulting to the first entry's key
      (research.md §1), renders only the active entry's `content` (spec.md FR-003)

**Checkpoint**: shared tab component exists; ready for all four candidate pages.

---

## Phase 3: User Story 1 - Reach any block without scrolling (P1) 🎯 MVP

**Goal**: Each of the four candidate pages presents its blocks as tabs instead of a long stack.

**Independent Test**: Load any one of the four pages; confirm a tab strip renders, only the active
tab's block is present, and clicking another tab swaps the visible block (spec.md's own Independent
Test for this story).

**Depends on**: Phase 2 (T001).

### Storage (fully independent blocks — simplest case, build first as the reference pattern)

- [x] T002 [P] [US1] Wrap `app/pages/StorageInventory.tsx`'s three blocks (R2 buckets, KV
      namespaces, D1 databases) in `TabStrip` per data-model.md's mapping table; page-level
      `AlertBanner` stays above the strip, unchanged position
- [x] T003 [US1] Extend `tests/e2e/storage-inventory.spec.ts`: tab-strip scenario — three tabs
      visible, only the active one's table rendered, clicking each shows that table's existing
      rows/empty-state unchanged (depends on T002)

### Security Posture (Zones block gains a label it doesn't have today)

- [x] T004 [P] [US1] Wrap `app/pages/SecurityPostureInventory.tsx`'s four blocks (Zones — new
      "Zones" tab label, research.md §4 — Certificates, WAF custom rules, Turnstile widgets) in
      `TabStrip`; page-level `AlertBanner` stays above the strip
- [x] T005 [US1] Extend `tests/e2e/security-inventory.spec.ts`: tab-strip scenario across all four
      tabs, including the newly-labeled Zones tab (depends on T004)

### Zero Trust (Access Groups decouples from the Applications tab into its own)

- [x] T006 [P] [US1] Wrap `app/pages/ZeroTrustInventory.tsx`'s three blocks in `TabStrip`: Access
      applications (app-picker chips + table + `PolicyDetailPanel` stay together), Access Groups
      (`GroupsPanel` moves to its own tab — no data dependency to preserve, research.md §4), Service
      tokens; page-level `AlertBanner` stays above the strip
- [x] T007 [US1] Extend `tests/e2e/zero-trust-inventory.spec.ts`: tab-strip scenario across all
      three tabs, confirming Access Groups renders correctly as its own tab, decoupled from
      application selection (depends on T006)

### Audit & Drift (account-wide alert banner relocates to stay page-level)

- [x] T008 [P] [US1] Wrap `app/pages/AuditInventory.tsx`'s four blocks (Audit log, Unified alerts
      inbox, What changed, Account-wide posture summary) in `TabStrip`; move the account-wide
      `criticalAlert` banner (`scope="account"`) above the `TabStrip` so it's page-level like the
      other three pages' banners, not nested inside a specific tab (spec.md FR-006, research.md §4)
- [x] T009 [US1] Extend `tests/e2e/audit-inventory.spec.ts`: tab-strip scenario across all four
      tabs; confirm the account-wide critical alert banner (when present) stays visible regardless
      of active tab (depends on T008)

**Checkpoint**: all four candidate pages tabbed; User Story 1 fully functional and independently
shippable.

---

## Phase 4: User Story 2 - Switching tabs preserves state (P2)

**Goal**: A block's own page/sort/selection state survives switching away to another tab and back.

**Independent Test**: On Zero Trust, page forward, sort, and select an application; switch to
Service tokens and back; confirm nothing reset (spec.md's own Independent Test for this story).

**Depends on**: Phase 3 (the pages must already be tabbed before their state-preservation can be
tested). Per research.md §5, this story needs **no new implementation** — every piece of state
FR-007 covers is already lifted to the owning page's own `useState`, above whichever tab content
`TabStrip` is currently showing, so it was never inside the switched-away subtree to begin with.
This phase is verification-only.

- [x] T010 [US2] Extend `tests/e2e/zero-trust-inventory.spec.ts`: page forward on Access
      applications, sort by a column, select an application, switch to Service tokens and back —
      confirm page/sort/selection all unchanged (quickstart.md Scenario 2, depends on T007)
- [x] T011 [US2] Extend `tests/e2e/storage-inventory.spec.ts`: page/sort one of the three tables,
      switch tabs and back — confirm unchanged (depends on T003)
- [x] T012 [US2] Extend `tests/e2e/security-inventory.spec.ts`: page/sort the Zones (or
      Certificates/WAF) table, switch tabs and back — confirm unchanged (depends on T005)

**Checkpoint**: both user stories independently verified.

---

## Phase 5: Polish & Cross-Cutting

- [x] T013 Run `deno fmt --check`, `deno lint`, full-tree `deno check`, `deno task test` — zero
      regressions across the whole suite, not just this feature's new tests
- [ ] T014 Run `quickstart.md`'s manual scenarios in a real browser (real-browser dependency — leave
      unchecked here until actually run, per this project's established convention for every prior
      feature)

## Dependencies & Execution Order

- **Phase 2 (Foundational)**: T001 only. Blocks Phase 3 entirely (no page can use `TabStrip` before
  it exists).
- **Phase 3 (US1)**: each page's impl+e2e pair (T002/T003, T004/T005, T006/T007, T008/T009) is
  independent of the other three pages — [P] across pages, sequential within a pair (e2e depends on
  that page's own implementation).
- **Phase 4 (US2)**: depends on Phase 3's corresponding page being tabbed first (T010 needs T007,
  T011 needs T003, T012 needs T005) — pure test-extension, no new page code.
- **Phase 5 (Polish)**: depends on every prior phase.

## Parallel Example: Phase 3

```bash
# Once T001 (TabStrip) is done, all four pages' implementation tasks can proceed in parallel:
Task: "Wrap StorageInventory.tsx's three blocks in TabStrip"
Task: "Wrap SecurityPostureInventory.tsx's four blocks in TabStrip"
Task: "Wrap ZeroTrustInventory.tsx's three blocks in TabStrip"
Task: "Wrap AuditInventory.tsx's four blocks in TabStrip"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (`TabStrip`)
2. Complete Phase 3: all four pages tabbed
3. **STOP and VALIDATE**: quickstart.md Scenario 1 across all four pages
4. Deploy/demo if ready — User Story 2 (state preservation) already holds by construction
   (research.md §5), so an MVP stopping here isn't missing a behavioral guarantee, only its
   dedicated test coverage.

### Incremental Delivery

1. Foundational → `TabStrip` ready
2. Storage tabbed (simplest, reference pattern) → verify → repeat for Security, Zero Trust, Audit
3. Add User Story 2's verification tests once all four pages are tabbed
4. Polish: full-suite check + manual quickstart pass
