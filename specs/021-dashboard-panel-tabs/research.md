# Phase 0 Research: Dashboard Panel Tabs

## §1 — Decision: active-tab state is plain component `useState`, not URL state

**Decision**: `TabStrip` owns its own `activeKey` state internally (or the parent page owns it via a
lifted `useState`, per-page — either way, plain React state), defaulting to the first entry. No
query parameter, no `window.location` interaction.

**Rationale**: The original spec draft assumed tabs should be URL-reflected "consistent with this
project's existing pagination/sort URL-state convention" — that convention doesn't exist. Verified
directly in the codebase: `app/App.tsx`'s own top-level page navigation is `useState<PageKey>` with
an explicit comment — _"State-based nav — no router dependency yet (research.md §6 of
specs/009-design-system-alignment: revisit once enough modules land that a real router earns its
keep...)"_ — and every module page's pagination/sort state (`DnsInventory.tsx`,
`ZeroTrustInventory.tsx`, etc.) builds a `URLSearchParams` object only to shape the outgoing
`fetch()` request, never to update the browser's actual address bar. Nothing in this app persists
across a reload today except what's in D1. Confirmed with the project owner (see spec.md
Assumptions) that tabs should match this same precedent rather than being the one piece of
navigation state that's suddenly URL-addressable while everything around it isn't — that
inconsistency would be confusing (a shared link would restore the tab but not the page's pagination
state, sort order, or even the fact that you were on this page at all, since top-level nav isn't
URL-addressable either).

**Alternatives considered**:

- _URL query param (`?tab=...`), no full router_: rejected — would be the one bit of URL state in an
  otherwise URL-state-free app; a half-measure that raises "why only tabs?" without a good answer,
  and pre-empts the real decision (spec 009's research.md §6) about when this app actually earns a
  router.
- _Introduce a real router now to support both page-level and tab-level URL state consistently_:
  rejected as far outside this feature's scope — spec 009 explicitly deferred this until "enough
  modules land," which is a call for a dedicated feature/spec of its own, not a side effect of a
  tabs layout change.

## §2 — Visual pattern: no tab precedent in `docs/design.zip`; reuse the existing chip-button style

**Decision**: Style `TabStrip`'s buttons after the interactive chip-button pattern already used
twice in this codebase — `ZeroTrustInventory.tsx`'s application picker (lines ~550-573: active state
via `border`/`background`/`color` swapped to `var(--brand-primary)`/`var(--brand-wash)`/
`var(--fg-primary)`, inactive via `var(--border)`/`transparent`/`var(--fg-faint)`) and
`AuditInventory.tsx`'s `SOURCE_FILTERS` source-filter chips. Both already establish "a row of
`<button>`s, one visually distinguished as active" as this app's own convention for exactly this
kind of control, using only existing CSS custom properties (no new tokens).

**Rationale**: `docs/design.zip` was unpacked and searched (`grep -i tab` across
`FlareTower.dc.html`) — zero matches for any tab/tablist pattern. Per the constitution's Design
System section, a screen not covered by the design package "MAY be designed in the same visual
language, with that fact noted explicitly in the PR description" (spec.md FR-010 captures this
requirement). Reusing the chip-button pattern already validated twice in this codebase is lower-risk
than inventing a new visual treatment, and keeps `TabStrip` trivially themeable via the same tokens
every other component already uses.

**Alternatives considered**:

- _Classic underlined/bordered-bottom tab strip_: a more conventional "tabs" look, but introduces a
  new visual treatment with no precedent anywhere in this app — rejected in favor of the chip-button
  pattern's lower design risk.
- _`<select>` dropdown instead of a tab strip_: would technically satisfy "reach any block without
  scrolling," but loses the "see everything available at a glance" property a tab strip has, and
  doesn't match the phrase "tabs" the feature was explicitly requested as.

## §3 — No `contracts/` directory needed

**Decision**: Skip `contracts/` for this feature (matches `plan.md`'s Project Structure note).

**Rationale**: `contracts/` documents interfaces exposed to users or other systems (APIs, CLI
schemas, etc. — per `/speckit-plan`'s own instructions: "Skip if project is purely internal"). This
feature adds no API, no new data flow, and no interface beyond one internal React component's own
props, which `data-model.md` documents directly. Precedent: `specs/009-design-system-alignment`
(also a UI-only, no-backend-change spec) has no `contracts/` directory either.

## §4 — Per-page block inventory (confirms spec.md's page/block counts against actual code)

Surveyed via `grep -n "SectionHeading>\|<h2"` across `app/pages/*.tsx` plus a manual read of each
candidate page's render function. Two corrections to spec.md's informal count, both captured in
plan.md's Project Structure:

- **Security Posture's first block (Zones)** has no `<SectionHeading>` today — it's the page's
  implicit "main" content, rendered directly under the page's `<h1>`/critical-finding banner with no
  label of its own. This feature gives it an explicit "Zones" tab label (new, but consistent with
  how every other block in this app is named — by what it contains).
- **Audit & Drift's account-wide critical-alert banner** (`criticalAlert`, `scope="account"`) is
  currently positioned _between_ the "Audit log" and "Unified alerts inbox" blocks in the JSX — a
  historical artifact of insertion order, not a deliberate scoping decision (the banner's own data —
  the single most urgent unacknowledged alert across all modules — has nothing to do with "Audit
  log" specifically). FR-006 requires it stay visible on every tab, so it moves above the `TabStrip`
  during implementation, matching where the other three candidate pages already place their own
  critical-finding banners (before any block/tab content).

No other blocks have hidden coupling worth flagging: Storage's 3 blocks are fully independent
(confirmed by their independent pagination state, spec/020); Zero Trust's `GroupsPanel` reads only
`data?.access_groups`, with no dependency on `selectedAppId` (confirmed by reading its props type),
so promoting it from "rendered alongside `PolicyDetailPanel`" to "its own tab" per the user's
explicit 3-tab decision requires no data plumbing changes, only a JSX move.

## §5 — Why FR-007's state-preservation guarantee needs no new plumbing (and where its boundary is)

**Finding**: Every piece of state FR-007 explicitly names (current page, sort key/direction, Zero
Trust's selected application) is _already_ lifted to the owning page component's own `useState`
(`appState`/`tokenState`/`zoneState`/etc., `selectedAppId`) — never owned by `FindingsTable` itself.
`TabStrip` only decides which pre-built `content` element to return; it never unmounts the _page_,
only swaps which of the page's own already-rendered JSX subtrees is visible. Since the state lives
above the switched subtree, not inside it, it survives a tab switch automatically — no new
state-lifting work needed for what FR-007 actually promises.

**Boundary confirmed and intentionally NOT covered by FR-007**: `FindingsTable` itself owns some
state unconditionally, regardless of whether the `pagination` prop is passed — `expanded` (which
row's detail is open) always, and `localSortKey`/`localSortDir`/`filter` whenever `pagination` is
absent (Audit & Drift's "Unified alerts inbox" and "What changed" tables, both un-paginated). This
state genuinely does reset when `FindingsTable` unmounts on a tab switch. This is **not a regression
introduced by this feature** — the exact same reset already happens today whenever a user navigates
away from a top-level sidebar page and back (`App.tsx`'s `PAGES.find(...).render()` only ever mounts
the active page, discarding every other page's component tree, the same conditional-rendering shape
`TabStrip` uses). Lifting `expanded`/local-sort/filter out of `FindingsTable` to survive tab
switches specifically (while still resetting on top-level page nav) would be new scope beyond what
spec.md's FR-007 examples ask for, and would touch a shared component's contract for a benefit not
requested — out of scope for this feature. Captured as an explicit edge case in spec.md rather than
left as a silent gap.
