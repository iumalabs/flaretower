import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus, ExposureStatusBadge } from "../components/ExposureStatusBadge.tsx";

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

async function fetchPagesInventory(): Promise<PagesInventoryResponse> {
  const res = await fetch("/api/pages/inventory");
  if (!res.ok) {
    throw new Error(`GET /api/pages/inventory failed: ${res.status}`);
  }
  return await res.json();
}

function Row(
  { badge, label, meta, reason }: {
    badge: ExposureStatus;
    label: string;
    meta: string;
    reason: string;
  },
): JSX.Element {
  const critical = badge === "critical";
  return (
    <tr
      style={{
        borderTop: "1px solid var(--rule-hairline)",
        borderLeft: critical ? "3px solid var(--status-critical)" : "3px solid transparent",
        background: critical ? "var(--status-critical-row)" : "transparent",
      }}
    >
      <td style={{ padding: "8px 0 8px 8px", width: 120 }}>
        <ExposureStatusBadge status={badge} />
      </td>
      <td
        style={{
          padding: "8px 0",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {label}
        <span style={{ color: "var(--fg-faint)" }}>· {meta}</span>
      </td>
      <td style={{ padding: "8px 0", fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
        {reason}
      </td>
    </tr>
  );
}

function ProjectSection({ project }: { project: ProjectFinding }): JSX.Element {
  return (
    <section
      style={{
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: 16,
        marginBottom: 12,
        background: "var(--surface-1)",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-title-size)",
          fontWeight: "var(--text-title-weight)" as unknown as number,
          margin: "0 0 12px",
        }}
      >
        {project.project_name}
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <Row
            badge={project.subdomain.status}
            label={project.subdomain.subdomain}
            meta="pages.dev exposure"
            reason={project.subdomain.reason}
          />
          {project.deployment && (
            <Row
              badge={project.deployment.status}
              label={project.deployment.deployment_id ?? "no production deployment"}
              meta="production deployment"
              reason={project.deployment.reason}
            />
          )}
          {project.domains.map((d) => (
            <Row
              key={d.domain_name}
              badge={d.status}
              label={d.domain_name}
              meta="custom domain"
              reason={d.reason}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

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

  if (!data) {
    return <p style={{ color: "var(--fg-muted)" }}>Loading Pages inventory…</p>;
  }

  if (data.projects.length === 0) {
    return (
      <p style={{ color: "var(--fg-muted)" }}>
        No evaluation runs yet. Trigger one via <code>POST /api/pages/evaluate</code>.
      </p>
    );
  }

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
      <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
        Last evaluated {data.evaluated_at} · run {data.run_id}
      </p>

      {data.projects.map((project) => (
        <ProjectSection key={project.project_name} project={project} />
      ))}
    </div>
  );
}
