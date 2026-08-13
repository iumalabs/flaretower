# Quickstart: Audit Dashboard

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-13

Manual validation against a real Cloudflare account (real-account dependency — same caveat as
every prior module's equivalent task; left unchecked in `tasks.md` until run).

## Prerequisites

- A Cloudflare account with recent activity from both the dashboard (e.g. change a zone setting via
  the Cloudflare dashboard UI) and the API (e.g. run any FlareTower evaluation, which itself makes
  API calls — or use `wrangler`/`curl` directly against the Cloudflare API).
- FlareTower deployed and authenticated against that account.

## Scenario 1 — Real activity feed (User Story 1)

1. Open the Audit & Drift page.
2. Confirm the Audit log panel shows real entries from the last 7 days with accurate
   time/actor/action/target values.
3. Confirm an entry resulting from a real config change (e.g. the dashboard-made zone-setting
   change above) shows a real result summary reflecting the before/after values.

## Scenario 2 — Source filter (User Story 2)

1. Confirm entries from both dashboard and API activity are visible under "All sources."
2. Select "Dashboard" — confirm only dashboard-sourced entries remain.
3. Select "API" — confirm only API-sourced entries remain.

## Scenario 3 — JSONL export (User Story 3)

1. Apply the "API" filter.
2. Trigger the export.
3. Open the downloaded file and confirm it contains exactly the entries visible under that filter,
   one JSON object per line, and no dashboard-sourced entries.
