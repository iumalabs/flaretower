# Data Model: DNS

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-07

Structurally parallel to Module 1's `exposure_findings`/`exposure_alerts`
(see [`specs/001-workers-access-exposure/data-model.md`](../001-workers-access-exposure/data-model.md))
— this module owns its own pair of tables rather than sharing Module 1's,
per research.md §5.

## New tables (owned by this module)

### `dns_findings`

One row per (record, evaluation run).

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `zone_name` | `TEXT NOT NULL` | The zone this record belongs to |
| `record_name` | `TEXT NOT NULL` | The record's full name (e.g. `www.example.com`) |
| `record_type` | `TEXT NOT NULL` | `A`, `AAAA`, `CNAME`, `MX`, `TXT`, `NS`, etc. |
| `content` | `TEXT NOT NULL` | The record's target/content |
| `proxy_capable` | `INTEGER NOT NULL` | Boolean (0/1) — whether this record type can be proxied at all |
| `proxied` | `INTEGER` | Boolean (0/1), `NULL` if not proxy-capable |
| `status` | `TEXT NOT NULL` | `safe`, `warning`, `critical`, `not_evaluated` |
| `reason` | `TEXT NOT NULL` | Human/machine-readable explanation |
| `evaluated_at` | `TEXT NOT NULL` | ISO 8601 |
| `run_id` | `TEXT NOT NULL` | Groups all rows from one evaluation run |
| `run_trigger` | `TEXT NOT NULL` | `interactive` or `scheduled` |

**Indexes**: `(zone_name, record_name, record_type, evaluated_at DESC)` —
latest-state-per-record is the primary read pattern, same rationale as
Module 1's `exposure_findings` index.

### `dns_alerts`

One row per alert-worthy transition, same shape and rationale as Module
1's `exposure_alerts`.

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `zone_name` | `TEXT NOT NULL` | |
| `record_name` | `TEXT NOT NULL` | |
| `record_type` | `TEXT NOT NULL` | |
| `previous_status` | `TEXT` | `NULL` if first-ever evaluation of this record |
| `new_status` | `TEXT NOT NULL` | The newly observed `warning` or `critical` status |
| `run_id` | `TEXT NOT NULL` | |
| `detected_at` | `TEXT NOT NULL` | |
| `acknowledged_at` | `TEXT` | `NULL` until acknowledged |

**Note**: a record is identified by `(zone_name, record_name, record_type,
content)` in principle (the same name+type can have multiple records, e.g.
round-robin `A` records) — the finding/alert identity key used across a
run must account for `content` too so distinct records with the same
name+type aren't conflated. `data-model.md`'s finding row already includes
`content`; the alerting diff key (implementation detail, `alerts.ts`) uses
`zone_name + record_name + record_type + content` as the identity for
matching a record across runs.

## Entity relationships

```
Zone (from Cloudflare API, not persisted)
  └─ has 0..N DNS Records
       └─ evaluated into exactly 1 dns_findings row per run
            └─ a status change vs. the previous run's row for the same
               record produces 0..1 dns_alerts rows
```

Same "account is the source of truth, D1 only remembers what was found"
principle as Module 1.
