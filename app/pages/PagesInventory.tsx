import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus } from "../components/ExposureStatusBadge.tsx";
import {
  FindingsTable,
  type FindingsTableColumn,
  type FindingsTableRow,
} from "../components/FindingsTable.tsx";
import { AlertBanner } from "../components/AlertBanner.tsx";

interface SubdomainFinding {
  subdomain: string;
  status: ExposureStatus;
  reason: string;
}

interface DeploymentFinding {
  deployment_id: string | null;
  status: ExposureStatus;
  reason: string;
}

interface DomainFinding {
  domain_name: string;
  status: ExposureStatus;
  reason: string;
}

interface ProjectFinding {
  project_name: string;
  subdomain: SubdomainFinding;
  deployment: DeploymentFinding | null;
  domains: DomainFinding[];
}

interface PagesInventoryResponse {
  run_id: string | null;
  evaluated_at: string | null;
  projects: ProjectFinding[];
}

interface FlatFinding {
  project_name: string;
  check: string;
  label: string;
  reason: string;
}

async function fetchPagesInventory(): Promise<PagesInventoryResponse> {
  const res = await fetch("/api/pages/inventory");
  if (!res.ok) {
    throw new Error(`GET /api/pages/inventory failed: ${res.status}`);
  }
  return await res.json();
}

const COLUMNS: FindingsTableColumn<FlatFinding>[] = [
  {
    key: "project",
    label: "Project",
    width: "20%",
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
    key: "check",
    label: "Check",
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {r.label}
        <span style={{ color: "var(--fg-faint)" }}>· {r.check}</span>
      </span>
    ),
  },
  {
    key: "reason",
    label: "Reason",
    width: "34%",
    render: (r) => (
      <span style={{ fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
        {r.reason}
      </span>
    ),
  },
];

export function PagesInventory(): JSX.Element {
  const [data, setData] = useState<PagesInventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPagesInventory()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load Pages inventory")
      );
  }, []);

  if (error) {
    return <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>;
  }

  const rows: FindingsTableRow<FlatFinding>[] | null = data
    ? data.projects.flatMap((project) => {
      const out: FindingsTableRow<FlatFinding>[] = [
        {
          id: `${project.project_name}:subdomain`,
          status: project.subdomain.status,
          data: {
            project_name: project.project_name,
            check: "pages.dev exposure",
            label: project.subdomain.subdomain,
            reason: project.subdomain.reason,
          },
        },
      ];
      if (project.deployment) {
        out.push({
          id: `${project.project_name}:deployment`,
          status: project.deployment.status,
          data: {
            project_name: project.project_name,
            check: "production deployment",
            label: project.deployment.deployment_id ?? "no production deployment",
            reason: project.deployment.reason,
          },
        });
      }
      for (const d of project.domains) {
        out.push({
          id: `${project.project_name}:domain:${d.domain_name}`,
          status: d.status,
          data: {
            project_name: project.project_name,
            check: "custom domain",
            label: d.domain_name,
            reason: d.reason,
          },
        });
      }
      return out;
    })
    : null;

  const criticalRow = rows?.find((r) => r.status === "critical");

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
        Pages inventory
      </h1>
      {data && (
        <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
          Last evaluated {data.evaluated_at} · run {data.run_id}
        </p>
      )}

      {criticalRow && (
        <AlertBanner
          scope="module"
          finding={{
            severity: "critical",
            title: "A Pages project is publicly reachable with no Access policy",
            target: `${criticalRow.data.project_name} · ${criticalRow.data.label}`,
            description: criticalRow.data.reason,
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
      />
    </div>
  );
}
