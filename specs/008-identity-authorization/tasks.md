---

## description: "Task list for Identity, Authorization & Audit Data Model implementation"

# Tasks: Identity, Authorization & Audit Data Model

**Input**: Design documents from `/specs/008-identity-authorization/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md),
[quickstart.md](./quickstart.md)

**Tests**: Included and REQUIRED (constitution Principle VI).

**Organization**: By user story (US1 P1, US2 P2), plus one non-story phase for FR-010's audit-log
mechanism (no demonstrable user-facing flow exists yet — spec.md Assumptions). No D1 migration
anywhere — this feature adds no tables (research.md §1).

---

## Phase 1: Foundational (Blocking Prerequisite)

- [ ] T001 Mount `/api/identity/*` in `worker/index.ts`'s Hono app, gated by the existing
      `accessAuth` middleware. Stub router until US2.

**Checkpoint**: Routing mount point exists.

---

## Phase 2: User Story 1 - Returning operators are recognized across visits (Priority: P1) 🎯 MVP

**Goal**: Every authenticated identity gets a persistent `users` row — created on first sight (with
best-effort IdP enrichment and first-user auto-elevation), refreshed on every return visit — and the
request's identity context carries that operator's current `role`.

**Independent Test**: quickstart.md Scenarios 1-3.

### Tests for User Story 1

- [ ] T002 [P] [US1] Unit test in `tests/unit/identity-users.test.ts` (mocked `D1Database`): a
      never-seen `sub` creates a new row with `created_at === last_seen_at`; a known `sub` updates
      `last_seen_at`/`email` without creating a duplicate row; the very first operator ever gets
      `role: "admin"`, every operator after that gets `role: "member"`; a failing/malformed
      `get-identity` response still creates the operator, with `idp: "unknown"`, and never throws.

### Implementation for User Story 1

- [ ] T003 [US1] Implement `worker/modules/identity/users.ts`:
      `upsertOperator(db, {sub, email},
      fetchIdp)` — the two-step select-then-insert/update
      logic (research.md §3), decoupled from the auth middleware for testability.
- [ ] T004 [P] [US1] Implement a best-effort `fetchIdentityProvider(teamDomain, jwt)` helper: calls
      `GET {teamDomain}/cdn-cgi/access/get-identity` with `Cookie: CF_Authorization={jwt}`, returns
      `.idp.type` on success, `"unknown"` on any failure (non-200, network error, unexpected shape)
      — never throws (research.md §2).
- [ ] T005 [US1] Wire `worker/auth/access-jwt.ts`'s `accessAuth` to call `upsertOperator()` (using
      T004's helper only on the new-operator path) after JWT validation succeeds; extend
      `AccessIdentity` to `{ sub, email, role }` and attach the resolved role to the request context
      (data-model.md's Identity Context). Depends on T003, T004.

**Checkpoint**: User Story 1 fully functional and independently testable — operators are recognized
and persisted, `role` is resolved on every request, even though nothing gates on it yet.

---

## Phase 3: User Story 2 - Mutating actions require FlareTower's own permission check (Priority: P2)

**Goal**: A `member` operator cannot acknowledge an alert; an `admin` operator can, can view the
operator roster, and can promote/demote other operators.

**Independent Test**: quickstart.md Scenario 4.

### Tests for User Story 2

- [ ] T006 [P] [US2] Unit test in `tests/unit/identity-routes.test.ts` (mocked `D1Database`):
      `GET /users` returns the roster for an `admin` caller; `POST /users/:sub/role` returns `400`
      for an invalid `role` value, `404` for an unknown `sub`, and `200` with the updated role
      otherwise.
- [ ] T007 [P] [US2] Playwright e2e test in `tests/e2e/acknowledge-authorization.spec.ts` (mocked
      identity/role and acknowledge endpoints): a `member`-role operator's acknowledge action is
      rejected and the UI reflects the alert as still outstanding; an `admin`-role operator's
      acknowledge action succeeds exactly as it does today.

### Implementation for User Story 2

- [ ] T008 [US2] Implement a `requireRole("admin")` Hono middleware (research.md §4): reads
      `c.get("identity").role` (already resolved by `accessAuth`, no new D1 call) and returns `403`
      if it doesn't match.
- [ ] T009 [P] [US2] Add `listOperators(db)` and `setOperatorRole(db, sub, role)` to
      `worker/modules/identity/users.ts`. Depends on T003 (same file).
- [ ] T010 [US2] Implement `GET /api/identity/users` and `POST /api/identity/users/:sub/role` in
      `worker/modules/identity/routes.ts`, both gated by `requireRole("admin")`. Depends on T008,
      T009.
- [ ] T011 [US2] Wire `worker/modules/identity/routes.ts` into the `/api/identity` mount from T001.
      Depends on T010.
- [ ] T012 [US2] Apply `requireRole("admin")` to all 7 existing `POST .../alerts/.../acknowledge`
      endpoints —
      `worker/modules/{workers-access-exposure,dns,
      zero-trust,pages,storage,security,audit}/routes.ts`
      — per FR-007–FR-009, with no other behavior change for an already-`admin` caller. Depends on
      T008.

**Checkpoint**: User Stories 1 and 2 both work independently — permission-gated acknowledge, working
promotion and roster endpoints.

---

## Phase 4: Audit-log write mechanism (FR-010 — no associated user story)

**Goal**: `writeAuditEntry()` exists, is correctly shaped, and is unit-tested — ready for the first
future Cloudflare-account-mutating module to include in its own `db.batch()`. Not wired to anything
yet; no demonstrable end-to-end flow exists (spec.md Assumptions), so this phase has no `[US#]`
label and no e2e test.

- [ ] T013 [P] Unit test in `tests/unit/audit-log.test.ts` (mocked `D1Database`):
      `writeAuditEntry(db, {actorSub, action, beforeJson, afterJson})` returns a
      `D1PreparedStatement` whose bound values match the given arguments.
- [ ] T014 Implement `worker/audit-log.ts`: `writeAuditEntry()` per research.md §6 — builds and
      returns the prepared statement, does not execute it (the caller includes it in their own
      `db.batch()`).

**Checkpoint**: All of this feature's functional requirements (FR-001–FR-011) are implemented.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T015 [P] Run all 6 quickstart.md scenarios end-to-end against a real Cloudflare test account
      with FlareTower deployed behind a real Access application and at least two distinct
      authenticated identities available (real-environment dependency, same as every prior module's
      equivalent task — here the requirement is real Access identities, not Cloudflare API
      credentials, since this feature calls no Cloudflare account API).
- [ ] T016 [P] Add a short "Identity & Roles" note to the README: the first operator to ever
      authenticate becomes `admin` automatically; promoting others is via
      `POST /api/identity/users/:sub/role` (no UI yet — FR-006/FR-011). **No new token-scope table
      changes** — this feature requests no new Cloudflare API scopes (research.md §8) — note that
      explicitly in the commit rather than silently adding nothing.
- [ ] T017 [P] `deno fmt` + `deno lint` pass across `worker/modules/identity/`,
      `worker/auth/access-jwt.ts`, `worker/audit-log.ts`, and the 7 modified acknowledge routes.

---

## Dependencies & Execution Order

Foundational (T001) blocks everything. Within US1: T003/T004 are independent of each other, T005
depends on both. US2 depends on US1 being complete (needs `role` resolved in the identity context) —
T008 is standalone; T009 extends the same file as T003; T010 depends on T008+T009; T011 depends on
T010; T012 depends only on T008 and can run in parallel with T009-T011. Phase 4 (T013-T014) has no
dependency on US1/US2 and could technically run in parallel with either, but is sequenced last here
since it's the lowest-priority deliverable.

### Parallel Opportunities

`[P]`-marked tasks within each phase; T004 (IdP helper) parallel with T003 (upsert core) within US1;
T012 (retrofitting the 7 acknowledge routes) parallel with T009-T011 (identity module routes) within
US2, since they touch disjoint files.

---

## Implementation Strategy

### MVP First (User Story 1)

Operator recognition alone (US1) already delivers standalone value — a roster of who has used
FlareTower, when they first showed up, and when they were last active — before any authorization
behavior changes.

### Incremental Delivery

1. Foundational → routing mount point ready.
2. US1 → MVP: every operator is recognized and persisted, `role` resolved into every request.
3. US2 → mutating actions are gated by FlareTower's own permission check; promotion/roster endpoints
   usable.
4. Phase 4 → the `audit_log` write mechanism is built and unit-tested, ready for the future.

---

## Notes

- T012 is the one task touching all 7 existing modules' acknowledge routes — review it with that in
  mind, same caveat as every prior module's own shared-surface task.
- Run `quickstart.md` in full (T015) before considering this feature done. Same real-environment
  caveat as every prior module, though the actual dependency here is real distinct Access
  identities, not Cloudflare API credentials.

---

## Phase 5: Convergence

- [x] T018 Add a Playwright e2e scenario to `tests/e2e/acknowledge-authorization.spec.ts` in which a
      `member` operator is promoted to `admin` (mocked `POST /api/identity/users/:sub/role`) and
      their subsequent acknowledge action succeeds, per US2/AC3 ("that operator can subsequently
      perform mutating actions themselves") and plan.md's own Project Structure entry for this file
      ("member blocked, admin succeeds, promoted member succeeds", research.md §7) — the file
      currently has only the first two of those three scenarios (partial)
