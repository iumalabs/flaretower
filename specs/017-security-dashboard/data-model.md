# Phase 1 Data Model: Security Dashboard

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-13 | **Research**: [research.md](./research.md)

**Numbering note**: this spec's migration is named `0013_...` even though `0007` is this module's
own baseline findings migration — specs 015 and 016 (still-unmerged/recently-merged at the time of
writing) already claim `0011` and `0012`. Naming this one `0013` up front avoids a numbering
collision once all merge to `main` in sequence (research.md §7).

## New tables (`worker/db/migrations/0013_security_findings_add_bot_https_min_tls.sql`)

Mirrors the exact shape of the 4 existing pairs in `0007_security_findings.sql` — 3 new
independent finding/alert table pairs, zone-keyed, each alertable independently:

- `bot_fight_mode_findings` / `bot_fight_mode_alerts`
- `always_https_findings` / `always_https_alerts`
- `min_tls_findings` / `min_tls_alerts`

Each `*_findings` table: `id, zone_id, zone_name, status ('safe'|'warning'|'not_evaluated'),
reason, evaluated_at, run_id, run_trigger` — identical column set to `waf_findings`/
`rate_limiting_findings`. Each `*_alerts` table: identical column set to `waf_alerts`.

No columns are added to the 4 existing tables — User Story 1's zone-row restructuring is a
response-shape and frontend change only (research.md, spec.md FR-003).

## In-memory types (`worker/modules/security/types.ts`)

- New `SettingStatus = "safe" | "warning" | "not_evaluated"` (identical shape to the existing
  `ProtectionStatus`, named separately since it covers a conceptually different kind of check —
  settings, not ruleset presence).
- `ZoneInventoryItem` gains 3 new fields: `botFightMode: { value: string | null;
  evaluationError?: string }`, `alwaysUseHttps: { value: string | null; evaluationError?: string
  }`, `minTlsVersion: { value: string | null; evaluationError?: string }` — mirrors the existing
  `sslTls`/`dnssec` field shape exactly.
- New `BotFightModeEvaluation`, `AlwaysHttpsEvaluation`, `MinTlsVersionEvaluation` — each `{
  zoneId, zoneName, status: SettingStatus, reason }`, mirroring `WafEvaluation`.
- New `ZoneSecurityRow` (routes.ts response shape, not a D1 table): `{ zoneId, zoneName,
  sslTls, dnssec, waf, rateLimiting, botFightMode, alwaysUseHttps, minTlsVersion, overallStatus }`
  — one row per zone, assembled in `GET /inventory` from the 7 per-check tables.
- New `ZoneCertificate` (live-fetched only, never persisted): `{ zoneId, zoneName, hosts: string[],
  issuer: string, expiresOn: string, status: SettingStatus }`.
- New `CustomWafRule` (live-fetched only, never persisted): `{ zoneId, zoneName, description:
  string, expression: string, action: string, enabled: boolean, status: SettingStatus }`.

## Pure functions

- `rollUpZoneStatus(statuses: readonly ExposureStatus[]): ExposureStatus` (evaluate.ts) —
  critical > warning > not_evaluated > safe, worst wins (research.md §2).
- `evaluateBotFightMode()`, `evaluateAlwaysUseHttps()`, `evaluateMinTlsVersion()` (evaluate.ts) —
  structurally identical to the existing `evaluateWaf()`/`evaluateRateLimiting()` shape (research.md
  §3).
- `classifyCertificateExpiry(expiresOn: string | null): SettingStatus` (evaluate.ts) — <30 days =
  warning, else safe, `null` (no active pack) = not_evaluated (research.md §5).
- `classifyCustomWafRule(enabled: boolean, action: string): SettingStatus` (evaluate.ts) — disabled
  = not_evaluated, enabled+skip = warning, enabled+other = safe (research.md §6).

## Response shape (`GET /api/security/inventory`)

See [contracts/api.md](./contracts/api.md). `zones[]` gains 3 new per-check fields
(`bot_fight_mode`, `always_use_https`, `min_tls_version`) plus `overall_status`, alongside the
existing 4 unchanged fields (`ssl_tls`, `dnssec`, `waf`, `rate_limiting`). Two new top-level
arrays, `certificates` and `waf_custom_rules`, both live-fetched (research.md §5/§6), `null` only
if their respective zone list itself couldn't be fetched at all. `turnstile_widgets` is unchanged.
