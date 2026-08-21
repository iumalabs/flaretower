import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus, ExposureStatusBadge } from "../components/ExposureStatusBadge.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { RoutePolicy, type RoutePolicyData } from "../components/RoutePolicy.tsx";
import { SECTION_HEADING_STYLE } from "../lib/section-heading-style.ts";

interface RouteEntry {
  hostname: string;
  kind: string;
  status: ExposureStatus;
  reason: string;
  policy: RoutePolicyData | null;
}

interface RecentChange {
  occurred_at: string;
  actor: string;
  actor_source: string;
  action: string;
  target: string;
  result_summary: string | null;
}

interface WorkerDetailResponse {
  worker_name: string;
  environment: "production" | "preview";
  routes: RouteEntry[];
  recent_changes: RecentChange[];
  cloudflare_url: string;
  unavailable: Array<{ source: "policy" | "recent_changes"; error: string }>;
}

interface WorkerDetailPageProps {
  workerName: string;
  onBack: () => void;
}

interface RowAction {
  label: string;
  kind: "primary" | "warning" | "ghost";
}

// issue #431 — visual-only controls derived from this Worker's own real
// route data, following the exact precedent already established in
// ExposureMatrixTable.tsx's deriveActions (specs/025, research.md §6): not
// a fixed action bar reproduced verbatim from the design mockup's example
// Worker, since a real Worker's actual routes decide which actions are
// even relevant (e.g. "Disable workers.dev" on a Worker with no
// workers.dev route would be dishonest). Re-scan is the one action always
// offered regardless of findings — a generic per-worker refresh, not a
// remediation. None of these perform a real mutation; the only real action
// on this page stays "Open in Cloudflare".
function deriveActions(routes: RouteEntry[]): RowAction[] {
  const actions: RowAction[] = [];
  if (routes.some((r) => r.kind === "workers_dev" && r.status === "critical")) {
    actions.push({ label: "Disable workers.dev", kind: "primary" });
  }
  if (routes.some((r) => r.kind === "custom_domain" && r.status === "critical")) {
    actions.push({ label: "Attach Access application", kind: "primary" });
  }
  if (routes.some((r) => r.status === "warning")) {
    actions.push({ label: "Review policy", kind: "warning" });
  }
  actions.push({ label: "Re-scan Worker", kind: "ghost" });
  return actions;
}

async function fetchWorkerDetail(workerName: string): Promise<WorkerDetailResponse | "not_found"> {
  const res = await fetch(`/api/workers/${encodeURIComponent(workerName)}/detail`);
  if (res.status === 404) return "not_found";
  if (!res.ok) {
    throw new Error(`GET /api/workers/${workerName}/detail failed: ${res.status}`);
  }
  return await res.json();
}

export function WorkerDetailPage({ workerName, onBack }: WorkerDetailPageProps): JSX.Element {
  const [data, setData] = useState<WorkerDetailResponse | "not_found" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    fetchWorkerDetail(workerName)
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load Worker detail")
      );
  }, [workerName]);

  // issue #431 — a real breadcrumb ("Workers / {name}"), matching the
  // design source's Worker-detail section, instead of a plain back-link.
  const breadcrumb = (
    <nav
      aria-label="Breadcrumb"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-meta-size)",
      }}
    >
      <button
        type="button"
        onClick={onBack}
        style={{
          color: "var(--fg-faint)",
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        Workers
      </button>
      <span style={{ color: "var(--fg-faint)" }}>/</span>
      <span style={{ color: "var(--fg-muted)" }}>{workerName}</span>
    </nav>
  );

  if (error) {
    return (
      <div>
        {breadcrumb}
        <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>
      </div>
    );
  }

  if (data === "not_found") {
    return (
      <div>
        {breadcrumb}
        <EmptyState
          heading="Worker not found"
          description={`"${workerName}" was not found in the latest evaluation run. It may have been removed or renamed.`}
        />
      </div>
    );
  }

  return (
    <div>
      {breadcrumb}
      <h1
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-display-size)",
          fontWeight: "var(--text-display-weight)" as unknown as number,
          letterSpacing: "var(--text-display-ls)",
          margin: "8px 0 4px",
        }}
      >
        {workerName}
      </h1>
      {data && (
        <>
          <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
            {data.environment} ·{" "}
            <a href={data.cloudflare_url} target="_blank" rel="noreferrer">
              Open in Cloudflare
            </a>
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {deriveActions(data.routes).map((a) => (
              <div
                key={a.label}
                data-testid={`worker-action-${a.label}`}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-meta-size)",
                  letterSpacing: "0.05em",
                  border: `1px solid ${
                    a.kind === "primary"
                      ? "var(--status-critical-border)"
                      : a.kind === "warning"
                      ? "var(--status-warning-border)"
                      : "var(--border)"
                  }`,
                  color: a.kind === "primary"
                    ? "var(--status-critical-fg)"
                    : a.kind === "warning"
                    ? "var(--status-warning)"
                    : "var(--fg-muted)",
                  padding: "6px 10px",
                  textTransform: "uppercase",
                }}
              >
                {a.label}
              </div>
            ))}
          </div>
        </>
      )}

      <div
        style={{
          ...SECTION_HEADING_STYLE,
          margin: "20px 0 10px",
        }}
      >
        Routes
      </div>

      {data === null && <p style={{ color: "var(--fg-faint)" }}>Loading Worker detail…</p>}

      {data && data.routes.length === 0 && (
        <EmptyState
          heading="Exposure does not apply"
          description="This Worker has no public HTTP routes — no custom domain, workers.dev, or Preview URL."
        />
      )}

      {data && data.unavailable.some((u) => u.source === "policy") && (
        <p style={{ color: "var(--status-critical-fg)", fontSize: "var(--text-code-size)" }}>
          Access policy detail unavailable: {data.unavailable.find((u) =>
            u.source === "policy"
          )?.error}
        </p>
      )}

      {data && data.routes.length > 0 && (
        <div style={{ border: "1px solid var(--border)", background: "var(--bg-canvas)" }}>
          {data.routes.map((r) => (
            <div
              key={`${r.kind}:${r.hostname}`}
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--rule-hairline)",
                background: r.status === "critical" ? "var(--status-critical-row)" : "transparent",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <ExposureStatusBadge status={r.status} />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-code-size)",
                    color: "var(--fg-secondary)",
                    minWidth: 0,
                  }}
                >
                  {r.hostname}
                  <span style={{ color: "var(--fg-faint)" }}>· {r.kind}</span>
                </span>
                <span style={{ fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
                  {r.reason}
                </span>
              </div>
              <RoutePolicy policy={r.policy} status={r.status} />
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          <div
            style={{
              ...SECTION_HEADING_STYLE,
              margin: "20px 0 10px",
            }}
          >
            Recent changes
          </div>
          {data.unavailable.some((u) => u.source === "recent_changes")
            ? (
              <p
                data-testid="recent-changes-unavailable"
                style={{ color: "var(--status-critical-fg)", fontSize: "var(--text-code-size)" }}
              >
                Recent changes unavailable:{" "}
                {data.unavailable.find((u) => u.source === "recent_changes")?.error}
              </p>
            )
            : data.recent_changes.length === 0
            ? (
              <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-code-size)" }}>
                No recent changes for this Worker.
              </p>
            )
            : (
              <div style={{ border: "1px solid var(--border)", background: "var(--bg-canvas)" }}>
                {data.recent_changes.map((c, i) => (
                  <div
                    key={`${c.occurred_at}-${i}`}
                    data-testid={`recent-change-${i}`}
                    style={{ padding: "10px 12px", borderBottom: "1px solid var(--rule-hairline)" }}
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
                      {c.actor} · {c.actor_source} · {c.occurred_at}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </>
      )}
    </div>
  );
}
