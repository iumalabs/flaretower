# Component Contracts: Design System & App Shell Alignment

This feature adds no new backend API endpoints (research.md §3 — the
Overview page reuses Module 7's existing `GET /api/audit/{summary,
alerts,changes}`, already documented in
`specs/007-audit-drift/contracts/api.md`). The interfaces this feature
introduces are frontend component contracts instead.

## `<Logo variant="lockup" | "mono" | "tile" theme="dark" | "light" />`

Renders the design system's SVG mark. `lockup` = wordmark + icon (used in
the Sidebar header); `mono` = icon-only monochrome (used in loading/empty
states); `tile` = the gradient app-tile treatment (reserved for favicon
generation / external use, not required inline anywhere by this
feature's own acceptance scenarios). Pure presentational, no state, no
network access.

## `<Sidebar activeKey={string} items={SidebarItem[]} footer={{account, version}} />`

```ts
interface SidebarItem {
  key: string;
  label: string;
  icon: ReactNode;          // 12x12 shape, matches design's per-item icons
  badge?: number;           // omit or 0 = no badge rendered (FR-004)
}
```

Renders the 214px left sidebar (US1/AC2, AC3, AC4). Pure presentational
— `onSelect(key: string)` callback prop drives navigation, no routing
logic inside the component itself (research.md §6: `App.tsx` keeps
owning the `useState`).

## `<FindingsTable columns={FindingsTableColumn<Row>[]} rows={FindingsTableRow<Row>[]} statusFilter emptyState loadingState />`

The shared data-table pattern (research.md §4, data-model.md). Owns:
sort-by-column state, active status-filter-chip state, per-row
expand/collapse state. Does not own: data fetching (the calling page
still owns its own `fetch`/`useEffect`, matching every existing page's
current pattern) or any mutating action (acknowledge etc. stay exactly
where they are today, per FR-019/spec.md's "role-based gating... continues
to apply unchanged" Assumption — `FindingsTable` only renders whatever
action affordance a row's `detail` content includes; it does not itself
call any mutating endpoint).

Renders, per US2's acceptance scenarios: the filter-chip row, the
sortable column header, one row per `FindingsTableRow`, redundant
critical-row marking (FR-011), and — via the `emptyState`/`loadingState`
props — delegates to `<EmptyState>`/`<LoadingSkeleton>` when `rows` is
empty/not yet loaded, rather than reimplementing those states inline.

## `<AlertBanner finding={AlertBannerFinding} scope="module" | "account" />`

Renders the critical/warning banner treatment (US2/AC3, US3/AC3). `scope`
only affects copy ("this module has..." vs. "this account has...");
visual treatment is identical for either scope, per the design source
(the design's own reference screens use the same banner component on
both the module page and could equally apply to the account-wide
Overview page).

## `<EmptyState icon heading description ctaLabel? onCta? />`

Renders the dimmed-logo/heading/description/CTA treatment (FR-015).
`ctaLabel`/`onCta` are optional — a module with nothing actionable to
offer (e.g. a read-only informational empty state) may omit them.

## `<LoadingSkeleton rows={number} />`

Renders the shimmer-skeleton treatment (FR-014). Purely presentational,
no props beyond row count — matches the design source's `skeletonRows`
data shape closely enough that no further configuration is needed.

## Overview page's own data contract

`OverviewPage` composes three existing, already-contracted endpoints —
no new contract to define here. Its only new client-side transform is
the `ModuleBadgeCount` rollup (data-model.md), which is pure and
independently unit-testable without any component involved.
