# Quickstart: Worker Detail Page

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-16

Manual validation once implemented — run `deno task dev`, log in via Access. Needs a real
`POST /api/exposure/evaluate` and `POST /api/access/evaluate` run against a Cloudflare account with
at least one Worker whose custom domain is covered by an Access application and whose `workers.dev`
subdomain isn't (the same kind of mixed-coverage Worker every other Exposure-related quickstart in
this repo already relies on).

## Scenario 1 — Routes/hostnames with individual status (User Story 1)

1. Open Workers, click a Worker row (pick one with more than one hostname and a mixed status, e.g.
   one CRITICAL + one PROTECTED route).
2. Confirm the detail page shows every one of that Worker's routes, each with its own status badge
   — matching what Exposure inventory shows for the same Worker's hostnames today (cross-check the
   two pages side by side).
3. Click "back" (or equivalent); confirm the Workers table shows the same page/sort/filter state it
   had before the click-through, not reset to page 1/default sort.

## Scenario 2 — Plain-language policy per route (User Story 2)

1. On the same Worker's detail page, find the route covered by an Access application. Confirm its
   policy renders as ALLOW/REQUIRE/DENY lines, not just a "covered" flag — cross-check the text
   matches that same application's policy detail on the Zero Trust page exactly.
2. Find the route with no covering application (or one whose covering app has no policies/allows
   Everyone). Confirm it explicitly states no policy covers it (or that the app is permissive), not
   just a blank policy section.

## Scenario 3 — Recent changes scoped to this Worker (User Story 3)

1. Trigger a real change against this Worker (e.g. toggle its `workers.dev` subdomain via
   `wrangler deploy`, or via the Cloudflare dashboard) and wait for it to appear in Cloudflare's
   Audit Logs (may take a minute).
2. Reload the detail page; confirm the change appears in "recent changes," scoped to this Worker —
   cross-check against a *different* Worker's detail page to confirm that Worker's own list doesn't
   show the same entry.
3. Open the detail page for a Worker with no recent changes; confirm an explicit "no recent
   changes" message, not a blank section.

## Scenario 4 — Edge cases

1. Open the detail page for a Worker with zero HTTP routes (a queue-consumer-only Worker, if the
   test account has one — or check via `GET /api/exposure/inventory` for a Worker whose
   `hostnames` array is empty). Confirm an explicit "exposure does not apply" state, not an empty
   table.
2. Manually hit `GET /api/workers/does-not-exist/detail`. Confirm `404` with the documented error
   body (contracts/api.md), and that the frontend renders an explicit not-found state rather than a
   blank page or crash.
3. Temporarily break the `CF_API_TOKEN`'s Access Logs scope (or simulate via a mocked route in a
   Playwright test) and confirm the "recent changes" section shows an explicit unavailable state,
   distinct from a genuinely-empty one — reuses `WorkersDashboardPage.tsx`'s existing
   `recent-changes-unavailable` pattern.
