# Data Model: Workers Dashboard

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-13

No new D1 table (plan.md's Storage decision) — every entity below is assembled live on each request
from three sources: Module 1's existing `exposure_findings` table (read-only), Cloudflare's GraphQL
Analytics API, and Cloudflare's Audit Logs API. Nothing here is persisted by this module.

## `WorkerDashboardRow` (response shape, one per deployed Worker script)

| Field | Type | Notes |
| --- | --- | --- |
| `worker_name` | `string` | |
| `environment` | `"production" \| "preview"` | research.md §2 |
| `route_count` | `number` | Count of this Worker's active hostnames (custom domain + workers.dev + preview), from Module 1's inventory. |
| `last_deploy_at` | `string \| null` | ISO 8601; `null` if not obtainable. |
| `requests_24h` | `number \| null` | `null` = not available (FR-007), never a fabricated 0. |
| `errors_24h` | `number \| null` | |
| `cpu_p50_ms` | `number \| null` | |
| `exposure_status` | `"critical" \| "warning" \| "safe" \| "not_evaluated"` | Worst-of-hostnames rollup (spec.md FR-004) over Module 1's `exposure_findings` rows for this `worker_name`. |

## `AccountSummary` (response shape, one per dashboard load)

| Field | Type | Notes |
| --- | --- | --- |
| `deployed_count` | `number` | Total deployed Worker scripts. |
| `deployed_by_environment` | `{ production: number; preview: number }` | |
| `requests_24h_total` | `number \| null` | |
| `requests_24h_change_pct` | `number \| null` | vs. prior 24h window; `null` if either window's data is unavailable. |
| `error_rate_pct` | `number \| null` | `errors_24h_total / requests_24h_total`. |
| `errors_24h_total` | `number \| null` | |
| `cpu_p99_ms` | `number \| null` | Account-wide P99, distinct from each row's own P50. |

## `RecentChangeEntry` (response shape, list)

| Field | Type | Notes |
| --- | --- | --- |
| `occurred_at` | `string` | ISO 8601 |
| `actor` | `string` | e.g. `wrangler`, `@ilse`, `terraform` — from Cloudflare Audit Logs' actor field. |
| `actor_source` | `string` | e.g. `dashboard`, `api`, `wrangler`, `terraform`. |
| `action` | `string` | Human-readable action summary. |
| `target` | `string` | The Worker/route/binding the entry concerns. |
| `result_summary` | `string \| null` | Short before/after or outcome summary, when the Audit Logs entry carries one. |

**Filtering rule**: only Audit Logs entries whose resource identifies a Worker script, a Worker route,
or an Access application bound to a Worker's route are included — everything else (DNS-only, Pages-only,
etc. entries) is excluded from this panel (spec.md FR-008).

## Reused, not owned, by this module

- **`exposure_findings`** (Module 1) — read-only. This module does not evaluate exposure itself; it
  rolls up Module 1's latest run's per-hostname rows into one status per Worker (research.md, spec.md
  FR-004).
