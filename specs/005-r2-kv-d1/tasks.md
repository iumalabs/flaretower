---

description: "Task list for R2 / KV / D1 module implementation"
---

# Tasks: R2 / KV / D1

**Input**: Design documents from `/specs/005-r2-kv-d1/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md), [quickstart.md](./quickstart.md)

**Tests**: Included and REQUIRED (constitution Principle VI).

**Organization**: By user story (US1 P1, US2 P1, US3 P2, US4 P2). No Setup
phase — reuses Modules 1-4's tooling entirely.

---

## Phase 1: Foundational (Blocking Prerequisites)

- [x] T001 [P] Create D1 migration `worker/db/migrations/0006_storage_findings.sql`
      for `r2_bucket_findings`, `r2_bucket_alerts`,
      `kv_namespace_findings`, `kv_namespace_alerts`,
      `d1_database_findings`, `d1_database_alerts` per data-model.md.
- [x] T002 Mount `/api/storage/*` in `worker/index.ts`'s Hono app, gated
      by the existing `accessAuth` middleware. Stub router until US1.

**Checkpoint**: D1 schema and routing mount point exist.

---

## Phase 2: User Story 1 - Full inventory (Priority: P1) 🎯 MVP

**Goal**: Every R2 bucket, KV namespace, and D1 database listed, grouped
by type, none omitted.

**Independent Test**: quickstart.md Scenario 1.

### Tests for User Story 1

- [x] T003 [P] [US1] Unit test in `tests/unit/storage-inventory.test.ts`
      (mocked `fetch`): buckets, namespaces, and databases are correctly
      enumerated, including a total failure of any one list surfacing a
      sentinel entry rather than an empty (confirmed-zero) list.
- [x] T004 [P] [US1] Playwright e2e test in
      `tests/e2e/storage-inventory.spec.ts` (mocked
      `GET /api/storage/inventory`): every bucket, namespace, and
      database renders, none omitted.

### Implementation for User Story 1

- [x] T005 [P] [US1] Implement `worker/modules/storage/types.ts` and
      `inventory.ts`: list R2 buckets
      (`GET /accounts/{account_id}/r2/buckets`), list KV namespaces
      (`GET /accounts/{account_id}/storage/kv/namespaces`), list D1
      databases (`GET /accounts/{account_id}/d1/database`) per
      research.md §1-§2.
- [x] T006 [US1] Implement basic `evaluateBucketExposure()`,
      `evaluateKvNamespaceUsage()`, `evaluateD1DatabaseUsage()` in
      `worker/modules/storage/evaluate.ts`: returns `not_evaluated` on an
      evaluationError, `safe` otherwise for now (US2/US3 extend the real
      branches). Depends on T005's types.
- [x] T007 [US1] Implement `GET /api/storage/inventory` in
      `worker/modules/storage/routes.ts`. Depends on T005, T006.
- [x] T008 [US1] Implement `POST /api/storage/evaluate`: runs inventory +
      evaluate, persists to `r2_bucket_findings`,
      `kv_namespace_findings`, `d1_database_findings`. Depends on T001,
      T006.
- [x] T009 [P] [US1] Build `app/pages/StorageInventory.tsx`, reusing
      `ExposureStatusBadge` unchanged, with three sections (buckets,
      namespaces, databases). Add a fifth nav entry to `app/App.tsx`.
- [x] T010 [US1] Wire `routes.ts` into the `/api/storage` mount from
      T002.

**Checkpoint**: User Story 1 fully functional and independently testable.

---

## Phase 3: User Story 2 - R2 bucket exposure flag (Priority: P1)

**Goal**: A bucket with its `r2.dev` domain enabled, or an enabled custom
domain not covered (or covered by an open policy), is flagged.

**Independent Test**: quickstart.md Scenario 2.

### Tests for User Story 2

- [x] T011 [P] [US2] Unit test: `r2.dev` enabled → critical; enabled
      custom domain uncovered by any Access application → critical;
      covered by an Allow-Everyone/Bypass/zero-policy application →
      warning; covered by a scoped-policy application, or no public
      access configured at all → safe (same distinctions Module 1 and
      Module 4 already established).
- [ ] T012 [P] [US2] Playwright e2e test: the critical, warning, and safe
      bucket-exposure badges render distinctly for mocked buckets.

### Implementation for User Story 2

- [x] T013 [US2] Extend `worker/modules/storage/inventory.ts` to fetch,
      per bucket, its managed (`r2.dev`) and custom domain configuration
      (research.md §1), and to independently fetch Access applications
      (`GET /accounts/{account_id}/access/apps`) per research.md §4.
- [x] T014 [US2] Implement the hostname-coverage and policy-openness
      decision logic in `evaluate.ts` (research.md §4 — local
      re-implementation, not imported from Module 1 or Module 4) and
      wire it into `evaluateBucketExposure()`, replacing US1's stub.
      Persist real values in `POST /api/storage/evaluate` (T008) and
      surface them in `GET /api/storage/inventory` (T007).

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 4: User Story 3 - KV/D1 unused-resource flag (Priority: P2)

**Goal**: A KV namespace or D1 database not referenced by any deployed
Worker's bindings is flagged; one that is referenced is safe.

**Independent Test**: quickstart.md Scenario 3.

### Tests for User Story 3

- [x] T015 [P] [US3] Unit test: a namespace/database id present in some
      script's bindings → safe; absent from every successfully-checked
      script's bindings → warning; absent AND at least one script's
      bindings call failed (so absence can't be fully confirmed) →
      not_evaluated (research.md §3's partial-failure rule).
- [x] T016 [P] [US3] Playwright e2e test: the safe and warning
      usage badges render distinctly for mocked namespaces/databases.

### Implementation for User Story 3

- [x] T017 [US3] Extend `worker/modules/storage/inventory.ts` to list
      Worker scripts (`GET /accounts/{account_id}/workers/scripts`) and
      each script's bindings
      (`GET /accounts/{account_id}/workers/scripts/{name}/bindings`),
      building the referenced-KV-namespace-id and
      referenced-D1-database-id sets plus the set of scripts whose
      bindings call failed, per research.md §3.
- [x] T018 [US3] Implement the real usage-check branch in
      `evaluateKvNamespaceUsage()`/`evaluateD1DatabaseUsage()`, replacing
      US1's stubs. Persist real values in `POST /api/storage/evaluate`
      (T008) and surface them in `GET /api/storage/inventory` (T007).

**Checkpoint**: All three status-detection stories independently
functional.

---

## Phase 5: User Story 4 - Scheduled drift alerting (Priority: P2)

**Goal**: Scheduled evaluation joins the existing shared handler; alerts
on new bucket-exposure or namespace/database-usage findings, no repeats.

**Independent Test**: quickstart.md Scenario 4.

### Tests for User Story 4

- [x] T019 [P] [US4] Unit test in `tests/unit/storage-alerts.test.ts`:
      first-run alerting, no-repeat on unchanged state, transitions, for
      all three diff functions (buckets, KV namespaces, D1 databases —
      three separate diff functions per data-model.md's three-table
      design).

### Implementation for User Story 4

- [x] T020 [US4] Implement `worker/modules/storage/alerts.ts` — three
      diff functions (`diffForBucketAlerts`, `diffForKvNamespaceAlerts`,
      `diffForD1DatabaseAlerts`), same new-vs-repeat semantics as every
      prior module.
- [x] T021 [US4] **Integration point** (plan.md's Constitution Check):
      add this module's evaluation + alert-diffing to the *existing*
      `scheduled` handler in `worker/index.ts`, as a fifth independent
      `waitUntil` call alongside Modules 1-4's. Depends on T008, T014,
      T018, T020.
- [x] T022 [US4] Implement `GET /api/storage/alerts` (merges all three
      alert tables with a `kind` discriminator per contracts/api.md).
      Depends on T020.
- [x] T023 [US4] Implement
      `POST /api/storage/alerts/:kind/:id/acknowledge` (routes to the
      matching table based on `:kind`). Depends on T020.

**Checkpoint**: All 4 user stories independently functional — Module 5 is
feature-complete per spec.md.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T024 [P] Run all 6 quickstart.md scenarios end-to-end against a real
      scratch Cloudflare test account (real-account dependency, same as
      every prior module's equivalent task).
- [x] T025 [P] Add this module's required token scopes (`Workers R2
      Storage Read`, `Workers KV Storage Read`, `D1 Read` — all new;
      `Workers Scripts Read` and `Access: Apps and Policies Read` are
      already documented) to the README.
- [x] T026 [P] `deno fmt` + `deno lint` pass across the new
      `worker/modules/storage/` and `StorageInventory.tsx` files.

---

## Dependencies & Execution Order

Same shape as Modules 1-4: Foundational blocks everything; US1 creates
the shared `evaluate.ts`/`inventory.ts` that US2/US3 extend; US4 depends
on US1's persistence and US2/US3's complete evaluation, built last.

### Parallel Opportunities

T001/T002 in parallel; `[P]`-marked tests within each story in parallel;
T009 (frontend) parallel with T007/T008 (backend) within US1.

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

Both P1 — an inventory without the R2 exposure flag doesn't yet deliver
this module's headline value, same reasoning as every prior module.

### Incremental Delivery

1. Foundational → foundation ready.
2. US1 + US2 → MVP: full inventory with R2 exposure detection.
3. US3 → adds KV/D1 unused-resource detection.
4. US4 → adds scheduled drift alerting, joining the shared handler as a
   fifth independent evaluation.

---

## Notes

- T021 is the one task touching the shared `worker/index.ts` scheduled
  handler — review it with that in mind, same caveat as every prior
  module's equivalent task.
- Run `quickstart.md` in full (T024) before considering Module 5 done —
  same real-account caveat as every prior module.
