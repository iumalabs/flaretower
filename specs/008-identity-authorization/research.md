# Research: Identity, Authorization & Audit Data Model

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-11

## 1. Baseline schema already has every column this feature needs — no new migration

Re-reading `worker/db/migrations/0001_baseline.sql`:

```sql
CREATE TABLE users (
  sub TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  idp TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_sub TEXT NOT NULL REFERENCES users(sub),
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Every column this feature's requirements need already exists: `role` for the two-tier permission
model, `idp`/`created_at`/`last_seen_at` for operator recognition, and `audit_log`'s full shape for
FR-010's write-capable mechanism. **This feature adds no D1 migration** — a deliberate outcome, not
an oversight, matching the precedent Module 7 set for "no new tables needed" (its own research.md
§4). One consequence worth flagging: `idp TEXT NOT NULL` has no default and cannot be relaxed
without a full table rebuild, so §3 below resolves how a not-yet-determined IdP is represented
without violating that constraint.

**Decision**: no new migration file. **Rejected alternative**: adding a `CHECK (role IN ('member',
'admin'))` constraint via a rebuild-migration — technically nice-to-have defense-in-depth, but
`role` is only ever written by this feature's own application code (never copied verbatim from
request input — FR-006's promotion endpoint validates the requested value before writing), so a DB
constraint would duplicate a check the application layer already must do, for real migration risk
(SQLite/D1 has no `ALTER TABLE ... ADD CONSTRAINT`; enforcing a `CHECK` on an existing column
requires recreating the table). Not worth it for this increment.

## 2. Identity-provider enrichment: `get-identity`, not a JWT claim

Constitution Principle II already anticipates this: *"Richer identity (IdP used, group membership,
custom claims) MAY be obtained by calling `GET
https://<team>.cloudflareaccess.com/cdn-cgi/access/get-identity` ... but this call is an enrichment
step, never a substitute for JWT validation."*

Confirmed via Cloudflare's own docs (`developers.cloudflare.com/cloudflare-one/identity/...`):

- The `Cf-Access-Jwt-Assertion` JWT's guaranteed claims are `aud`, `email`, `exp`, `iat`, `nbf`,
  `iss`, `type`, `identity_nonce`, `sub`, `country` — **no IdP identifier by default**. Groups and
  IdP-specific data only appear if explicitly configured as a custom SAML attribute/OIDC claim, and
  even then may be silently trimmed if the token would exceed cookie size limits.
- `GET /cdn-cgi/access/get-identity` (called with the `CF_Authorization` cookie set to the same JWT
  value already validated from the `Cf-Access-Jwt-Assertion` header) returns a richer JSON payload
  including `idp: { id, type }` — `type` is the field this feature wants (e.g. `"oidc"`,
  `"google-apps"`, `"github"`).

**Decision**: `accessAuth` (or a helper it calls) makes a best-effort `fetch()` to
`{TEAM_DOMAIN}/cdn-cgi/access/get-identity`, forwarding the already-validated JWT as the
`CF_Authorization` cookie, and reads `.idp.type` — **only on the new-operator path** (FR-001's
"first time"), not on every request, since IdP doesn't change per person and re-fetching it on every
already-recognized request adds latency for no benefit. On any failure (network error, unexpected
shape, non-200) the operator record is still created, with `idp` set to the literal string
`"unknown"` (never `NULL` — the column is `NOT NULL`, see §1). This matches Principle II's framing
of the call as enrichment that must never gate or break authentication, and satisfies FR-003's "MUST
NOT fail authentication when [IdP information] is not [available]."

**Rejected alternative**: requiring Access administrators to configure a custom OIDC claim/SAML
attribute carrying IdP name, and reading it straight from the JWT. Rejected because it pushes a
manual Zero Trust configuration step onto every deployer as a hard prerequisite, where
`get-identity` gets the same information with zero configuration.

## 3. Users upsert: two-step read-then-write, not a single UPSERT

**Decision**: inside `accessAuth`, after JWT validation succeeds, do:

1. `SELECT sub, role FROM users WHERE sub = ?`.
2. If no row: best-effort `get-identity` call (§2); `SELECT COUNT(*) AS n FROM users` to decide
   `role` (`n === 0` → `'admin'` per FR-005, else `'member'` per FR-004); `INSERT INTO users (sub,
   email, idp, role, created_at, last_seen_at) VALUES (?, ?, ?, ?, datetime('now'),
   datetime('now'))`.
3. If a row exists: `UPDATE users SET email = ?, last_seen_at = datetime('now') WHERE sub = ?` (email
   can legitimately change at the IdP and should stay current; `role` is left untouched — only
   FR-006's promotion path writes it).
4. Either way, attach `{ sub, email, role }` to the request's identity context so downstream route
   handlers can make an authorization decision (FR-007) without a second D1 round-trip.

**Rejected alternative**: a single `INSERT ... ON CONFLICT(sub) DO UPDATE ... RETURNING` statement.
Genuinely more efficient (one round-trip instead of two on the common "returning operator" path),
but determining "was this newly inserted" (needed to decide whether to run the first-user COUNT
check and the `get-identity` call) from a single upsert's result is awkward with D1's API, and the
codebase has consistently favored the clearer, more testable multi-statement form over cleverness
(e.g. every module's own findings-then-alerts write is two explicit statements, not one). Kept
consistent with that precedent.

**Accepted risk**: two operators authenticating for the very first time, concurrently, on a
fresh deployment could theoretically both observe `COUNT(*) = 0` and both become `'admin'`. Low
probability (requires two *distinct* identities racing on literally the first-ever request), not
harmful if it happens (both end up as legitimate admins on a deployment only the intended operators
can reach at all, per Access), and consistent with the project's existing risk posture elsewhere
(e.g. concurrent alert-acknowledge races are similarly unguarded). Not worth adding cross-request
locking for.

## 4. Authorization: a `requireRole` guard reading the identity context

**Decision**: a small `requireRole(role: "admin")` Hono middleware, applied only to the routes that
need it (the 7 existing acknowledge endpoints, and the new promotion/list endpoints from FR-006/
FR-011), reads `c.get("identity").role` — already resolved by `accessAuth` per §3 step 4 — and
returns `403` if it doesn't match. No new D1 call per protected request.

## 5. Promotion and operator-list endpoints (FR-006, FR-011)

New, small, cross-cutting module — not owned by any of the 7 audit modules, matching how `audit`
itself is cross-cutting relative to Modules 1-6:

- `GET /api/identity/users` — list operators (`sub`, `email`, `idp`, `role`, `created_at`,
  `last_seen_at`), `admin`-only (FR-011).
- `POST /api/identity/users/:sub/role` — body `{ "role": "member" | "admin" }`, `admin`-only
  (FR-006). `400` on an invalid `role` value, `404` on an unknown `sub`, otherwise updates and
  returns the updated operator summary.

Mounted at `/api/identity`, alongside the existing `/api/{exposure,dns,zero-trust,pages,storage,
security,audit}` mounts in `worker/index.ts`.

## 6. `audit_log` write-capable mechanism (FR-010) — built, not wired to anything yet

**Decision**: a small `writeAuditEntry(db, { actorSub, action, beforeJson, afterJson })` helper in
`worker/audit-log.ts`, returning a `D1PreparedStatement` (not executing it directly) so a future
write-capable module can include it in its own `db.batch([...])` alongside its actual Cloudflare-
mutating write — matching the `db.batch()` pattern every module already uses for atomically writing
a finding and its alert together (`worker/modules/*/routes.ts`), and satisfying Principle IX's "as
part of that action's own transaction, before the action is considered complete." This feature
writes unit tests for the helper directly (constructing the statement, asserting its SQL/bindings)
since there is no real caller yet to exercise it end-to-end — consistent with spec.md's Assumptions
(FR-010 "is not exercised by any user-facing flow in this increment").

## 7. Playwright coverage

Per constitution Principle VI, any user-facing flow needs e2e coverage. Two are genuinely
user-facing in this feature: acknowledging an alert now failing for a non-`admin` operator (US2,
Acceptance Scenario 1), and a `member`-role operator's acknowledge action succeeding once promoted
(Acceptance Scenario 2/3). Operator recognition (US1) has no UI surface of its own to click through
— it's exercised by the existing e2e suite's own Access-JWT mocking already hitting `accessAuth` on
every page load, so no *new* e2e test is needed for US1 itself; a unit test on the upsert logic
suffices, matching how User Story 2 in Module 7 (an internal SQL query, no dedicated screen) was
verified by unit test + a live D1 check rather than a new Playwright spec.

## 8. Token scopes

No new Cloudflare API scope is needed. The `get-identity` call (§2) authenticates via the
already-validated Access JWT/cookie, not the Cloudflare API token — it is a Zero Trust identity
call, not an Account API call. README's token-scope table needs no changes, same as Module 7.
