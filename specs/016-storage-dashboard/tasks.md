---

## description: "Task list for Storage Dashboard implementation"

# Tasks: Storage Dashboard

**Input**: Design documents from `/specs/016-storage-dashboard/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md),
[quickstart.md](./quickstart.md)

**Tests**: Included and REQUIRED (constitution Principle VI).

**Organization**: 3 independently-shippable user stories (P1/P2/P3) — each adds columns to a
different, non-overlapping slice of the existing 3 grouped tables.

---

## Phase 1: Foundational (blocking prerequisite for all stories)

- [x] T001 Add `worker/db/migrations/0012_storage_findings_add_bindings_and_d1_detail.sql`: 6
      nullable columns across the 3 existing storage findings tables (data-model.md).

**Checkpoint**: Migration exists; every story's `routes.ts` work can now persist its new columns.

---

## Phase 2: User Story 1 - See who actually uses a storage resource (Priority: P1) 🎯 MVP

**Goal**: Every R2 bucket, KV namespace, and D1 database row shows which deployed Worker(s)
reference it.

**Independent Test**: quickstart.md Scenario 1.

### Tests for User Story 1

- [x] T002 [P] [US1] Unit test in `tests/unit/storage-inventory.test.ts`: `buildBindingReferences()`
      preserves referencing Worker names per resource (KV namespace id, D1 database uuid, R2 bucket
      name — matched by name, not id, for R2 per research.md §2), including a resource referenced by
      multiple Workers and one referenced by zero.
- [x] T003 [P] [US1] Unit test in `tests/unit/storage-routes.test.ts` (NEW file): `boundToLabel()` —
      `"none"` for empty, the single name for length 1, `"N workers"` for length > 1
      (data-model.md).
- [x] T004 [P] [US1] Playwright e2e test extending `tests/e2e/storage-inventory.spec.ts`: the Bound
      to column shows the correct Worker name, count, or "none" state across all 3 tables (spec.md
      Acceptance Scenarios 1-3).

### Implementation for User Story 1

- [x] T005 [US1] Extend `worker/modules/storage/types.ts`: `BindingReferences` gains 3
      `Map<string, string[]>` fields (`kvNamespaceBoundTo`, `d1DatabaseBoundTo`, `r2BucketBoundTo`);
      `BucketEvaluation`/`KvNamespaceEvaluation`/`D1DatabaseEvaluation` gain
      `boundToWorkers: string[]` (data-model.md).
- [x] T006 [US1] Extend `worker/modules/storage/inventory.ts`'s `buildBindingReferences()`: populate
      the 3 new Maps alongside the existing (unchanged) flat Sets; recognize `r2_bucket`-typed
      bindings (`bucket_name` field) for the first time — additive only, no existing Set/decision
      logic touched (research.md §2). Depends on T005.
- [x] T007 [US1] Extend `evaluateBucketExposure()`/`evaluateKvNamespaceUsage()`/
      `evaluateD1DatabaseUsage()` in `evaluate.ts` to accept and pass through `boundToWorkers`
      unchanged (pure pass-through — status/reason decision logic itself is explicitly NOT touched,
      research.md §2, spec.md FR-004). Depends on T005, T006.
- [x] T008 [US1] Extend `worker/modules/storage/routes.ts`: persist `bound_to_workers` (JSON) in all
      3 `runStorageEvaluation()` INSERTs; add `boundToLabel()` pure helper; in
      `GET
      /inventory`, parse the stored array and include both `bound_to_workers` and the
      derived `bound_to` label in every row (contracts/api.md). Depends on T001, T006, T007.
- [x] T009 [US1] Extend `app/pages/StorageInventory.tsx`: add a "Bound to" column to all 3 tables;
      update the page's summary line to drop any fabricated total-size figure and show only real,
      computable numbers (resource count, publicly-exposed count — FR-006). Depends on T008.

**Checkpoint**: User Story 1 fully functional and independently shippable.

---

## Phase 3: User Story 2 - See an R2 bucket's public-facing domain at a glance (Priority: P2)

**Goal**: The R2 buckets table shows each bucket's custom domain directly.

**Independent Test**: quickstart.md Scenario 2.

### Tests for User Story 2

- [x] T010 [P] [US2] Unit test in `tests/unit/storage-evaluate.test.ts`: `evaluateBucketExposure()`
      derives `customDomain` as the first _enabled_ domain among `bucket.customDomains`, or `null`
      when none are enabled (research.md §3, spec.md Edge Cases).
- [x] T011 [P] [US2] Playwright e2e test extending `tests/e2e/storage-inventory.spec.ts`: the Custom
      domain column shows the real domain or an explicit "none" state (spec.md Acceptance Scenarios
      1-2).

### Implementation for User Story 2

- [x] T012 [US2] Extend `worker/modules/storage/types.ts`: `BucketEvaluation` gains
      `customDomain: string | null` (data-model.md). Depends on T005 (same file as US1).
- [x] T013 [US2] Extend `evaluateBucketExposure()` in `evaluate.ts`: compute `customDomain` once
      (first enabled domain, or `null`) and thread it into every existing return branch unchanged.
      Depends on T007, T012.
- [x] T014 [US2] Extend `worker/modules/storage/routes.ts`: persist `custom_domain` in the bucket
      INSERT; include it in the `GET /inventory` bucket rows. Depends on T001, T008, T013.
- [x] T015 [US2] Extend `app/pages/StorageInventory.tsx`: add a "Custom domain" column to the R2
      buckets table only. Depends on T014.

**Checkpoint**: User Story 2 fully functional and independently shippable.

---

## Phase 4: User Story 3 - See a D1 database's real size and table count (Priority: P3)

**Goal**: The D1 databases table shows each database's real table count and on-disk size.

**Independent Test**: quickstart.md Scenario 3.

### Tests for User Story 3

- [x] T016 [P] [US3] Unit test in `tests/unit/storage-inventory.test.ts`: a new
      `getD1DatabaseDetail()` maps `num_tables`/`file_size`; a per-database detail-fetch failure
      yields `numTables`/`fileSizeBytes` both `undefined`, never a thrown error that blocks the rest
      of the inventory build (research.md §1, spec.md Edge Cases).
- [x] T017 [P] [US3] Playwright e2e test extending `tests/e2e/storage-inventory.spec.ts`: the
      Tables/Size columns show real values, and an explicit "not available" state when the detail
      fetch failed (spec.md Acceptance Scenario 1, Edge Cases).

### Implementation for User Story 3

- [x] T018 [US3] Extend `worker/modules/storage/types.ts`: `D1DatabaseInventoryItem` gains
      `numTables?: number`, `fileSizeBytes?: number`; `D1DatabaseEvaluation` gains
      `numTables: number | null`, `fileSizeBytes: number | null` (data-model.md).
- [x] T019 [US3] Extend `worker/modules/storage/inventory.ts`: new `getD1DatabaseDetail()` calling
      `GET /accounts/{id}/d1/database/{id}` (research.md §1); wire it into
      `buildStorageInventory()`, one call per discovered D1 database, same
      `mapWithConcurrency`-capped pattern already used for buckets. Depends on T018.
- [x] T020 [US3] Extend `evaluateD1DatabaseUsage()` in `evaluate.ts`: thread
      `numTables`/`fileSizeBytes` through unchanged (pure pass-through, `null` when the detail fetch
      failed — usage decision logic itself is explicitly NOT touched). Depends on T018, T019.
- [x] T021 [US3] Extend `worker/modules/storage/routes.ts`: persist `num_tables`/`file_size` in the
      D1 INSERT; include them in the `GET /inventory` D1 rows. Depends on T001, T008, T020.
- [x] T022 [US3] Extend `app/pages/StorageInventory.tsx`: add "Tables"/"Size" columns to the D1
      databases table only, with a byte-size formatting helper (e.g. "840 MB"). Depends on T021.

**Checkpoint**: User Story 3 fully functional and independently shippable — Module 016 is
feature-complete per spec.md.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T023 [P] Run all 3 quickstart.md scenarios end-to-end against a real scratch Cloudflare test
      account (real-account dependency, same as every prior module's equivalent task).
- [x] T024 [P] `deno fmt` + `deno lint` pass across every touched file.

---

## Dependencies & Execution Order

T001 (migration) blocks every story's `routes.ts` task (T008, T014, T021). Within each story, the
usual chain applies: types → inventory → evaluate → routes → frontend. The 3 stories touch
non-overlapping columns of the same 3 files (`types.ts`/`evaluate.ts`/`routes.ts`/
`StorageInventory.tsx`), so they are conceptually independent but should land sequentially
story-by-story to avoid merge churn within a single PR (unlike specs 012-014's genuinely parallel
stories across separate files).

### Parallel Opportunities

Every story's test tasks (T002-T004, T010-T011, T016-T017) can be written in parallel with each
other ahead of the implementation they verify, per constitution Principle VI's test-first
requirement. T023/T024 in the Final Phase are independent of each other.

---

## Implementation Strategy

### MVP First

User Story 1 (Bound to, P1) is the MVP — it touches all 3 tables and is the highest-value story
(spec.md's own priority rationale). User Stories 2 and 3 are strictly additive columns on top, each
independently shippable and independently testable without the other.

---

## Notes

- `evaluate.ts` is touched only to pass new fields through (T007, T013, T020) — its actual
  safe/warning/critical/not_evaluated decision logic is explicitly unchanged across all 3 stories;
  do not "improve" it as part of this spec (spec.md FR-004, research.md §2/§6).
- R2 Objects/Size and KV Keys/Size are explicitly out of scope — do not add them even if a future
  task seems to invite it (research.md §4).
- Run `quickstart.md` in full (T023) before considering Module 016 done — same real-account caveat
  as every prior module.
