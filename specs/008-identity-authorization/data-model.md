# Data Model: Identity, Authorization & Audit Data Model

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-11

No new D1 tables or migration (research.md §1). This feature is the first to actually read and
write the constitution-mandated baseline tables that every prior module's own data-model.md only
referenced for context.

## `users` (baseline, `worker/db/migrations/0001_baseline.sql` — unchanged schema)

| Column          | Type | Notes                                                                 |
| ---------------- | ---- | ---------------------------------------------------------------------- |
| `sub`            | TEXT | Primary key. From the validated Access JWT — stable, never the email. |
| `email`          | TEXT | Kept current on every request (research.md §3).                       |
| `idp`            | TEXT | `NOT NULL`; `"unknown"` when not determinable (research.md §2).       |
| `role`           | TEXT | `'member'` (default) or `'admin'` — this feature's two-tier model.    |
| `created_at`     | TEXT | First-seen timestamp — set once, on insert.                           |
| `last_seen_at`   | TEXT | Updated on every authenticated request.                               |

Written by: `accessAuth` middleware (upsert, research.md §3) and the `POST
/api/identity/users/:sub/role` endpoint (`role` only, FR-006).

Read by: `accessAuth` (to resolve the current request's `role` into its identity context) and `GET
/api/identity/users` (FR-011).

## `audit_log` (baseline, unchanged schema)

| Column        | Type | Notes                                                          |
| -------------- | ---- | ---------------------------------------------------------------- |
| `id`           | TEXT | Primary key, `crypto.randomUUID()`.                             |
| `actor_sub`    | TEXT | `REFERENCES users(sub)` — the operator who performed the action. |
| `action`       | TEXT | Free-form action identifier (e.g. `"module.kind.action_name"`).  |
| `before_json`  | TEXT | JSON snapshot of the relevant state before the change.           |
| `after_json`   | TEXT | JSON snapshot of the relevant state after the change.            |
| `created_at`   | TEXT | Defaults to `datetime('now')`.                                   |

Written by: nothing yet (FR-010) — `writeAuditEntry()` (research.md §6) exists and is unit-tested,
ready for the first Cloudflare-account-mutating module to call it as part of its own `db.batch()`.

## Computed shape: Identity Context (request-scoped, never persisted)

```ts
interface AccessIdentity {
  sub: string;
  email: string;
  role: "member" | "admin";
}
```

Extends the existing `AccessIdentity` interface in `worker/auth/access-jwt.ts` (today: `{ sub,
email }`) with `role`, resolved once per request by `accessAuth` from the `users` upsert
(research.md §3) and read by `requireRole()` (research.md §4) and any route handler that needs it —
never re-queried mid-request.

## Entity relationships

```
Access JWT (validated per Principle II)
  └─ accessAuth middleware
       ├─ upsert → users (research.md §3), enrich idp via get-identity on first sight (§2)
       └─ attach { sub, email, role } → request identity context (this file, above)

requireRole("admin") (research.md §4)
  └─ reads request identity context — no D1 call
  └─ gates: POST /alerts/.../acknowledge (all 7 modules, FR-009),
            GET /api/identity/users (FR-011), POST /api/identity/users/:sub/role (FR-006)

writeAuditEntry() (research.md §6)
  └─ returns a D1PreparedStatement for audit_log — not called by anything in this feature yet
  └─ intended caller: the first future module whose action changes Cloudflare account state
