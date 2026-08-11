# Quickstart: Identity, Authorization & Audit Data Model

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-11

## Prerequisites

- A Cloudflare test account with FlareTower deployed behind its own Access application (same
  prerequisite every prior module's quickstart shares).
- At least two distinct Access-authenticated identities able to reach FlareTower, to exercise
  promotion (one starts as the auto-elevated first operator, one starts as `member`).
- No new API token scopes (research.md §8) — this feature makes no Cloudflare account API calls.

## Scenario 1 — first operator is auto-elevated (User Story 1 + 2)

1. On a fresh deployment (empty `users` table), authenticate as identity A through the Access gate.
2. `GET /api/identity/users` as identity A → one row, `role: "admin"`.

## Scenario 2 — returning operator is recognized, not duplicated (User Story 1)

1. Authenticate as identity A again (a second, later request).
2. `GET /api/identity/users` → still exactly one row for identity A; `last_seen_at` has advanced
   past the value observed in Scenario 1.

## Scenario 3 — a new operator defaults to `member` (User Story 1 + 2)

1. Authenticate as a second identity, B, for the first time.
2. `GET /api/identity/users` as identity A → two rows; B's `role` is `"member"`.

## Scenario 4 — a `member` cannot acknowledge; an `admin` can (User Story 2)

1. As identity B (`member`), `POST` an acknowledge on any outstanding alert in any module →
   `403`, and the alert's `acknowledged_at` remains unchanged (confirm via that module's own
   `GET /alerts`).
2. As identity A (`admin`), `POST /api/identity/users/{B's sub}/role` with `{"role": "admin"}` →
   `200`.
3. As identity B (now `admin`), repeat the same acknowledge request → `200`, and the alert's
   `acknowledged_at` is now set.

## Scenario 5 — no unauthenticated access (cross-cutting, Principle II)

`GET /api/identity/users` and `POST /api/identity/users/{sub}/role` without a valid
`Cf-Access-Jwt-Assertion` header both return `403` — same as every other module's endpoints.

## Scenario 6 — the audit-log mechanism is ready but idle (FR-010)

Confirm via `deno test` (not a live scenario — there is no user-facing flow to click through yet,
per spec.md's Assumptions): `writeAuditEntry()` produces a correctly-shaped `D1PreparedStatement`
given `{actorSub, action, beforeJson, afterJson}`, ready for `db.batch()` inclusion by the first
future Cloudflare-mutating module.
