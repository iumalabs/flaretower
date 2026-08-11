# Implementation Plan: Identity, Authorization & Audit Data Model

**Branch**: `008-identity-authorization` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-identity-authorization/spec.md`

## Summary

Wires the constitution-mandated `users` and `audit_log` baseline tables into actual behavior for
the first time. `accessAuth` now upserts an operator record on every request (creating it, with
best-effort IdP enrichment and first-user auto-elevation, on first sight; refreshing
`last_seen_at`/`email` on every return visit) and resolves the operator's FlareTower-native `role`
into the request's identity context. A new `requireRole("admin")` guard gates the one existing
in-app mutating action (alert acknowledgment, across all 7 modules) and two new small
`/api/identity/*` endpoints for listing operators and promoting/demoting one. A `writeAuditEntry()`
helper is built and unit-tested, ready for the first future Cloudflare-account-mutating module to
adopt — `audit_log` itself stays out of scope for acknowledgment, per the precedent already
documented in Module 1's own data-model.md and confirmed with the project owner.

## Technical Context

**Language/Version**: TypeScript (strict mode), Deno 2.9+, Cloudflare Workers runtime

**Primary Dependencies**: Hono (routing/middleware — already in use), no new dependency

**Storage**: Cloudflare D1 — no new migration (research.md §1); this feature reads/writes the
existing baseline `users` and `audit_log` tables for the first time

**Testing**: `deno test` (unit, mocked `D1Database` — same hand-rolled mock pattern as every prior
module), Playwright (the two genuinely user-facing behavior changes per research.md §7: a `member`
operator's acknowledge attempt now failing, and succeeding once promoted)

**Target Platform**: Cloudflare Workers (edge)

**Project Type**: Web application (single Worker + React SPA) — matches existing structure exactly

**Performance Goals**: N/A beyond existing per-request latency norms — adds one D1 read + one D1
write per authenticated request (research.md §3), acceptable at FlareTower's expected scale (a
handful of internal operators)

**Constraints**: No new Cloudflare API token scopes (research.md §8); `get-identity` enrichment
call must never block or fail authentication (research.md §2)

**Scale/Scope**: A handful of operators per deployment (self-hosted internal tool) — two new
endpoints, one new cross-cutting module, a behavior change to 7 existing endpoints

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **I. Access Is the Only Gate**: PASS. No IdP code is added. The `get-identity` call is the exact
  enrichment mechanism Principle II itself names — not a new identity system, not a substitute for
  JWT validation.
- **II. Defense-in-Depth JWT Validation, Fail Closed**: PASS. JWT validation in `accessAuth` is
  unchanged; the operator upsert and `get-identity` enrichment run strictly after successful
  validation, and a `get-identity` failure never affects the authentication decision
  (research.md §2).
- **III. Single Worker, Shared Audit Logic**: N/A. This feature adds no scheduled/interactive
  evaluation logic — it has no Cloudflare API inventory to evaluate, so there is nothing for a
  `scheduled` handler to run (same N/A posture Module 7's own read-only endpoints have for anything
  outside its digest logging).
- **IV. Deno-Only Local Toolchain**: PASS. No new tools, no new dependencies.
- **V. One Configuration File**: PASS. No new config files.
- **VI. Strict TypeScript, Test-First, Playwright for User-Facing Flows**: PASS. Unit tests for the
  upsert logic, `requireRole`, and `writeAuditEntry()` written alongside implementation; Playwright
  coverage for the two user-facing behavior changes (research.md §7).
- **VII. Never Publicly Reachable**: N/A. Unaffected by this feature.
- **VIII. Least-Privilege Secrets, Never in Config or UI**: PASS. No new secret, no new token scope
  — `get-identity` authenticates via the already-validated Access JWT/cookie, not the Cloudflare API
  token.
- **IX. Every Mutation Is Audited Before It Counts**: PASS, by construction — this feature *is* the
  infrastructure Principle IX requires, built ahead of the first Cloudflare-mutating action that
  will need it (FR-010). Alert acknowledgment stays correctly out of `audit_log`'s scope, per the
  precedent already documented in Module 1 and confirmed with the project owner (spec.md
  Assumptions).
- **X. English-Only, Conventional Commits**: PASS.

No violations — Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/008-identity-authorization/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
worker/
├── auth/
│   └── access-jwt.ts          # MODIFIED: AccessIdentity gains `role`; accessAuth upserts users
│                               #   and resolves role (research.md §3)
├── audit-log.ts                # NEW: writeAuditEntry() helper (research.md §6) — built, unused
│                               #   by anything yet (FR-010)
├── modules/
│   ├── identity/                # NEW cross-cutting module (research.md §5)
│   │   ├── routes.ts           # GET /users, POST /users/:sub/role
│   │   └── users.ts            # listOperators(), setOperatorRole()
│   ├── workers-access-exposure/routes.ts   # MODIFIED: acknowledge gated by requireRole("admin")
│   ├── dns/routes.ts                        # MODIFIED: same
│   ├── zero-trust/routes.ts                 # MODIFIED: same
│   ├── pages/routes.ts                      # MODIFIED: same
│   ├── storage/routes.ts                    # MODIFIED: same
│   ├── security/routes.ts                   # MODIFIED: same
│   └── audit/routes.ts                      # MODIFIED: same, for its own pass-through acknowledge
└── index.ts                    # MODIFIED: mount /api/identity

app/
└── pages/
    └── (no new page — FR-011/FR-006 are consumed via direct API calls in this increment,
        per spec.md's "no admin UI in this increment" assumption; a future increment MAY add one)

tests/
├── unit/
│   ├── identity-users.test.ts   # NEW: upsert logic, first-user auto-elevation, get-identity
│   │                            #   enrichment (mocked)
│   ├── identity-routes.test.ts  # NEW: list/promote endpoint behavior, requireRole gating
│   └── audit-log.test.ts        # NEW: writeAuditEntry() statement shape
└── e2e/
    └── acknowledge-authorization.spec.ts   # NEW: member blocked, admin succeeds, promoted
                                             #   member succeeds (research.md §7)
```

**Structure Decision**: Follows the exact structure every prior module used — a new
`worker/modules/identity/` directory for the two new endpoints (cross-cutting, like `audit/`
relative to Modules 1-6), plus targeted edits to the existing `accessAuth` middleware and the 7
existing acknowledge routes. No new top-level directories, no new build tooling.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
