# Data Model: Security Posture

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-10

Four independent finding/alert table pairs (research.md §7) — all
zone-keyed, kept separate so each of the four checks alerts
independently, following Module 4's established precedent for
same-parent-entity, independently-alertable signals.

## `ssl_tls_findings`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `zone_id` | `TEXT NOT NULL` | |
| `zone_name` | `TEXT NOT NULL` | |
| `status` | `TEXT NOT NULL` | `safe`, `warning`, `critical`, `not_evaluated` |
| `reason` | `TEXT NOT NULL` | |
| `evaluated_at` | `TEXT NOT NULL` | ISO 8601 |
| `run_id` | `TEXT NOT NULL` | |
| `run_trigger` | `TEXT NOT NULL` | `interactive` or `scheduled` |

**Index**: `(zone_id, evaluated_at DESC)`.

## `ssl_tls_alerts`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | |
| `zone_id` | `TEXT NOT NULL` | |
| `zone_name` | `TEXT NOT NULL` | |
| `previous_status` | `TEXT` | `NULL` if first-ever evaluation |
| `new_status` | `TEXT NOT NULL` | `warning` or `critical` |
| `run_id` | `TEXT NOT NULL` | |
| `detected_at` | `TEXT NOT NULL` | |
| `acknowledged_at` | `TEXT` | |

## `dnssec_findings`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `zone_id` | `TEXT NOT NULL` | |
| `zone_name` | `TEXT NOT NULL` | |
| `status` | `TEXT NOT NULL` | `safe`, `warning`, `not_evaluated` (no `critical` outcome) |
| `reason` | `TEXT NOT NULL` | |
| `evaluated_at` | `TEXT NOT NULL` | |
| `run_id` | `TEXT NOT NULL` | |
| `run_trigger` | `TEXT NOT NULL` | |

**Index**: `(zone_id, evaluated_at DESC)`.

## `dnssec_alerts`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | |
| `zone_id` | `TEXT NOT NULL` | |
| `zone_name` | `TEXT NOT NULL` | |
| `previous_status` | `TEXT` | |
| `new_status` | `TEXT NOT NULL` | `warning` only |
| `run_id` | `TEXT NOT NULL` | |
| `detected_at` | `TEXT NOT NULL` | |
| `acknowledged_at` | `TEXT` | |

## `waf_findings`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `zone_id` | `TEXT NOT NULL` | |
| `zone_name` | `TEXT NOT NULL` | |
| `status` | `TEXT NOT NULL` | `safe`, `warning`, `not_evaluated` |
| `reason` | `TEXT NOT NULL` | |
| `evaluated_at` | `TEXT NOT NULL` | |
| `run_id` | `TEXT NOT NULL` | |
| `run_trigger` | `TEXT NOT NULL` | |

**Index**: `(zone_id, evaluated_at DESC)`.

## `waf_alerts`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | |
| `zone_id` | `TEXT NOT NULL` | |
| `zone_name` | `TEXT NOT NULL` | |
| `previous_status` | `TEXT` | |
| `new_status` | `TEXT NOT NULL` | `warning` only |
| `run_id` | `TEXT NOT NULL` | |
| `detected_at` | `TEXT NOT NULL` | |
| `acknowledged_at` | `TEXT` | |

## `rate_limiting_findings`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `zone_id` | `TEXT NOT NULL` | |
| `zone_name` | `TEXT NOT NULL` | |
| `status` | `TEXT NOT NULL` | `safe`, `warning`, `not_evaluated` |
| `reason` | `TEXT NOT NULL` | |
| `evaluated_at` | `TEXT NOT NULL` | |
| `run_id` | `TEXT NOT NULL` | |
| `run_trigger` | `TEXT NOT NULL` | |

**Index**: `(zone_id, evaluated_at DESC)`.

## `rate_limiting_alerts`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | |
| `zone_id` | `TEXT NOT NULL` | |
| `zone_name` | `TEXT NOT NULL` | |
| `previous_status` | `TEXT` | |
| `new_status` | `TEXT NOT NULL` | `warning` only |
| `run_id` | `TEXT NOT NULL` | |
| `detected_at` | `TEXT NOT NULL` | |
| `acknowledged_at` | `TEXT` | |

## Entity relationships

```
Zone (from Cloudflare API, not persisted)
  ├─ has exactly 1 SSL/TLS mode
  │    └─ evaluated into exactly 1 ssl_tls_findings row per run
  │         └─ a status change vs. the previous run produces 0..1 ssl_tls_alerts rows
  ├─ has exactly 1 DNSSEC status
  │    └─ evaluated into exactly 1 dnssec_findings row per run
  │         └─ a status change vs. the previous run produces 0..1 dnssec_alerts rows
  ├─ has 0..1 WAF managed-ruleset entrypoint
  │    └─ evaluated into exactly 1 waf_findings row per run
  │         └─ a status change vs. the previous run produces 0..1 waf_alerts rows
  └─ has 0..1 rate-limiting-ruleset entrypoint
       └─ evaluated into exactly 1 rate_limiting_findings row per run
            └─ a status change vs. the previous run produces 0..1 rate_limiting_alerts rows

Turnstile Widget (from Cloudflare API, never persisted, never evaluated)
```

WAF/rate-limiting ruleset rule details are not persisted as their own
rows — read inline from the Cloudflare API on each run and evaluated
into a single presence/absence verdict, the same "account is the source
of truth" principle as every prior module.
