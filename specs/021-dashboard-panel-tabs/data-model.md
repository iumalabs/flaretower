# Phase 1 Data Model: Dashboard Panel Tabs

No backend data model changes — this feature is client-side layout only (plan.md Technical Context).
What follows is `TabStrip`'s component contract (its "data model" in the absence of any persisted
entity) and each candidate page's block-to-tab mapping.

## `TabStrip` component contract

```ts
export interface TabEntry {
  key: string; // stable identity, e.g. "buckets" | "kv" | "d1"
  label: string; // the block's existing section-heading text, unchanged (spec.md FR-002)
  content: JSX.Element; // the block's existing rendered output, unchanged
}

export interface TabStripProps {
  tabs: TabEntry[]; // 3+ entries per spec.md FR-001/FR-004 — the component itself doesn't
  // enforce a minimum; callers only use it on pages that already qualify
}
```

- **Active-tab state**: owned inside `TabStrip` via `useState(() => tabs[0].key)` — a page never
  needs to read or set it externally (research.md §1: no URL/router involvement, so there's no
  external state to lift up for a query-param sync that doesn't exist).
- **Rendering**: `TabStrip` renders a row of `<button>`s (one per entry, chip style per research.md
  §2) followed by `tabs.find((t) => t.key === activeKey)!.content` — only the active entry's
  `content` is ever in the returned tree (spec.md FR-003: not merely `display:none`-hidden).
- **Empty/zero-row blocks**: `content` for a zero-row block is whatever that block already renders
  for its empty state (e.g. `StorageInventory.tsx`'s existing `emptyState` prop on `FindingsTable`)
  — `TabStrip` itself has no opinion on a block's contents, so FR-009 ("tab stays present even when
  the block has zero rows") falls out for free: the tab entry exists in the `tabs` array regardless
  of what its `content` currently renders.

## Per-page block → tab mapping

| Page             | Tab key          | Label                        | Existing content (unchanged)                                          |
| ---------------- | ---------------- | ---------------------------- | --------------------------------------------------------------------- |
| Audit & Drift    | `log`            | Audit log                    | `AuditLogPanel`                                                       |
|                  | `alerts`         | Unified alerts inbox         | `UnavailableSourcesNotice` + alerts `FindingsTable`                   |
|                  | `changes`        | What changed                 | `UnavailableSourcesNotice` + changes `FindingsTable`/error text       |
|                  | `summary`        | Account-wide posture summary | `UnavailableSourcesNotice` + summary `<table>`                        |
| Security Posture | `zones`          | Zones                        | zones `FindingsTable` (new label — research.md §4)                    |
|                  | `certificates`   | Certificates                 | certificates `FindingsTable`/unavailable text                         |
|                  | `waf-rules`      | WAF custom rules             | WAF rules `FindingsTable`/unavailable text                            |
|                  | `turnstile`      | Turnstile widgets            | Turnstile widgets content (unpaginated, unchanged)                    |
| Storage          | `buckets`        | R2 buckets                   | buckets `FindingsTable`                                               |
|                  | `kv`             | KV namespaces                | KV `FindingsTable`                                                    |
|                  | `d1`             | D1 databases                 | D1 `FindingsTable`                                                    |
| Zero Trust       | `applications`   | Access applications          | app-picker chips + applications `FindingsTable` + `PolicyDetailPanel` |
|                  | `groups`         | Access Groups                | `GroupsPanel` (decoupled from `selectedAppId` — research.md §4)       |
|                  | `service-tokens` | Service tokens               | service tokens `FindingsTable`                                        |

## Page-level elements that stay outside every tab (rendered once, always visible)

- Page `<h1>` + run/evaluated-at metadata line — already page-level on all 4 pages, unchanged.
- The page's own critical-finding `AlertBanner`, where present (Security, Storage, Zero Trust
  already render this above their first block; Audit & Drift's `criticalAlert` banner moves here
  during implementation — research.md §4) — spec.md FR-006.
