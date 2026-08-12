import { useEffect, useState } from "react";
import type { JSX } from "react";
import type { ExposureStatus } from "../components/ExposureStatusBadge.tsx";
import {
  FindingsTable,
  type FindingsTableColumn,
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
  };
  workers: WorkerRow[];
  recent_changes: RecentChange[];
  unavailable: Array<{ source: string; error: string }>;
}

async function fetchDashboard(): Promise<DashboardResponse> {
  const res = await fetch("/api/workers/dashboard");
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

function RecentChangesPanel({ changes }: { changes: RecentChange[] | null }): JSX.Element {
  return (
    <div
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
      {changes !== null && changes.length === 0 && (
        <div style={{ padding: 14, color: "var(--fg-faint)", fontSize: "var(--text-code-size)" }}>
          No recent Workers-related changes.
        </div>
      )}
      {changes !== null && changes.length > 0 && (
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

export function WorkersDashboardPage(): JSX.Element {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load dashboard")
      );
  }, []);

  if (error) {
    return <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>;
  }

  const rows: FindingsTableRow<WorkerRow>[] | null = data
    ? data.workers.map((w) => ({
      id: w.worker_name,
      status: w.exposure_status,
      data: w,
    }))
    : null;

  return (
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
        <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
          {data.summary.deployed_count} deployed · generated {data.generated_at}
        </p>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
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
        />
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {rows && rows.length === 0
            ? (
              <EmptyState
                heading="No Workers in this account"
                description="Deploy a Worker to see it appear here."
              />
            )
            : (
              <FindingsTable
                columns={COLUMNS}
                rows={rows}
                loadingLabel="Loading Workers inventory…"
              />
            )}
        </div>
        <RecentChangesPanel changes={data ? data.recent_changes : null} />
      </div>
    </div>
  );
}
