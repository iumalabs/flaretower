# Quickstart: Audit Operator Role Changes

Manual validation guide once implemented. This feature touches only D1 (no Cloudflare API calls),
so — unlike most other modules' quickstart guides — every scenario here is fully runnable locally
against `wrangler dev`'s local D1, with no real Cloudflare account dependency at all.

## Prerequisites

- The feature merged; local D1 migrations applied (`deno task db:migrations:apply:local`).
- At least two operator rows in the local `users` table: one `admin` (the actor) and one `member`
  (the target). The existing first-login auto-elevation (FR-005, spec 008) already produces the
  first admin; a second operator can be seeded directly into local D1 for this walkthrough.
- A valid Access JWT for the admin operator (or the existing test harness used by
  `tests/e2e/acknowledge-authorization.spec.ts`, which already exercises this exact endpoint).

## Scenario 1 — A role change is recorded (User Story 1, Acceptance Scenario 1)

1. As the admin operator, call `POST /api/identity/users/<member-sub>/role` with body
   `{"role": "admin"}`.
2. **Expect**: `200` response, same shape as before this feature (`{"sub": "...", "role": "admin"}`)
   — no observable change to the API response (spec.md SC-004).
3. Query local D1's `audit_log` table for rows where `action = 'identity.role_change'`. **Expect**:
   exactly one new row, with `actor_sub` equal to the admin's `sub`, `before_json` containing
   `{"sub": "<member-sub>", "role": "member"}`, and `after_json` containing
   `{"sub": "<member-sub>", "role": "admin"}`.

## Scenario 2 — Reversing a change produces a second, distinct record (Acceptance Scenario 2)

1. Immediately after Scenario 1, call `POST /api/identity/users/<member-sub>/role` again with body
   `{"role": "member"}`.
2. Query `audit_log` again. **Expect**: two rows now exist for this target operator — the original
   from Scenario 1 (`member` → `admin`) is untouched, and a new second row records `admin` → `member`
   with its own, later `created_at`.

## Scenario 3 — A role change for a non-existent operator produces no record (Acceptance Scenario 3)

1. Call `POST /api/identity/users/does-not-exist/role` with body `{"role": "admin"}`.
2. **Expect**: `404`, unchanged from current behavior.
3. Query `audit_log`. **Expect**: no new row was added by this request.

## Scenario 4 — Atomicity: a record-keeping failure blocks the role change (Acceptance Scenario 4)

This scenario is exercised by the automated unit test suite (`tests/unit/identity-users.test.ts`),
not manually — reliably forcing a D1 batch failure requires the same mock-D1 harness already used
throughout this repo's other `*-routes.test.ts`/`*-users.test.ts` files, not a live environment.
**Expect** (verified by the unit tests): when the batched write fails, the operator's `role` column
in `users` is left unchanged — never partially applied with a missing audit row.

## Scenario 5 — Self-role-change is recorded accurately (Edge Case)

1. As an admin operator, call `POST /api/identity/users/<own-sub>/role` with body
   `{"role": "member"}` (changing their own role).
2. **Expect**: `200`, and a new `audit_log` row where `actor_sub` and the `sub` inside
   `before_json`/`after_json` are the same value.
