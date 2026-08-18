# Quickstart: Workers Inventory Layout

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-18

Manual validation once implemented — run `deno task dev`, log in via Access, open Workers.

## Scenario 1 — Status column anchored right (User Story 1)

1. Open the Workers inventory page. Confirm the column order left-to-right is: Worker, Env, Routes,
   Requests 24h, Errors, CPU, Last deploy, then the exposure/status pill last.
2. Open another `FindingsTable`-using page (e.g. DNS). Confirm its status column is still first,
   unchanged — this feature's `statusPosition` change did not leak into other pages.

## Scenario 2 — Header toolbar (User Story 2)

1. Confirm the header shows a subtitle ("{N} deployed · {N} routes · {N} environments") and a
   one-line description under the title.
2. Type part of a Worker's name into the search box. Confirm the table narrows to matches, no reload.
   Clear it — confirm the full list returns.
3. Select "Production" from the environment filter. Confirm only production Workers remain visible.
   Combine with a search term — confirm both apply together. Reset to "All."
4. Click the header's recent-activity control. Confirm the page brings the existing Recent changes
   panel into view — no new panel, no new network request beyond what already loads it.

## Scenario 3 — Complete metric tile row (User Story 3)

1. Confirm all four metric tiles (Deployed, Requests 24h, Error rate, CPU P99) show both a value and
   a context line underneath — including CPU P99, which previously showed the value alone.
