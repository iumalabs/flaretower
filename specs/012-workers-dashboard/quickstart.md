# Quickstart: Workers Dashboard

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-13

## Prerequisites

- A Cloudflare test account with several deployed Workers: at least one with a production custom
  domain, one with only a Preview URL active, and traffic/error history on at least one (so the
  metrics aren't all-zero).
- Module 1 (`exposure_findings`) already has at least one completed evaluation run, so the exposure
  rollup column has real data to show.
- An API token scoped per research.md §4 (adds `Account Analytics Read` and `Audit Logs Read` to this
  project's existing scope set).

## Scenario 1 — full Workers inventory (User Story 1)

`GET /api/workers/dashboard` — every deployed Worker appears exactly once in `workers[]`, each with
its environment and its exposure status matching what the Exposure page shows for the same Worker.
Confirm the sidebar shows "Workers" and "Exposure" as two separate items, each with its own badge
count.

## Scenario 2 — real operational metrics (User Story 2)

Each Worker with recent traffic shows non-null `requests_24h`/`errors_24h`/`cpu_p50_ms`; `summary`
shows account-wide totals and a day-over-day `requests_24h_change_pct`. Temporarily revoke the token's
Analytics scope and reconfirm: `unavailable` now includes an `"analytics"` entry, every Worker's
per-row metric fields become `null` (never `0`), and `exposure_status` and inventory fields are
unaffected.

## Scenario 3 — Workers-scoped recent changes (User Story 3)

Perform a real, small Workers-relevant change in the test account (e.g. toggle a Preview URL) and a
real, unrelated change (e.g. a DNS record edit). Reload the dashboard: the Workers-relevant entry
appears in `recent_changes`; the DNS entry does not.

## Scenario 4 — empty account

Against an account with zero deployed Workers, `workers[]` is empty and the page shows an explicit
empty state (not an indefinite loading state or a bare empty table).

## Scenario 5 — nav split doesn't break existing Exposure page

Confirm the existing Exposure page (specs/001) is unchanged in behavior and content — only reachable
via its own now-separate "Exposure" nav item instead of the old merged "Workers & Access" item.

Run all 5 scenarios against a real scratch Cloudflare test account before considering this module
done — same real-account caveat as every prior module's own quickstart.
