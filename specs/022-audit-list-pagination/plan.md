# Implementation Plan: Audit List Pagination

**Branch**: `022-audit-list-pagination` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-audit-list-pagination/spec.md`

## Summary

`GET /api/audit/alerts` and `GET /api/audit/changes` gain server-side pagination via
`worker/pagination.ts`'s `paginateArray()` — the same in-memory sort+slice mechanism already used by
Workers dashboard (both endpoints already merge 17 sources into one plain JS array, not a single D1
query). Audit & Drift's "Unified alerts inbox" and "What changed" tabs get real page/prev/next
controls, matching every other paginated table on the site. Overview's alerts/recent-activity lists
switch from unbounded `.map()` to a fixed top-5 request against these same now-paginated endpoints
(`page_size=5&sort_key=severity`), with a "N more" indicator reading the envelope's `total` — no
pager controls of its own. A new `severity` sort key (critical-first, mirroring Overview's existing
client-side `SEVERITY_ORDER`) is added to both endpoints' whitelist, moved server-side so Overview's
bounded request can use it and so it's available as a real sort option on both tabs.

## Technical Context

**Language/Version**: TypeScript (strict), Deno 2.9+

**Primary Dependencies**: Hono, React — no new dependency. Reuses `worker/pagination.ts` (spec 020)
and `FindingsTable`'s existing `pagination` prop (spec 020) unchanged.

**Storage**: D1 — no schema change. The two endpoints' 17 underlying per-source queries are
unchanged; pagination/sort happens on the already-merged in-memory result, same as Workers
dashboard's existing pattern.

**Testing**: `deno test` for the two routes' new pagination/sort behavior (extends
`tests/unit/audit-routes.test.ts` or adds `tests/unit/audit-inbox.test.ts`/`audit-changes.test.ts`
coverage as appropriate) and the new `severity` sort accessor. Playwright extends
`tests/e2e/audit-inventory.spec.ts` (pagination scenario on both tabs) and
`tests/e2e/overview.spec.ts` (bounded top-5 + "N more" indicator + link).

**Target Platform**: Cloudflare Workers (interactive `GET` routes only — no scheduled-handler
change, no new Cloudflare API call).

**Project Type**: Web application (existing structure, unchanged).

**Performance Goals**: N/A beyond spec.md SC-001/SC-002 (qualitative) — no new query cost; the 17
per-source reads already happen in full regardless of requested page (research.md §1), so pagination
bounds the _response size_, not the D1 read cost, consistent with how Workers dashboard pagination
already works.

**Constraints**: Must not change `acknowledgeAlert()`'s per-row semantics or either page's existing
client-side "remove on acknowledge" behavior (spec.md FR-008, research.md §5). Must not introduce a
new pagination envelope shape — reuse `worker/pagination.ts`'s existing `PaginationEnvelope`/
`PageQuery`/`paginateArray` exactly as-is.

**Scale/Scope**: 2 backend routes extended (`worker/modules/audit/routes.ts`'s `GET /alerts` and
`GET /changes`), 2 frontend pages extended (`AuditInventory.tsx`'s two tabs, `OverviewPage.tsx`'s
two lists), 1 new shared sort-key concept (`severity`, defined once and reused by both endpoints).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Principle I/II (Access-only auth, JWT validation)**: No change — existing `/api/audit/*` routes
  stay behind the same JWT middleware; new query params carry no auth implications. PASS.
- **Principle III (single Worker, shared audit logic)**: N/A — this only affects the interactive
  `GET` read paths; the scheduled-handler-invoked `runAuditDigest()` (24h change count) is
  unaffected, since it calls `computeChanges()` directly for a count, not through the paginated
  route.
- **Principle IV/V (Deno-only, one config file)**: No new tooling/dependency/config file. PASS.
- **Principle VI (strict TypeScript, test-first, Playwright)**: Unit tests for the new
  pagination/sort/severity-accessor behavior land before/alongside the route changes; Playwright
  extends both affected pages' existing specs. PASS.
- **Principle VII (never publicly reachable)**: Unaffected. PASS.
- **Principle VIII (least-privilege secrets)**: N/A — no new Cloudflare API call, no new secret.
- **Principle IX (every mutation audited)**: N/A — no new mutation; `acknowledgeAlert()` is
  unchanged (research.md §5).
- **Principle X (English-only, Conventional Commits)**: PASS by convention.

No violations. Proceeding to Phase 0.

**Post-design re-check** (after research.md/data-model.md/quickstart.md): the one substantive
correction from Phase 0 (dropping "recency" sort for changes, since no timestamp field exists —
research.md §2) simplified the design rather than adding complexity. No new violations. Still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/022-audit-list-pagination/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory (research.md §6).

### Source Code (repository root)

```text
worker/modules/audit/
├── inbox.ts              # extended: queryUnifiedAlerts() keeps returning the full merged array
│                          #   unchanged (pagination stays a route-layer concern, matching how
│                          #   Workers dashboard's own inventory.ts vs. routes.ts split works) --
│                          #   only routes.ts changes
├── changes.ts             # extended: same -- computeChanges() unchanged, routes.ts paginates
└── routes.ts              # extended: GET /alerts and GET /changes each accept
                            #   page/page_size/sort_key/sort_dir, apply paginateArray() with a
                            #   { entity, detected?, severity } sort whitelist (detected only for
                            #   alerts, which alone has a timestamp -- data-model.md), response
                            #   gains a pagination envelope alongside the existing alerts/changes
                            #   array and unavailable_sources

app/pages/AuditInventory.tsx
                            # extended: own page/sort state per tab (mirroring every other
                            #   candidate page from spec 021), wired to FindingsTable's existing
                            #   pagination prop on both the Unified alerts inbox and What changed
                            #   tables

app/pages/OverviewPage.tsx  # extended: both fetch calls request page_size=5&sort_key=severity;
                            #   render stays a fixed-size list (no FindingsTable, no pager) plus a
                            #   new "N more -- see full list" indicator/link when
                            #   pagination.total > 5

tests/unit/
├── audit-routes.test.ts   # extended (or split): GET /alerts, GET /changes pagination/sort
│                          #   behavior, including the new severity accessor and the 400-on-invalid-
│                          #   param path (spec 020's existing convention)
tests/e2e/
├── audit-inventory.spec.ts  # extended: pagination scenario on both tabs
└── overview.spec.ts         # extended: bounded top-5 + "N more" indicator + link-to-Audit&Drift
                              #   scenario
```

**Structure Decision**: Existing single-Worker + React SPA structure, unchanged. No new shared
component or backend helper needed — this is a straight application of spec 020's already-built
`worker/pagination.ts` and `FindingsTable`'s existing pagination mode to two endpoints/pages that
were out of that feature's original scope, plus one new whitelist sort key (`severity`) reused by
both.

## Complexity Tracking

_No Constitution Check violations — this section is not applicable._
