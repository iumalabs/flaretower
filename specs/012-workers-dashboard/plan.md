# Implementation Plan: Workers Dashboard

**Branch**: `012-workers-dashboard` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-workers-dashboard/spec.md`

## Summary

A new, dedicated "Workers" page — separate from the existing "Exposure" page — showing every deployed
Worker script's environment, route count, last-deploy time, and existing exposure status, alongside
NEW real operational data (requests/errors/CPU over the trailing 24h, per-Worker and account-wide),
and a Workers-scoped "recent changes" panel sourced from Cloudflare's real Audit Logs API. Requires
splitting the sidebar's merged "Workers & Access" nav entry into separate "Workers" and "Exposure"
items. Two new read-only token scopes (research.md §1, §3): `Account Analytics Read` (GraphQL
Analytics API) and `Audit Logs Read`. This is the pilot for six more per-module dashboards (specs
013-018); its metric-card row and module-table components are built to be reused, not Workers-specific
one-offs.

## Technical Context

**Language/Version**: TypeScript (strict), React 19, Deno 2 runtime — unchanged.

**Primary Dependencies**: None new. Cloudflare's GraphQL Analytics API and Audit Logs API are called
via plain `fetch()`, matching every existing module's own `cfFetch`-style helper pattern — no GraphQL
client library.

**Storage**: One new D1 migration — a `worker_metrics_cache` table is NOT needed; operational metrics
(requests/errors/CPU) and recent-changes entries are read live from Cloudflare on each page load
(research.md's two new API calls), not persisted, since they're inherently time-windowed and
re-fetching is cheap. The existing `exposure_findings` table (Module 1) is read, not written, by this
feature. No new D1 migration.

**Testing**: `deno test` for the environment-classification and exposure-status-rollup pure functions
(Constitution Principle VI); Playwright for the new page (inventory renders, metric cards render real
mocked figures, "not available" degradation state, recent-changes panel, empty state, nav split).

**Target Platform**: Browser SPA + one new Worker route group (`/api/workers/*`).

**Project Type**: Existing single-Worker web application — one new page, nav split (2 files), one new
backend module (`worker/modules/workers-dashboard/`), reusing Module 1's existing inventory/evaluate
code as a dependency rather than duplicating it (this module reads Module 1's `exposure_findings`
table directly for the exposure-status column, per Constitution Principle III).

**Performance Goals**: Page load (including both new Cloudflare API calls) MUST complete within the
same order of magnitude as every other module's inventory page — no specific new SLA beyond this
project's existing "operator opens a page and sees current data without a noticeable stall" bar.

**Constraints**: MUST NOT fabricate any operational figure — an unavailable metric shows an explicit
"not available" state (spec.md FR-007). MUST NOT add any Cloudflare-mutating control (spec.md FR-009).
MUST NOT duplicate Module 7/8's existing finding-status-digest mechanism for the recent-changes panel
(research.md §3 — that mechanism answers a different question).

**Scale/Scope**: One new page (`WorkersDashboardPage`), nav split (`app/nav-items.ts`, `app/App.tsx`),
one new backend module (`worker/modules/workers-dashboard/`: Cloudflare Analytics + Audit Logs
clients, environment classification, exposure-status rollup, one new route
`GET /api/workers/dashboard`), two new README token-scope rows. Reusable pieces this spec is expected
to leave behind for specs 013-018: a `MetricCard`/metric-row component, and the Audit Logs
fetch/parse helper (research.md §3's note for spec 018).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
| --- | --- | --- |
| I. Access is the only gate | N/A | No identity/auth code touched — new page sits behind the existing Access-gated SPA shell. |
| II. Defense-in-depth JWT validation | Pass | New route `GET /api/workers/dashboard` is mounted behind the existing `accessAuth` middleware, same as every other module's routes — no new validation logic. |
| III. Single Worker, shared audit logic | Pass | Reads Module 1's `exposure_findings` table directly rather than re-evaluating exposure; the scheduled handler is untouched (this feature has no alerting/drift concept of its own — it is a live-read dashboard, not an evaluate-and-persist module). Audit Logs fetch/parse code is built once here for explicit reuse by spec 018 (research.md §3). |
| IV. Deno-only local toolchain | Pass | No new dependency. |
| V. One configuration file | Pass | No new config file class. |
| VI. Strict TypeScript, test-first, Playwright | Pass (gate for implementation) | Environment classification and exposure-status rollup are pure functions, tested first; Playwright covers the new page's states. |
| VII. Never publicly reachable | Pass | Unaffected — `workers_dev: false` untouched. |
| VIII. Least-privilege secrets | Pass, with a new scope | Two new read-only scopes added (`Account Analytics Read`, `Audit Logs Read`) — both directly required by this spec's own functional requirements (FR-005/006, FR-008), documented in research.md §1/§3/§4, added to README's scope table. No write/mutation scope of any kind. |
| IX. Every mutation is audited | N/A | This feature performs no Cloudflare-account mutation — it is entirely read-only (spec.md FR-009). Nothing for `audit_log` to record. |
| X. English-only, Conventional Commits | Pass | Unaffected. |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/012-workers-dashboard/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
worker/modules/workers-dashboard/
├── types.ts          # WorkerDashboardRow, AccountSummary, RecentChangeEntry
├── analytics.ts       # GraphQL Analytics API client (research.md §1)
├── audit-log.ts        # Cloudflare Audit Logs API client (research.md §3) — spec 018 reuses this
├── classify.ts         # Environment classification (research.md §2) + exposure-status rollup, pure functions, unit-tested
├── routes.ts           # GET /api/workers/dashboard — assembles inventory + analytics + audit log
worker/index.ts          # Mount /api/workers/* (one line, same pattern as every prior module)

app/pages/WorkersDashboardPage.tsx   # New page
app/components/MetricCard.tsx        # New shared component (reused by specs 013-018)
app/nav-items.ts                     # Split "exposure" entry into "workers" + "exposure"
app/App.tsx                          # Route the new "workers" nav key to WorkersDashboardPage

tests/unit/workers-dashboard-classify.test.ts
tests/e2e/workers-dashboard.spec.ts
```

**Structure Decision**: Follows this project's established single-Worker module layout exactly
(`worker/modules/<name>/` + one `app/pages/<Name>Page.tsx` + nav entry), with one addition: a shared
`app/components/MetricCard.tsx` extracted up-front (rather than inlined in this page and later
extracted by spec 013) since the design's metric-card row is explicitly a repeated pattern across all
7 new module mockups (research already confirmed via visual review of §09-§14).

## Complexity Tracking

No violations — table not needed.
