# Phase 1 Data Model: Audit Operator Role Changes

No new migration. This feature writes into the existing `audit_log` table
(`worker/db/migrations/0001_baseline.sql`), unchanged:

```sql
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_sub TEXT NOT NULL REFERENCES users(sub),
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Role Change Record (a value shape, not a new table)

One `audit_log` row per completed role change (spec.md FR-001):

| Column | Value for this feature |
|---|---|
| `id` | New `crypto.randomUUID()`, same as every other `writeAuditEntry()` call would produce. |
| `actor_sub` | The **calling admin's** `sub` — read from `c.get("identity").sub` in `routes.ts` and passed into `setOperatorRole()` as its new `actorSub` parameter — not the target operator's `sub`, except in the self-role-change case (spec.md FR-005) where they happen to be equal. |
| `action` | The literal string `"identity.role_change"` (research.md §3). |
| `before_json` | `{ "sub": "<target operator's sub>", "role": "<role before the change>" }` |
| `after_json` | `{ "sub": "<target operator's sub>", "role": "<role after the change>" }` |
| `created_at` | Same instant as the paired `users.role` `UPDATE`, via `writeAuditEntry()`'s own `new Date().toISOString()` — not a separately-computed timestamp. |

`before_json`/`after_json` both carry the target operator's `sub` (not just the role) so a later
reader doesn't need to cross-reference `actor_sub` to know whose role changed, particularly in the
self-role-change case where `actor_sub` alone is ambiguous about that distinction.

## No schema change to `users`

`setOperatorRole()`'s existing `UPDATE users SET role = ? WHERE sub = ?` is unchanged — no new
`changed_by`/`changed_at` columns on `users` itself. The `audit_log` row is the record; duplicating
"last changed by whom" onto `users` as well would be two sources of truth for the same fact.

## `SetRoleResult` (existing type, unchanged)

```ts
export type SetRoleResult =
  | { outcome: "ok"; sub: string; role: Role }
  | { outcome: "not_found" };
```

No new fields needed. `setOperatorRole()`'s existing existence-check `SELECT sub FROM users WHERE
sub = ?` widens to `SELECT sub, role FROM users WHERE sub = ?` — the one additional column is what
supplies the "before" role for `before_json`; everything else needed (target `sub`, new `role`) is
already a parameter. The `"not_found"` outcome continues to short-circuit before either statement is
built, per spec.md FR-004 (no record for an attempt that changed nothing).
