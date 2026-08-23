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
import { RescanButton } from "../components/RescanButton.tsx";
import { useRescan } from "../lib/use-rescan.ts";
import { formatRelativeTime } from "../lib/format-relative-time.ts";

// issue #457 — the production custom domain's own Access-policy coverage,
// a separate signal from health_status (which is the *.pages.dev
// subdomain's exposure). Never "critical" — see worker/modules/pages/
// types.ts's DomainAccessEvaluation doc comment for why. Null when the
// project has no active production domain to evaluate at all (distinct
// from "not_evaluated", which means a domain exists but its coverage
// couldn't be determined or genuinely has none).
interface ProductionDomainAccess {
  status: "safe" | "warning" | "not_evaluated";
  reason: string;
  covering_app_id: string | null;
  // issue #466 — the same app's resolved name, never a raw UUID; display
  // prefers this, falling back to covering_app_id only for rows persisted
  // before this field existed.
  covering_app_name: string | null;
}

interface ProjectRow {
  project_name: string;
  production_domain: string | null;
  production_domain_access: ProductionDomainAccess | null;
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
  production_domain_access: ProductionDomainAccess | null;
  production_branch: string | null;
  last_build_status: ExposureStatus;
  last_build_deployment_id: string | null;
  last_build_created_at: string | null;
  health_status: ExposureStatus;
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

// A project with no production deployment yet (deployment_id null) is a
// distinct state from a build that ran and failed (spec.md Edge Cases) —
// both would otherwise read as last_build_status "warning".
function lastBuildText(r: FlatFinding): string {
  if (r.last_build_deployment_id === null) return "no production deployment yet";
  if (r.last_build_status === "safe") return "success";
  if (r.last_build_status === "not_evaluated") return "not evaluated";
  return "failed";
}

// issue #435 — the design's short vocabulary for preview-URL exposure
// (OPEN/ACCESS), reusing this page's own already-computed health_status
// (worker/modules/pages/evaluate.ts's evaluateSubdomainExposure — Access
// coverage of the project's *.pages.dev subdomain, which by Cloudflare's
// own wildcard-domain matching also covers every preview deployment
// under it). Not a second taxonomy alongside the existing Health column —
// this *is* the Health column's own real data, just labeled the way the
// design source's dedicated Preview column names it, exactly the same
// treatment already applied to DNS's Finding column (issue #433).
// specs/015-pages-dashboard's FR-003 (don't invent a distinct severity
// tier) stays satisfied: no new signal, no new taxonomy, only a short
// label for a status that already exists.
function previewExposureLabel(status: ExposureStatus): string {
  switch (status) {
    case "critical":
    case "warning":
      return "OPEN";
    case "safe":
      return "ACCESS";
    case "not_evaluated":
      return "N/A";
  }
}

// issue #457 — the design's separate Access column: whether the
// PRODUCTION custom domain (not the *.pages.dev subdomain Preview covers)
// has its own covering Access application. A genuinely new signal
// (worker/modules/pages/evaluate.ts's evaluateDomainAccess), not a
// relabel — safe shows the covering app's name, warning means an app
// covers it but doesn't meaningfully restrict access (reusing the exact
// isPolicyEffectivelyOpen logic Preview's own check already uses).
// not_evaluated splits into two honest sub-labels by its own real reason
// text: a genuine "nothing covers this domain" fact (NO POLICY) versus an
// actual evaluation failure (N/A) — never a fabricated "public by design"
// claim, since no owner-confirmation signal exists anywhere here.
function accessLabel(access: ProductionDomainAccess | null): string {
  if (!access) return "—";
  if (access.status === "safe") return access.covering_app_name ?? access.covering_app_id ?? "—";
  if (access.status === "warning") return "WEAK POLICY";
  if (access.reason === "no Access application covers this domain") return "NO POLICY";
  return "N/A";
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
    key: "access",
    label: "Access",
    width: "13%",
    sortValue: (r) => accessLabel(r.production_domain_access),
    render: (r) => {
      const access = r.production_domain_access;
      const color = !access || access.status === "not_evaluated"
        ? "var(--fg-faint)"
        : access.status === "warning"
        ? "var(--status-warning)"
        : "var(--status-safe)";
      return (
        <span
          title={access?.reason}
          style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-code-size)", color }}
        >
          {accessLabel(access)}
        </span>
      );
    },
  },
  {
    key: "branch",
    label: "Branch",
    width: "12%",
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

  function refetch() {
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
  }

  useEffect(() => {
    refetch();
  }, [page, sortKey, sortDir]);

  const rescan = useRescan("/api/pages/evaluate", refetch);

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
        production_domain_access: p.production_domain_access,
        production_branch: p.production_branch,
        last_build_status: p.last_build_status,
        last_build_deployment_id: p.deployment?.deployment_id ?? null,
        last_build_created_at: p.last_build_created_at,
        health_status: p.health_status,
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
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
        <RescanButton pending={rescan.pending} error={rescan.error} onClick={rescan.trigger} />
      </div>
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
        statusLabel="Preview"
        statusBadgeLabel={(r) => previewExposureLabel(r.health_status)}
      />
    </div>
  );
}
