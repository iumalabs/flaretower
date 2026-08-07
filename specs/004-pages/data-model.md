# Data Model: Pages

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-08

Three independent finding/alert table pairs (research.md §3) — custom
domains have a distinct identity from projects, and the two project-keyed
checks (`pages.dev` exposure, deployment health) are kept separate so each
alerts independently.

## `pages_domain_findings`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `project_name` | `TEXT NOT NULL` | |
| `domain_name` | `TEXT NOT NULL` | The custom domain hostname |
| `status` | `TEXT NOT NULL` | `safe`, `warning`, `not_evaluated` (a non-active domain state is a configuration/verification problem, not a public-exposure one — `warning`, no `critical` outcome for this check) |
| `reason` | `TEXT NOT NULL` | |
| `evaluated_at` | `TEXT NOT NULL` | ISO 8601 |
| `run_id` | `TEXT NOT NULL` | |
| `run_trigger` | `TEXT NOT NULL` | `interactive` or `scheduled` |

**Index**: `(project_name, domain_name, evaluated_at DESC)`.

## `pages_domain_alerts`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | |
| `project_name` | `TEXT NOT NULL` | |
| `domain_name` | `TEXT NOT NULL` | |
| `previous_status` | `TEXT` | `NULL` if first-ever evaluation |
| `new_status` | `TEXT NOT NULL` | `warning` only |
| `run_id` | `TEXT NOT NULL` | |
| `detected_at` | `TEXT NOT NULL` | |
| `acknowledged_at` | `TEXT` | |

## `pages_subdomain_findings`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `project_name` | `TEXT NOT NULL` | Also the identity key — one `<project_name>.pages.dev` host per project |
| `subdomain` | `TEXT NOT NULL` | The `<project_name>.pages.dev` host, stored for display |
| `status` | `TEXT NOT NULL` | `safe`, `warning`, `critical`, `not_evaluated` |
| `reason` | `TEXT NOT NULL` | |
| `evaluated_at` | `TEXT NOT NULL` | |
| `run_id` | `TEXT NOT NULL` | |
| `run_trigger` | `TEXT NOT NULL` | |

**Index**: `(project_name, evaluated_at DESC)`.

## `pages_subdomain_alerts`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | |
| `project_name` | `TEXT NOT NULL` | |
| `subdomain` | `TEXT NOT NULL` | |
| `previous_status` | `TEXT` | |
| `new_status` | `TEXT NOT NULL` | `warning` or `critical` |
| `run_id` | `TEXT NOT NULL` | |
| `detected_at` | `TEXT NOT NULL` | |
| `acknowledged_at` | `TEXT` | |

## `pages_deployment_findings`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `project_name` | `TEXT NOT NULL` | Identity key |
| `deployment_id` | `TEXT` | `NULL` when no production deployment exists yet |
| `status` | `TEXT NOT NULL` | `safe`, `warning`, `not_evaluated` (deployment health has no `critical` outcome — the previous successful build, if any, keeps serving) |
| `reason` | `TEXT NOT NULL` | |
| `evaluated_at` | `TEXT NOT NULL` | |
| `run_id` | `TEXT NOT NULL` | |
| `run_trigger` | `TEXT NOT NULL` | |

**Index**: `(project_name, evaluated_at DESC)`.

## `pages_deployment_alerts`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | |
| `project_name` | `TEXT NOT NULL` | |
| `deployment_id` | `TEXT` | |
| `previous_status` | `TEXT` | |
| `new_status` | `TEXT NOT NULL` | `warning` only |
| `run_id` | `TEXT NOT NULL` | |
| `detected_at` | `TEXT NOT NULL` | |
| `acknowledged_at` | `TEXT` | |

## Entity relationships

```
Pages Project (from Cloudflare API, not persisted)
  ├─ has 0..N Custom Domains
  │    └─ each evaluated into exactly 1 pages_domain_findings row per run
  │         └─ a status change vs. the previous run produces 0..1 pages_domain_alerts rows
  ├─ has exactly 1 pages.dev subdomain
  │    └─ evaluated (against the account's Access applications) into exactly
  │       1 pages_subdomain_findings row per run
  │         └─ a status change vs. the previous run produces 0..1 pages_subdomain_alerts rows
  └─ has 0..1 "most recent production deployment"
       └─ evaluated into exactly 1 pages_deployment_findings row per run
            └─ a status change vs. the previous run produces 0..1 pages_deployment_alerts rows
```

Access applications and policies are not persisted by this module — read
inline from the Cloudflare API on each run and evaluated against each
project's `pages.dev` hostname, same "account is the source of truth"
principle as every prior module.
