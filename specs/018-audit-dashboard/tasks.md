---

## description: "Task list for Audit Dashboard implementation"

# Tasks: Audit Dashboard

**Input**: Design documents from `/specs/018-audit-dashboard/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md),
[quickstart.md](./quickstart.md)

**Tests**: Included and REQUIRED (constitution Principle VI). Frontend-only pure helpers (source
filter, JSONL export) are covered via Playwright only, matching this rollout's established precedent
(e.g. specs 016/017's frontend-only formatting helpers had no separate Deno unit test).

**Organization**: 3 independently-shippable user stories (P1/P2/P3) — the Audit log panel itself, a
source filter, and a JSONL export.

---

## Phase 1: User Story 1 - See real account activity, not just this project's own findings (Priority: P1) 🎯 MVP

**Goal**: The Audit & Drift page shows a new panel listing real Cloudflare account activity from the
last 7 days, alongside the existing 3 unchanged sections.

**Independent Test**: quickstart.md Scenario 1.

### Tests for User Story 1

- [x] T001 [P] [US1] Unit test in `tests/unit/audit-routes.test.ts` (NEW file): `GET /log` calls
      `fetchAccountAuditLog()` with `since` = 7 days before now, maps entries to the response shape,
      and returns `unavailable: true` with `entries: []` (not a thrown error) when the underlying
      call rejects (contracts/api.md, spec.md FR-003).
- [x] T002 [P] [US1] Playwright e2e test extending `tests/e2e/audit-inventory.spec.ts`: the Audit
      log panel shows real entries (time/actor/action/target/result); confirmed-zero-activity and
      unavailable states render distinctly; the existing 3 sections are still present and unchanged
      (spec.md Acceptance Scenarios 1-3, FR-008).

### Implementation for User Story 1

- [x] T003 [US1] Extend `worker/modules/audit/routes.ts`: add `GET /log`, importing
      `fetchAccountAuditLog()` from `worker/modules/workers-dashboard/audit-log.ts` unmodified
      (research.md §1); `Env` gains `CF_ACCOUNT_ID`/`CF_API_TOKEN` (this route file's first
      Cloudflare API call — every other endpoint here only reads D1).
- [x] T004 [US1] Extend `app/pages/AuditInventory.tsx`: add an "Audit log" panel — a plain table (no
      `FindingsTable`/status pill, research.md §3), fetching `GET /api/audit/log`; an explicit empty
      state distinct from an explicit unavailable state (spec.md Edge Cases). Depends on T003.

**Checkpoint**: User Story 1 fully functional and independently shippable.

---

## Phase 2: User Story 2 - Narrow the feed to a real activity source (Priority: P2)

**Goal**: The Audit log panel can be filtered to All sources / Dashboard / API.

**Independent Test**: quickstart.md Scenario 2.

### Tests for User Story 2

- [x] T005 [P] [US2] Playwright e2e test extending `tests/e2e/audit-inventory.spec.ts`: selecting
      "Dashboard" shows only dashboard-sourced entries; selecting "API" shows only API-sourced
      entries; "All sources" shows every entry again (spec.md Acceptance Scenarios 1-2).

### Implementation for User Story 2

- [x] T006 [US2] Extend `app/pages/AuditInventory.tsx`: add a client-side source filter (All /
      Dashboard / API only — research.md §2, spec.md FR-004/FR-005) over the already-fetched Audit
      log entries. Depends on T004.

**Checkpoint**: User Story 2 fully functional and independently shippable.

---

## Phase 3: User Story 3 - Export the visible entries (Priority: P3)

**Goal**: The operator can download the currently-filtered Audit log entries as JSONL.

**Independent Test**: quickstart.md Scenario 3.

### Tests for User Story 3

- [x] T007 [P] [US3] Playwright e2e test extending `tests/e2e/audit-inventory.spec.ts`: triggering
      the export with a filter applied produces a download whose content matches exactly the
      currently-visible (filtered) entries, one JSON object per line (spec.md Acceptance Scenario
      1).

### Implementation for User Story 3

- [x] T008 [US3] Extend `app/pages/AuditInventory.tsx`: add an "Export JSONL" action — client-side
      serialization of the currently-filtered entries into a downloaded file (research.md §5,
      spec.md FR-006/FR-007 — no new backend endpoint, no Cloudflare API call). Depends on T006.

**Checkpoint**: User Story 3 fully functional and independently shippable — Module 018 is
feature-complete per spec.md. This is also the last spec of the 7-module dashboard rollout.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T009 [P] Run all 3 quickstart.md scenarios end-to-end against a real scratch Cloudflare test
      account (real-account dependency, same as every prior module's equivalent task).
- [x] T010 [P] `deno fmt` + `deno lint` pass across every touched file.

---

## Dependencies & Execution Order

No migration, no blocking foundational phase (research.md §6 — nothing persisted). T003 (backend
route) blocks T004 (frontend fetch); T004 blocks T006 (filter operates on already-rendered entries);
T006 blocks T008 (export operates on the already-filtered view). Tests within each story can be
written in parallel with each other ahead of that story's implementation, per constitution Principle
VI's test-first requirement.

### Parallel Opportunities

T001/T002 in parallel; T005 and T007 are each independent of the other stories' tests. T009/T010 in
the Final Phase are independent of each other.

---

## Implementation Strategy

### MVP First

User Story 1 (the Audit log panel itself, P1) is the MVP — it delivers this feature's entire value
proposition (a real account-activity feed) with zero new Cloudflare API calls. User Stories 2 and 3
are strictly additive UI conveniences on top.

---

## Notes

- This is the last of the 7-spec per-module dashboard rollout (012-018).
- `fetchAccountAuditLog()` (`worker/modules/workers-dashboard/audit-log.ts`) is reused completely
  unmodified — do not edit that file as part of this spec (research.md §1).
- No Wrangler/Terraform filter values, no date-range picker beyond the fixed 7-day window
  (research.md §2/§4) — do not add these even if a future task seems to invite them.
- Run `quickstart.md` in full (T009) before considering Module 018 — and the whole rollout — done.
