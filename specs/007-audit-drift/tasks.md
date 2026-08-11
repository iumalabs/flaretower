---

description: "Task list for Audit & Drift module implementation"
---

# Tasks: Audit & Drift

**Input**: Design documents from `/specs/007-audit-drift/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md), [quickstart.md](./quickstart.md)

**Tests**: Included and REQUIRED (constitution Principle VI).

**Organization**: By user story (US1 P1, US2 P1, US3 P2, US4 P2). No
D1 migration in Foundational — this module adds no tables
(research.md §4).

---

## Phase 1: Foundational (Blocking Prerequisite)

- [ ] T001 Mount `/api/audit/*` in `worker/index.ts`'s Hono app, gated
      by the existing `accessAuth` middleware. Stub router until US1.

**Checkpoint**: Routing mount point exists.

---

## Phase 2: User Story 1 - Unified alerts inbox (Priority: P1) 🎯 MVP

**Goal**: Every unacknowledged alert from all fourteen sources appears
in one list, sorted newest first, and can be acknowledged through this
module's own endpoint (writing through to the owning module's row).

**Independent Test**: quickstart.md Scenarios 1-2.

### Tests for User Story 1

- [ ] T002 [P] [US1] Unit test in `tests/unit/audit-inbox.test.ts`
      (mocked `D1Database`): alerts from multiple sources are merged and
      sorted by `detected_at` descending; acknowledged alerts are
      excluded; a mocked read failure on one source doesn't blank out
      the others (spec FR-010).
- [ ] T003 [P] [US1] Playwright e2e test in
      `tests/e2e/audit-inventory.spec.ts` (mocked
      `GET /api/audit/alerts`): alerts from multiple modules render,
      each labeled with its source module and kind.

### Implementation for User Story 1

- [ ] T004 [P] [US1] Implement `worker/modules/audit/sources.ts`: the
      fourteen-entry hard-coded source registry per research.md §2 /
      data-model.md.
- [ ] T005 [US1] Implement `worker/modules/audit/inbox.ts`:
      `queryUnifiedAlerts(db)` (per-source `SELECT ... WHERE
      acknowledged_at IS NULL`, merged and sorted; a per-source query
      failure is caught and that source's contribution is empty, not a
      thrown error — spec FR-010) and `acknowledgeAlert(db, module,
      kind, id)` (routes through `sources.ts` to the matching
      `alertsTable`, same idempotent/404 semantics as every prior
      module's acknowledge endpoint). Depends on T004.
- [ ] T006 [US1] Implement `GET /api/audit/alerts` and
      `POST /api/audit/alerts/:module/:kind/:id/acknowledge` in
      `worker/modules/audit/routes.ts`. Depends on T005.
- [ ] T007 [P] [US1] Build `app/pages/AuditInventory.tsx` (alerts
      section), reusing `ExposureStatusBadge` unchanged. Add a seventh
      nav entry to `app/App.tsx`.
- [ ] T008 [US1] Wire `routes.ts` into the `/api/audit` mount from T001.

**Checkpoint**: User Story 1 fully functional and independently testable.

---

## Phase 3: User Story 2 - What changed since a point in time (Priority: P1)

**Goal**: `GET /api/audit/changes?since=` lists every finding, across
every source, whose status differs between the window's start and now.

**Independent Test**: quickstart.md Scenario 3.

### Tests for User Story 2

- [ ] T009 [P] [US2] Unit test in `tests/unit/audit-changes.test.ts`
      (mocked `D1Database`): an entity whose status differs between the
      cutoff and now appears with both statuses; an unchanged entity
      does not appear; an entity first observed inside the window
      appears with `previousStatus: null` (research.md §5).
- [ ] T010 [P] [US2] Playwright e2e test: the changes digest renders in
      the UI for mocked `GET /api/audit/changes`.

### Implementation for User Story 2

- [ ] T011 [US2] Implement `worker/modules/audit/changes.ts`:
      `computeChanges(db, since)` per research.md §5 — for each source,
      compare each entity's latest finding against its most recent
      finding at or before `since`. Depends on T004.
- [ ] T012 [US2] Implement `GET /api/audit/changes?since=` in
      `routes.ts`, defaulting `since` to 24 hours before the request
      time when omitted. Depends on T011.
- [ ] T013 [US2] Add a "what changed" section to `AuditInventory.tsx`.

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 4: User Story 3 - Account-wide posture summary (Priority: P2)

**Goal**: `GET /api/audit/summary` shows, per source, current
safe/warning/critical/not_evaluated counts from its latest run, or
`has_data: false` if it has never run.

**Independent Test**: quickstart.md Scenario 4.

### Tests for User Story 3

- [ ] T014 [P] [US3] Unit test in `tests/unit/audit-summary.test.ts`
      (mocked `D1Database`): counts are correct per source from its
      latest `run_id`; a source with zero rows ever shows
      `has_data: false`, not zero counts (spec FR-007).
- [ ] T015 [P] [US3] Playwright e2e test: the summary section renders
      per-module counts, and a no-data module renders distinctly from a
      confirmed-clean one.

### Implementation for User Story 3

- [ ] T016 [US3] Implement `worker/modules/audit/summary.ts`:
      `computePostureSummary(db)` per data-model.md. Depends on T004.
- [ ] T017 [US3] Implement `GET /api/audit/summary` in `routes.ts`.
      Depends on T016.
- [ ] T018 [US3] Add a posture summary section to `AuditInventory.tsx`.

**Checkpoint**: All three read endpoints independently functional.

---

## Phase 5: User Story 4 - Scheduled digest logging (Priority: P2)

**Goal**: The shared scheduled handler computes the default (24-hour)
changes digest each cron cycle and logs the count found — no new alert
table, no new persisted state (research.md §4).

**Independent Test**: quickstart.md Scenario 5.

### Tests for User Story 4

- [ ] T019 [P] [US4] Unit test: the scheduled-digest helper (reusing
      `computeChanges()` from T011) returns the correct count for a
      known set of mocked status changes, including zero when nothing
      changed.

### Implementation for User Story 4

- [ ] T020 [US4] Implement `runAuditDigest(env, trigger)` in
      `routes.ts`: calls `computeChanges(db, twentyFourHoursAgo)` and
      returns `{ changeCount }`. Depends on T011.
- [ ] T021 [US4] **Integration point** (plan.md's Constitution Check):
      add this module's digest computation to the *existing* `scheduled`
      handler in `worker/index.ts`, as a seventh independent
      `ctx.waitUntil()` call alongside Modules 1-6's, logging
      `changeCount`. Depends on T020.

**Checkpoint**: All 4 user stories independently functional — Module 7,
and the constitution's full module roadmap, are feature-complete.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T022 [P] Run all 6 quickstart.md scenarios end-to-end against a
      real scratch Cloudflare test account with Modules 1-6 already
      deployed and evaluated at least once (real-account dependency,
      same as every prior module's equivalent task).
- [ ] T023 [P] Update the README's Status section to mark Module 7 as
      implemented. **No token-scope table changes** — this module
      requests no new scopes (research.md §6) — note that explicitly in
      the commit rather than silently adding nothing.
- [ ] T024 [P] `deno fmt` + `deno lint` pass across the new
      `worker/modules/audit/` and `AuditInventory.tsx` files.

---

## Dependencies & Execution Order

Same shape as Modules 1-6, adapted for this module's lack of an
`evaluate.ts`: Foundational blocks everything; `sources.ts` (T004) is
the one shared dependency every other implementation task builds on,
analogous to every prior module's `types.ts`; US4 depends on US2's
`computeChanges()`, built last.

### Parallel Opportunities

`[P]`-marked tests within each story in parallel; T007 (frontend)
parallel with T005/T006 (backend) within US1.

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

Both P1 — the unified inbox (US1) and the "what changed" digest (US2)
are the two capabilities the constitution names directly for this
module; the posture summary (US3) is a supporting overview, and the
scheduled digest (US4) only materializes US2's logic on a schedule.

### Incremental Delivery

1. Foundational → routing mount point ready.
2. US1 + US2 → MVP: unified inbox and change digest, the module's two
   headline capabilities.
3. US3 → adds the account-wide posture summary.
4. US4 → adds scheduled digest logging, joining the shared handler as a
   seventh independent evaluation. This is the final task across the
   entire constitution module roadmap.

---

## Notes

- T021 is the one task touching the shared `worker/index.ts` scheduled
  handler — review it with that in mind, same caveat as every prior
  module's equivalent task.
- Run `quickstart.md` in full (T022) before considering Module 7 — and
  the full seven-module roadmap — done. Same real-account caveat as
  every prior module.

---

## Phase 6: Convergence

- [ ] T025 Distinguish a genuine per-source D1 read failure from "no data
      yet"/"currently none" in the unified inbox, changes digest, and
      posture summary: track which of the fourteen sources' queries
      rejected in `worker/modules/audit/inbox.ts`
      (`queryUnifiedAlerts`), `worker/modules/audit/changes.ts`
      (`computeChanges`), and `worker/modules/audit/summary.ts`
      (`computePostureSummary`) — currently a `Promise.allSettled`
      rejection is silently treated identically to "this source has zero
      rows" — surface an explicit "not available" indicator per source
      in `GET /api/audit/alerts`, `/changes`, and `/summary`, and render
      it distinctly in `app/pages/AuditInventory.tsx`, per FR-010 /
      spec.md Edge Cases bullet 2 (partial)
