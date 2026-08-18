import { useState } from "react";
import type { JSX, KeyboardEvent } from "react";
import { type ExposureStatus, ExposureStatusBadge } from "./ExposureStatusBadge.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { LoadingSkeleton } from "./LoadingSkeleton.tsx";
import { RoutePolicy, type RoutePolicyData } from "./RoutePolicy.tsx";

export interface HostnameFinding {
  hostname: string;
  kind: string;
  status: ExposureStatus;
  reason: string;
}

// data-model.md — one cell per entry-point type (custom domain / workers.dev /
// preview URL). `present: false` is the "no hostname of this kind" state
// (FR-002); `hostnames` always carries every hostname of that kind, even
// when the cell's own badge only shows the worst one (research.md §7).
export interface EntryPointCell {
  status: ExposureStatus;
  present: boolean;
  hostnames: HostnameFinding[];
}

export interface WorkerMatrixRow {
  workerName: string;
  customDomain: EntryPointCell;
  workersDev: EntryPointCell;
  previewUrl: EntryPointCell;
  coverage: { label: string; pct: number; status: ExposureStatus };
  overallStatus: ExposureStatus;
}

interface WorkerRouteEntry {
  hostname: string;
  kind: string;
  status: ExposureStatus;
  reason: string;
  policy: RoutePolicyData | null;
}

interface WorkerDetailResponse {
  worker_name: string;
  routes: WorkerRouteEntry[];
  cloudflare_url: string;
  unavailable: Array<{ source: "policy" | "recent_changes"; error: string }>;
}

interface RowAction {
  label: string;
  kind: "primary" | "warning" | "ghost";
  href?: string;
}

// research.md §6 — visual-only controls derived from the row's own status
// data (not reproduced verbatim from the design mockup's fictional example
// Workers, whose per-row action sets don't map 1:1 onto this app's real,
// variable data). The one real, non-visual-only action ("View in
// Cloudflare") is appended separately once the lazy detail fetch resolves.
function deriveActions(row: WorkerMatrixRow): RowAction[] {
  const actions: RowAction[] = [];
  if (row.workersDev.status === "critical") {
    actions.push({ label: "Disable workers.dev", kind: "primary" });
  }
  if (row.previewUrl.status === "critical") {
    actions.push({ label: "Disable preview URL", kind: "primary" });
  }
  if (row.customDomain.status === "critical") {
    actions.push({ label: "Attach Access application", kind: "primary" });
  }
  const anyWarning = [row.customDomain, row.workersDev, row.previewUrl].some((c) =>
    c.present && c.status === "warning"
  );
  if (anyWarning) {
    actions.push({ label: "Review policy", kind: "warning" });
  }
  if (actions.length === 0) {
    actions.push({ label: "View routes", kind: "ghost" });
  }
  return actions;
}

async function fetchWorkerDetail(workerName: string): Promise<WorkerDetailResponse> {
  const res = await fetch(`/api/workers/${encodeURIComponent(workerName)}/detail`);
  if (!res.ok) {
    throw new Error(`GET /api/workers/${workerName}/detail failed: ${res.status}`);
  }
  return await res.json();
}

const COL_WIDTHS = {
  worker: "17%",
  customDomain: "18%",
  workersDev: "14%",
  previewUrl: "14%",
  coverage: "19%",
  status: "18%",
};

function EntryPointBadge({ cell, label }: { cell: EntryPointCell; label: string }): JSX.Element {
  if (!cell.present) {
    return (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-faint)",
        }}
      >
        not present
      </span>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <ExposureStatusBadge status={cell.status} />
      {cell.hostnames.length > 1 && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-meta-size)",
            color: "var(--fg-faint)",
          }}
        >
          {cell.hostnames.length} {label}
        </span>
      )}
    </div>
  );
}

function activateOnKey(onActivate: () => void) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  };
}

interface ExposureMatrixTableProps {
  rows: WorkerMatrixRow[] | null;
  hasUnfilteredRows: boolean;
}

export function ExposureMatrixTable(
  { rows, hasUnfilteredRows }: ExposureMatrixTableProps,
): JSX.Element {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Map<string, WorkerDetailResponse>>(new Map());
  const [detailErrors, setDetailErrors] = useState<Map<string, string>>(new Map());
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  if (rows === null) {
    return <LoadingSkeleton label="Loading exposure matrix…" />;
  }

  if (rows.length === 0) {
    return hasUnfilteredRows
      ? (
        <EmptyState
          heading="No matches"
          description="No Workers match the current search."
        />
      )
      : (
        <EmptyState
          heading="No Workers in this account"
          description="No evaluation runs yet. Trigger a re-scan above."
        />
      );
  }

  function toggle(workerName: string) {
    const open = expanded === workerName;
    setExpanded(open ? null : workerName);
    if (!open && !details.has(workerName) && loadingDetail !== workerName) {
      setLoadingDetail(workerName);
      fetchWorkerDetail(workerName)
        .then((detail) => {
          setDetails((prev) => new Map(prev).set(workerName, detail));
        })
        .catch((err: unknown) => {
          setDetailErrors((prev) =>
            new Map(prev).set(
              workerName,
              err instanceof Error ? err.message : "failed to load Worker detail",
            )
          );
        })
        .finally(() => setLoadingDetail((cur) => (cur === workerName ? null : cur)));
    }
  }

  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--bg-canvas)" }}>
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
          {(
            [
              ["worker", "Worker"],
              ["customDomain", "Custom domain"],
              ["workersDev", "workers.dev"],
              ["previewUrl", "Preview URL"],
              ["coverage", "Access coverage"],
              ["status", "Status"],
            ] as const
          ).map(([key, label]) => (
            <div
              key={key}
              style={{ width: COL_WIDTHS[key], flex: "none", padding: "10px 8px" }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-label-size)",
                  letterSpacing: "var(--text-label-ls)",
                  color: key === "status" ? "var(--brand-primary)" : "var(--fg-faint)",
                  textTransform: "uppercase",
                }}
              >
                {label}
              </span>
            </div>
          ))}
          <div style={{ width: 24, flex: "none" }} />
        </div>

        <div>
          {rows.map((row) => {
            const open = expanded === row.workerName;
            const critical = row.overallStatus === "critical";
            const detail = details.get(row.workerName);
            const detailError = detailErrors.get(row.workerName);
            const actions = deriveActions(row);
            return (
              <div
                key={row.workerName}
                id={`worker-row-${row.workerName}`}
                data-testid={`matrix-row-${row.workerName}`}
                style={{
                  borderBottom: "1px solid var(--rule-hairline)",
                  background: critical ? "var(--status-critical-row)" : "transparent",
                }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={open}
                  onClick={() => toggle(row.workerName)}
                  onKeyDown={activateOnKey(() => toggle(row.workerName))}
                  style={{ display: "flex", alignItems: "center", cursor: "pointer" }}
                >
                  <div style={{ width: COL_WIDTHS.worker, flex: "none", padding: "10px 8px" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "var(--text-code-size)",
                        color: "var(--fg-secondary)",
                      }}
                    >
                      {row.workerName}
                    </span>
                  </div>
                  <div
                    style={{ width: COL_WIDTHS.customDomain, flex: "none", padding: "10px 8px" }}
                  >
                    <EntryPointBadge cell={row.customDomain} label="custom domains" />
                  </div>
                  <div style={{ width: COL_WIDTHS.workersDev, flex: "none", padding: "10px 8px" }}>
                    <EntryPointBadge cell={row.workersDev} label="workers.dev" />
                  </div>
                  <div style={{ width: COL_WIDTHS.previewUrl, flex: "none", padding: "10px 8px" }}>
                    <EntryPointBadge cell={row.previewUrl} label="preview URLs" />
                  </div>
                  <div style={{ width: COL_WIDTHS.coverage, flex: "none", padding: "10px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        style={{
                          width: 46,
                          height: 5,
                          flex: "none",
                          background: "var(--surface-3)",
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${row.coverage.pct}%`,
                            background: "var(--brand-primary)",
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "var(--text-meta-size)",
                          color: "var(--fg-muted)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.coverage.label}
                      </span>
                    </div>
                  </div>
                  <div style={{ width: COL_WIDTHS.status, flex: "none", padding: "10px 8px" }}>
                    <ExposureStatusBadge status={row.overallStatus} />
                  </div>
                  <div style={{ width: 24, flex: "none", textAlign: "center" }}>
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
                  </div>
                </div>

                {open && (
                  <div
                    style={{
                      background: "var(--bg-base)",
                      borderTop: "1px solid var(--rule-hairline)",
                      padding: "16px 24px 18px 21px",
                      display: "flex",
                      gap: 28,
                    }}
                  >
                    <div style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "var(--text-label-size)",
                          letterSpacing: "var(--text-label-ls)",
                          color: "var(--fg-faint)",
                          textTransform: "uppercase",
                        }}
                      >
                        Routes & effective policy
                      </div>
                      {loadingDetail === row.workerName && (
                        <LoadingSkeleton rows={2} label="Loading routes…" />
                      )}
                      {detailError && (
                        <p
                          style={{
                            color: "var(--status-critical-fg)",
                            fontSize: "var(--text-code-size)",
                          }}
                        >
                          {detailError}
                        </p>
                      )}
                      {detail && detail.routes.length === 0 && (
                        <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-code-size)" }}>
                          This Worker has no public HTTP routes.
                        </p>
                      )}
                      {detail && detail.routes.map((r) => (
                        <div
                          key={`${r.kind}:${r.hostname}`}
                          style={{
                            paddingBottom: 8,
                            borderBottom: "1px solid var(--rule-hairline)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <ExposureStatusBadge status={r.status} />
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "var(--text-code-size)",
                                color: "var(--fg-secondary)",
                              }}
                            >
                              {r.hostname}
                              <span style={{ color: "var(--fg-faint)" }}>· {r.kind}</span>
                            </span>
                          </div>
                          <RoutePolicy policy={r.policy} status={r.status} />
                        </div>
                      ))}
                    </div>
                    <div
                      style={{
                        width: 190,
                        flex: "none",
                        display: "flex",
                        flexDirection: "column",
                        gap: 7,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "var(--text-label-size)",
                          letterSpacing: "var(--text-label-ls)",
                          color: "var(--fg-faint)",
                          textTransform: "uppercase",
                        }}
                      >
                        Actions
                      </div>
                      {actions.map((a) => (
                        <div
                          key={a.label}
                          data-testid={`action-${row.workerName}-${a.label}`}
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
                            textAlign: "center",
                            textTransform: "uppercase",
                          }}
                        >
                          {a.label}
                        </div>
                      ))}
                      {detail && (
                        <a
                          data-testid={`action-${row.workerName}-view-in-cloudflare`}
                          href={detail.cloudflare_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "var(--text-meta-size)",
                            letterSpacing: "0.05em",
                            border: "1px solid var(--border)",
                            color: "var(--fg-muted)",
                            padding: "6px 10px",
                            textAlign: "center",
                            textTransform: "uppercase",
                            textDecoration: "none",
                          }}
                        >
                          View in Cloudflare
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
