# Quickstart: DNS

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-07

Validation guide, mirroring Module 1's quickstart shape. Not implementation
code — see `tasks.md` for that.

## Prerequisites

- A Cloudflare test account with:
  - At least 2 zones, each with a mix of record types (`A`, `AAAA`,
    `CNAME`, `MX`, `TXT`).
  - At least one `CNAME` record pointing at a confirmed-decommissioned
    third-party resource (e.g. a deleted S3 bucket's hostname) — enough
    for Cloudflare's own Security Insights scan to flag it as dangling
    (may take up to the insight scan's own periodic cadence to appear —
    not instantaneous).
  - At least one origin-facing record (`A`/`AAAA`/`CNAME`) set to
    DNS-only.
- An API token scoped per `research.md` §6 (`Zone Read`, `DNS Read`,
  `Zone Security Center Insights` read).

## Scenario 1 — full DNS inventory (User Story 1)

1. Call `GET /api/dns/inventory` (Access-authenticated).
2. **Expect**: every zone and every record in the test account appears,
   grouped by zone, no omissions.

## Scenario 2 — dangling record flagged critical (User Story 2)

1. Using the test `CNAME` pointing at a decommissioned resource.
2. Call `GET /api/dns/inventory`.
3. **Expect**: that record's `status` is `"critical"`, reason names the
   dangling target. A healthy record in the same zone shows a different
   status in the same response.

## Scenario 3 — DNS-only exposure flagged warning (User Story 3)

1. Using the test origin-facing record set to DNS-only.
2. Call `GET /api/dns/inventory`.
3. **Expect**: `status: "warning"`. An `MX`/`TXT` record in the same zone
   (inherently DNS-only) shows `proxy_capable: false`, not flagged.

## Scenario 4 — scheduled drift detection (User Story 4)

Same shape as Module 1 Scenario 4: trigger `/cdn-cgi/local/scheduled`
locally twice with no underlying change, confirm no duplicate alert; then
introduce a new dangling record and confirm exactly one new alert appears.

## Scenario 5 — partial-evaluation transparency (Edge Cases / FR-011)

Scope the test token down (remove `Zone Security Center Insights`), call
`GET /api/dns/inventory`, confirm affected records show
`status: "not_evaluated"`, never silently `"safe"`.

## Scenario 6 — no unauthenticated access (cross-cutting, Principle II)

Same as Module 1: call any `/api/dns/*` endpoint with no/garbage JWT,
expect `403`.
