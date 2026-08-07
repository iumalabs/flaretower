# Quickstart: R2 / KV / D1

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-08

## Prerequisites

- A Cloudflare test account with:
  - At least one R2 bucket with its `r2.dev` domain enabled, one with an
    enabled custom domain not covered by any Access application, one
    with an enabled custom domain covered by an Allow-Everyone policy,
    one with an enabled custom domain covered by a scoped policy, and
    one bucket with no public access configured at all.
  - At least one KV namespace and one D1 database bound to a deployed
    Worker, and one of each not bound to any Worker.
- An API token scoped per `research.md` §7.

## Scenario 1 — full inventory (User Story 1)

`GET /api/storage/inventory` — every bucket, namespace, and database
appears, grouped by type.

## Scenario 2 — R2 bucket exposure flagged (User Story 2)

The `r2.dev`-enabled and uncovered-custom-domain buckets show `critical`;
the open-policy-covered bucket shows `warning`; the scoped-policy-covered
and fully-private buckets show `safe`.

## Scenario 3 — KV/D1 usage flagged (User Story 3)

The bound namespace and database show `safe`; the unbound ones show
`warning`.

## Scenario 4 — scheduled drift detection (User Story 4)

Same shape as every prior module: two scheduled runs with no change
produce no duplicate alert; enabling a test bucket's `r2.dev` domain
between runs produces exactly one new alert.

## Scenario 5 — partial-evaluation transparency

Scope the token down, confirm affected items show `not_evaluated`.

## Scenario 6 — no unauthenticated access

Call any `/api/storage/*` endpoint with no/garbage JWT, expect `403`.
