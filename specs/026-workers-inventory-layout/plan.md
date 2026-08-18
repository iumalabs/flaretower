# Implementation Plan: Workers Inventory Layout

**Branch**: `026-workers-inventory-layout` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-workers-inventory-layout/spec.md`

## Summary

Closes GitHub issue #420 as a presentation-only fix (research.md — the underlying Workers dashboard
data was already correct). `FindingsTable` gains a small, backward-compatible `statusPosition?:
"left" | "right"` prop (default `"left"`, every existing caller unaffected) instead of a third
bespoke table component, since Workers' columns already fit `FindingsTable`'s existing model
(research.md §1). One tiny backend addition — `AccountSummary.totalRouteCount`, a pure sum over data
already in memory (research.md §2) — powers the new header subtitle; everything else (search,
environment filter, CPU P99 context, the recent-activity control) is frontend-only, reusing data
this page already fetches. Two of GitHub issue #420's four claims (the Recent changes panel being
unspecced / mis-cased) were verified incorrect against the current codebase before drafting and are
explicitly left untouched (research.md §6).

## Technical Context

**Language/Version**: TypeScript (strict), Deno 2.9+

**Primary Dependencies**: React — no new dependency.

**Storage**: D1 — no schema change; `AccountSummary.totalRouteCount` is computed in memory from data
already queried, not a new query (research.md §2).

**Testing**: Playwright — extends `tests/e2e/workers-dashboard.spec.ts` with column-order,
header-toolbar, and metric-tile scenarios, plus a regression scenario on another `FindingsTable`
caller confirming `statusPosition`'s default is unaffected (research.md §7).

**Target Platform**: Browser (React SPA) + one Worker-side change (`buildAccountSummary`'s new
field) — no new Cloudflare API call, no new route.

**Performance Goals**: N/A beyond spec.md SC-003 ("under 5 seconds" search, qualitative).

**Constraints**: MUST NOT change `FindingsTable`'s default (left) status position for any of its
other 7 current callers (spec.md FR-002, SC-002). MUST NOT change Workers dashboard detection/
aggregation logic beyond the one additive summary field (FR-010). MUST NOT introduce any
Cloudflare-mutating capability (FR-011) — every new control is read-only/navigational.

**Scale/Scope**: 1 shared-component prop addition (`FindingsTable`), 1 backend field addition
(`AccountSummary.totalRouteCount`), 1 page rebuild (header toolbar + column reorder +
CPU P99 context on `WorkersDashboardPage.tsx`), 1 extended e2e spec file.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I/II (Access-only auth, JWT validation)**: No change — reuses the already-gated
  `GET /api/workers/dashboard` route as-is, no new route, no new auth logic. PASS.
- **Principle III (single Worker, shared audit logic)**: No change — `totalRouteCount` is computed
  inside the existing `buildAccountSummary()`, the same function both the dashboard's only
  (interactive) code path already calls; this page has no scheduled/cron counterpart to diverge
  from. No new evaluation logic anywhere. PASS.
- **Principle IV/V (Deno-only, one config file)**: No new tooling/dependency/config file. PASS.
- **Principle VI (strict TypeScript, test-first, Playwright)**: Covered by extending
  `tests/e2e/workers-dashboard.spec.ts` (research.md §7); `FindingsTable`'s `statusPosition` prop is
  exercised through both Workers' own coverage and a regression check on an unaffected page. PASS.
- **Principle VII (never publicly reachable)**: Unaffected. PASS.
- **Principle VIII (least-privilege secrets)**: No new secret, no new scope — `totalRouteCount` is a
  pure computation over data the existing token scope already fetches. PASS.
- **Principle IX (every mutation audited)**: N/A — this feature performs zero Cloudflare-mutating
  actions (FR-011); every new control (search, environment filter, recent-activity scroll-to) is
  read-only/navigational, nothing writes to `audit_log`.
- **Principle X (English-only, Conventional Commits)**: PASS by convention.

No violations. Proceeding to Phase 0.

**Post-design re-check** (after research.md/data-model.md/quickstart.md): research.md §1's decision
to extend `FindingsTable` rather than duplicate it (as specs/025 did for Exposure, for good reason
specific to that page's column shapes) was the key design-phase call — re-confirmed safe because
Workers' columns already match `FindingsTable`'s existing generic-column model exactly; only the
status pill's position needed to change. No new Constitution concerns. Still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/026-workers-inventory-layout/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── checklists/requirements.md
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory — the one backend change (`AccountSummary.totalRouteCount`) is an
additive field on an existing, already-documented response shape, not a new endpoint or a breaking
contract change.

### Source Code (repository root)

```text
worker/modules/workers-dashboard/
├── types.ts              # AccountSummary gains totalRouteCount
└── routes.ts              # buildAccountSummary() computes it; JSON response includes
                             #   total_route_count

app/components/
└── FindingsTable.tsx      # new optional statusPosition prop ("left" default | "right"),
                             #   every existing caller's output unchanged

app/pages/
└── WorkersDashboardPage.tsx # rebuilt header (subtitle, description, search, environment
                              #   filter, recent-activity control) + statusPosition="right" +
                              #   CPU P99 MetricCard gets a context line

tests/e2e/
└── workers-dashboard.spec.ts # extended: column-order, header-toolbar, metric-tile scenarios,
                               #   plus a statusPosition regression check on another page
```

**Structure Decision**: Existing single-Worker + React SPA structure, unchanged — this feature adds
no new backend route. `FindingsTable` is deliberately extended rather than forked a third time
(research.md §1) — the smaller, more maintainable choice given Workers' columns already fit its
existing model.

## Complexity Tracking

*No Constitution Check violations — this section is not applicable.*
