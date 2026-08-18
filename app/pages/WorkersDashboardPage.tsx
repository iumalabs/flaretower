import { useEffect, useState } from "react";
import type { JSX } from "react";
import type { ExposureStatus } from "../components/ExposureStatusBadge.tsx";
import {
  FindingsTable,
  type FindingsTableColumn,
  type FindingsTablePagination,
  type FindingsTableRow,
} from "../components/FindingsTable.tsx";
import { MetricCard } from "../components/MetricCard.tsx";
import { EmptyState } from "../components/EmptyState.tsx";

interface WorkerRow {
  worker_name: string;
  environment: "production" | "preview";
  route_count: number;
  last_deploy_at: string | null;
  requests_24h: number | null;
  errors_24h: number | null;
  cpu_p50_ms: number | null;
  exposure_status: ExposureStatus;
}

interface RecentChange {
  occurred_at: string;
  actor: string;
  actor_source: string;
  action: string;
  target: string;
  result_summary: string | null;
}

interface PaginationEnvelope {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

interface DashboardResponse {
  generated_at: string;
  summary: {
    deployed_count: number;
    deployed_by_environment: { production: number; preview: number };
    requests_24h_total: number | null;
    requests_24h_change_pct: number | null;
    error_rate_pct: number | null;
    errors_24h_total: number | null;
    cpu_p99_ms: number | null;
    total_route_count: number;
  };
  workers: WorkerRow[];
  workers_pagination: PaginationEnvelope;
  recent_changes: RecentChange[];
  unavailable: Array<{ source: string; error: string }>;
}

interface WorkersPageParams {
  page: number;
  sortKey: string | null;
  sortDir: 1 | -1;
}

// specs/023-worker-detail-page (FR-011) — page/sort state and the row-click
// callback are lifted up to App.tsx instead of local useState, so
// navigating to a Worker's detail page and back preserves them.
interface WorkersDashboardPageProps {
  page: number;
  sortKey: string | null;
  sortDir: 1 | -1;
  onPageChange: (page: number) => void;
  onSortChange: (key: string) => void;
  onSelectWorker: (workerName: string) => void;
}

async function fetchDashboard(params: WorkersPageParams): Promise<DashboardResponse> {
  const query = new URLSearchParams({ page: String(params.page) });
  if (params.sortKey) {
    query.set("sort_key", params.sortKey);
    query.set("sort_dir", params.sortDir === 1 ? "asc" : "desc");
  }
  const res = await fetch(`/api/workers/dashboard?${query}`);
  if (!res.ok) {
    throw new Error(`GET /api/workers/dashboard failed: ${res.status}`);
  }
  return await res.json();
}

const NOT_AVAILABLE = "not available";

function formatCount(n: number | null): string {
  return n === null ? NOT_AVAILABLE : n.toLocaleString();
}

function formatMs(n: number | null): string {
  return n === null ? NOT_AVAILABLE : `${n}ms`;
}

const COLUMNS: FindingsTableColumn<WorkerRow>[] = [
  {
    key: "worker",
    label: "Worker",
    width: "20%",
    sortValue: (r) => r.worker_name,
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {r.worker_name}
      </span>
    ),
  },
  {
    key: "env",
    label: "Env",
    width: "12%",
    sortValue: (r) => r.environment,
    render: (r) => (
      <span style={{ fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
        {r.environment}
      </span>
    ),
  },
  {
    key: "routes",
    label: "Routes",
    width: "8%",
    sortValue: (r) => r.route_count,
    render: (r) => <span style={{ color: "var(--fg-muted)" }}>{r.route_count}</span>,
  },
  {
    key: "requests",
    label: "Requests 24h",
    width: "14%",
    sortValue: (r) => r.requests_24h ?? -1,
    render: (r) => (
      <span style={{ color: r.requests_24h === null ? "var(--fg-faint)" : "var(--fg-muted)" }}>
        {formatCount(r.requests_24h)}
      </span>
    ),
  },
  {
    key: "errors",
    label: "Errors",
    width: "10%",
    sortValue: (r) => r.errors_24h ?? -1,
    render: (r) => (
      <span
        style={{
          color: r.errors_24h === null
            ? "var(--fg-faint)"
            : r.errors_24h > 0
            ? "var(--status-critical-fg)"
            : "var(--fg-muted)",
        }}
      >
        {formatCount(r.errors_24h)}
      </span>
    ),
  },
  {
    key: "cpu",
    label: "CPU P50",
    width: "10%",
    sortValue: (r) => r.cpu_p50_ms ?? -1,
    render: (r) => (
      <span style={{ color: r.cpu_p50_ms === null ? "var(--fg-faint)" : "var(--fg-muted)" }}>
        {formatMs(r.cpu_p50_ms)}
      </span>
    ),
  },
  {
    key: "last-deploy",
    label: "Last Deploy",
    sortValue: (r) => r.last_deploy_at ?? "",
    render: (r) => (
      <span style={{ fontSize: "var(--text-meta-size)", color: "var(--fg-faint)" }}>
        {r.last_deploy_at ?? NOT_AVAILABLE}
      </span>
    ),
  },
];

function formatPct(n: number | null): string {
  if (n === null) return NOT_AVAILABLE;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function RecentChangesPanel(
  { changes, unavailableReason }: {
    changes: RecentChange[] | null;
    unavailableReason: string | null;
  },
): JSX.Element {
  return (
    <div
      id="recent-changes-panel"
      style={{
        width: 300,
        flex: "none",
        border: "1px solid var(--border)",
        background: "var(--bg-canvas)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-label-size)",
          letterSpacing: "var(--text-label-ls)",
          color: "var(--fg-faint)",
          textTransform: "uppercase",
        }}
      >
        Recent changes
      </div>
      {changes === null && (
        <div style={{ padding: 14, color: "var(--fg-faint)", fontSize: "var(--text-code-size)" }}>
          Loading…
        </div>
      )}
      {changes !== null && unavailableReason && (
        <div
          data-testid="recent-changes-unavailable"
          style={{
            padding: 14,
            color: "var(--status-critical-fg)",
            fontSize: "var(--text-code-size)",
          }}
        >
          Recent changes unavailable: {unavailableReason}
        </div>
      )}
      {changes !== null && !unavailableReason && changes.length === 0 && (
        <div style={{ padding: 14, color: "var(--fg-faint)", fontSize: "var(--text-code-size)" }}>
          No recent Workers-related changes.
        </div>
      )}
      {changes !== null && !unavailableReason && changes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {changes.map((c, i) => (
            <div
              key={`${c.occurred_at}-${i}`}
              data-testid={`recent-change-${i}`}
              style={{ padding: "12px", borderBottom: "1px solid var(--rule-hairline)" }}
            >
              <div style={{ fontSize: "var(--text-body-size)", color: "var(--fg-primary)" }}>
                {c.action}
              </div>
              <div
                style={{
                  fontSize: "var(--text-meta-size)",
                  color: "var(--fg-faint)",
                  marginTop: 2,
                }}
              >
                {c.target}
              </div>
              <div
                style={{
                  fontSize: "var(--text-meta-size)",
                  color: "var(--fg-faint)",
                  marginTop: 4,
                }}
              >
                {c.actor} · {c.actor_source} · {c.occurred_at}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ENV_FILTERS = ["all", "production", "preview"] as const;
type EnvFilter = typeof ENV_FILTERS[number];

export function WorkersDashboardPage(
  { page, sortKey, sortDir, onPageChange, onSortChange, onSelectWorker }: WorkersDashboardPageProps,
): JSX.Element {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [envFilter, setEnvFilter] = useState<EnvFilter>("all");

  useEffect(() => {
    fetchDashboard({ page, sortKey, sortDir })
      .then((res) => {
        // The requested page no longer exists (e.g. the underlying inventory
        // shrank between loads) but real results do — recover to the true
        // last page rather than showing "no Workers" for an account that
        // has them (FR-008), instead of setData()-ing this stale response.
        if (
          res.workers.length === 0 && res.workers_pagination.total > 0 &&
          page > res.workers_pagination.total_pages
        ) {
          onPageChange(res.workers_pagination.total_pages);
          return;
        }
        setData(res);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load dashboard")
      );
  }, [page, sortKey, sortDir]);

  if (error) {
    return <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>;
  }

  // research.md §3 — narrows the current, already-loaded server-side page's
  // rows only; does not reach into un-loaded pages (same tradeoff
  // specs/025's Exposure matrix search already established for this app).
  const filteredWorkers = data
    ? data.workers.filter((w) =>
      (envFilter === "all" || w.environment === envFilter) &&
      (query === "" || w.worker_name.toLowerCase().includes(query.toLowerCase()))
    )
    : null;

  const rows: FindingsTableRow<WorkerRow>[] | null = filteredWorkers
    ? filteredWorkers.map((w) => ({
      id: w.worker_name,
      status: w.exposure_status,
      data: w,
    }))
    : null;

  const environmentCount = data
    ? Object.values(data.summary.deployed_by_environment).filter((n) => n > 0).length
    : 0;

  const pagination: FindingsTablePagination | undefined = data
    ? {
      page: data.workers_pagination.page,
      pageSize: data.workers_pagination.page_size,
      total: data.workers_pagination.total,
      onPageChange,
      sortKey,
      sortDir,
      onSortChange,
    }
    : undefined;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-display-size)",
              fontWeight: "var(--text-display-weight)" as unknown as number,
              letterSpacing: "var(--text-display-ls)",
              margin: "0 0 8px",
            }}
          >
            Workers
          </h1>
          {data && (
            <p
              style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}
            >
              {data.summary.deployed_count} deployed · {data.summary.total_route_count} routes ·
              {" "}
              {environmentCount} environment{environmentCount === 1 ? "" : "s"}
            </p>
          )}
          <p
            style={{
              fontSize: "var(--text-body-size)",
              color: "var(--fg-muted)",
              maxWidth: 520,
              margin: "4px 0 0",
            }}
          >
            The Worker inventory the exposure scan reads from — code, routes, environments, bindings
            and traffic for everything deployed in this account.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="filter…"
            aria-label="Filter Workers"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-code-size)",
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              color: "var(--fg-secondary)",
              padding: "6px 10px",
              minWidth: 140,
            }}
          />
          <select
            value={envFilter}
            onChange={(e) => setEnvFilter(e.target.value as EnvFilter)}
            aria-label="Filter by environment"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-code-size)",
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              color: "var(--fg-secondary)",
              padding: "6px 10px",
            }}
          >
            <option value="all">ENV: ALL</option>
            <option value="production">ENV: PRODUCTION</option>
            <option value="preview">ENV: PREVIEW</option>
          </select>
          <button
            type="button"
            onClick={() =>
              document.getElementById("recent-changes-panel")?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              })}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-code-size)",
              letterSpacing: "0.06em",
              background: "var(--brand-primary)",
              color: "var(--bg-base)",
              border: "none",
              padding: "7px 12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            RECENT ACTIVITY
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, margin: "20px 0", flexWrap: "wrap" }}>
        <MetricCard
          label="Deployed"
          value={data ? data.summary.deployed_count : null}
          context={data
            ? `${data.summary.deployed_by_environment.production} production · ${data.summary.deployed_by_environment.preview} preview`
            : undefined}
        />
        <MetricCard
          label="Requests 24h"
          value={data ? formatCount(data.summary.requests_24h_total) : null}
          context={data && data.summary.requests_24h_change_pct !== null
            ? `${formatPct(data.summary.requests_24h_change_pct)} vs yesterday`
            : undefined}
        />
        <MetricCard
          label="Error rate"
          value={data && data.summary.error_rate_pct !== null
            ? `${data.summary.error_rate_pct.toFixed(3)}%`
            : null}
          context={data && data.summary.errors_24h_total !== null
            ? `${formatCount(data.summary.errors_24h_total)} errors`
            : undefined}
        />
        <MetricCard
          label="CPU P99"
          value={data ? formatMs(data.summary.cpu_p99_ms) : null}
          context="slowest 1% of requests"
        />
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {rows && rows.length === 0 && (query !== "" || envFilter !== "all")
            ? (
              <EmptyState
                heading="No matches"
                description="No Workers match the current filter."
              />
            )
            : rows && rows.length === 0
            ? (
              <EmptyState
                heading="No Workers in this account"
                description="Deploy a Worker to see it appear here."
              />
            )
            : (
              <FindingsTable
                statusPosition="right"
                columns={COLUMNS}
                rows={rows}
                loadingLabel="Loading Workers inventory…"
                pagination={pagination}
                onRowClick={(w) => onSelectWorker(w.worker_name)}
              />
            )}
        </div>
        <RecentChangesPanel
          changes={data ? data.recent_changes : null}
          unavailableReason={data?.unavailable.find((u) => u.source === "audit_log")?.error ??
            null}
        />
      </div>
    </div>
  );
}
