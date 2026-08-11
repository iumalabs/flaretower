# Research: DNS

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-07

Resolves the Technical Context unknowns specific to this module. Where Module 1's research already
settled a cross-cutting concern (Access JWT validation, routing, static assets, D1 migration
mechanics, rate limits, CPU/subrequest budgets, testing tools), this file doesn't re-derive it — see
[`specs/001-workers-access-exposure/research.md`](../001-workers-access-exposure/research.md).

## 1. Enumerating zones and records

**Decision**: `GET /accounts/{account_id}/zones` (or `GET /zones` filtered to the account) to list
zones, then `GET /zones/{zone_id}/dns_records` per zone for records — both plain `fetch()`, matching
Module 1's approach (research.md §3 there).

**Rationale**: Same reasoning as Module 1 — the read surface is small enough that a typed SDK
dependency isn't justified yet.

## 2. Dangling-record detection — use Cloudflare's own Security Insights, don't reimplement it

**Decision**: Consume Cloudflare's native **Security Insights** findings (`Dangling A Records`,
`Dangling AAAA Records`, `Dangling CNAME Records` — confirmed as real, named insight types in
[Security Insights](https://developers.cloudflare.com/security/security-insights/)) via the
account/zone insights API (`GET /accounts/{account_id}/security-center/insights`, filtered by
`issue_type` — **path corrected 2026-08-11**: the `security-center` segment was missing from this
section's original guess, confirmed live when the bare `/accounts/{account_id}/insights` path
returned a Cloudflare routing error (7003/7000), not a permission failure). Required token scope:
**`Account Security Insights`** — confirmed 2026-08-11 against the live dashboard's permission
picker (account-scoped, under "App Security"; supersedes this section's original
`Zone Security
Center Insights` guess — see §6 below).

**Rationale**: Cloudflare already runs exactly this heuristic scan natively, on a schedule, using
signatures for decommissioned/claimable third-party resources that Cloudflare's own security team
actively maintains and expands. Reimplementing dangling-target detection ourselves (DNS-resolving
every external `CNAME`/`A`/`AAAA` target and pattern-matching against a hand-maintained fingerprint
list of claimable providers — AWS S3, GitHub Pages, Heroku, Azure, etc.) would be strictly worse: a
redundant, almost-certainly-less-complete implementation to build and maintain, requiring outbound
DNS resolution from the Worker (its own complexity and CPU-time cost) for a check Cloudflare already
performs for every zone.

**Alternatives considered**:

- **Build our own DNS-resolution + fingerprint-matching checker** — rejected per above; the spec's
  own Assumptions section ("pattern-based ... incrementally extended") was written before this
  research surfaced the native feature, and is superseded by this decision. (No spec change needed —
  FR-005/FR-006 describe the _outcome_, "mark as critical when target is confirmed dangling," not an
  implementation, so this is a planning-level refinement, not a scope change.)
- **Fall back to our own checker if Security Insights isn't available on the account's plan tier** —
  Security Insights' own docs describe a 10,000-zone aggregation limit but don't gate the feature
  behind a paid tier in what was found during this research; if implementation discovers a real
  plan-tier gate, `tasks.md` must add a fallback path (a record whose dangling status can't be
  determined this way becomes `not_evaluated`, consistent with FR-006 — never silently safe).

## 3. Proxy status and DNS-only-of-note evaluation

**Decision**: A DNS record's `proxied` boolean (present on `A`/`AAAA`/ `CNAME` records in the
`dns_records` API response) is read directly — no separate check needed. "DNS-only-of-note" (spec
User Story 3) applies only to `A`/`AAAA`/`CNAME` records with `proxied: false`; other record types
don't carry a `proxied` field at all and are shown as not-applicable (FR-004).

**Rationale**: This is a direct field read, not a derived evaluation — simplest possible correct
implementation.

## 4. Shared evaluation module shape

**Decision**: Mirror Module 1's `evaluate.ts` shape exactly: a pure function
`evaluateRecord(record, insightsForZone)` returning `{ status, reason }`, called by both `fetch`
(`POST /api/dns/evaluate`) and `scheduled`. `status` uses the same four-value semantics as Module 1
(`safe`/`warning`/`critical`/`not_evaluated`):

- `critical` — confirmed dangling target (Security Insights match).
- `warning` — DNS-only on an origin-facing record type where that matters (User Story 3).
- `safe` — proxied, or DNS-only on a record type where it's expected (`MX`/`TXT`/`NS`/etc.), and not
  flagged dangling.
- `not_evaluated` — couldn't determine dangling status (Security Insights API error / insufficient
  scope) or couldn't enumerate the zone/record at all.

**Rationale**: Reuses Module 1's already-validated design and its constitution Principle III
compliance pattern (one shared function, both entry points) rather than inventing a new shape.

## 5. Data model additions

**Decision**: New D1 table `dns_findings`, structurally parallel to Module 1's `exposure_findings`
(see `data-model.md`), plus reuse of the _shape_ of Module 1's `exposure_alerts` pattern for
new-vs-repeat alerting — but as its own `dns_alerts` table rather than a shared table, keeping each
module's alerting independently queryable and avoiding a cross-module polymorphic table (a
`finding_type` discriminator column would work too, but a dedicated table matches Module 1's own
precedent of "one module-owned pair of tables per module" and keeps migrations additive and easy to
reason about per module).

**Rationale**: Consistency with Module 1's already-established schema pattern; no new architectural
decision needed here.

## 6. Token scope summary for this module

**Updated 2026-08-11**: `Zone Security Center Insights` was this section's original guess; the live
dashboard's current permission picker confirms the actual name is `Account Security
Insights`
(account-scoped, under "App Security" — not zone-scoped as originally assumed).

| Purpose                   | Scope                       |
| ------------------------- | --------------------------- |
| List zones                | `Zone Read`                 |
| List DNS records per zone | `DNS Read`                  |
| Dangling-record findings  | `Account Security Insights` |

All read-only, consistent with constitution Principle VIII (start read-only, add scope only as
needed).
