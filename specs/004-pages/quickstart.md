# Quickstart: Pages

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-08

## Prerequisites

- A Cloudflare test account with:
  - At least one Pages project with a custom domain in the `active` state
    and one with a domain in a non-active state (e.g. still verifying).
  - At least one Pages project whose `pages.dev` subdomain is uncovered by
    any Access application, one covered by an "Allow, Everyone" (or
    zero-policy) application, and one covered by a scoped-policy
    application.
  - At least one Pages project whose latest production deployment failed
    (or one with no production deployment at all) and one whose latest
    production deployment succeeded.
- An API token scoped per `research.md` §5.

## Scenario 1 — full inventory, custom domain status (User Story 1)

`GET /api/pages/inventory` — every project and every one of its custom
domains appears; the active domain shows `safe`, the non-active domain
shows `warning`.

## Scenario 2 — `pages.dev` exposure flagged (User Story 2)

The uncovered project's subdomain shows `critical`; the
Everyone-or-zero-policy-covered project's subdomain shows `warning`; the
scoped-policy-covered project's subdomain shows `safe`.

## Scenario 3 — deployment health flagged (User Story 3)

The failed (or absent) production deployment shows `warning`; the
successful one shows `safe`.

## Scenario 4 — scheduled drift detection (User Story 4)

Same shape as every prior module: two scheduled runs with no change
produce no duplicate alert; removing Access coverage from a project's
`pages.dev` subdomain between runs produces exactly one new alert.

## Scenario 5 — partial-evaluation transparency

Scope the token down, confirm affected items show `not_evaluated`.

## Scenario 6 — no unauthenticated access

Call any `/api/pages/*` endpoint with no/garbage JWT, expect `403`.
