# Implementation Plan: Worker Detail Page

**Branch**: `023-worker-detail-page` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/023-worker-detail-page/spec.md`

## Summary

A new `GET /api/workers/:worker_name/detail` endpoint composes three modules' already-persisted
findings for one Worker — its routes/hostnames and their exposure status (`exposure_findings`,
same shape `GET /api/exposure/inventory` already returns, narrowed by `worker_name`), the plain-
language Access policy covering each route (a join against `zt_app_findings`'s already-humanized
`policy_rules_json`, made possible by one new structured column, `covering_app_ids`, replacing a
fragile plan to parse Access application IDs back out of a human-readable reason string), and
recent changes scoped to this Worker (`fetchAccountAuditLog()`, the same live Cloudflare Audit
Logs call and 7-day window the Workers dashboard's own "Recent changes" panel already makes,
filtered to a narrower hostname set). No new evaluation logic — this is read-only composition, per
spec.md's Assumptions. A new `WorkerDetailPage.tsx`, reached by clicking a row in the existing
Workers dashboard table, renders it; `App.tsx` lifts the Workers dashboard's page/sort/filter state
up one level so returning from the detail page preserves it (FR-011).

## Technical Context

**Language/Version**: TypeScript (strict), Deno 2.9+

**Primary Dependencies**: Hono, React — no new dependency. This is a dedicated page reached by
navigation, not `FindingsTable`'s existing row-detail expand pattern (Exposure inventory's own
sibling-hostnames panel) — that pattern stays exactly as-is and unrelated. Reuses
`zero-trust/rule-humanizer.ts`'s pre-computed `policy_rules_json` and
`workers-dashboard/audit-log.ts`'s `fetchAccountAuditLog()`/`filterWorkersRelevant()` verbatim.

**Storage**: D1. One new nullable column, `exposure_findings.covering_app_ids` (migration 0014,
data-model.md) — written by the existing `POST /api/exposure/evaluate` / scheduled evaluation
(`runEvaluation()` in `worker/modules/workers-access-exposure/routes.ts`), read by the new detail
endpoint. No other schema change; the `zt_app_findings` join reads columns migration 0010 already
added.

**Testing**: `deno test` for the new detail-composition logic (`tests/unit/` — a new
`workers-detail.test.ts` or extending `workers-dashboard-routes.test.ts`, covering the not-found
case, the zero-routes case, the policy-join including the "app_id absent from latest ZT run"
degradation, and the unavailable-source cases) and `evaluateHostname()`'s new `coveringAppIds`
field (extends `tests/unit/` wherever `evaluate.ts` is already covered). Playwright: a new
`tests/e2e/worker-detail.spec.ts` covering all three user stories plus the edge cases
(quickstart.md), and an extension to the existing Workers dashboard e2e spec for the
row-click-through and state-preservation-on-return behavior (FR-011).

**Target Platform**: Cloudflare Workers (interactive `GET` route only — no scheduled-handler
change; the one live Cloudflare API call this endpoint makes, `fetchAccountAuditLog()`, is the
same call two other interactive-only routes already make).

**Project Type**: Web application (existing structure, unchanged).

**Performance Goals**: N/A beyond spec.md SC-001–SC-004 (qualitative). The `zt_app_findings` join
is a single `WHERE app_id IN (...)` query regardless of route count (data-model.md) — not N+1.

**Constraints**: Must not introduce any Cloudflare-state-mutating action (spec.md Assumptions,
FR-010) — this endpoint and page are `GET`-only, no `POST`. Must not duplicate exposure or Access
evaluation logic (Principle III) — every status/policy value shown is read from the latest
persisted run of the module that already owns that evaluation, never recomputed here.

**Scale/Scope**: 1 migration, 1 new backend route + composition function, 2 small extensions
(`evaluate.ts`'s `coveringAppIds`, `filterWorkersRelevant`'s hostname-set parameter generalized),
1 new frontend page, 1 `App.tsx` navigation/state-lifting change.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Principle I/II (Access-only auth, JWT validation)**: No change — the new route sits behind the
  same JWT middleware as every other `/api/*` route. PASS.
- **Principle III (single Worker, shared audit logic)**: The new endpoint introduces no new
  evaluation — it reads the latest run of two existing evaluation pipelines (exposure, zero-trust)
  and reuses `fetchAccountAuditLog()` as-is. `evaluateHostname()`'s one addition
  (`coveringAppIds`) is populated from data that function already computes internally in every
  branch, not a new decision. PASS.
- **Principle IV/V (Deno-only, one config file)**: No new tooling/dependency/config file. PASS.
- **Principle VI (strict TypeScript, test-first, Playwright)**: Unit tests for the new
  composition/join logic and `evaluateHostname()`'s extended return shape land before/alongside
  the route change; a new Playwright spec covers the full user-facing flow including edge cases.
  PASS.
- **Principle VII (never publicly reachable)**: Unaffected. PASS.
- **Principle VIII (least-privilege secrets)**: No new secret, no new scope — `fetchAccountAuditLog()`
  already uses the existing `CF_API_TOKEN`'s Audit Logs scope (granted for spec 012/018).
- **Principle IX (every mutation audited)**: N/A — this feature has no mutation. FR-010 makes this
  an explicit requirement, not just an absence: no button on this page may call a Cloudflare-
  mutating endpoint. PASS.
- **Principle X (English-only, Conventional Commits)**: PASS by convention.

No violations. Proceeding to Phase 0.

**Post-design re-check** (after research.md/data-model.md/quickstart.md): research.md §3 corrected
a mismatch in the original feature description (it named `computeChanges()`/`queryUnifiedAlerts()`
as the recent-changes source; the actually-matching, mockup-consistent source is
`fetchAccountAuditLog()`) — a correction that simplifies the design (one existing function reused
as-is, no new D1-side filtering-by-hostname-set logic needed on the status-transition digest) rather
than adding complexity. No new violations. Still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/023-worker-detail-page/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── api.md            # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
worker/db/migrations/
└── 0014_exposure_findings_add_covering_app_ids.sql
                            # new: ALTER TABLE exposure_findings ADD COLUMN covering_app_ids TEXT

worker/modules/workers-access-exposure/
├── types.ts                # extended: HostnameEvaluation gains coveringAppIds: string[]
├── evaluate.ts              # extended: evaluateHostname() populates coveringAppIds from the
│                            #   `covering` array it already computes, in every branch
├── routes.ts                # extended: runEvaluation()'s INSERT statements gain the new column;
│                            #   GET /inventory unaffected (doesn't need to expose the new field)
└── inventory.ts              # extended: new getWorkerHostnames(db, workerName) — same query as
                             #   GET /inventory's handler, narrowed WHERE worker_name = ?
                             #   (research.md §1)

worker/modules/workers-dashboard/
├── audit-log.ts              # extended: filterWorkersRelevant() takes any Set<string> of
│                             #   hostnames (already its parameter type) — no signature change,
│                             #   just a second call site with a narrower set (research.md §3)
├── detail.ts                 # new: buildWorkerDetail(env, workerName) — composes routes (via
│                             #   getWorkerHostnames), the zt_app_findings policy join, and
│                             #   fetchAccountAuditLog() filtered to this Worker; mirrors
│                             #   buildWorkersDashboard()'s existing structure/error-handling
└── routes.ts                 # extended: GET /:worker_name/detail, 404 on not-found
                             #   (data-model.md)

app/pages/
├── WorkersDashboardPage.tsx  # extended: rows become clickable (onSelect callback prop, mirroring
│                             #   OverviewPage's onNavigateToAudit pattern); page/sortKey/sortDir
│                             #   state lifted to props (FR-011) instead of local useState
└── WorkerDetailPage.tsx      # new: renders routes (status + policy per route), recent changes,
                             #   not-found/zero-routes/unavailable states, "Open in Cloudflare"
                             #   link, "back to Workers" affordance

app/App.tsx                  # extended: selectedWorker state + workers-page state lifted up
                             #   (data-model.md's Frontend navigation state section); new
                             #   "worker-detail" PAGES entry

tests/unit/
└── workers-detail.test.ts    # new: buildWorkerDetail()'s composition/join/degradation logic;
                             #   evaluateHostname()'s coveringAppIds extension covered wherever
                             #   evaluate.ts's existing tests live

tests/e2e/
├── worker-detail.spec.ts     # new: all 3 user stories + edge cases (quickstart.md)
└── workers-dashboard.spec.ts # extended: row click navigates to detail; returning preserves
                             #   page/sort/filter state (FR-011)
```

**Structure Decision**: Existing single-Worker + React SPA structure, unchanged. The new endpoint
lives alongside `buildWorkersDashboard()` in the same `workers-dashboard` module (it's the natural
home — reached from that page, shares its `fetchAccountAuditLog()`/`filterWorkersRelevant()`
dependency) rather than under `workers-access-exposure`, even though it also reads
`exposure_findings` — matching this module's existing precedent of reading another module's tables
directly for composition (`getExposureStatusByWorker()` already does this for the dashboard's own
per-row status column).

## Complexity Tracking

_No Constitution Check violations — this section is not applicable._
