import { useState } from "react";
import type { JSX, KeyboardEvent, ReactNode } from "react";
import { type ExposureStatus, ExposureStatusBadge } from "./ExposureStatusBadge.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { LoadingSkeleton } from "./LoadingSkeleton.tsx";

export interface FindingsTableColumn<Row> {
  key: string;
  label: string;
  width?: string;
  render: (row: Row) => ReactNode;
  sortValue?: (row: Row) => string | number;
}

export interface FindingsTableRow<Row> {
  id: string;
  status: ExposureStatus;
  data: Row;
  detail?: ReactNode;
}

// Opt-in server-side pagination (specs/020-list-pagination) — when present,
// `rows` is just the current page (already filtered/sorted server-side by
// the caller's own request), and this component delegates paging/sorting
// to the callbacks below instead of its own local state. Omitting this prop
// keeps every existing caller's fully-local filter/sort behavior unchanged.
export interface FindingsTablePagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  sortKey: string | null;
  sortDir: 1 | -1;
  // Receives just the clicked column's key — direction-toggle-on-repeat-click
  // is the caller's own responsibility (it owns sortKey/sortDir state and
  // must pass the next value back down), mirroring this component's own
  // local toggleSort below.
  onSortChange: (key: string) => void;
}

interface FindingsTableProps<Row> {
  columns: FindingsTableColumn<Row>[];
  // null = still loading; [] with emptyState set = confirmed-empty state.
  rows: FindingsTableRow<Row>[] | null;
  emptyState?: { heading: string; description: string; ctaLabel?: string; onCta?: () => void };
  loadingLabel?: string;
  pagination?: FindingsTablePagination;
}

const STATUS_ORDER: ExposureStatus[] = ["critical", "warning", "safe", "not_evaluated"];
const STATUS_LABEL: Record<ExposureStatus, string> = {
  critical: "critical",
  warning: "warning",
  safe: "protected",
  not_evaluated: "n/a",
};

// The shared "matrix" data-table pattern (docs/design.zip's flagship
// Exposure-matrix reference screen): status-count filter chips, sortable
// columns, expandable rows, and critical rows marked redundantly (tint +
// edge bar + the badge's own shape+color) — parameterized by
// caller-supplied columns/rows so every module's differently-shaped
// findings share one table implementation instead of duplicating the
// chrome per page (specs/009-design-system-alignment/research.md §4).
export function FindingsTable<Row>(
  { columns, rows, emptyState, loadingLabel, pagination }: FindingsTableProps<Row>,
): JSX.Element {
  const [filter, setFilter] = useState<ExposureStatus | null>(null);
  const [localSortKey, setLocalSortKey] = useState<string | null>(null);
  const [localSortDir, setLocalSortDir] = useState<1 | -1>(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (rows === null) {
    return <LoadingSkeleton label={loadingLabel} />;
  }

  if (rows.length === 0 && emptyState) {
    return <EmptyState {...emptyState} />;
  }

  const counts: Record<ExposureStatus, number> = {
    critical: 0,
    warning: 0,
    safe: 0,
    not_evaluated: 0,
  };
  for (const r of rows) counts[r.status]++;

  // Filter chips are hidden under pagination (below) so `filter` never gets
  // set in that mode — this stays a no-op local filter either way.
  const visibleRows = filter ? rows.filter((r) => r.status === filter) : rows;

  const sortKey = pagination ? pagination.sortKey : localSortKey;
  const sortDir = pagination ? pagination.sortDir : localSortDir;

  // FR-004: a result set that fits on one page must render exactly as it
  // does without pagination — no pager, chips/footer shown as normal (their
  // counts are accurate here, since `rows` is the complete set either way).
  // Sort still delegates to the caller whenever `pagination` is passed
  // (below) regardless of page count — same correct result, no mode-flip.
  const totalPages = pagination
    ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
    : 1;
  const showPager = !!pagination && totalPages > 1;

  // Under pagination, `rows` is already the server-sorted current page —
  // sorting it again locally would re-order it using only this page's data,
  // silently breaking cross-page order (FR-006).
  const sortColumn = sortKey ? columns.find((c) => c.key === sortKey) : undefined;
  const sortedRows = !pagination && sortColumn?.sortValue
    ? [...visibleRows].sort((a, b) => {
      const av = sortColumn.sortValue!(a.data);
      const bv = sortColumn.sortValue!(b.data);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return cmp * sortDir;
    })
    : visibleRows;

  function toggleSort(key: string) {
    if (pagination) {
      pagination.onSortChange(key);
      return;
    }
    if (localSortKey === key) {
      setLocalSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setLocalSortKey(key);
      setLocalSortDir(1);
    }
  }

  // The column-sort header and row-expand toggle below are plain <div>s
  // (not <button>) for layout reasons, so neither gets keyboard focus or
  // Enter/Space activation for free — this makes them behave like real
  // buttons for keyboard-only and screen-reader users, not just mouse
  // users. Space is included alongside Enter since that's the native
  // activation key for a button role.
  function activateOnKey(onActivate: () => void) {
    return (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    };
  }

  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--bg-canvas)" }}>
      {
        /* Hidden under pagination: `counts` only reflects the current page's
          rows once `rows` stops being the full result set, so a filter chip
          reading "12 critical" would be wrong/misleading the moment there's
          a second page (research.md §5). */
      }
      {!showPager && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", flexWrap: "wrap" }}>
          {STATUS_ORDER.filter((s) =>
            counts[s] > 0
          ).map((s) => {
            const active = filter === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(active ? null : s)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  border: `1px solid ${active ? "var(--brand-primary)" : "var(--border)"}`,
                  background: active ? "var(--brand-wash)" : "transparent",
                  padding: "5px 9px",
                  cursor: "pointer",
                }}
              >
                <ExposureStatusBadge status={s} />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-label-size)",
                    color: "var(--fg-faint)",
                  }}
                >
                  {counts[s]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {
        /* Header + rows scroll together, horizontally, as one region — every
         * column below is `flex: "none"` on purpose (fixed/percentage widths
         * so cells stay readable instead of being squeezed illegibly), which
         * means none of them can shrink to fit a narrow viewport. Without
         * this wrapper the overflow used to bleed into the page itself,
         * clipping the rightmost column(s) with no way to reach them
         * (reported live on the Workers dashboard: the Last Deploy column
         * and part of a metric card were cut off at the browser's edge). */
      }
      <div style={{ overflowX: "auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderTop: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-1)",
          }}
        >
          <div style={{ width: 3, flex: "none" }} />
          <div style={{ width: 120, flex: "none", padding: "10px 8px" }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-label-size)",
                letterSpacing: "var(--text-label-ls)",
                color: "var(--fg-faint)",
                textTransform: "uppercase",
              }}
            >
              Status
            </span>
          </div>
          {columns.map((c) => (
            <div
              key={c.key}
              data-testid={`sort-header-${c.key}`}
              role={c.sortValue ? "button" : undefined}
              tabIndex={c.sortValue ? 0 : undefined}
              aria-sort={c.sortValue && sortKey === c.key
                ? (sortDir === 1 ? "ascending" : "descending")
                : undefined}
              onClick={() => c.sortValue && toggleSort(c.key)}
              onKeyDown={c.sortValue ? activateOnKey(() => toggleSort(c.key)) : undefined}
              style={{
                width: c.width,
                flex: c.width ? "none" : 1,
                padding: "10px 8px",
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: c.sortValue ? "pointer" : undefined,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-label-size)",
                  letterSpacing: "var(--text-label-ls)",
                  color: sortKey === c.key ? "var(--brand-primary)" : "var(--fg-faint)",
                  textTransform: "uppercase",
                }}
              >
                {c.label}
              </span>
              {sortKey === c.key && (
                <span style={{ fontSize: 9, color: "var(--brand-primary)" }}>
                  {sortDir === 1 ? "▴" : "▾"}
                </span>
              )}
            </div>
          ))}
          <div style={{ width: 24, flex: "none" }} />
        </div>

        <div>
          {sortedRows.map((row) => {
            const critical = row.status === "critical";
            const open = expanded === row.id;
            return (
              <div
                key={row.id}
                data-testid={`findings-row-${row.id}`}
                style={{
                  borderBottom: "1px solid var(--rule-hairline)",
                  background: critical ? "var(--status-critical-row)" : "transparent",
                }}
              >
                <div
                  role={row.detail ? "button" : undefined}
                  tabIndex={row.detail ? 0 : undefined}
                  aria-expanded={row.detail ? open : undefined}
                  onClick={() => row.detail && setExpanded(open ? null : row.id)}
                  onKeyDown={row.detail
                    ? activateOnKey(() => setExpanded(open ? null : row.id))
                    : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    cursor: row.detail ? "pointer" : undefined,
                  }}
                >
                  <div
                    style={{
                      width: 3,
                      flex: "none",
                      alignSelf: "stretch",
                      background: critical ? "var(--status-critical)" : "transparent",
                    }}
                  />
                  <div style={{ width: 120, flex: "none", padding: "8px" }}>
                    <ExposureStatusBadge status={row.status} />
                  </div>
                  {columns.map((c) => (
                    <div
                      key={c.key}
                      style={{
                        width: c.width,
                        flex: c.width ? "none" : 1,
                        padding: "8px",
                        minWidth: 0,
                      }}
                    >
                      {c.render(row.data)}
                    </div>
                  ))}
                  <div style={{ width: 24, flex: "none", textAlign: "center" }}>
                    {row.detail && (
                      <span
                        style={{
                          display: "inline-block",
                          color: "var(--fg-faint)",
                          transform: open ? "rotate(90deg)" : undefined,
                          transition: "transform .15s",
                        }}
                      >
                        {"›"}
                      </span>
                    )}
                  </div>
                </div>
                {open && row.detail && (
                  <div
                    style={{
                      background: "var(--bg-base)",
                      borderTop: "1px solid var(--rule-hairline)",
                      padding: "16px 24px 18px 21px",
                    }}
                  >
                    {row.detail}
                  </div>
                )}
              </div>
            );
          })}
          {sortedRows.length === 0 && (
            <div style={{ padding: "12px 8px", color: "var(--fg-faint)" }}>
              No findings match this filter.
            </div>
          )}
        </div>
      </div>

      {showPager && pagination
        ? (
          (() => {
            return (
              <div
                data-testid="pagination-footer"
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  borderTop: "1px solid var(--border)",
                  background: "var(--surface-1)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-label-size)",
                  color: "var(--fg-faint)",
                }}
              >
                <div data-testid="pagination-status">
                  {pagination.total} total · page {pagination.page} of {totalPages}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    data-testid="pagination-prev"
                    disabled={pagination.page <= 1}
                    onClick={() => pagination.onPageChange(pagination.page - 1)}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-label-size)",
                      color: pagination.page <= 1 ? "var(--fg-faint)" : "var(--fg-secondary)",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      padding: "4px 9px",
                      cursor: pagination.page <= 1 ? "default" : "pointer",
                    }}
                  >
                    PREV
                  </button>
                  <button
                    type="button"
                    data-testid="pagination-next"
                    disabled={pagination.page >= totalPages}
                    onClick={() => pagination.onPageChange(pagination.page + 1)}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-label-size)",
                      color: pagination.page >= totalPages
                        ? "var(--fg-faint)"
                        : "var(--fg-secondary)",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      padding: "4px 9px",
                      cursor: pagination.page >= totalPages ? "default" : "pointer",
                    }}
                  >
                    NEXT
                  </button>
                </div>
              </div>
            );
          })()
        )
        : (
          <div
            style={{
              display: "flex",
              gap: 14,
              padding: "10px 12px",
              borderTop: "1px solid var(--border)",
              background: "var(--surface-1)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-label-size)",
              color: "var(--fg-faint)",
            }}
          >
            {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
              <div key={s}>
                {counts[s]} {STATUS_LABEL[s]}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
