# Implementation Plan: Audit Operator Role Changes

**Branch**: `019-audit-role-changes` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-audit-role-changes/spec.md`

## Summary

`POST /api/identity/users/:sub/role` (`worker/modules/identity/routes.ts`, spec 008) changes an
operator's role between `member` and `admin` with no record of who made the change or when.
`worker/db/migrations/0001_baseline.sql` already defines an `audit_log` table (`actor_sub`,
`action`, `before_json`, `after_json`, `created_at`), and `worker/audit-log.ts`'s
`writeAuditEntry()` already builds an insert statement for it — but neither is called from anywhere
in the codebase today (confirmed by grep: zero call sites). This feature makes the role-change route
the first real caller: `setOperatorRole()` gains an `actorSub` parameter and, on finding the target
operator, batches the role `UPDATE` together with an audit `INSERT` (via `writeAuditEntry()`) in one
atomic `db.batch()` call — the same D1 atomicity technique already used elsewhere in this codebase
for multi-statement writes (e.g. `worker/modules/dns/routes.ts`'s `runDnsEvaluation` batching
finding/alert rows), newly applied to this specific pairing (research.md §1-§2).

## Technical Context

**Language/Version**: TypeScript (strict), Deno runtime — matches the rest of the project.

**Primary Dependencies**: Hono (existing router), Cloudflare D1 (existing binding) — no new
dependency.

**Storage**: Cloudflare D1, reusing the existing `audit_log` table from `0001_baseline.sql`. No new
migration.

**Testing**: `deno test` (unit) against `worker/modules/identity/users.ts` and
`worker/modules/identity/routes.ts`, extending the existing `tests/unit/identity-users.test.ts` and
`tests/unit/identity-routes.test.ts` with a mock-D1 pattern already established by every other
`*-routes.test.ts` file in this repo for asserting `db.batch()` contents.

**Target Platform**: Cloudflare Workers (single Worker, existing deployment).

**Project Type**: Web service (single Cloudflare Worker + SPA) — existing structure, no new
project/package.

**Performance Goals**: N/A — one additional prepared statement inside an existing single-row
`db.batch()` call; no measurable latency impact.

**Constraints**: MUST reuse `writeAuditEntry()`/`audit_log` unmodified (no new table, no new
mechanism); MUST NOT require any new Cloudflare API token scope (this is a D1-only change, no
Cloudflare API call involved); MUST NOT change the route's response shape or its `requireRole
("admin")` gating.

**Scale/Scope**: One function (`setOperatorRole`) and one route handler modified; two existing unit
test files extended. No new files, no new migration, no frontend change (no existing identity UI
page to update — this route is API-only today, per spec.md's Assumptions).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| I. Access-only gate | Unaffected — no identity-provider code touched. **PASS** |
| II. Defense-in-depth JWT | Unaffected — route already sits behind `accessAuth` + `requireRole("admin")`, unchanged. **PASS** |
| III. Single Worker, shared audit logic | Directly reinforced: reuses the one shared `writeAuditEntry()` mechanism rather than introducing a second, feature-specific one. **PASS** |
| IV. Deno-only toolchain | No new tooling. **PASS** |
| V. One configuration file | No config changes. **PASS** |
| VI. Strict TypeScript, test-first, Playwright for user-facing flows | New unit tests written alongside the implementation, extending existing test files. No new Playwright coverage needed: this route has no frontend page today (API-only, exercised only via direct `fetch()` in `tests/e2e/acknowledge-authorization.spec.ts`), and this feature adds an internal side effect, not a new user-facing flow or a response-shape change (spec.md SC-004). **PASS** |
| VII. Never publicly reachable | Unaffected. **PASS** |
| VIII. Least-privilege secrets | Reinforced — this feature needs zero new Cloudflare API token scope, since it touches only D1, not the Cloudflare API. **PASS** |
| IX. Every mutation is audited | This principle's literal text scopes only to "Cloudflare account state"; an operator's FlareTower-internal role is not Cloudflare account state, so this feature is not closing a literal violation. It does, however, directly serve the principle's own rationale ("what did they do here?" cannot be an afterthought) for the most security-sensitive mutation FlareTower's own control plane has. Extending the existing mechanism to cover it is a voluntary strengthening, not a deviation — no complexity-tracking entry needed. **PASS** |
| X. English-only, Conventional Commits | Followed as with every other change in this repo. **PASS** |

No violations. Complexity Tracking table intentionally omitted (empty).

## Project Structure

### Documentation (this feature)

```text
specs/019-audit-role-changes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

No `contracts/` directory: the HTTP contract for `POST /api/identity/users/:sub/role` (already
documented in spec 008's own contracts) is unchanged by this feature — same request body, same
response shape, same status codes (spec.md SC-004). This feature adds a side effect, not a new or
changed interface.

### Source Code (repository root)

```text
worker/
├── audit-log.ts                        # EXISTING — writeAuditEntry(), unmodified, gains its first caller
├── db/migrations/
│   └── 0001_baseline.sql               # EXISTING — audit_log table, unmodified, no new migration
└── modules/identity/
    ├── users.ts                        # MODIFIED — setOperatorRole(db, actorSub, sub, role) batches
    │                                    #             the role UPDATE + audit INSERT via db.batch()
    └── routes.ts                       # MODIFIED — passes the calling admin's sub (from
                                         #             c.get("identity")) through to setOperatorRole()

tests/unit/
├── identity-users.test.ts              # EXTENDED — setOperatorRole()'s audit-statement shape
└── identity-routes.test.ts             # EXTENDED — route-level: db.batch() called with both statements,
                                         #             atomicity (batch failure -> no role change), no-op
                                         #             not-found case still produces zero audit statements
```

**Structure Decision**: Single-Worker structure, unchanged from the rest of the project. This
feature modifies two existing files in `worker/modules/identity/` and extends two existing test
files — no new source files, no new test files, no new frontend files.

## Complexity Tracking

*No violations — table intentionally omitted.*
