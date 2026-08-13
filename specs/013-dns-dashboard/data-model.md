# Data Model: DNS Dashboard

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-13

## `dns_findings` (existing table, extended)

New column, added by `worker/db/migrations/0009_dns_findings_add_ttl.sql`:

| Column | Type | Notes |
| --- | --- | --- |
| `ttl` | `INTEGER` | Nullable — `1` means "auto" (Cloudflare's own convention for a proxied record's effective TTL); `NULL` when not available (research.md §1). |

Every other existing `dns_findings` column (`zone_name`, `record_name`, `record_type`, `content`,
`proxy_capable`, `proxied`, `status`, `reason`, `evaluated_at`, `run_id`, `run_trigger`) is unchanged.

## `DnsRecordEvaluation` (response shape, extended)

| Field | Type | Notes |
| --- | --- | --- |
| `ttl` | `number \| null` | research.md §1 |
| `isPlatformTarget` | `boolean` | research.md §3 — presentational only, never affects `status`. |

Every other existing field (`zoneName`, `recordName`, `recordType`, `content`, `proxyCapable`,
`proxied`, `status`, `reason`) is unchanged. `status`/`reason` now MAY reflect the new DMARC-policy
check (research.md §2) in addition to the existing dangling/DNS-only checks — same fields, wider set
of cases.

## Zone tab (presentational, frontend-only — no new backend entity)

| Field | Type | Notes |
| --- | --- | --- |
| `zoneName` | `string` | |
| `recordCount` | `number` | `records.length` from the existing `GET /api/dns/inventory` response's per-zone array. |
| `selected` | `boolean` | Local component state, not persisted (spec.md Assumptions). |
