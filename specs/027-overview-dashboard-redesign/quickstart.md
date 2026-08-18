# Quickstart: Overview Dashboard Redesign

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-18

Manual validation once implemented — run `deno task dev`, log in via Access, open Overview.

## Scenario 1 — Header context row (User Story 1)

1. Open Overview. Confirm the header shows real zone and Worker counts, "last scanned {relative
   time} ago," and the real cadence text ("runs hourly").
2. Click RE-SCAN. Confirm it clearly indicates progress and can't be triggered again mid-run.
3. Wait for it to finish. Confirm the header's last-scan time updates and every panel's data
   reflects fresh results.
4. Against a never-evaluated account (or a fresh preview D1), confirm the header shows an explicit
   "never scanned" state instead of a blank or negative time.

## Scenario 2 — Findings rows (User Story 2)

1. With open findings from at least two modules, confirm each row shows a real plain-language reason
   (not a raw slug) and a contextual action label alongside Acknowledge.
2. Click Acknowledge on a row. Confirm it disappears from the list exactly as it does today.

## Scenario 3 — Trend chart (User Story 3)

1. Confirm the "Exposure over time" chart renders 14 days of real critical/warning/safe counts.
2. Against an account younger than 14 days, confirm days before its first evaluation show an
   explicit "no data" state, not a fabricated zero.
3. Time the page load. Confirm it doesn't noticeably slow down as evaluation history grows (spec.md
   SC-005) — the trend computation is bounded to ~2 queries per source (research.md §5), not one
   query per day per source.
