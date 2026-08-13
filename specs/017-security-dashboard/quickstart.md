# Quickstart: Security Dashboard

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-13

Manual validation against a real Cloudflare account (real-account dependency — same caveat as
every prior module's equivalent task; left unchecked in `tasks.md` until run).

## Prerequisites

- A Cloudflare account with at least 2 zones, ideally in different states:
  - One zone fully protected (SSL/TLS Strict, DNSSEC active, a managed WAF ruleset with an enabled
    rule, a rate-limiting ruleset, Bot Fight Mode on, Always Use HTTPS on, minimum TLS 1.2+).
  - One zone with at least one real gap (e.g. Bot Fight Mode off, or minimum TLS version 1.0).
  - At least one zone with a custom WAF rule configured, including one with a "skip" action and
    one disabled.
- FlareTower deployed and authenticated against that account.

## Scenario 1 — One row per zone, rolled up correctly (User Story 1)

1. Trigger an evaluation: `POST /api/security/evaluate`.
2. Open the Security page.
3. Confirm each zone appears exactly once.
4. Confirm the zone with a real gap shows an overall status matching its worst individual check.

## Scenario 2 — Bot Fight Mode / Always Use HTTPS / Minimum TLS Version (User Story 2)

1. On the same evaluated run, confirm the zone with Bot Fight Mode off shows a warning for that
   check.
2. Confirm the zone with minimum TLS version 1.0/1.1 shows a warning for that check; a zone at
   1.2+ shows safe.

## Scenario 3 — Certificates and WAF Custom Rules (User Story 3)

1. Confirm the Certificates panel shows a real host/issuer/expiry for each zone with an active
   certificate.
2. Confirm the WAF Custom Rules panel shows every configured custom rule, each labeled with its
   real zone, with a "skip"-action rule showing warning, a disabled rule showing not-evaluated,
   and any other enabled rule showing safe.
3. Confirm the Turnstile widgets section at the bottom of the page is unaffected — same content and
   position as before this feature.
