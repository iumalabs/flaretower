# Data Model: Pages Dashboard

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-13

**Numbering note**: this spec's migration is named `0011_...` even though `0009` is the highest
migration present on this branch at the time of writing — spec 014's still-unmerged PR already claims
`0010` (`zt_app_findings_add_policy_detail.sql`). Naming this one `0011` up front avoids a numbering
collision once both merge to `main` in sequence, rather than both PRs claiming `0010`.

## `pages_subdomain_findings` (existing table, extended)

New column, added by `worker/db/migrations/0011_pages_findings_add_branch_and_build_time.sql`:

| Column | Type | Notes |
| --- | --- | --- |
| `production_branch` | `TEXT` | Nullable — Cloudflare's own project-level field (research.md §1), not currently captured. |

## `pages_deployment_findings` (existing table, extended)

New column, same migration:

| Column | Type | Notes |
| --- | --- | --- |
| `created_at` | `TEXT` | Nullable — ISO 8601, the deployment's own `created_on` (research.md §1). |

Every other existing column on both tables, and both tables' `status` CHECK constraints, are
unchanged (spec.md FR-003).

## `SubdomainEvaluation` / `DeploymentEvaluation` (response shapes, extended)

| Field | Type | Notes |
| --- | --- | --- |
| `SubdomainEvaluation.productionBranch` | `string \| null` | `null` = "not set" (spec.md Edge Cases). |
| `DeploymentEvaluation.createdAt` | `string \| null` | `null` = "not available." |

## `PagesProjectRow` (response shape, assembled at read time — GET /inventory)

| Field | Type | Notes |
| --- | --- | --- |
| `project_name` | `string` | |
| `production_domain` | `string \| null` | Derived (research.md §2) — first `safe`-status domain from `pages_domain_findings`, or `null` ("none"). |
| `production_branch` | `string \| null` | |
| `last_build_status` | `string` | The existing `DeploymentEvaluation.status`. |
| `last_build_reason` | `string` | The existing `DeploymentEvaluation.reason`. |
| `last_build_created_at` | `string \| null` | |
| `health_status` | `ExposureStatus` | The existing `SubdomainEvaluation.status`, unchanged (research.md §3). |
| `health_reason` | `string` | The existing `SubdomainEvaluation.reason`, unchanged — carries what the mockup's second pill would have shown. |
