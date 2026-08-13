# Phase 0 Research: Audit Operator Role Changes

## §1. Reuse `writeAuditEntry()` / `audit_log`, don't build a second mechanism

**Decision**: `setOperatorRole()` (`worker/modules/identity/users.ts`) builds an audit-entry
prepared statement via the existing `writeAuditEntry()` (`worker/audit-log.ts`), and the route
handler (`worker/modules/identity/routes.ts`) batches it together with the role `UPDATE` via a
single `env.DB.batch([...])` call.

**Rationale**: `worker/db/migrations/0001_baseline.sql` already defines `audit_log` with exactly the
shape this feature needs — `actor_sub`, `action`, `before_json`, `after_json`, `created_at` — and
`writeAuditEntry()` already builds the correctly-shaped insert statement. Building a second,
feature-specific table or mechanism would duplicate this for no benefit and would directly
contradict constitution Principle III's "single shared audit logic" spirit (written about the
`fetch`/`scheduled` duplication risk specifically, but the same reasoning against parallel
mechanisms applies here).

**Notable finding, confirmed by grep, not assumed**: `writeAuditEntry()` currently has **zero call
sites** anywhere in `worker/` outside its own definition file. `INSERT INTO audit_log` likewise
appears nowhere else. This is because every one of the 7 built modules (Workers exposure, DNS, Zero
Trust, Pages, R2/KV/D1, Security, Audit) is a read/evaluate/alert module with no actual
Cloudflare-account-mutating "fix" action yet — per the constitution's own Product Scope section,
FlareTower "surfaces state AND mutates configuration" is the intended full scope, but no
mutating-write module has landed yet. `writeAuditEntry()` was built ahead of need (per its own
header comment) specifically for the first such feature. **This role-change feature is that first
real caller** — worth stating plainly rather than implying an existing call-site convention that
doesn't actually exist yet.

**Alternatives considered**:
- A dedicated `operator_role_history` table — rejected: would duplicate `audit_log`'s exact column
  shape (actor, action, before/after, timestamp) for a distinction (Cloudflare-state vs.
  FlareTower-internal-state) that the schema itself doesn't need to care about; two tables with
  identical shapes recording "who changed what" is exactly the kind of parallel-mechanism split
  Principle III's rationale warns against.
- Logging via `console.log` only — rejected: not durable, not queryable, and does not satisfy
  spec.md FR-002 (the change and its record must succeed or fail together) or SC-002 (a
  record-keeping failure must block the role change) — a log line cannot participate in a D1
  transaction/batch.
- Writing the audit row as a best-effort, non-blocking side effect (fire-and-forget after the role
  `UPDATE` commits) — rejected: spec.md FR-002/SC-002 explicitly require the two to succeed or fail
  together, mirroring Principle IX's "as part of that action's own transaction, before the action is
  considered complete" even though this particular mutation is technically outside Principle IX's
  literal Cloudflare-state scope (see plan.md's Constitution Check).

## §2. `db.batch()` for atomicity — an established technique, newly applied to this pairing

**Decision**: Use `env.DB.batch([roleUpdateStatement, auditInsertStatement])`.

**Rationale**: `db.batch()` is D1's existing mechanism, already used throughout this codebase (e.g.
`worker/modules/dns/routes.ts`'s `runDnsEvaluation`, batching multiple `exposure_findings`/
`dns_alerts` insert statements together) whenever multiple D1 statements must succeed or fail as a
unit. This feature is a new *pairing* (one `UPDATE` + one audit `INSERT`) rather than an existing
pattern already applied to an audit write specifically (per §1's finding, nothing has paired a
mutation with an audit write before) — but the underlying technique (`db.batch()` for atomicity) is
the same one already relied on elsewhere, not a new concept introduced by this feature.

**Alternatives considered**:
- Two sequential `.run()` calls (`UPDATE` then `INSERT`) — rejected: not atomic; a failure between
  the two calls would leave the role changed with no record, exactly the gap this feature exists to
  close.
- D1 `BEGIN`/`COMMIT` transaction syntax — not used elsewhere in this codebase; `db.batch()` is the
  established idiom here and is sufficient for a two-statement atomic write.

## §3. `action` string convention

**Decision**: `"identity.role_change"` — a `<module>.<action>` dot-namespaced string.

**Rationale**: Since `writeAuditEntry()` has no prior callers (§1), there is no existing convention
to match. `<module>.<action>` mirrors this codebase's own `kind`/kebab-case naming style used
elsewhere (e.g. `exposure_status`, `hostname_kind` column values) while staying greppable and
self-describing in a future `audit_log` query or admin tool. Chosen deliberately rather than left
ambiguous, since this string sets the convention the next real `writeAuditEntry()` caller will
likely follow.

## §4. No-op role submissions

**Decision** (already fixed in spec.md's Edge Cases, restated here for planning traceability): a
role-change request where the submitted role equals the operator's current role still produces both
the `UPDATE` (a no-op write, same value) and an audit record. `setOperatorRole()` does not need a
"did anything actually change" branch — it already only reaches its `UPDATE` after confirming the
operator exists (the only case that currently short-circuits to `{ outcome: "not_found" }`), so no
new branching logic is needed to implement this decision; it falls out of the existing control flow
unchanged.
