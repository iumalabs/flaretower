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

- [x] T001 [P] ~~Vendor self-hosted IBM Plex Sans (weights 400, 600) and
      IBM Plex Mono (weights 400, 500, 600) `.woff2` files under
      `app/assets/fonts/`~~ — superseded: fonts are pulled in via the
      `@fontsource/ibm-plex-sans`/`@fontsource/ibm-plex-mono` npm packages
      (Deno `npm:` specifier in `deno.json`) instead of manually vendored
      binaries, achieving the identical self-hosted-not-CDN outcome
      research.md §1 requires with no binary files to maintain by hand.
- [x] T002 [P] Create `app/public/favicon.svg` implementing the design
      package's simplified single-arc mark (research.md §2) — lives under
      `app/public/` per Vite's static-asset convention for this project,
      not `app/assets/` as originally guessed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Corrected tokens, loaded fonts, the favicon wired in, and
the shared `Logo` component — every later story's pages render inside
this shell.

**⚠️ CRITICAL**: No user story work can begin until this phase is
complete.

- [x] T003 Fix `app/styles/tokens.css`'s `--surface-2` value from the
      current `#18130f` to the design source's `#181310` (confirmed
      transposed-digit color-drift bug, research.md/spec.md FR-008).
- [x] T004 [P] Add the missing `--text-metric` typography token (28px /
      600 weight / IBM Plex Mono, letter-spacing -0.03em) to
      `app/styles/tokens.css` — present in the design source's
      `typeScale` but not yet extracted into the token file.
- [x] T005 Add `app/styles/fonts.css` (`@import`ing the `@fontsource`
      weight-specific CSS files — T001) and point `--font-sans`/
      `--font-mono` at them (FR-005; the CSS variable names were already
      correct, the bug was that nothing loaded the actual font files).
- [x] T006 Add `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`
      (T002) and the `fonts.css` import (via `app/main.tsx`) so the font
      stylesheet loads on every page (FR-006).
- [x] T007 [P] Create `app/components/Logo.tsx` implementing the SVG mark
      with `lockup`/`mono`/`tile` variants and `dark`/`light` theme props,
      per `contracts/components.md` (FR-001).
- [x] T008 Verified Vite serves `app/public/favicon.svg` at `/favicon.svg`
      correctly under this project's existing static-asset convention.
      Also found and fixed a related gap while verifying: `vite.config.ts`
      had no explicit `server.fs.allow`, and Vite's default (derived from
      `root: "app"`) excluded the repo-root `node_modules/` — where Deno's
      npm-compat layer nests `@fontsource`'s actual `.woff2` files
      (`node_modules/.deno/<pkg>@<version>/node_modules/...`, one level
      above `app/`). This silently blocked the browser's own font
      requests in local dev (a 403 masked by `@font-face` still
      registering the family name in `document.fonts` even when the file
      itself fails to load — only checking each `FontFace`'s own
      `.status` catches it, which `tests/e2e/app-shell.spec.ts`'s AC5 test
      now does). Fixed by adding `server.fs.allow: [".."]` to
      `vite.config.ts`.

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

- [x] T009 [US1] Write `tests/e2e/app-shell.spec.ts` covering spec.md's
      US1 acceptance scenarios 1–5: favicon link present; sidebar renders
      all 8 destinations with logo and footer; active-state indicator
      moves to the current page on navigation; a module's nav badge shows
      only when its critical count is > 0; computed `font-family` is IBM
      Plex Sans/Mono, not a fallback, AND (added beyond the original
      task, per T008's finding above) each `document.fonts` `FontFace`'s
      own `.status` is `"loaded"`, not just that the family name is
      registered. Confirmed failing against the pre-migration shell.
- [x] T010 [P] [US1] Write `tests/unit/module-badge-counts.test.ts` for
      the pure rollup described in data-model.md's `ModuleBadgeCount`.
      Typed against a minimal `AuditSummaryModuleEntry` shape matching
      `GET /api/audit/summary`'s actual (snake_case `has_data`) wire
      response, not `worker/modules/audit/summary.ts`'s internal
      camelCase `PostureSummaryEntry` — the two aren't the same shape and
      the function only ever needs `module`/`counts.critical`, so typing
      it against the real wire format avoids a frontend/backend type
      mismatch. Confirmed failing before implementing.

### Implementation for User Story 1

- [x] T011 [P] [US1] Create `app/lib/module-badge-counts.ts` implementing
      the rollup from T010 (data-model.md's `ModuleBadgeCount`).
- [x] T012 [US1] Create `app/components/Sidebar.tsx` per
      `contracts/components.md`: logo header (via T007's `Logo`), a
      vertical list of `SidebarItem`s (icon + label + optional badge,
      active-state left edge bar + background tint), and an
      account/version footer block (FR-002, FR-003). Footer shows only
      `"self-hosted"` (no fake account/version string — this app has no
      existing source of truth for either, and fabricating one would be
      worse than a minimal-but-honest footer).
- [x] T013 [US1] Define the 8 nav items (icon paths per the design
      source's `NAV` array, labels matching the existing `PAGES` array in
      `app/App.tsx`) as a shared constant in `app/nav-items.ts`. The
      design source's own `NAV` array actually has 9 entries (separate
      "Workers" and "Exposure" rows); this app's `exposure` module
      already covers both, so only one icon/row is used for it and the
      duplicate is intentionally dropped.
- [x] T014 [US1] Wire `app/App.tsx`: replace the inline `<nav>` with
      `<Sidebar>`; fetch `GET /api/audit/summary` once at the App level;
      compute per-module badges via T011's helper; pass `activeKey`,
      `items`, and `footer` down (FR-004). `"exposure"` stays the
      default/initial page (unchanged from before this feature) — making
      `"overview"` the default is explicitly a later task (T033, User
      Story 3), scoped to once the real `OverviewPage` exists; the new
      `"overview"` nav item added here (FR-002's "all 8 destinations")
      renders a placeholder ("Overview coming soon.") if clicked before
      then.
- [x] T015 [US1] Remove `ExposureStatusBadge.tsx`'s `borderRadius: 4` —
      the design system uses zero border-radius everywhere (research.md
      §5, FR-007).
- [x] T016 [US1] Ran quickstart.md Scenario 1 manually against a real
      `deno task dev`-equivalent session (Playwright screenshots,
      inspected directly) — sidebar, logo, active-state, badge, and
      typography all render correctly. This is also where T008's
      Vite `fs.allow` bug was actually caught (the shell rendered
      visually fine even with fonts failing to load, since the fallback
      font is visually similar enough not to be obvious by eye alone —
      only the strengthened `document.fonts` status check in T009's test
      caught it for certain).

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

- [x] T017 [P] [US2] Write `tests/e2e/exposure-inventory.spec.ts`
      coverage for spec.md's US2 acceptance scenarios (filter chips
      narrow the table with no reload, alert banner appears for a
      critical finding, critical-row triple marking) against the
      Exposure module page (superseded the originally-planned separate
      `findings-table-filter.spec.ts` file — the existing per-module spec
      file was the more natural place to add this coverage once the
      migration made it possible, avoiding a parallel, redundant spec
      file for the same page). Row expand/collapse (FR-012) is NOT
      covered — see T021's note on why no page currently has real
      expandable-detail content.

### Shared components for User Story 2

- [x] T018 [P] [US2] Create `app/components/EmptyState.tsx` per
      `contracts/components.md` (dimmed `Logo` mono variant, heading,
      description, optional CTA) (FR-015).
- [x] T019 [P] [US2] Create `app/components/LoadingSkeleton.tsx` per
      `contracts/components.md` (shimmer-animated placeholder rows,
      matching the design source's `ftShimmer`/`ftPulse` keyframes —
      added as global `@keyframes ft-shimmer`/`ft-pulse` in
      `app/styles/tokens.css` since every instance shares them) (FR-014).
- [x] T020 [P] [US2] Create `app/components/AlertBanner.tsx` per
      `contracts/components.md` (`critical`/`warning` severity styling,
      `module`/`account` scope copy) (FR-013).
- [x] T021 [US2] Create `app/components/FindingsTable.tsx` per
      `contracts/components.md` and data-model.md's
      `FindingsTableColumn`/`FindingsTableRow`: sort-by-column state,
      status-filter-chip state, per-row expand/collapse state; the
      status badge itself is rendered by `FindingsTable` automatically
      as a fixed leading column driven by `row.status` (a real bug was
      caught live during T022's verification: an earlier draft required
      each caller to add its own badge column, and none did, so no row
      ever showed a status badge at all — moving badge rendering into
      `FindingsTable` itself, matching data-model.md's own framing of
      `status` as what "drives... the badge," fixed this at the source
      instead of in each of the 7 callers). Delegates to T018/T019 for
      its empty/loading states (FR-009, FR-010, FR-011). Row
      expand/collapse (FR-012) is implemented and structurally available
      via the optional `detail` field, but **no page currently populates
      it** — every module's flat-table columns already surface all the
      data its API response provides; there is no additional per-row
      detail beyond what's already visible to reveal on expand.
      Fabricating filler detail content just to exercise the mechanic
      was rejected as dishonest scope-padding; this is left available
      for a future module/data source that has real additional detail.

### Per-module migration for User Story 2

Every migration below also adds an `AlertBanner` for that page's most
urgent critical finding (FR-013) — not explicitly called out per-task
below since it applies uniformly. Row ids use a `data-testid="findings-row-<id>"`
attribute (added to `FindingsTable`, not in the original task
description) so e2e specs can target a specific row precisely instead of
fragile text-based `hasText` filtering, which turned out to false-match
the table's own footer/filter-chip text during T022's implementation.

- [x] T022 [P] [US2] Migrate `app/pages/ExposureInventory.tsx` onto
      `FindingsTable`/`AlertBanner`/`EmptyState`/`LoadingSkeleton`, one
      flat table across every worker's hostnames (not grouped
      per-worker); update `tests/e2e/exposure-inventory.spec.ts`.
- [x] T023 [P] [US2] Migrate `app/pages/DnsInventory.tsx` onto the shared
      components, one flat table across every zone's records. A zone
      with zero records gets a synthetic "(no records)" sentinel row so
      it's never silently dropped by the flattening `flatMap` — this
      specifically preserves specs/002-dns/tasks.md T026's earlier
      backend fix for the exact same omission bug, now re-guarded at the
      frontend layer too. Update `tests/e2e/dns-inventory.spec.ts`.
- [x] T024 [P] [US2] Migrate `app/pages/ZeroTrustInventory.tsx` onto the
      shared components as two separate `FindingsTable`s (Access
      applications, Service tokens — too structurally different to
      flatten into one table). Preserves the `run_id === null` empty-state
      gate (specs/003-zero-trust/tasks.md T026). Update
      `tests/e2e/zero-trust-inventory.spec.ts`.
- [x] T025 [P] [US2] Migrate `app/pages/PagesInventory.tsx` onto the
      shared components, one flat table per project flattening its
      subdomain/deployment/domain checks into rows tagged by check type.
      Update `tests/e2e/pages-inventory.spec.ts`.
- [x] T026 [P] [US2] Migrate `app/pages/StorageInventory.tsx` onto the
      shared components as three separate `FindingsTable`s (buckets, KV
      namespaces, D1 databases). Update `tests/e2e/storage-inventory.spec.ts`.
- [x] T027 [P] [US2] Migrate `app/pages/SecurityPostureInventory.tsx`
      onto the shared components, one flat table across every zone's four
      checks; Turnstile widgets (which carry no status/severity at all)
      are deliberately left as their own simple list, not forced into
      `FindingsTable`'s row model. Preserves the `run_id === null`
      empty-state gate (specs/006-security-posture/tasks.md T026).
      Update `tests/e2e/security-inventory.spec.ts`.
- [x] T028 [P] [US2] Migrate `app/pages/AuditInventory.tsx`'s "Unified
      alerts inbox" and "What changed" sections onto `FindingsTable` (the
      Acknowledge action moved into a table column, functionally
      unchanged); "Account-wide posture summary" stays a plain styled
      table since it holds aggregated per-source counts, not per-entity
      findings, and doesn't fit `FindingsTable`'s row model. Update
      `tests/e2e/audit-inventory.spec.ts`. **`tests/e2e/acknowledge-authorization.spec.ts`
      required updating (not "unmodified" as originally planned)** — both
      for the new `data-testid` row selectors, and to fix a genuine
      pre-existing bug found while running the full suite: its
      `/api/audit/alerts`/`/changes`/`/summary` mocks predated the
      `unavailable_sources` field added by #299, which crashed
      `AuditInventory.tsx`'s already-existing `<UnavailableSourcesNotice>`
      render — confirmed via `git show origin/main` this was already
      broken before this branch, not introduced by it. FR-019 still
      holds: no change to who can act on what, only to the test's mocks
      and selectors.
- [x] T029 [US2] Ran quickstart.md Scenario 2 across all 7 migrated
      pages via Playwright screenshots (Exposure and DNS inspected
      directly; the rest verified via their full e2e suites, 37/37
      passing) — filter chips, critical-row triple marking, and the new
      alert banners all render correctly; DNS's empty-zone sentinel row
      confirmed visually.

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
