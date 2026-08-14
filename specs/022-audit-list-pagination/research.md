# Phase 0 Research: Audit List Pagination

## §1 — Both endpoints already return fully-merged, in-memory arrays — same shape as Workers dashboard

`queryUnifiedAlerts()` (`worker/modules/audit/inbox.ts`) and `computeChanges()`
(`worker/modules/audit/changes.ts`) each run 17 sources' queries via `Promise.allSettled`, merge the
fulfilled results into one plain JS array, and return it. Neither is a single D1 query that could
take a SQL `LIMIT`/`OFFSET`/`ORDER BY` — this is exactly the same shape spec 020 already solved for
`worker/modules/workers-dashboard/routes.ts` (whose rows also come from multiple live sources merged
in-isolate, not one D1 table). **Decision**: reuse `worker/pagination.ts`'s `paginateArray()`
exactly as Workers dashboard does — sort-and-slice the merged array in memory, no query-shape change
to the 17 underlying per-source D1 reads. No new pagination mechanism.

## §2 — Correction: "changes" has no timestamp field to sort by recency with

The original feature description assumed both Overview lists would keep their "existing
severity/recency sort." Checking `ChangeEntry`'s actual fields
(`module, kind, entityLabel, previousStatus, currentStatus`) shows there is no timestamp field at
all — unlike `UnifiedAlert`, which has `detectedAt`. `computeChanges()` today doesn't sort its
output at all (arbitrary, source-iteration order); `OverviewPage.tsx`'s "Scan log" panel renders
`changes.changes.map(...)` in that same unsorted order, with no client-side sort applied either
(confirmed by reading the render code directly — `AuditInventory.tsx`'s "What changed" tab does
support a local _entity_label_ sort by clicking the column header, but that's alphabetical, not
recency, and Overview never engages it).

**Decision**: correct spec.md's FR-004 to "most-severe-first" for _both_ Overview lists, not
severity-for-alerts/recency-for-changes. Alerts already sort this way client-side today
(`OverviewPage.tsx`'s `SEVERITY_ORDER` map, `critical: 0, warning: 1, safe: 2, not_evaluated: 3`) —
this feature moves that ordering server-side (as a new `severity` sort-key option in the pagination
whitelist) so Overview's now-bounded top-N slice can request it directly via `sort_key=severity`,
and additionally exposes it as a real, always-available sort option on both Audit & Drift tabs (not
an Overview-only special case) — consistent with every other paginated table's
sort-by-any-whitelisted-column behavior.

## §3 — Default sort key per endpoint (when no `sort_key` is requested)

- **Alerts**: default to `detected` (`detectedAt` descending) — matches `queryUnifiedAlerts()`'s own
  existing in-code sort (`alerts.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))`), so
  Audit & Drift's Unified alerts inbox tab's _default_ view is unchanged from today. `entity` and
  the new `severity` are also selectable via `sort_key`.
- **Changes**: no existing default sort to preserve (§2) — default to `entity` (alphabetical by
  entity label), matching the one sort the frontend already exposes today via its clickable column
  header. `severity` is also selectable, and is what Overview's own fetch explicitly requests.

## §4 — Overview's bounded top-N: a `page_size` request, not a new "limit" concept

Confirmed reusable without any new backend concept: Overview simply calls both endpoints with
`page=1&page_size=<N>&sort_key=severity` (`paginateArray` already computes `total`/`total_pages` in
its returned envelope regardless of how small `page_size` is) and reads `pagination.total` to know
how many are being hidden (`total - <N>` when `total > N`) — the exact mechanism the feature
description proposed, confirmed workable against the actual envelope shape spec 020 already
established (`{ page, page_size, total, total_pages }`).

**Bounded slice size**: 5, matching `MetricCard`-row-count conventions already used elsewhere in
this app's summary UI (research.md/data-model.md's own convention of small round numbers for
"glance" surfaces) — an implementation detail per spec.md's Assumptions, not a product decision.

## §5 — Acknowledge flow needs no change

`acknowledgeAlert()` (`worker/modules/audit/inbox.ts`) already operates on a single row by
`module/kind/id`, entirely independent of how the _list_ it came from was fetched or paginated. Both
`AuditInventory.tsx`'s existing acknowledge handler (removes the row from local `alertRows` state)
and `OverviewPage.tsx`'s (removes it from local `alerts` state) already do a pure client-side filter
on success — no re-fetch, no page-aware logic. Confirmed this survives pagination unchanged:
removing a row from an already-fetched page/slice array client-side works identically whether that
array is "everything" (today) or "one page's worth" (after this feature) — FR-008 requires no new
code, just confirms the existing behavior is preserved.

## §6 — Correction found during implementation: the critical-alert banner needs a server-side field too

`AuditInventory.tsx`'s account-wide critical-alert banner (moved above the tab strip in spec 021)
computes its "is there a critical alert" check as `alertRows?.find((r) => r.status === "critical")`
— against whatever `alertRows` currently holds. Before this feature, that was always the _entire_
alerts array; once `GET /alerts` paginates, `alertRows` becomes only the current page, so a critical
alert sitting on page 2 would silently stop triggering the banner — the exact "page-level signal
computed from a paginated subset" bug spec 021's FR-006 was written to prevent for the _display_
side, but this feature's _response shape_ didn't originally account for it on the audit-alerts side
specifically.

**Fix**: `GET /alerts` now also returns `critical_alert` (the same per-alert JSON shape used inside
the `alerts` array, or `null`), computed from the full pre-pagination merged array — mirrors the
`critical_finding` field every other paginated module route already returns (spec 020's established
pattern for exactly this problem). `AuditInventory.tsx` reads this field instead of deriving it from
`alertRows`. `changes.ts`/`GET /changes` has no equivalent banner today, so no matching field was
added there.

## §7 — No `contracts/` directory

Same rationale as spec 021: this is a query-shape extension to two existing endpoints using the
already-established pagination contract (`worker/pagination.ts`'s `PaginationEnvelope`, `PageQuery`)
— nothing new to document beyond `data-model.md`'s sort-key tables.
