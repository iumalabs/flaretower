# Research: Security Posture

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-10

Cross-cutting concerns (Access JWT validation, routing, static assets, D1
migration mechanics, rate limits, CPU/subrequest budgets, testing tools)
are settled in
[Module 1's research.md](../001-workers-access-exposure/research.md) and
not re-derived here.

## 1. Enumerating zones

**Decision**: `GET /zones?account.id={account_id}` — the same endpoint
Module 2's `inventory.ts` already calls, fetched independently here per
the "duplication beats coupling" precedent (already applied by Modules
3-5). Fields used: `id`, `name`.

## 2. SSL/TLS encryption mode

**Decision**: `GET /zones/{zone_id}/settings/ssl`, per-zone. Response
field `value`, confirmed enum: `"off" | "flexible" | "full" | "strict" |
"origin_pull"` (`origin_pull` — "Strict (SSL-Only Origin Pull)" — is an
Enterprise-only variant, treated identically to `"strict"` per spec User
Story 2, Acceptance Scenario 4).

**Rationale**: A direct field-to-status mapping — no Access-coverage
logic needed here (unlike Modules 1/4/5's exposure checks), since
SSL/TLS mode is a single zone-wide setting, not a per-hostname question.

## 3. DNSSEC status

**Decision**: `GET /zones/{zone_id}/dnssec`, per-zone. Response field
`status`, confirmed enum: `"active" | "pending" | "disabled" |
"pending-disabled" | "error"`.

**Rationale**: `"active"` → safe; `"disabled"`, `"pending"`, and
`"pending-disabled"` → warning (not yet providing protection, whichever
direction the zone is transitioning, per spec User Story 3, Acceptance
Scenario 2); `"error"` → not_evaluated (the API itself couldn't
determine the real state, so this module can't claim either safe or
warning — spec Edge Cases).

## 4. WAF managed-ruleset presence

**Decision**: `GET /zones/{zone_id}/rulesets/phases/http_request_firewall_managed/entrypoint`,
per-zone. **Confirmed: a zone with no entrypoint ruleset configured for
this phase returns HTTP 404** — this is the "no WAF deployed" case, not
an error to surface as `not_evaluated`. When present, the response is a
ruleset object with a `rules[]` array; each rule has `enabled` (boolean).
A zone is WAF-protected iff the entrypoint exists AND at least one rule
has `enabled: true` (spec FR-006 — a ruleset that exists but has every
rule disabled provides no actual protection, same as no ruleset at all).

**Rationale**: This is Cloudflare's current WAF product (Rulesets API);
the legacy WAF packages API is not used.

## 5. Rate-limiting-ruleset presence

**Decision**: `GET /zones/{zone_id}/rulesets/phases/http_ratelimit/entrypoint`,
per-zone — same shape and same 404-means-none behavior as §4's WAF
check. The legacy `GET /zones/{zone_id}/rate_limits` endpoint is
**confirmed deprecated** per Cloudflare's API deprecations page and is
not used.

**Rationale**: Structurally identical check to §4 (ruleset entrypoint,
`enabled` rules), just a different phase — implemented via one shared
`hasEnabledManagedRule(rulesetOrNull)` helper used by both
`evaluateWaf()` and `evaluateRateLimiting()`. This is intra-module code
reuse of genuinely identical logic, not the cross-module coupling the
"duplication beats coupling" precedent is about.

## 6. Turnstile widgets — inventory only, no evaluation

**Decision**: `GET /accounts/{account_id}/challenges/widgets`,
account-wide. Fields used: `sitekey`, `name`, `domains[]`. Listed in
`GET /api/security/inventory` but never persisted to D1 and never
evaluated — there is no safe/unsafe judgment to attach (spec FR-002,
Assumptions). Read fresh from the Cloudflare API on every request/run,
the same "account is the source of truth, D1 only remembers evaluated
outcomes" principle as every prior module's non-evaluated inline data
(e.g. Access policies, Worker bindings).

## 7. Data model — four finding/alert table pairs, all zone-keyed

**Decision**: `ssl_tls_findings`/`ssl_tls_alerts`,
`dnssec_findings`/`dnssec_alerts`, `waf_findings`/`waf_alerts`,
`rate_limiting_findings`/`rate_limiting_alerts` — four independent pairs
even though all four share the same identity key (zone id/name).

**Rationale**: Directly following Module 4's established precedent for
this exact situation (`pages.dev` exposure vs. deployment health shared
one parent entity but were kept in separate tables so each alerts
independently) — a zone whose SSL/TLS mode is already critical and stays
critical, while DNSSEC independently flips from safe to warning on the
same run, must produce a DNSSEC alert; a combined per-zone status would
blur that the same way Module 4's research.md already reasoned through
and rejected.

## 8. Token scope summary for this module

| Purpose | Scope |
|---|---|
| Read zone SSL/TLS setting, DNSSEC status | `Zone Settings Read` (new — best-available name; **not fully disambiguated during research, confirm against a live token-creation screen in Polish**) |
| Read zone WAF/rate-limiting rulesets | `Zone WAF Read` and/or `Zone Rulesets Read` (new — **exact scope name(s), and whether WAF and rate-limiting share one scope or need two, not fully disambiguated; confirm in Polish**) |
| Read Turnstile widgets | `Turnstile Read` (new) |
| List zones | `Zone Read` (already granted for Module 2) |

Several net-new scopes, all read-only, consistent with constitution
Principle VIII — exact naming carries a documented open item into this
module's Polish phase (T025/T026-equivalent), the same class of
live-account verification every prior module has also deferred.
