---

## description: "Task list for Pages Dashboard implementation"

# Tasks: Pages Dashboard

**Input**: Design documents from `/specs/015-pages-dashboard/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md), [quickstart.md](./quickstart.md)

**Tests**: Included and REQUIRED (constitution Principle VI).

**Organization**: Single user story (P1) — this spec's scope is small enough that splitting it into
multiple independently-shippable stories would be artificial; every column lands together.

---

## Phase 1: User Story 1 - One row per project, real domain/branch/build data (Priority: P1) 🎯 MVP

**Goal**: The Pages table shows one row per project with Production domain, Branch, Last build, and
the existing unchanged Health status.

**Independent Test**: quickstart.md Scenarios 1-3.

### Tests for User Story 1

- [x] T001 [P] [US1] Unit test in `tests/unit/pages-inventory.test.ts`: `listPagesProjects()` /
      `fetchProjectsWithDomains()` capture `production_branch`; `listProjectProductionDeployment()`
      captures `created_on` (research.md §1).
- [x] T002 [P] [US1] Unit test: a pure `deriveProductionDomain()` function — returns the first
      `safe`-status domain, or `null` when none are active (research.md §2, spec.md Edge Cases).
- [x] T003 [P] [US1] Playwright e2e test in `tests/e2e/pages-inventory.spec.ts`: one row per project
      (not per check); Production domain shows the real domain or "none"; Branch shows the real
      branch or "not set"; Last build shows success/failure/"no production deployment yet" as three
      distinct states; Health pill matches the existing subdomain-exposure status/reason unchanged.

### Implementation for User Story 1

- [x] T004 [US1] Add `worker/db/migrations/0011_pages_findings_add_branch_and_build_time.sql`: 2
      nullable columns across 2 existing tables (data-model.md).
- [x] T005 [P] [US1] Extend `worker/modules/pages/types.ts`: `PagesProjectInventoryItem` gains
      `productionBranch`, `ProductionDeployment` gains `createdOn`; `SubdomainEvaluation` gains
      `productionBranch`, `DeploymentEvaluation` gains `createdAt` (data-model.md).
- [x] T006 [US1] Extend `worker/modules/pages/inventory.ts`: capture `production_branch` from the
      existing projects-list fetch, `created_on` from the existing deployment fetch (research.md
      §1). Depends on T005.
- [x] T007 [US1] Extend `evaluateSubdomainExposures()`/`evaluateDeployments()` in `evaluate.ts` to
      carry `productionBranch`/`createdAt` through unchanged (pure pass-through, no new branch —
      status/reason logic itself is explicitly NOT touched, research.md §3). Depends on T005, T006.
- [x] T008 [US1] Extend `worker/modules/pages/routes.ts`: persist the 2 new columns in
      `runPagesEvaluation`'s INSERTs; in `GET /inventory`, derive `production_domain` (research.md
      §2) and assemble the new top-level `PagesProjectRow` convenience fields (contracts/api.md)
      alongside the existing `subdomain`/`deployment`/`domains` objects, unchanged. Depends on T004,
      T007.
- [x] T009 [US1] Rewrite `app/pages/PagesInventory.tsx`: one `FindingsTableRow` per project (removes
      the current per-check flattening), columns Project/Production domain/Branch/Last build, Health
      pill sourced from `health_status`/`health_reason` (unchanged values), reusing `FindingsTable`
      unchanged. Depends on T008.

**Checkpoint**: User Story 1 fully functional — Module 015 is feature-complete per spec.md (single-
story spec).

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T010 [P] Run all 3 quickstart.md scenarios end-to-end against a real scratch Cloudflare test
      account (real-account dependency, same as every prior module's equivalent task).
- [ ] T011 [P] `deno fmt` + `deno lint` pass across every touched file.

---

## Dependencies & Execution Order

Strictly sequential backend chain (T004→T005→T006→T007→T008), each building on the last; T009
(frontend) depends on T008. T001/T002/T003 (tests) can be written in parallel with each other ahead
of the implementation they'll verify, per constitution Principle VI's test-first requirement.

### Parallel Opportunities

T001/T002/T003 in parallel; T005 has no other file dependency so it can start immediately.

---

## Implementation Strategy

### Single Story (no phased MVP split)

Every column in this spec depends on the same small backend chain — there's no meaningful subset to
ship independently that wouldn't already require touching every file in T004-T008, so this spec is
organized as one story rather than artificially split (unlike specs 012-014's genuinely independent
user stories).

---

## Notes

- `evaluate.ts` is touched only to pass two new fields through (T007) — its actual
  safe/warning/critical/not_evaluated decision logic is explicitly unchanged; do not "improve" it as
  part of this spec (spec.md FR-003, research.md §3).
- Run `quickstart.md` in full (T010) before considering Module 015 done — same real-account caveat as
  every prior module.
