# Data Model: Access Dashboard

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-13

## `zt_app_findings` (existing table, extended)

New columns, added by `worker/db/migrations/0010_zt_app_findings_add_policy_detail.sql`:

| Column | Type | Notes |
| --- | --- | --- |
| `policy_count` | `INTEGER` | Nullable. |
| `covered_hostname_count` | `INTEGER` | Nullable — `self_hosted_domains.length`, or 1 for a legacy single-`domain` app (research.md §1). |
| `identity_summary` | `TEXT` | Nullable — e.g. `"Okta SSO"`, `"— none —"`, `"service token"` (research.md §2). |
| `session_duration` | `TEXT` | Nullable — Cloudflare's own raw string (e.g. `"24h"`). |
| `policy_rules_json` | `TEXT` | Nullable — JSON-serialized `PolicyRuleLine[][]` (one array per policy, in evaluation order), pre-computed at evaluation time (research.md §5). |
| `referenced_group_ids` | `TEXT` | Nullable — JSON-serialized `string[]` of raw Access Group ids this app's policies reference, used for exact-id-match group-reference counting (research.md §3) rather than parsing `policy_rules_json`'s human-readable text. |

Every existing column (`app_id`, `app_domain`, `status`, `reason`, `evaluated_at`, `run_id`,
`run_trigger`) and the `status` CHECK constraint (`safe`/`warning`/`not_evaluated`) are unchanged —
spec.md FR-002.

## `AccessApplication` / `AppEvaluation` (response shape, extended)

| Field | Type | Notes |
| --- | --- | --- |
| `appName` | `string` | Cloudflare's own human-readable Access Application name (falls back to `appDomain` when absent) — was missing from this project's data entirely before this spec; the table previously had no readable app name at all. |
| `policyCount` | `number` | |
| `coveredHostnameCount` | `number` | Count only — `appDomain` is already the primary hostname; the UI derives "+N" from `count - 1`. |
| `identitySummary` | `string` | research.md §2 |
| `sessionDuration` | `string \| null` | `null` when not set. |
| `policyRules` | `PolicyRuleLine[][]` | One array per policy. |

Every existing field (`appId`, `appDomain`, `status`, `reason`) is unchanged.

## `PolicyRuleLine` (new, nested in `policyRules`)

| Field | Type | Notes |
| --- | --- | --- |
| `verb` | `"ALLOW" \| "REQUIRE" \| "DENY"` | research.md §4 |
| `label` | `string` | Plain-language description, or the generic fallback for an unrecognized rule type. |

## `AccessGroup` (response shape, live-read — not persisted, research.md §3)

| Field | Type | Notes |
| --- | --- | --- |
| `groupId` | `string` | |
| `name` | `string` | |
| `ruleSummary` | `string` | The group's own rules, humanized the same way as a policy's rules — never a fabricated member count. |
| `referencedByAppCount` | `number` | Computed locally from every application's policy rules (research.md §3), not a separate API call. |

## `GET /api/zero-trust/inventory` — new top-level field

| Field | Type | Notes |
| --- | --- | --- |
| `access_groups` | `AccessGroup[] \| null` | `null` when the Groups fetch failed entirely (spec.md FR-008) — distinct from `[]` (confirmed zero groups). |
