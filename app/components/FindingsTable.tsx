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

interface FindingsTableProps<Row> {
  columns: FindingsTableColumn<Row>[];
  // null = still loading; [] with emptyState set = confirmed-empty state.
  rows: FindingsTableRow<Row>[] | null;
  emptyState?: { heading: string; description: string; ctaLabel?: string; onCta?: () => void };
  loadingLabel?: string;
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
  { columns, rows, emptyState, loadingLabel }: FindingsTableProps<Row>,
): JSX.Element {
  const [filter, setFilter] = useState<ExposureStatus | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
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

  const visibleRows = filter ? rows.filter((r) => r.status === filter) : rows;

  const sortColumn = sortKey ? columns.find((c) => c.key === sortKey) : undefined;
  const sortedRows = sortColumn?.sortValue
    ? [...visibleRows].sort((a, b) => {
      const av = sortColumn.sortValue!(a.data);
      const bv = sortColumn.sortValue!(b.data);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return cmp * sortDir;
    })
    : visibleRows;

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
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
      <div style={{ display: "flex", gap: 8, padding: "10px 12px", flexWrap: "wrap" }}>
        {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => {
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
    </div>
  );
}
