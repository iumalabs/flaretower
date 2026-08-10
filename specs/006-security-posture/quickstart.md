# Quickstart: Security Posture

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-10

## Prerequisites

- A Cloudflare test account with:
  - At least one zone in each SSL/TLS mode: Off, Flexible, Full, Full
    (strict).
  - At least one zone with DNSSEC active and one with it disabled.
  - At least one zone with an enabled WAF managed ruleset and one with
    none deployed.
  - At least one zone with an enabled rate-limiting rule and one with
    none deployed.
  - At least one Turnstile widget configured on the account.
- An API token scoped per `research.md` §8 (confirm the exact
  zone-ruleset scope name(s) against the live token-creation screen
  first — flagged as an open item in research.md).

## Scenario 1 — full inventory (User Story 1)

`GET /api/security/inventory` — every zone's four checks, plus every
Turnstile widget, appear.

## Scenario 2 — SSL/TLS mode flagged (User Story 2)

Off/Flexible zones show `critical`; Full shows `warning`; Full (strict)
shows `safe`.

## Scenario 3 — DNSSEC/WAF/rate-limiting gaps flagged (User Story 3)

Disabled DNSSEC, absent/fully-disabled WAF, and absent/fully-disabled
rate-limiting each show `warning`; their protected counterparts show
`safe`.

## Scenario 4 — scheduled drift detection (User Story 4)

Same shape as every prior module: two scheduled runs with no change
produce no duplicate alert; switching a test zone's SSL/TLS mode from
Full (strict) to Flexible between runs produces exactly one new alert.

## Scenario 5 — partial-evaluation transparency

Scope the token down, confirm affected checks show `not_evaluated`.

## Scenario 6 — no unauthenticated access

Call any `/api/security/*` endpoint with no/garbage JWT, expect `403`.
