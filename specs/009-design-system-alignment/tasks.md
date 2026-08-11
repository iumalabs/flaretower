# Tasks: Design System & App Shell Alignment

**Input**: Design documents from `/specs/009-design-system-alignment/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/components.md, quickstart.md

**Tests**: Required, not optional — constitution Principle VI mandates
tests before a feature is done, and Playwright coverage for every
user-facing flow. Every story below writes its e2e coverage before (or
alongside) its implementation, matching this project's convention on
every prior module.

**Organization**: Tasks are grouped by user story (spec.md's US1/US2/US3)
so each can be implemented, tested, and shipped independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Path Conventions

Single-project layout already in use by this repo: `worker/` (untouched
by this feature), `app/` (SPA, where every task below lands), `tests/`.

---

## Phase 1: Setup

**Purpose**: Vendor the static assets every later phase depends on.

- [ ] T001 [P] Vendor self-hosted IBM Plex Sans (weights 400, 600) and IBM
      Plex Mono (weights 400, 500, 600) `.woff2` files under
      `app/assets/fonts/`, plus a `LICENSE.txt` noting the SIL Open Font
      License attribution (research.md §1 — only the weights actually
      used by the design's `typeScale` are vendored, not the full family).
- [ ] T002 [P] Create `app/assets/favicon.svg` implementing the design
      package's simplified single-arc mark (research.md §2).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Corrected tokens, loaded fonts, the favicon wired in, and
the shared `Logo` component — every later story's pages render inside
this shell.

**⚠️ CRITICAL**: No user story work can begin until this phase is
complete.

- [ ] T003 Fix `app/styles/tokens.css`'s `--surface-2` value from the
      current `#18130f` to the design source's `#181310` (confirmed
      transposed-digit color-drift bug, research.md/spec.md FR-008).
- [ ] T004 [P] Add the missing `--text-metric` typography token (28px /
      600 weight / IBM Plex Mono, letter-spacing -0.03em) to
      `app/styles/tokens.css` — present in the design source's
      `typeScale` but not yet extracted into the token file.
- [ ] T005 Add `@font-face` declarations for the fonts vendored in T001
      to `app/styles/tokens.css`, and point `--font-sans`/`--font-mono`
      at them (FR-005).
- [ ] T006 Add `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`
      (T002) to `app/index.html`, and confirm the `@font-face` stylesheet
      (T005) is loaded on every page (FR-006).
- [ ] T007 [P] Create `app/components/Logo.tsx` implementing the SVG mark
      with `lockup`/`mono`/`tile` variants and `dark`/`light` theme props,
      per `contracts/components.md` (FR-001).
- [ ] T008 Verify the existing static-assets configuration in
      `wrangler.jsonc` serves `app/assets/*` (fonts, favicon) correctly
      under the current build output — confirms no config change is
      needed; if one is, make the minimal fix here.

**Checkpoint**: Fonts render, favicon resolves, tokens are correct, and
`Logo` is available for every later story to consume.

---

## Phase 3: User Story 1 - Consistent, on-brand app shell everywhere (Priority: P1) 🎯 MVP

**Goal**: Every page shares one branded sidebar, correct typefaces, a
favicon, and zero stray rounded corners.

**Independent Test**: Load any existing module page and confirm the
sidebar, logo, typefaces, favicon, and corner treatment all match
`docs/design.zip` — verifiable without any table or dashboard change
existing yet (quickstart.md Scenario 1).

### Tests for User Story 1

- [ ] T009 [US1] Write `tests/e2e/app-shell.spec.ts` covering spec.md's
      US1 acceptance scenarios 1–5: favicon link present; sidebar renders
      all 8 destinations with logo and footer; active-state indicator
      moves to the current page on navigation; a module's nav badge shows
      only when its critical count is > 0; computed `font-family` is IBM
      Plex Sans/Mono, not a fallback. Confirm it fails against the
      current shell before implementing.
- [ ] T010 [P] [US1] Write `tests/unit/module-badge-counts.test.ts` for
      the pure rollup described in data-model.md's `ModuleBadgeCount`:
      sums `counts.critical` per `module` across a `PostureSummaryEntry[]`
      fixture, and omits any module whose summed count is 0. Confirm it
      fails (module doesn't exist yet) before implementing.

### Implementation for User Story 1

- [ ] T011 [P] [US1] Create `app/lib/module-badge-counts.ts` implementing
      the rollup from T010 (data-model.md's `ModuleBadgeCount`).
- [ ] T012 [US1] Create `app/components/Sidebar.tsx` per
      `contracts/components.md`: logo header (via T007's `Logo`), a
      vertical list of `SidebarItem`s (icon + label + optional badge,
      active-state left edge bar + background tint), and an
      account/version footer block (FR-002, FR-003).
- [ ] T013 [US1] Define the 8 nav items (icon paths per the design
      source's `NAV` array, labels matching the existing `PAGES` array in
      `app/App.tsx`) as a shared constant in `app/nav-items.ts`.
- [ ] T014 [US1] Wire `app/App.tsx`: replace the inline `<nav>` with
      `<Sidebar>`; fetch `GET /api/audit/summary` once at the App level;
      compute per-module badges via T011's helper; pass `activeKey`,
      `items`, and `footer` down (FR-004).
- [ ] T015 [US1] Remove `ExposureStatusBadge.tsx`'s `borderRadius: 4` —
      the design system uses zero border-radius everywhere (research.md
      §5, FR-007).
- [ ] T016 [US1] Run quickstart.md Scenario 1 manually against
      `deno task dev`; fix any drift found before moving to User Story 2.

**Checkpoint**: User Story 1 is fully functional and independently
shippable — every existing page now renders inside the correct shell.

---

## Phase 4: User Story 2 - Unified, filterable findings table per module (Priority: P2)

**Goal**: Every module's findings render in one sortable/filterable/
expandable table with an alert banner and proper loading/empty states,
replacing today's ad-hoc per-entity cards.

**Independent Test**: Open any one module's page and confirm findings
render in the unified table with working filter chips and row expansion
(quickstart.md Scenario 2) — verifiable per module, without the Overview
page existing yet.

### Tests for User Story 2

- [ ] T017 [P] [US2] Write `tests/e2e/findings-table-filter.spec.ts`
      covering spec.md's US2 acceptance scenarios 1–5 and 7 (filter
      chips narrow the table with no reload, alert banner appears for a
      critical finding, row expand/collapse, critical-row triple
      marking, shimmer loading state) against the Exposure module page.
      Confirm it fails before implementing.

### Shared components for User Story 2

- [ ] T018 [P] [US2] Create `app/components/EmptyState.tsx` per
      `contracts/components.md` (dimmed `Logo` mono variant, heading,
      description, optional CTA) (FR-015).
- [ ] T019 [P] [US2] Create `app/components/LoadingSkeleton.tsx` per
      `contracts/components.md` (shimmer-animated placeholder rows,
      matching the design source's `ftShimmer` keyframe treatment)
      (FR-014).
- [ ] T020 [P] [US2] Create `app/components/AlertBanner.tsx` per
      `contracts/components.md` (`critical`/`warning` severity styling,
      `module`/`account` scope copy) (FR-013).
- [ ] T021 [US2] Create `app/components/FindingsTable.tsx` per
      `contracts/components.md` and data-model.md's
      `FindingsTableColumn`/`FindingsTableRow`: sort-by-column state,
      status-filter-chip state, per-row expand/collapse state; delegates
      to T018/T019 for its empty/loading states (FR-009, FR-010, FR-011,
      FR-012). Depends on T018, T019.

### Per-module migration for User Story 2

Each of the following is a different file and safe to parallelize; each
depends on T020/T021 existing. Every task also updates that module's
existing e2e spec's selectors if the migration changes them — existing
assertions must keep passing (spec.md SC-006).

- [ ] T022 [P] [US2] Migrate `app/pages/ExposureInventory.tsx` onto
      `FindingsTable`/`AlertBanner`/`EmptyState`/`LoadingSkeleton`,
      columns per its existing hostname-finding shape; update
      `tests/e2e/exposure-inventory.spec.ts`.
- [ ] T023 [P] [US2] Migrate `app/pages/DnsInventory.tsx` onto the shared
      components, columns per its zone/record shape; update
      `tests/e2e/dns-inventory.spec.ts`.
- [ ] T024 [P] [US2] Migrate `app/pages/ZeroTrustInventory.tsx` onto the
      shared components, columns per its application/service-token
      shapes; update `tests/e2e/zero-trust-inventory.spec.ts`.
- [ ] T025 [P] [US2] Migrate `app/pages/PagesInventory.tsx` onto the
      shared components, columns per its project/domain shape; update
      `tests/e2e/pages-inventory.spec.ts`.
- [ ] T026 [P] [US2] Migrate `app/pages/StorageInventory.tsx` onto the
      shared components, columns per its bucket/binding shape; update
      `tests/e2e/storage-inventory.spec.ts`.
- [ ] T027 [P] [US2] Migrate `app/pages/SecurityPostureInventory.tsx`
      onto the shared components, columns per its zone/Turnstile shape;
      update `tests/e2e/security-inventory.spec.ts`.
- [ ] T028 [P] [US2] Migrate `app/pages/AuditInventory.tsx` onto the
      shared components for its own per-source table presentation (the
      unified cross-module inbox view and the acknowledge action stay
      functionally unchanged — presentation only); update
      `tests/e2e/audit-inventory.spec.ts` and confirm
      `tests/e2e/acknowledge-authorization.spec.ts` still passes
      unmodified (FR-019: no change to who can act on what).
- [ ] T029 [US2] Run quickstart.md Scenario 2 manually across at least
      two modules; fix any drift found before moving to User Story 3.

**Checkpoint**: User Stories 1 AND 2 both work independently — every
module page is now on the shared table pattern.

---

## Phase 5: User Story 3 - Cross-module Overview page (Priority: P3)

**Goal**: A new Overview page answers "is anything wrong right now?"
across all 7 modules at a glance, reusing Module 7's existing endpoints.

**Independent Test**: Navigate to the Overview page and confirm its
aggregate counts match the sum of each individual module page's own
counts (quickstart.md Scenario 3).

### Tests for User Story 3

- [ ] T030 [US3] Write `tests/e2e/overview.spec.ts` covering spec.md's
      US3 acceptance scenarios 1–5: aggregate per-severity counts render;
      counts match the sum of per-module data; a critical finding appears
      in the prioritized list with an inspect/act affordance; a recent-
      activity log renders; an all-clear state renders when every module
      has zero findings; a module whose latest run is unavailable is
      shown as not-available, not folded into zero. Confirm it fails
      before implementing.

### Implementation for User Story 3

- [ ] T031 [US3] Create `app/pages/OverviewPage.tsx`: fetch
      `GET /api/audit/summary`, `/alerts`, `/changes` (research.md §3);
      render 4 metric cards (critical/warning/safe/not-applicable,
      summed across every `PostureSummaryEntry`), a prioritized findings
      list sourced from `/alerts`, and a chronological activity log
      sourced from `/changes` (FR-016, FR-017).
- [ ] T032 [US3] Handle `unavailableSources` from `GET /api/audit/summary`
      in `OverviewPage`: a module reported there must render as
      not-available in the aggregate counts, never silently counted as
      zero (FR-018).
- [ ] T033 [US3] Add an `"overview"` entry to `app/App.tsx`'s `PAGES`
      array as the first/default page, and set it as `Sidebar`'s initial
      `activeKey`.
- [ ] T034 [US3] Run quickstart.md Scenario 3 manually; fix any drift
      found.

**Checkpoint**: All three user stories are independently functional and
the full feature is demoable end-to-end.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Feature-wide verification the per-story checkpoints don't
individually cover.

- [ ] T035 [P] Grep-sweep `app/` for any remaining `borderRadius`/
      `border-radius` occurrence; every one must trace to a deliberate,
      non-zero exception documented inline, or be removed (FR-007,
      spec.md SC-001).
- [ ] T036 [P] Grep-sweep every file touched by this feature for
      hardcoded hex color values outside `app/styles/tokens.css`; fix any
      found (spec.md SC-005).
- [ ] T037 Run `deno fmt`, `deno lint`, and `deno check` across all
      touched files; fix anything they flag.
- [ ] T038 Run `deno test -A tests/unit/` and `deno task test:e2e`;
      confirm 100% pass, including every pre-existing test untouched by
      this feature (spec.md SC-006).
- [ ] T039 Run quickstart.md end-to-end as a final combined sanity pass
      across all three scenarios.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001/T002's assets) —
  BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational. No dependency on
  US2/US3.
- **User Story 2 (Phase 4)**: Depends on Foundational. Renders inside
  US1's `Sidebar`/`App.tsx` wiring to be reachable end-to-end, so build
  after US1 in practice, even though its own components (`FindingsTable`
  etc.) don't technically import anything from US1.
- **User Story 3 (Phase 5)**: Depends on Foundational. Independent of
  US2's per-module table migration (reads Module 7's existing endpoints
  directly, not through `FindingsTable`), but — like US2 — needs US1's
  `Sidebar`/`App.tsx` wiring to be reachable via navigation.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- T001/T002 (Setup) in parallel.
- T004/T007 (Foundational) in parallel with each other, after T003/T005/T006.
- T010/T011 (US1 tests/rollup) in parallel with each other.
- T018/T019/T020 (US2 shared components) in parallel with each other;
  T021 (`FindingsTable`) depends on T018 and T019.
- T022–T028 (the 7 per-module migrations) are all different files and
  fully parallelizable once T020/T021 exist.
- T035/T036 (Polish grep-sweeps) in parallel.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational).
2. Complete Phase 3 (User Story 1).
3. **STOP and VALIDATE**: run quickstart.md Scenario 1 independently.
4. Ship if desired — every page is already correctly branded even before
   US2/US3 land.

### Incremental Delivery

1. Setup + Foundational → shell prerequisites ready.
2. User Story 1 → on-brand shell everywhere → validate → ship (MVP).
3. User Story 2 → unified table pattern across all 7 modules → validate
   → ship.
4. User Story 3 → Overview page → validate → ship.
5. Polish → final cross-cutting verification.

Each increment adds value without breaking the previous one, per
spec.md's own priority ordering.
