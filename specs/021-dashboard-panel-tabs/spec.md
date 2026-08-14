# Feature Specification: Dashboard Panel Tabs

**Feature Branch**: `021-dashboard-panel-tabs`

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "Convert stacked content blocks into tabbed navigation on module
dashboard pages that have multiple distinct blocks, so users don't have to scroll through a long
single-column page to reach lower sections. Apply as a general design-system principle: any page
with 3+ stacked full-width blocks (a section heading followed by its own table/panel) becomes tabs,
one tab per block, with the block's existing heading text becoming the tab label; a page with only
one or two blocks stays as-is. Confirmed candidate pages: Audit & Drift (4 blocks), Security Posture
(4 blocks), Storage (3 blocks), Zero Trust (3 blocks — Access Groups becomes its own tab, not nested
under Applications). Confirmed out of scope: Overview, Workers, DNS, Exposure, Pages, Token Tools.
Each page's existing pagination, sorting, critical-finding alert banner, and empty/loading states
must keep working per-tab, unchanged in behavior. Switching tabs must not lose in-flight per-tab
state. (Corrected during planning research: the app has no router and no existing URL-state
convention at all — top-level page navigation, pagination, and sort are all plain component state
that doesn't survive a reload. Bookmarkable tab URLs were dropped for this reason — see spec's
Assumptions — so active-tab state matches that same precedent: component state, not a URL param.)"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Reach any block on a long dashboard without scrolling past the others (Priority: P1)

An operator opens a dashboard page that today stacks several independent tables/panels one after
another (e.g. Security Posture's Zones, Certificates, WAF custom rules, and Turnstile widgets).
Instead of scrolling past earlier blocks to reach a later one, they click a tab and land directly on
the block they need.

**Why this priority**: This is the entire point of the feature — without it, nothing changes for the
user. It's also the smallest slice that delivers real value: converting even one page's blocks into
tabs immediately shortens that page.

**Independent Test**: Load any one of the four candidate pages (Audit & Drift, Security Posture,
Storage, Zero Trust); confirm only the active tab's block renders, a tab strip listing every block's
heading text is visible, and clicking another tab swaps which block is shown without a full page
reload.

**Acceptance Scenarios**:

1. **Given** a page with 3+ stacked blocks, **When** the page loads with no tab specified, **Then**
   the first block's tab is active and its content renders; the other blocks' content is not
   rendered on screen.
2. **Given** the tab strip is visible, **When** the operator clicks a different tab, **Then** that
   tab's block renders in place of the previous one, and the tab strip visually marks the newly
   active tab.
3. **Given** a page with only one or two blocks (e.g. today's DNS or Pages inventory), **When** the
   page loads, **Then** it renders exactly as before this feature — no tab strip, no behavior
   change.

---

### User Story 2 - Switching tabs never loses what you were doing on another tab (Priority: P2)

An operator is on page 3 of the Access applications table, with a specific application selected to
view its policy detail, when they switch to the Service tokens tab to check something. When they
switch back to Access applications, their page position, sort order, and selected application are
exactly as they left them — nothing reset.

**Why this priority**: Without this, tabs would actively make the page worse than the current
stacked layout (where switching "context" costs nothing, since everything is always on screen at
once). This is what makes tabs a strict improvement rather than a trade-off.

**Independent Test**: On Zero Trust, page forward on Access applications, select a specific
application, switch to Service tokens, then switch back — confirm the page number, sort order, and
selected application are unchanged.

**Acceptance Scenarios**:

1. **Given** a paginated/sorted table on a non-default page or sort order, **When** the operator
   switches to another tab and back, **Then** the table shows the same page and sort order as before
   switching away.
2. **Given** a block with its own selection state (Zero Trust's selected application), **When** the
   operator switches away and back, **Then** the same selection is still active.

---

### Edge Cases

- What happens to a block's own critical-finding alert banner when its tab isn't active — is it
  still shown, or hidden until that tab is selected? Per FR-006 below, a page-level critical finding
  (spanning the whole page, e.g. Zero Trust's single `critical_finding`) stays visible regardless of
  which tab is active, since it's not scoped to one block; it must not be hidden by switching away
  from whichever tab happens to contain the finding's own row.
- What happens on a page where a block legitimately has zero rows (e.g. Storage's KV namespaces when
  the account has none)? The tab itself still appears in the strip (never removed just because its
  content is currently empty) and clicking it shows that block's existing empty state.
- What happens to a table's expanded row detail, or to a table's local sort/filter when that table
  has no server-side pagination (Audit & Drift's "Unified alerts inbox" and "What changed" tables)?
  These reset when switching away from and back to that tab. FR-007 covers the state this feature
  explicitly promises to preserve (current page, sort key/direction for paginated blocks, and a
  block-local selection like Zero Trust's selected application) — all of which already live in the
  owning page's own state, above the switched content, not inside it. An expanded row or an
  un-paginated table's own local sort/filter is state the shared table component always owns
  internally; resetting it on a tab switch matches this app's existing behavior when navigating away
  from a top-level page and back (research.md §5) — not a new regression, and out of scope to fix
  here.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Pages with 3 or more stacked content blocks (Audit & Drift, Security Posture, Storage,
  Zero Trust) MUST present those blocks as tabs — one tab per block — instead of stacking them
  vertically.
- **FR-002**: Each tab's label MUST be the block's existing section-heading text, unchanged (e.g.
  "R2 buckets", "Certificates", "Access Groups") — no new naming introduced by this feature.
- **FR-003**: Exactly one tab's block MUST be rendered (present in the page, not merely visually
  hidden) at a time; the other blocks' content MUST NOT be rendered while their tab is inactive, so
  a page with many/large tables doesn't pay the DOM cost of every block at once. This governs
  rendering only — each page's data-fetching pattern (today, one request per page covering every
  block's data) is unchanged by this feature; a block's data can already be in hand before its tab
  is ever opened, only its table/panel isn't drawn until selected.
- **FR-004**: Pages with fewer than 3 blocks MUST NOT gain a tab strip or any other layout change
  from this feature — this is scoped to the four confirmed candidate pages, not applied
  automatically to every page.
- **FR-005**: Every existing behavior within a block — pagination, sorting, empty/loading states —
  MUST continue to work unchanged once that block is inside a tab.
- **FR-006**: A page-level critical-finding alert banner (one that applies to the whole page, not to
  one specific block) MUST remain visible regardless of which tab is currently active.
- **FR-007**: Switching away from a tab and back MUST preserve that block's own in-flight state
  (current page, sort key/direction, and any block-local selection such as Zero Trust's selected
  application) exactly as it was before switching away.
- **FR-008**: Active-tab state MUST be plain component state, matching this app's existing precedent
  for top-level page navigation and every block's pagination/sort state (research.md §6 of
  specs/009-design-system-alignment: no router yet) — it persists only for as long as the page stays
  mounted, resetting to the first tab on reload, same as every other piece of navigation state in
  this app today. No new URL/query-param mechanism is introduced by this feature.
- **FR-009**: A tab MUST remain present in the tab strip even when its block currently has zero rows
  — the block's own empty state renders when that tab is selected, the tab itself is never removed
  based on row count.
- **FR-010**: This tabbed-panel pattern is not covered by the existing design source
  (`docs/design.zip` has no tab component precedent as of this feature) — per the constitution's
  Design System section, it MUST be designed in the same visual language as the rest of the app
  (existing color/spacing tokens, existing interactive-chip patterns already used elsewhere, e.g.
  the Zero Trust application picker and Audit log's source filter), with that fact noted explicitly
  in the implementation PR description.

### Key Entities

- **Panel/Block**: An existing, independently-fetched section of a dashboard page (e.g. "R2 buckets"
  on Storage) — already has its own heading, its own table/content, and (where applicable) its own
  pagination/sort state. This feature changes only how blocks are arranged on screen, not what a
  block contains or how it fetches its data.
- **Tab**: A navigational control, one per block, on a page with 3+ blocks. Has a label (the block's
  existing heading text) and a key (identifies which block is active, held in component state).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: On each of the four candidate pages, the maximum scroll distance to reach any single
  block's content is reduced to effectively zero (one click, no scrolling), down from needing to
  scroll past every earlier block today.
- **SC-002**: Switching tabs and back preserves 100% of a block's in-flight state (page, sort,
  selection) — zero unintended resets, verified across every candidate page's paginated/sortable
  blocks.
- **SC-003**: Pages outside the four candidates render pixel-identical to their pre-feature layout —
  zero visual or behavioral regression on out-of-scope pages.

## Assumptions

- The four candidate pages and their block-to-tab mapping were confirmed directly with the project
  owner before this spec was written (Zero Trust: Applications / Groups / Service tokens as three
  separate tabs, not two).
- "3+ blocks" is the threshold for gaining tabs; a page with exactly 2 blocks is left stacked as
  today, since two blocks don't create the long-scroll problem this feature addresses. If a future
  page grows to 3+ blocks, it becomes a tabs candidate under this same principle, but retrofitting
  additional pages beyond the four confirmed here is out of scope for this feature.
- Workers dashboard's side-by-side table + "Recent changes" panel layout is a different pattern
  (parallel, not stacked) and is explicitly out of scope — tabbing it is not part of this feature.
- No new backend endpoints or data are required — every candidate block already has its own
  fetch/state; this feature only changes client-side layout, not data flow.
- No bookmarkable/shareable tab URLs — the app has no router or URL-state convention today (see
  Input section correction above); confirmed directly with the project owner that active-tab state
  should match the existing component-state precedent rather than introducing URL state for tabs
  alone while the rest of the app's navigation still has none.
