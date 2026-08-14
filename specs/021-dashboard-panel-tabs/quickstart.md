# Quickstart: Dashboard Panel Tabs

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-14

Manual validation once implemented — run `deno task dev`, log in via Access, and check each of the
four candidate pages plus a couple of out-of-scope pages for regression.

## Scenario 1 — Tabs replace the long scroll (User Story 1)

For each of Audit & Drift, Security Posture, Storage, Zero Trust:

1. Load the page. Confirm a tab strip is visible, one tab per block (see data-model.md's mapping
   table for the expected labels), and only the first tab's content renders — no stacked blocks
   below it.
2. Click each tab in turn. Confirm the page swaps to that block's content, no scrolling required,
   and the tab strip visually marks whichever tab is active.
3. Confirm the page's own critical-finding banner (when the account has one) stays visible no matter
   which tab is active — including Audit & Drift, where the account-wide alert banner moved above
   the tab strip as part of this feature (research.md §4).

## Scenario 2 — Switching tabs doesn't lose state (User Story 2)

On Zero Trust specifically (the page with the most state to lose):

1. Page forward on Access applications to page 2 (or force it with a small account via
   `?page_size=...` on the API, same trick specs/020's quickstart used).
2. Sort the Access applications table by a different column.
3. Click a specific application to open its policy detail.
4. Switch to the Service tokens tab, then switch back to Access applications.
5. Confirm: still on the same page, still sorted the same way, still showing the same selected
   application's policy detail — nothing reset to its default.

Repeat step 1-2's page/sort check (skip the app-selection-specific parts) on Storage's three tabs
and Security Posture's Zones/Certificates/WAF tabs, since they're also independently paginated.

## Scenario 3 — Out-of-scope pages are unaffected (Edge case / SC-003)

1. Load DNS, Pages, Workers, Overview, Exposure, and Token Tools.
2. Confirm none of them show a tab strip or any layout change — pixel-identical to before this
   feature.

## Scenario 4 — A currently-empty block still has a reachable tab (Edge case)

1. Find or contrive an account state where one candidate page's block is legitimately empty (e.g.
   Storage's KV namespaces tab on an account with none, or force it via the existing D1 test-data
   path used in this project's own dev setup).
2. Confirm that block's tab is still present in the strip (not hidden because it's empty) and
   clicking it shows the block's existing empty state, unchanged from before this feature.
