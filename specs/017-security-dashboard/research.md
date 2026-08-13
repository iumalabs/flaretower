# Phase 0 Research: Security Dashboard

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-13

## §1. No account-wide toggle aggregation

**Decision**: Every check (the existing 4, plus the 3 new ones) stays zone-scoped — one row per
zone, not one row per account-wide toggle aggregating N zones.

**Rationale**: The design mockup shows account-wide toggles like "Minimum TLS version: 1.0 · 1
zone lagging" — but this requires inventing an aggregation rule (which zone's value wins, what
counts as "lagging") this project has never needed before. Every prior spec in this rollout chose
the same resolution when a mockup's literal layout didn't map to real per-resource data: reuse the
"one row per real resource" precedent instead of fabricating a new aggregation (Pages didn't build
a second Access-specific pill taxonomy; DNS didn't invent an account-wide DNSSEC summary). Here,
"real resource" is the zone, exactly as it already is for the existing 4 checks.

## §2. Zone-row rollup reuses the existing severity ranking

**Decision**: A new `rollUpZoneStatus()` in `evaluate.ts` reduces an array of per-check statuses to
the single worst one, using critical=3 > warning=2 > not_evaluated=1 > safe=0 — identical ranking
and reduce-to-worst logic to `worker/modules/workers-dashboard/classify.ts`'s
`rollUpExposureStatus()`.

**Rationale**: This project already established this exact ranking for "many sub-checks, one
row" (Module 1's per-Worker hostname rollup). Duplicating the small pure function locally (rather
than importing across modules) matches this rollout's own "duplication beats premature
cross-module coupling" precedent, stated explicitly in every prior module's `research.md`.

## §3. Bot Fight Mode, Always Use HTTPS, Minimum TLS Version — same generic zone-settings endpoint

**Decision**: Fetch each via `GET /zones/{zone_id}/settings/{setting_id}` — the exact same generic
per-setting endpoint `worker/modules/security/inventory.ts`'s existing `getZoneSslSetting()`
already calls for `setting_id=ssl`. Setting ids: `bot_fight_mode`, `always_use_https`,
`min_tls_version`. Response shape for all three: `{ value: string }`, same as the existing `ssl`
call.

**Rationale**: Confirmed via Cloudflare's documentation that these are real, long-standing zone
settings (Bot Fight Mode: `bots/get-started/bot-fight-mode`; Minimum TLS Version: a documented
zone-level setting under Edge Certificates). The OpenAPI spec doesn't enumerate individual setting
ids as separate paths — they all resolve through the one generic `/zones/{zone_id}/settings/
{setting_id}` path, exactly matching this module's own existing call pattern. No new Cloudflare API
token scope: this is the same zone-settings read access already granted for the `ssl` setting.

**Evaluation**: `bot_fight_mode`/`always_use_https`: `"on"` = safe, `"off"` = warning (both are
free, no-tradeoff settings — off is a real, actionable gap). `min_tls_version`: `"1.2"`/`"1.3"` =
safe, `"1.0"`/`"1.1"` = warning (TLS 1.0/1.1 are formally deprecated).

## §4. Email Obfuscation — deliberately out of scope

**Decision**: Do not fetch or evaluate Email Obfuscation.

**Rationale**: Unlike the 3 settings in §3, Email Obfuscation's off-state is not inherently a
security gap — it only matters if the zone's actual page content contains email addresses to
obfuscate, something this project has no way to determine. The design mockup's own example shows
it off with a neutral, non-warning reason ("not required — no email addresses served"), which is
itself evidence that a blanket on/off-based safe/warning judgment would be dishonest. Matches this
rollout's precedent of trimming mockup detail this project cannot honestly evaluate (DNS's
"missing DMARC record entirely" case, Pages' build-duration).

## §5. Certificates panel — live-fetched, not persisted

**Decision**: `GET /zones/{zone_id}/ssl/certificate_packs` per zone, live-fetched on every `GET
/inventory` call (not persisted to D1, not independently alertable) — mirrors spec 014's
`fetchAccessGroupsPanel()` precedent in `worker/modules/zero-trust/routes.ts` exactly.

**Rationale**: Confirmed via Cloudflare's OpenAPI spec: `result[]` is an array of certificate
packs, each with `status` and a `certificates[]` array of `{ hosts, issuer, expires_on, ... }`.
Among certificate packs with `status === "active"`, pick the certificate with the soonest
`expires_on` across all their `certificates[]` — the one that would actually cause a problem
first. No active certificate pack found → not_evaluated, never a fabricated expiry. Expiry within
30 days → warning, else safe. Not persisted: Certificates don't need historical drift tracking the
way the 7 core checks do (an expiry date is a known future fact, not a configuration that silently
drifted), and the live-fetch approach avoids adding 2 more finding/alert table pairs for
information that's naturally re-derived fresh each time.

## §6. WAF Custom Rules panel — a different ruleset phase, live-fetched, zone-labeled

**Decision**: `GET /zones/{zone_id}/rulesets/phases/http_request_firewall_custom/entrypoint` per
zone, via the existing `cfFetchRulesetOrNull()` 404-tolerant helper (already used for the managed
WAF and rate-limiting phases) — but this time keeping each rule's real fields
(`description`/`expression`/`action`/`enabled`) instead of reducing to a boolean. Live-fetched, not
persisted, same rationale as §5. Each row carries its zone name, since custom WAF rulesets are
genuinely zone-scoped in Cloudflare's API — there is no account-wide custom-rules endpoint to
unify them under.

**Rationale**: `http_request_firewall_custom` is a distinct ruleset phase from
`http_request_firewall_managed` (which this module's existing `waf` check already reads) — it
holds the account's own hand-written rules, exactly what the mockup's "WAF custom rules" table
shows. A 404 (no custom ruleset deployed for that zone) means zero rules for that zone, not an
error — same "legitimate absence" handling this module already established for the managed/
rate-limiting phases.

**Evaluation**: disabled rule → not_evaluated (parked, no risk judgment to make); enabled with
`action === "skip"` → warning (a skip action bypasses WAF protection for matching traffic); any
other enabled action (`block`/`challenge`/`managed_challenge`/`js_challenge`/`log`) → safe.

**Hits 24h is out of scope**: no per-rule traffic volume is available without GraphQL Analytics
(the same API family Module 1/Workers Dashboard uses for request metrics) — a disproportionate
research-and-implementation effort for one column, matching spec 016's R2/KV object-count trim.

## §7. Migration numbering

**Decision**: Number this feature's migration `0013`, not `0007` (the existing security findings
migration) and not `0010`/`0011`/`0012` (already claimed by specs 014/015/016).

**Rationale**: At the time this branch was created (forked from `origin/main` after spec 015's PR
merged, which brought the visible migration count to `0011`), spec 016 (Storage Dashboard)'s PR —
still unmerged — already claims `0012`. Naming this migration `0013` up front avoids a numbering
collision once all three merge to `main` in sequence, following the exact defensive-numbering
precedent every prior spec in this rollout has used.
