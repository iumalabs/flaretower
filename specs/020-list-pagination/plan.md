# Implementation Plan: List Pagination

**Branch**: `020-list-pagination` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-list-pagination/spec.md`

## Summary

Two independent slices, both closing "unbounded/silently-truncated list" gaps: (1) the Audit log's
backend follows Cloudflare's Audit Logs API cursor itself up to a safe cap (mirrors the existing
`ANALYTICS_ROW_LIMIT`/`truncated` pattern already established in
`worker/modules/workers-dashboard/analytics.ts`), instead of fetching one 100-event page and
stopping; (2) the six module dashboard tables (DNS, Workers, Storage, Security, Zero Trust, Pages)
gain real server-side pagination — `GET .../inventory` accepts `page`/`page_size`, plus `sort_key`/
`sort_dir` (sorting must move server-side alongside pagination, since FR-006 requires sort to apply
across the whole result set, not just the page currently in the browser). The shared
`FindingsTable` component gains an opt-in server-side-pagination mode (page footer + delegated
sort) while keeping its existing fully-local mode as the default for any caller that doesn't opt in.

## Technical Context

**Language/Version**: TypeScript (strict), Deno 2.9+

**Primary Dependencies**: Hono (Worker routing), React (SPA), Cloudflare Workers bindings + D1,
Deno test runner, Playwright (`npm:@playwright/test` via Deno)

**Storage**: D1 — no new tables/migrations. Existing `<module>_findings` tables gain `LIMIT`/
`OFFSET` and a parallel `COUNT(*)` on their existing per-run `SELECT`; no schema change.

**Testing**: `deno test` for the new pagination/sort query logic (per module) and the Audit log's
cursor-follow loop; Playwright extends each of the 7 affected pages' existing specs
(`tests/e2e/{dns,workers-dashboard,storage,security,zero-trust,pages}-inventory.spec.ts` +
`audit-inventory.spec.ts`) with a large-result-set pagination scenario.

**Target Platform**: Cloudflare Workers (single Worker, `fetch` + `scheduled` handlers)

**Project Type**: Web application (Worker backend + React SPA, single repo, existing structure)

**Performance Goals**: A page request for any module dashboard returns in bounded time
independent of total account size (SC-002) — achieved by querying only `page_size` rows via SQL
`LIMIT`/`OFFSET` rather than fetching the full result set and slicing in the Worker or browser.

**Constraints**: No new Cloudflare API token scope (Audit log continues using the `Audit Logs Read`
scope from spec 012). Module dashboard tables' existing D1 schemas are unchanged — pagination is a
query-shape change, not a data-model change. Storage's KV key-listing non-goal (specs/016) is
unaffected — Storage's *findings* table (already D1-persisted, one row per R2 bucket/KV namespace/
D1 database) is what gets paginated, not a live KV key enumeration.

**Scale/Scope**: 7 pages (6 module dashboards + Audit log), 1 shared table component
(`FindingsTable`), 1 shared new pagination helper (`worker/pagination.ts`), 6 modules' `routes.ts` +
`evaluate`/inventory query layers, 1 audit-log fetch helper.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I/II (Access-only auth, JWT validation)**: No change — reuses existing `/api/*`
  routes already behind the shared JWT middleware; new query params carry no auth implications.
  PASS.
- **Principle III (single Worker, shared audit logic)**: Pagination/sort params only affect the
  interactive `GET /inventory` read path, not the scheduled evaluation/audit logic itself (which
  still evaluates and persists the full result set every run, unchanged). N/A to the audit logic
  split.
- **Principle IV/V (Deno-only, one config file)**: No new tooling, no new config file. PASS.
- **Principle VI (strict TypeScript, test-first, Playwright)**: Unit tests for the new pagination
  helper and each module's paginated/sorted query land before/alongside the implementation;
  Playwright coverage extends all 7 affected pages' existing specs. PASS.
- **Principle VII (never publicly reachable)**: Unaffected. PASS.
- **Principle VIII (least-privilege secrets)**: No new Cloudflare API token scope. PASS.
- **Principle IX (every mutation audited)**: This feature adds no mutation — `GET` reads only. N/A.
- **Principle X (English-only, Conventional Commits)**: PASS by convention.

No violations. Proceeding to Phase 0.

**Post-design re-check** (after research.md/data-model.md/contracts/quickstart.md): the sort-key
whitelist (research.md §3) and 400-on-invalid-param validation (data-model.md) were added during
design specifically to close a SQL-injection surface (Principle VIII's spirit — least-privilege,
no unvalidated input reaching a query) that a naive implementation could have introduced. No new
violations. Still PASS across all principles.

## Project Structure

### Documentation (this feature)

```text
specs/020-list-pagination/
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
└── pagination.ts                          # NEW: shared LIMIT/OFFSET math, response envelope,
                                            #   and a whitelisted-column sort-key validator used
                                            #   by all 6 modules (avoids 6x duplicated logic and
                                            #   rules out SQL-injection via an unvalidated ORDER BY)

worker/modules/{dns,workers-dashboard,storage,security,zero-trust,pages}/routes.ts
                                            # extended: GET /inventory accepts page/page_size/
                                            #   sort_key/sort_dir; adds a COUNT(*) query; adds
                                            #   LIMIT/OFFSET and a parameterized ORDER BY to the
                                            #   existing per-run SELECT; response envelope gains
                                            #   total/page/page_size/total_pages

worker/modules/workers-dashboard/audit-log.ts
                                            # extended: fetchAccountAuditLog() follows Cloudflare's
                                            #   pagination cursor internally up to a defined safe
                                            #   cap (mirrors analytics.ts's ANALYTICS_ROW_LIMIT/
                                            #   truncated pattern), returns { entries, truncated }

worker/modules/audit/routes.ts             # extended: GET /log forwards total count + truncated

app/components/
└── FindingsTable.tsx                      # extended: optional pagination prop ({ page, pageSize,
                                            #   total, onPageChange }) renders a page footer and
                                            #   switches sort from local state to a delegated
                                            #   onSortChange callback; omitting the prop keeps
                                            #   today's fully-local behavior unchanged

app/pages/{DnsInventory,WorkersDashboardPage,StorageInventory,SecurityPostureInventory,
           ZeroTrustInventory,PagesInventory}.tsx
                                            # extended: own page/sort state, pass to fetch call
                                            #   and to FindingsTable's new pagination prop

app/pages/AuditInventory.tsx               # extended: show true total + a "capped at N" indicator
                                            #   when the backend's fetch cap was hit

tests/unit/
├── pagination.test.ts                     # NEW: worker/pagination.ts helper
├── {dns,workers-dashboard,storage,security,zero-trust,pages}-routes.test.ts
│                                           # extended: page/page_size/sort_key/sort_dir behavior
└── workers-dashboard-audit-log.test.ts    # extended: cursor-follow-to-cap, truncated flag

tests/e2e/
├── {dns,workers-dashboard,storage,security,zero-trust,pages}-inventory.spec.ts
│                                           # extended: large-result-set pagination scenario
└── audit-inventory.spec.ts                # extended: total-count + capped-indicator scenario
```

**Structure Decision**: Single Cloudflare Worker + React SPA (existing project structure,
unchanged). One new small shared backend helper (`worker/pagination.ts`) avoids duplicating
LIMIT/OFFSET/sort-validation logic six times; one shared frontend component (`FindingsTable`)
already exists and is extended rather than forked per module, per the project's own established
"one shared table implementation" pattern (specs/009-design-system-alignment/research.md §4).

## Complexity Tracking

*No Constitution Check violations — this section is not applicable.*
