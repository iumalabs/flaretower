# Quickstart: Zero Trust / Access

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-07

## Prerequisites

- A Cloudflare test account with:
  - At least one Access application with a scoped policy, one with an
    "Allow, Everyone" policy, and one with zero policies.
  - At least one service token expired, one expiring within 14 days, and
    one healthy.
- An API token scoped per `research.md` §6.

## Scenario 1 — full inventory (User Story 1)

`GET /api/zero-trust/inventory` — every application (regardless of what it
protects) and every service token appears.

## Scenario 2 — open policy flagged (User Story 2)

The Allow-Everyone and zero-policy applications show `warning`; the
scoped-policy application shows `safe`.

## Scenario 3 — service token expiry (User Story 3)

The expired token shows `critical`; the soon-to-expire token shows
`warning`; the healthy token shows `safe`.

## Scenario 4 — scheduled drift detection (User Story 4)

Same shape as every prior module: two scheduled runs with no change
produce no duplicate alert; a policy loosened between runs produces
exactly one new alert.

## Scenario 5 — partial-evaluation transparency

Scope the token down, confirm affected items show `not_evaluated`.

## Scenario 6 — no unauthenticated access

Call any `/api/zero-trust/*` endpoint with no/garbage JWT, expect `403`.
