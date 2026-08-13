---

## description: "Task list for Audit Operator Role Changes implementation"

# Tasks: Audit Operator Role Changes

**Input**: Design documents from `/specs/019-audit-role-changes/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: Included and REQUIRED (constitution Principle VI).

**Organization**: Single user story (P1) — this spec has exactly one user story; there is no
independently-shippable smaller slice, so this is organized as one phase rather than split
artificially (matching spec 015's precedent).

---

## Phase 1: User Story 1 - An operator's role change leaves a permanent record (Priority: P1) 🎯 MVP

**Goal**: Every completed `POST /api/identity/users/:sub/role` call writes a matching `audit_log`
row (actor, target, before role, after role, timestamp), atomically with the role change itself.

**Independent Test**: quickstart.md Scenarios 1-5.

### Tests for User Story 1

- [x] T001 [P] [US1] Unit test in `tests/unit/identity-users.test.ts`: `setOperatorRole(db,
      actorSub, sub, role)` — on a found operator, batches exactly one `UPDATE users SET role`
      statement and one `INSERT INTO audit_log` statement via `db.batch()`, with `actor_sub` equal
      to `actorSub`, `action = "identity.role_change"`, `before_json = {sub, role: <old role>}`,
      `after_json = {sub, role: <new role>}` (data-model.md).
- [x] T002 [P] [US1] Unit test: a no-op role submission (target's current role equals the requested
      role) still produces both statements — `before_json.role === after_json.role` (spec.md Edge
      Cases, research.md §4).
- [x] T003 [P] [US1] Unit test: `setOperatorRole()` for a `sub` with no matching row returns
      `{outcome: "not_found"}` and calls `db.batch()` zero times (spec.md FR-004).
- [x] T004 [P] [US1] Unit test: self-role-change (`actorSub === sub`) — `actor_sub` and the `sub`
      inside `before_json`/`after_json` are the same value (spec.md FR-005).
- [x] T005 [P] [US1] Unit test: when `db.batch()` rejects, `setOperatorRole()`'s returned promise
      rejects too (propagates, doesn't swallow) — proves there is no separate code path that could
      apply the role `UPDATE` outside the atomic batch (spec.md FR-002/SC-002, research.md §2).
- [x] T006 [P] [US1] Extend `tests/unit/identity-routes.test.ts`'s mock D1: add a `batch()` method
      (awaits each statement's existing `run()`) and an in-memory `audit_log` array populated by an
      `INSERT INTO audit_log` match in `run()`, so the existing `POST /users/:sub/role` route tests
      keep passing against the now-batched write.
- [x] T007 [P] [US1] Unit test in `tests/unit/identity-routes.test.ts`: `POST /users/:sub/role`
      passes the calling admin's `c.get("identity").sub` through as `setOperatorRole()`'s
      `actorSub` — confirmed via the extended mock's captured `audit_log` row's `actor_sub`.

### Implementation for User Story 1

- [x] T008 [US1] Widen `setOperatorRole()`'s existence check in
      `worker/modules/identity/users.ts` from `SELECT sub FROM users WHERE sub = ?` to `SELECT sub,
      role FROM users WHERE sub = ?`, and add an `actorSub: string` parameter to the function
      signature (data-model.md). Depends on T001-T005 (tests written and failing first).
- [x] T009 [US1] In `setOperatorRole()`, on a found operator, build the existing `UPDATE users SET
      role = ? WHERE sub = ?` statement (unchanged SQL) plus a `writeAuditEntry()`
      (`worker/audit-log.ts`, already exists and is otherwise unmodified) call with `actorSub`,
      `action: "identity.role_change"`, `beforeJson: {sub, role: <row.role>}`, `afterJson: {sub,
      role}`; batch both via `db.batch([...])` and let any rejection propagate. Depends on T008.
- [x] T010 [US1] Update `worker/modules/identity/routes.ts`'s `POST /users/:sub/role` handler to
      read `c.get("identity").sub` and pass it as `setOperatorRole()`'s new `actorSub` argument.
      Depends on T009.

**Checkpoint**: User Story 1 fully functional — every completed role change now has a matching
`audit_log` record, atomically.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [x] T011 [P] `deno fmt` + `deno lint` pass across every touched file.
- [ ] T012 [P] Run all 5 quickstart.md scenarios end-to-end against a real scratch Cloudflare test
      account (real-account dependency, same as every prior module's equivalent task) — note this
      feature is D1-only, so this is really "against a real deployed Worker + its D1," not a
      Cloudflare-API dependency like every other module's version of this task.

---

## Dependencies & Execution Order

Strictly sequential implementation chain (T008→T009→T010), each building on the last. T001-T007
(tests) can be written in parallel with each other, ahead of the implementation they verify, per
constitution Principle VI's test-first requirement — but T006 (mock D1 extension) must land before
T007 can be written against it, since T007 asserts against the mock's new `audit_log` capture.

### Parallel Opportunities

T001-T005 (identity-users.test.ts) in parallel with each other and with T006 (mock D1 extension);
T007 depends on T006 landing first (same file, sequential).

---

## Implementation Strategy

### Single Story (no phased MVP split)

The entire feature is one small, atomic change to one function and its one call site — there's no
subset of it that would be independently valuable to ship alone, so (like spec 015) this is one
story rather than an artificial split.

---

## Notes

- No new D1 migration — reuses the existing `audit_log` table from `0001_baseline.sql` unmodified
  (data-model.md).
- No new Cloudflare API token scope — this feature never calls the Cloudflare API (plan.md
  Technical Context).
- No new frontend/Playwright coverage — `POST /api/identity/users/:sub/role` has no existing UI
  page (API-only today), and this feature adds an internal side effect with no response-shape
  change (plan.md Constitution Check, principle VI row).
- `writeAuditEntry()` (`worker/audit-log.ts`) is reused completely unmodified — this feature is
  simply its first real caller (research.md §1).
