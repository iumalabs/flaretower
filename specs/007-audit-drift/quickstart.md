# Quickstart: Audit & Drift

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-10

## Prerequisites

- A Cloudflare test account with Modules 1-6 already deployed and their
  scheduled evaluations having run at least once, with a mix of
  safe/warning/critical findings across at least three different
  modules, and at least one unacknowledged alert in at least two
  different modules.
- No new API token scopes required (research.md §6).

## Scenario 1 — unified alerts inbox (User Story 1)

`GET /api/audit/alerts` — every unacknowledged alert across every
module appears, tagged by module and kind, newest first.

## Scenario 2 — acknowledge from the unified inbox (User Story 1)

`POST /api/audit/alerts/{module}/{kind}/{id}/acknowledge` on one entry,
then confirm it disappears from both `GET /api/audit/alerts` and that
module's own `GET /api/{module}/alerts`.

## Scenario 3 — what changed since yesterday (User Story 2)

Flip one zone's SSL/TLS mode from Full (strict) to Flexible, re-run that
module's evaluation, then `GET /api/audit/changes` (default window) and
confirm the change appears with `previous_status: "safe"`,
`current_status: "critical"`.

## Scenario 4 — account posture summary (User Story 3)

`GET /api/audit/summary` — confirm every module with at least one run
shows correct counts, and any module with zero runs shows
`has_data: false`.

## Scenario 5 — scheduled digest logging (User Story 4)

Run the scheduled scan twice with a known status change between runs,
confirm the log line reports the correct changed-finding count each
time (including zero on a run with no changes).

## Scenario 6 — no unauthenticated access

Call any `/api/audit/*` endpoint with no/garbage JWT, expect `403`.
