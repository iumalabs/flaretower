# Implementation Plan: Audit Dashboard

**Branch**: `018-audit-dashboard` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-audit-dashboard/spec.md`

## Summary

Add an "Audit log" panel to the existing Audit & Drift page showing real Cloudflare account
activity from the last 7 days, reusing `worker/modules/workers-dashboard/audit-log.ts`'s
`fetchAccountAuditLog()` completely unmodified (built in spec 012 specifically for this reuse —
no new Cloudflare API call, no new token scope). Adds a source filter limited to the 2 real values
Cloudflare's API returns (dashboard/api) and a client-side JSONL export. The existing Unified
alerts inbox, What changed, and Account-wide posture summary sections are untouched.

## Technical Context

**Language/Version**: TypeScript (strict), Deno 2.9+

**Primary Dependencies**: Hono (Worker routing), React (SPA), Cloudflare Workers bindings, Deno
test runner, Playwright (`npm:@playwright/test` via Deno)

**Storage**: None new — this feature is entirely live-fetched, not persisted (mirrors Workers
Dashboard's own Recent Changes panel and spec 014's Access Groups panel precedent). No D1
migration.

**Testing**: `deno test` for unit tests (`worker/modules/audit/*.ts`), Playwright for
`app/pages/AuditInventory.tsx`'s user-facing flow

**Target Platform**: Cloudflare Workers (single Worker, `fetch` + `scheduled` handlers)

**Project Type**: Web application (Worker backend + React SPA, single repo, no separate
frontend/backend projects)

**Performance Goals**: N/A — read-only, live-fetched panel, no new performance-sensitive path

**Constraints**: No new Cloudflare API token scope (`Audit Logs Read` already granted in spec 012);
reuses `fetchAccountAuditLog()` verbatim, no changes to that module

**Scale/Scope**: 3 independently-shippable stories: (1) the Audit log panel itself; (2) a 2-value
source filter; (3) a client-side JSONL export

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I/II (Access-only auth, JWT validation)**: No change — reuses the existing
  `/api/audit/*` routes already behind the same JWT middleware. PASS.
- **Principle III (single Worker, shared audit logic)**: This feature is a live-fetched read
  panel, not an evaluation with a scheduled/interactive split — no divergent path to keep in sync.
  N/A.
- **Principle IV/V (Deno-only, one config file)**: No new tooling, no new config file. PASS.
- **Principle VI (strict TypeScript, test-first, Playwright)**: Unit tests for the new route and
  the client-side filter/export helpers land before/alongside the implementation; Playwright
  coverage extends `tests/e2e/audit-inventory.spec.ts`. PASS.
- **Principle VII (never publicly reachable)**: Unaffected. PASS.
- **Principle VIII (least-privilege secrets)**: No new Cloudflare API token scope —
  `fetchAccountAuditLog()` already uses the `Audit Logs Read` scope granted in spec 012 (README's
  token-scope table already documents "Module 018 reuses" this exact entry; no edit needed). PASS.
- **Principle IX (every mutation audited)**: This feature adds no mutation — read-only. N/A.
- **Principle X (English-only, Conventional Commits)**: PASS by convention.

No violations. Proceeding to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/018-audit-dashboard/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
worker/modules/audit/
└── routes.ts       # extended: new GET /log route, calling fetchAccountAuditLog() unfiltered
                      # (imported from workers-dashboard/audit-log.ts, unmodified)

app/pages/
└── AuditInventory.tsx   # extended: new Audit log panel (table + source filter + JSONL export),
                           # existing 3 sections unchanged

tests/unit/
└── audit-routes.test.ts   # extended (or new, if it doesn't already cover routes.ts fully)

tests/e2e/
└── audit-inventory.spec.ts   # extended
```

**Structure Decision**: Single Cloudflare Worker + React SPA (existing project structure,
unchanged). This feature touches only `worker/modules/audit/routes.ts` and
`app/pages/AuditInventory.tsx` plus their tests — no new top-level directories, no new module
files (the fetch logic it needs already exists in `workers-dashboard/audit-log.ts`).

## Complexity Tracking

*No Constitution Check violations — this section is not applicable.*
