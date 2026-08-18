# Quickstart: Exposure Matrix

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-18

Manual validation once implemented — run `deno task dev`, log in via Access, open Exposure.

## Scenario 1 — Matrix structure (User Story 1)

1. Open the Exposure page against an account with Workers that have varying custom
   domain/workers.dev/preview URL combinations. Confirm each Worker appears exactly once (not once
   per hostname).
2. Confirm each row shows a separate indicator per entry-point column, with an explicit "not
   present" state for any type a Worker doesn't have.
3. Confirm the rightmost column is the Worker's overall status, and confirm an access-coverage
   summary is shown per row.
4. Confirm a Worker with two hostnames of the same kind (e.g. two custom domains) shows one summarized
   cell (worst status + count), not two separate rows and not a dropped hostname.

## Scenario 2 — Row-expand detail (User Story 2)

1. Click a Worker's row. Confirm it expands in place to show its routes (each with a status) and its
   effective Access policy in plain language, without navigating away.
2. Click it again — confirm it collapses. Expand a different row — confirm it works independently.
3. Expand a Worker with no covering Access application. Confirm the policy panel explicitly says so,
   not a blank panel.
4. Confirm the expanded detail shows action controls appropriate to that Worker's finding, and that
   clicking any of them (other than "View in Cloudflare") does not change anything in the real
   Cloudflare account — this feature's actions are visual only (spec.md Assumptions).
5. Confirm "View in Cloudflare" opens the real Cloudflare dashboard page for that Worker.

## Scenario 3 — Navigation and search (User Story 3)

1. On a page with Workers of mixed severity, click the critical count. Confirm the view scrolls to
   the first critical row.
2. Type part of a Worker's name into the search box. Confirm the table narrows to matches only, with
   no page reload. Clear it — confirm the full list returns.
3. Type a string matching no Worker or hostname. Confirm an explicit "no matches" state, not a blank
   table.
4. Click Re-scan. Confirm it behaves the same as every other module dashboard (pending state, then
   refreshed results) — this reuses specs/024's existing hook/component unchanged.
