import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus } from "../components/ExposureStatusBadge.tsx";
import {
  FindingsTable,
  type FindingsTableColumn,
  type FindingsTablePagination,
  type FindingsTableRow,
} from "../components/FindingsTable.tsx";
import { AlertBanner } from "../components/AlertBanner.tsx";

interface ProjectRow {
  project_name: string;
  production_domain: string | null;
  production_branch: string | null;
  last_build_status: ExposureStatus;
  last_build_reason: string;
  last_build_created_at: string | null;
  health_status: ExposureStatus;
  health_reason: string;
  deployment: { deployment_id: string | null } | null;
}

interface PaginationEnvelope {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

interface PagesInventoryResponse {
  run_id: string | null;
  evaluated_at: string | null;
  critical_finding: { project_name: string; reason: string } | null;
  projects: ProjectRow[];
  projects_pagination: PaginationEnvelope;
}

interface FlatFinding {
  project_name: string;
  production_domain: string | null;
  production_branch: string | null;
  last_build_status: ExposureStatus;
  last_build_deployment_id: string | null;
  last_build_created_at: string | null;
  health_reason: string;
}

interface PageParams {
  page: number;
  sortKey: string | null;
  sortDir: 1 | -1;
}

async function fetchPagesInventory(params: PageParams): Promise<PagesInventoryResponse> {
  const query = new URLSearchParams({ page: String(params.page) });
  if (params.sortKey) {
    query.set("sort_key", params.sortKey);
    query.set("sort_dir", params.sortDir === 1 ? "asc" : "desc");
  }
  const res = await fetch(`/api/pages/inventory?${query}`);
  if (!res.ok) {
    throw new Error(`GET /api/pages/inventory failed: ${res.status}`);
  }
  return await res.json();
}

// Deliberately coarse (spec.md Assumptions — build duration/stage timing is
// out of scope); this only answers "how long ago", not "how long did it
// take".
function formatRelativeTime(iso: string | null): string {
  if (!iso) return "not available";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "not available";
  // Clamped at 0 — a timestamp slightly ahead of the client clock (clock
  // skew, or a fast render right after a build completes) must read as
  // "just now," never as a negative duration.
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

// A project with no production deployment yet (deployment_id null) is a
// distinct state from a build that ran and failed (spec.md Edge Cases) —
// both would otherwise read as last_build_status "warning".
function lastBuildText(r: FlatFinding): string {
  if (r.last_build_deployment_id === null) return "no production deployment yet";
  if (r.last_build_status === "safe") return "success";
  if (r.last_build_status === "not_evaluated") return "not evaluated";
  return "failed";
}

const COLUMNS: FindingsTableColumn<FlatFinding>[] = [
  {
    key: "project",
    label: "Project",
    width: "18%",
    sortValue: (r) => r.project_name,
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {r.project_name}
      </span>
    ),
  },
  {
    key: "domain",
    label: "Production domain",
    width: "20%",
    sortValue: (r) => r.production_domain ?? "",
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: r.production_domain ? "var(--fg-secondary)" : "var(--fg-faint)",
        }}
      >
        {r.production_domain ?? "none"}
      </span>
    ),
  },
  {
    key: "branch",
    label: "Branch",
    width: "14%",
    sortValue: (r) => r.production_branch ?? "",
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: r.production_branch ? "var(--fg-secondary)" : "var(--fg-faint)",
        }}
      >
        {r.production_branch && r.production_branch.length > 0 ? r.production_branch : "not set"}
      </span>
    ),
  },
  {
    key: "last_build",
    label: "Last build",
    width: "20%",
    render: (r) => (
      <span style={{ fontSize: "var(--text-body-size)", color: "var(--fg-secondary)" }}>
        {lastBuildText(r)}
        {r.last_build_deployment_id !== null && (
          <span style={{ color: "var(--fg-faint)" }}>
            &nbsp;· {formatRelativeTime(r.last_build_created_at)}
          </span>
        )}
      </span>
    ),
  },
  {
    key: "reason",
    label: "Reason",
    render: (r) => (
      <span style={{ fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
        {r.health_reason}
      </span>
    ),
  },
];

export function PagesInventory(): JSX.Element {
  const [data, setData] = useState<PagesInventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  useEffect(() => {
    fetchPagesInventory({ page, sortKey, sortDir })
      .then((res) => {
        // Same FR-008 out-of-range recovery as every other paginated module.
        if (
          res.projects.length === 0 && res.projects_pagination.total > 0 &&
          page > res.projects_pagination.total_pages
        ) {
          setPage(res.projects_pagination.total_pages);
          return;
        }
        setData(res);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load Pages inventory")
      );
  }, [page, sortKey, sortDir]);

  if (error) {
    return <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>;
  }

  function handleSortChange(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
    setPage(1);
  }

  const rows: FindingsTableRow<FlatFinding>[] | null = data
    ? data.projects.map((p) => ({
      id: p.project_name,
      status: p.health_status,
      data: {
        project_name: p.project_name,
        production_domain: p.production_domain,
        production_branch: p.production_branch,
        last_build_status: p.last_build_status,
        last_build_deployment_id: p.deployment?.deployment_id ?? null,
        last_build_created_at: p.last_build_created_at,
        health_reason: p.health_reason,
      },
    }))
    : null;

  // Computed server-side across the whole list, not just whichever page is
  // loaded (worker/modules/pages/routes.ts) — pagination can't hide the
  // critical project simply because it's on a different page.
  const criticalFinding = data?.critical_finding ?? null;

  const pagination: FindingsTablePagination | undefined = data
    ? {
      page: data.projects_pagination.page,
      pageSize: data.projects_pagination.page_size,
      total: data.projects_pagination.total,
      onPageChange: setPage,
      sortKey,
      sortDir,
      onSortChange: handleSortChange,
    }
    : undefined;

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
        Pages projects
      </h1>
      {data && (
        <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
          {data.projects_pagination.total} project{data.projects_pagination.total === 1 ? "" : "s"}
          {" "}
          · run {data.run_id}
        </p>
      )}

      {criticalFinding && (
        <AlertBanner
          scope="module"
          finding={{
            severity: "critical",
            title: "A Pages project is publicly reachable with no Access policy",
            target: criticalFinding.project_name,
            description: criticalFinding.reason,
          }}
        />
      )}

      <FindingsTable
        columns={COLUMNS}
        rows={rows}
        loadingLabel="Loading Pages inventory…"
        emptyState={{
          heading: "No Pages projects in this account",
          description: "No evaluation runs yet. Trigger one via POST /api/pages/evaluate.",
        }}
        pagination={pagination}
      />
    </div>
  );
}
