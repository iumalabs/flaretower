# Data Model: Zero Trust / Access

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-07

Two independent finding/alert table pairs (research.md §5) — applications
and service tokens have different identity shapes and lifecycles.

## `zt_app_findings`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `app_id` | `TEXT NOT NULL` | Cloudflare Access application ID |
| `app_domain` | `TEXT NOT NULL` | The application's configured domain/hostname |
| `status` | `TEXT NOT NULL` | `safe`, `warning`, `not_evaluated` (this module's app check has no `critical` outcome — an open policy is a `warning`-level finding, distinct from Module 1's Worker-specific `critical` framing, since this module's app may not be internet-reachable via a Worker at all) |
| `reason` | `TEXT NOT NULL` | |
| `evaluated_at` | `TEXT NOT NULL` | ISO 8601 |
| `run_id` | `TEXT NOT NULL` | |
| `run_trigger` | `TEXT NOT NULL` | `interactive` or `scheduled` |

**Index**: `(app_id, evaluated_at DESC)`.

## `zt_app_alerts`

Same shape as every prior module's alert table, keyed by `app_id`.

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | |
| `app_id` | `TEXT NOT NULL` | |
| `app_domain` | `TEXT NOT NULL` | |
| `previous_status` | `TEXT` | `NULL` if first-ever evaluation |
| `new_status` | `TEXT NOT NULL` | `warning` only (this module's app check never produces `critical`) |
| `run_id` | `TEXT NOT NULL` | |
| `detected_at` | `TEXT NOT NULL` | |
| `acknowledged_at` | `TEXT` | |

## `zt_token_findings`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `token_id` | `TEXT NOT NULL` | Cloudflare service token ID |
| `token_name` | `TEXT NOT NULL` | |
| `expires_at` | `TEXT` | `NULL` if the token has no expiration on record |
| `status` | `TEXT NOT NULL` | `safe`, `warning`, `critical`, `not_evaluated` |
| `reason` | `TEXT NOT NULL` | |
| `evaluated_at` | `TEXT NOT NULL` | |
| `run_id` | `TEXT NOT NULL` | |
| `run_trigger` | `TEXT NOT NULL` | |

**Index**: `(token_id, evaluated_at DESC)`.

## `zt_token_alerts`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | |
| `token_id` | `TEXT NOT NULL` | |
| `token_name` | `TEXT NOT NULL` | |
| `previous_status` | `TEXT` | |
| `new_status` | `TEXT NOT NULL` | `warning` or `critical` |
| `run_id` | `TEXT NOT NULL` | |
| `detected_at` | `TEXT NOT NULL` | |
| `acknowledged_at` | `TEXT` | |

## Entity relationships

```
Access Application (from Cloudflare API, not persisted)
  ├─ has 0..N Access Policies (evaluated inline, not separately persisted)
  └─ evaluated into exactly 1 zt_app_findings row per run
       └─ a status change vs. the previous run produces 0..1 zt_app_alerts rows

Service Token (from Cloudflare API, not persisted)
  └─ evaluated into exactly 1 zt_token_findings row per run
       └─ a status change vs. the previous run produces 0..1 zt_token_alerts rows
```

Policies are not persisted as their own rows — they're evaluated inline
when scoring an application (the same "account is the source of truth"
principle as every prior module; D1 only remembers the evaluated
*outcome*, not the raw policy list).
