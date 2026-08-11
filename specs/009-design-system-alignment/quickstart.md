# Quickstart: Design System & App Shell Alignment

Manual validation guide for this feature once implemented. Run against a
local `deno task dev` session (or the deployed preview environment) with
at least one module already evaluated so its findings tables are
non-empty — reuse an existing account/token from a prior module's
quickstart if one is already configured locally.

## Prerequisites

- `deno task dev` running, or a deployed preview URL.
- At least one module (e.g. Exposure) has a completed evaluation run with
  a mix of severities, so status filtering/critical marking is visibly
  testable. If starting from empty, trigger `POST /api/exposure/evaluate`
  and `POST /api/audit/summary`'s upstream sources first.

## Scenario 1 — App shell (User Story 1)

1. Load the app in a browser. **Expect**: the browser tab shows the
   FlareTower favicon (not a generic globe/default icon).
2. Open browser DevTools → Network tab, filter by `font`. **Expect**: at
   least one `.woff2` request from the app's own origin (not
   `fonts.googleapis.com`/`fonts.gstatic.com`), confirming self-hosted
   fonts are actually being loaded, not silently falling back.
3. Look at the left side of the screen. **Expect**: a sidebar containing
   the FlareTower logo, 8 destinations (Overview + 7 modules), and an
   account/version footer block.
4. Click through 2–3 different module pages. **Expect**: the active
   item's styling (left edge bar + background tint) moves to match the
   current page every time.
5. If a module has a critical finding, check its sidebar entry. **Expect**:
   a numeric badge showing that module's critical count; a module with
   zero critical findings shows no badge at all.
6. Inspect rendered text (DevTools → computed font-family). **Expect**:
   `IBM Plex Sans` for prose/headings, `IBM Plex Mono` for
   hostnames/identifiers/labels — not a fallback like `-apple-system` or
   `Arial`.
7. Visually scan every card/badge/button on any page. **Expect**: no
   rounded corners anywhere.

## Scenario 2 — Unified findings table (User Story 2)

1. Open a module page with mixed-severity findings (e.g. Exposure).
   **Expect**: one table with status-count filter chips above it, not
   grouped per-entity cards.
2. Click the "critical" filter chip. **Expect**: only critical rows
   remain, instantly, no page reload/flash of a loading state.
3. Click the chip again (or an "all" chip if present). **Expect**: all
   rows return.
4. If at least one critical finding exists, look above the table.
   **Expect**: an alert banner naming the single most urgent finding.
5. Click a row. **Expect**: it expands in place showing additional
   detail; click again to collapse.
6. Visually confirm a critical row shows background tint + left edge bar
   + the shape+color badge simultaneously — not just a colored badge.
7. Trigger a fresh evaluation and reload mid-run if timing allows
   (or throttle network in DevTools). **Expect**: the shimmer-skeleton
   loading treatment appears, not plain "Loading…" text.
8. Open a module that has never been evaluated (or reset its findings
   table locally). **Expect**: the empty-state treatment (icon, heading,
   description, CTA button) appears, not plain text.
9. Repeat steps 1–3 on at least one other module page (e.g. DNS or
   Storage) to confirm the pattern is shared, not Exposure-specific.

## Scenario 3 — Overview page (User Story 3)

1. Navigate to the Overview page (should be the first/default sidebar
   item). **Expect**: aggregate counts per severity across all 7
   modules, a prioritized findings list, and a recent-activity log.
2. Manually sum each module's own critical count (from Scenario 1 step
   5's badges, or each module's own page) and compare to the Overview
   page's critical total. **Expect**: exact match.
3. If any module's latest evaluation run genuinely failed to read at
   all, confirm the Overview page shows that module as not-available in
   its aggregation, not silently folded into a zero count.
4. If every module currently has zero findings, confirm the Overview
   page shows a confirmed-all-clear state, not an error or a "no data"
   message.

## Automated coverage checklist (for the implementer, not manual QA)

- [ ] `deno test -A tests/unit/` passes, including any new pure-logic
      test for the `ModuleBadgeCount` rollup.
- [ ] `deno task test:e2e` passes, including new specs for: filter-chip
      interaction (at least 2 module pages), row expansion, and the
      Overview page's aggregation-matches-sum assertion.
- [ ] Every e2e spec that existed before this feature for the 7 module
      pages still passes (selectors may need updating for the table
      migration, but behavior/assertions should not regress).
- [ ] `deno fmt --check` / `deno lint` / `deno check` clean.
