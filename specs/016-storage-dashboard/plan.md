# Implementation Plan: Storage Dashboard

**Branch**: `016-storage-dashboard` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-storage-dashboard/spec.md`

## Summary

Add a "Bound to" column (which deployed Worker(s) reference each resource) shared across the
existing R2 buckets / KV namespaces / D1 databases tables, a "Custom domain" column for R2 buckets
(already-fetched, not yet surfaced), and "Tables"/"Size" columns for D1 databases (one new small
per-database detail fetch). The existing Exposure status (safe/warning/critical/not_evaluated) and
its decision logic are untouched. No page-layout restructuring — the page already renders three
grouped tables, matching the design source's "grouped tables rather than tabs" mockup.

## Technical Context

**Language/Version**: TypeScript (strict), Deno 2.9+

**Primary Dependencies**: Hono (Worker routing), React (SPA), Cloudflare Workers/D1 bindings,
`@cloudflare/vitest-pool-workers`-free Deno test runner (project convention: `Deno.test`),
Playwright (`npm:@playwright/test` via Deno)

**Storage**: Cloudflare D1 — extends the existing `r2_bucket_findings`, `kv_namespace_findings`,
`d1_database_findings` tables (migration `0006_storage_findings.sql`) with nullable columns

**Testing**: `deno test` for unit tests (`worker/modules/storage/*.ts`), Playwright for
`app/pages/StorageInventory.tsx`'s user-facing flow

**Target Platform**: Cloudflare Workers (single Worker, `fetch` + `scheduled` handlers)

**Project Type**: Web application (Worker backend + React SPA, single repo, no separate
frontend/backend projects)

**Performance Goals**: N/A — read-only dashboard, no new performance-sensitive path

**Constraints**: No new Cloudflare API token scope; Workers' 6-concurrent-connection outbound
fetch limit (existing `mapWithConcurrency` caps already in place, one new D1 detail fetch per
database added to the same concurrency-capped path)

**Scale/Scope**: Single feature — 3 existing grouped tables, up to 4 new columns total (Bound to ×3
groups, Custom domain, Tables, Size)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I/II (Access-only auth, JWT validation)**: No change — this feature adds no new
  route, reuses the existing `/api/storage/*` routes already behind the same JWT middleware. PASS.
- **Principle III (single Worker, shared audit logic)**: The Worker-bindings scan and D1 detail
  fetch are added to `worker/modules/storage/inventory.ts`, invoked identically by
  `runStorageEvaluation()` for both the interactive `POST /evaluate` and the scheduled handler —
  no divergent path. PASS.
- **Principle IV/V (Deno-only, one config file)**: No new tooling, no new config file. PASS.
- **Principle VI (strict TypeScript, test-first, Playwright)**: Unit tests for the reworked
  binding-reference structure and the new D1 detail fetch land before/alongside the implementation;
  Playwright coverage extends the existing `tests/e2e/storage-inventory.spec.ts`. PASS.
- **Principle VII (never publicly reachable)**: Unaffected — no new deployment surface. PASS.
- **Principle VIII (least-privilege secrets)**: No new Cloudflare API token scope — the D1 detail
  endpoint is covered by the same D1 read access already granted for the list endpoint this module
  already calls. README's token-scope table needs no change. PASS.
- **Principle IX (every mutation audited)**: This feature adds no mutation — read-only, like every
  other module's dashboard. N/A.
- **Principle X (English-only, Conventional Commits)**: PASS by convention.

No violations. Proceeding to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/016-storage-dashboard/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
worker/
├── db/migrations/
│   └── 0012_storage_findings_add_bindings_and_d1_detail.sql   # NEW
└── modules/storage/
    ├── types.ts       # extended: bound-to + D1 detail fields
    ├── inventory.ts   # extended: name-preserving binding scan (+ r2_bucket type), D1 detail fetch
    ├── evaluate.ts     # extended: pure pass-through of new fields only, decision logic unchanged
    ├── routes.ts       # extended: persist + read new columns, derive display helpers
    └── alerts.ts       # unchanged

app/pages/
└── StorageInventory.tsx   # extended: Bound to / Custom domain / Tables / Size columns

tests/unit/
├── storage-inventory.test.ts   # extended
├── storage-evaluate.test.ts    # extended (pass-through only)
└── storage-routes.test.ts      # NEW (mirrors pages-routes.test.ts precedent)

tests/e2e/
└── storage-inventory.spec.ts   # extended
```

**Structure Decision**: Single Cloudflare Worker + React SPA (existing project structure,
unchanged). This feature touches only `worker/modules/storage/` and `app/pages/StorageInventory.tsx`
plus their tests — no new top-level directories.

## Complexity Tracking

*No Constitution Check violations — this section is not applicable.*
