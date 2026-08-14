# Research: List Pagination

## §1. Audit log: cursor-follow pattern

**Decision**: `fetchAccountAuditLog()` (`worker/modules/workers-dashboard/audit-log.ts`) follows
Cloudflare's Audit Logs API cursor itself, issuing further `per_page=100` requests (each still
gated by `withGlobalFetchSlot`) until either the API reports no further pages or a defined safe cap
(`AUDIT_LOG_FETCH_CAP = 1000` — same order of magnitude as `workers-dashboard/analytics.ts`'s
`ANALYTICS_ROW_LIMIT`) is reached. Returns `{ entries, truncated }` instead of a bare array, mirroring
`AnalyticsWindow.truncated`'s existing shape exactly (`analytics.ts:23-30`) — same convention, same
field name, so callers already familiar with that pattern read this one for free.

**Rationale**: This is the smallest independently-shippable slice (Story 1, P1) — no new shared
infrastructure needed, and the project already has an established, tested pattern for "fetch up to
a safe cap, surface truncation explicitly" to mirror rather than invent.

**Alternatives considered**: Operator-driven "Load more" (rejected by the user directly — see
spec.md's resolved FR-011 — more Cloudflare API request volume is preferred over a new UI
continuation pattern).

**Cursor mechanics**: Cloudflare's Audit Logs API pagination is offset-based via `page`/`per_page`
query params (not an opaque cursor token) per the existing `per_page=100` call — confirmed by
reading the current implementation, which already sets `per_page` but never `page`, defaulting to
page 1. Following it further means incrementing `page` and re-requesting until a response's
`result` array comes back shorter than `per_page` (end of data) or the cap is hit.

## §2. Module dashboard row-unit granularity (why pagination isn't one-shape-fits-six)

Read all six pages' current table wiring before assuming a single "add page/page_size, done"
pattern would work everywhere. It doesn't — each module's table has a different unit:

- **Workers** (`WorkersDashboardPage.tsx`): one `FindingsTable`, one row per Worker. Simplest case
  — a flat list, one paginated collection per page load.
- **DNS** (`DnsInventory.tsx:210-211,327`): the table shows **one zone's records at a time** (a
  zone-picker UI selects the active zone; `zone.records.map(...)` feeds `FindingsTable`). Pagination
  scope is records *within the selected zone*, not a flat cross-zone list — switching zones is
  already its own reset boundary (the component remounts `FindingsTable` on zone switch per its own
  comment at `DnsInventory.tsx:328`). **Correction (during implementation)**: this paragraph
  originally claimed zone-scoping was already an "existing `zone` query param" — that was wrong.
  `GET /api/dns/inventory` took **no query params at all** before this feature; zone selection was
  entirely client-side (the frontend fetched every zone's every record in one response and filtered
  in the browser). Implementing DNS pagination meant introducing `zone` as a genuinely new param, a
  lightweight `zone_summaries` list (name + count only) for the tab bar so it doesn't need every
  zone's full record set, and account-wide `total_records`/`total_dangling` computed server-side
  since the frontend can no longer sum them from data it doesn't fully have anymore. Recorded here
  as a reminder that "confirm before assuming" (this section's own opening instruction) applies to
  every module, not just the three explicitly flagged as unconfirmed below — this one was stated as
  fact and was wrong.
- **Storage** (`StorageInventory.tsx:229-236,308-334`): **three independent `FindingsTable`
  instances** on one page — R2 buckets, KV namespaces, D1 databases — each with its own rows array.
  Each needs its own independent page/page_size/total; there is no single "the table" to paginate.
- **Security, Zero Trust, Pages**: not yet re-read in this pass (deferred to each module's own
  implementation task) — Security is one-row-per-zone per specs/017; Zero Trust and Pages need the
  same "flat, per-zone-scoped, or multi-table" check DNS/Storage got here before assuming flat.

**Decision**: `worker/pagination.ts` provides the *shared math* (LIMIT/OFFSET computation, a
response envelope shape, and a whitelisted-column sort validator) — not a one-size API contract.
Each module's route applies it to whatever its own row-unit actually is: Workers applies it once;
DNS applies it scoped to the already-selected zone (an existing query parameter, not new); Storage
applies it three times (once per bucket/namespace/database collection) in one response.

**Rationale**: Guessing a single shape without reading each page first would have produced a
plausible-looking but wrong contract for DNS and Storage specifically — exactly the kind of
mistake this research phase exists to catch before implementation starts.

## §3. Sort must move server-side alongside pagination

**Decision**: `sort_key`/`sort_dir` become query params on the same paginated routes, validated
against a per-module whitelist of sortable column keys (reusing each module's existing
`FindingsTableColumn.sortValue`-bearing columns as the whitelist source) and applied via a
parameterized `ORDER BY` before `LIMIT`/`OFFSET`.

**Rationale**: FR-006 requires "existing sort behavior on a paginated table MUST operate over the
table's entire result set, not only the rows on the currently displayed page." Once pagination is
server-side, `FindingsTable`'s current purely-local sort (sorts whatever rows it was handed) can
only ever sort the current page — satisfying FR-006 is not optional polish, it's a direct
consequence of the pagination-mechanism decision already made (spec.md's resolved FR-010) and must
ship in the same change, not as follow-up.

**Alternatives considered**: Leaving sort client-side-only-within-page — rejected, directly
violates FR-006, which was written into the spec precisely to rule this out (Story 2, Scenario 3).

**Column whitelisting rationale**: `sort_key` arrives as a client-controlled query string value; an
unvalidated value concatenated into `ORDER BY` is a SQL-injection vector (D1 exposes no equivalent
of a parameterized identifier — parameters bind values, not column names). Each module's route
maps the incoming `sort_key` against a fixed `Record<string, string>` of allowed key → real column
name, defaulting to that module's existing default order (its current unparameterized `ORDER BY`)
on no/unrecognized key, and rejects (400) an explicitly-invalid key rather than silently falling
back — consistent with this project's existing input-validation convention (e.g.
`e6ef600 fix(audit): reject a malformed since query param`).

## §4. FindingsTable's dual-mode pagination

**Decision**: `FindingsTable` gains one new optional prop, `pagination?: { page: number; pageSize:
number; total: number; onPageChange: (page: number) => void; sortKey: string | null; sortDir: 1 |
-1; onSortChange: (key: string) => void }`. When present: the component renders a page footer
(current page / total pages / total count, prev/next), and its sort header `onClick`/`onKeyDown`
call `onSortChange` instead of internal `toggleSort` state, and `sortedRows` becomes just `rows`
(already sorted server-side) instead of a local `.sort()`. When absent: today's fully local
filter/sort/expand behavior is unchanged — every existing caller that doesn't opt in keeps working
exactly as it does now.

**Rationale**: A single shared component with an opt-in mode is a smaller, safer change than
forking a second table component, and matches the project's existing "one shared table
implementation" convention (specs/009-design-system-alignment/research.md §4) — the reason
`FindingsTable` exists at all.

**Alternatives considered**: A separate `PaginatedFindingsTable` component — rejected as needless
duplication of the filter-chip/row-expansion/keyboard-operability chrome that's identical either
way; a fork here would re-introduce exactly the per-module divergence risk `FindingsTable` was
built to eliminate.

## §5. Existing status-filter chips vs. server-side pagination

**Open interaction, resolved by design**: `FindingsTable`'s status filter chips (critical/warning/
protected/n/a counts, click to filter) currently filter the *already-loaded* `rows` array
client-side. With server-side pagination, the loaded rows are only the current page — filtering
client-side would show "0 of N critical" nonsense for criticals that exist on other pages.

**Decision**: When `pagination` is present, the status filter chips are hidden. Rationale: the
per-status counts shown in those chips (`counts[s]`) are already only ever computed from the
currently-loaded page's rows even without this change being in scope to fix, and re-deriving them
as a true account-wide count would need its own backend aggregation query — real, but genuinely
separate scope from "make long tables paginate," not something to silently bolt on here. Recorded
as a known limitation in `quickstart.md`, not hidden.

**Alternatives considered**: Fetching true per-status counts server-side and keeping chips visible
— deferred as follow-up scope (would need a `GROUP BY status` aggregation query per module,
genuinely separate work from the pagination/sort mechanism this feature is about).
