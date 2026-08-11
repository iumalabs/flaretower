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

## `zt_evaluation_runs`

Added by convergence tasks T025/T026 (`worker/db/migrations/0008_zero_trust_run_log.sql`).
A run-level marker, independent of `zt_app_findings`/`zt_token_findings` row
counts — written unconditionally on every run, even one that legitimately
finds zero applications and zero service tokens. `GET /inventory` uses this
table (not either findings table) to find the latest run: it's the only
reliable way to tell "never evaluated" (`run_id: null`, no row here) apart
from "evaluated, found nothing" (a row exists, both findings tables return
zero rows for that `run_id`), and it stops the findings tables' independent
identity spaces (applications vs. service tokens) from gating each other.

| Column | Type | Notes |
|---|---|---|
| `run_id` | `TEXT PRIMARY KEY` | Same `run_id` written to both findings tables for that run |
| `evaluated_at` | `TEXT NOT NULL` | ISO 8601 |
| `run_trigger` | `TEXT NOT NULL` | `interactive` or `scheduled` |
| `app_count` | `INTEGER NOT NULL` | Count of `zt_app_findings` rows this run produced (may be 0) |
| `token_count` | `INTEGER NOT NULL` | Count of `zt_token_findings` rows this run produced (may be 0) |

**Index**: `(evaluated_at DESC)`.

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
