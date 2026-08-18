import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus, ExposureStatusBadge } from "../components/ExposureStatusBadge.tsx";
import {
  ExposureMatrixTable,
  type HostnameFinding,
  type WorkerMatrixRow,
} from "../components/ExposureMatrixTable.tsx";
import { AlertBanner } from "../components/AlertBanner.tsx";
import { RescanButton } from "../components/RescanButton.tsx";
import { useRescan } from "../lib/use-rescan.ts";

interface WorkerFinding {
  worker_name: string;
  hostnames: HostnameFinding[];
}

interface InventoryResponse {
  run_id: string | null;
  evaluated_at: string | null;
  workers: WorkerFinding[];
}

async function fetchInventory(): Promise<InventoryResponse> {
  const res = await fetch("/api/exposure/inventory");
  if (!res.ok) {
    throw new Error(`GET /api/exposure/inventory failed: ${res.status}`);
  }
  return await res.json();
}

// research.md §7 — the "worst" status among a Worker's hostnames of one
// entry-point kind (or across all of them, for the row's overall status):
// critical outranks warning outranks not_evaluated (unknown, still worth
// flagging) outranks safe. Empty list = not_evaluated ("not applicable").
const SEVERITY_RANK: Record<ExposureStatus, number> = {
  critical: 0,
  warning: 1,
  not_evaluated: 2,
  safe: 3,
};

function worstStatus(hostnames: HostnameFinding[]): ExposureStatus {
  if (hostnames.length === 0) return "not_evaluated";
  return hostnames.reduce(
    (worst, h) => SEVERITY_RANK[h.status] < SEVERITY_RANK[worst] ? h.status : worst,
    "safe" as ExposureStatus,
  );
}

// data-model.md — pivots the existing GET /inventory response (already
// grouped by Worker, each hostname already carrying `kind`) into one row per
// Worker with a cell per entry-point type, no additional request
// (research.md §1).
function buildMatrixRows(data: InventoryResponse): WorkerMatrixRow[] {
  return data.workers.map((w) => {
    const byKind = (kind: string) => w.hostnames.filter((h) => h.kind === kind);
    const customDomainHosts = byKind("custom_domain");
    const workersDevHosts = byKind("workers_dev");
    const previewUrlHosts = byKind("preview_url");

    const total = w.hostnames.length;
    const covered = w.hostnames.filter((h) => h.status === "safe").length;
    const coverageStatus = worstStatus(w.hostnames);

    return {
      workerName: w.worker_name,
      customDomain: {
        status: worstStatus(customDomainHosts),
        present: customDomainHosts.length > 0,
        hostnames: customDomainHosts,
      },
      workersDev: {
        status: worstStatus(workersDevHosts),
        present: workersDevHosts.length > 0,
        hostnames: workersDevHosts,
      },
      previewUrl: {
        status: worstStatus(previewUrlHosts),
        present: previewUrlHosts.length > 0,
        hostnames: previewUrlHosts,
      },
      coverage: total === 0 ? { label: "no http routes", pct: 0, status: "not_evaluated" } : {
        label: `${covered} / ${total} routes`,
        pct: Math.round((covered / total) * 100),
        status: coverageStatus,
      },
      overallStatus: coverageStatus,
    };
  });
}

const SEVERITY_ORDER: ExposureStatus[] = ["critical", "warning", "safe", "not_evaluated"];

function matchesQuery(row: WorkerMatrixRow, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (row.workerName.toLowerCase().includes(q)) return true;
  const allHostnames = [
    ...row.customDomain.hostnames,
    ...row.workersDev.hostnames,
    ...row.previewUrl.hostnames,
  ];
  return allHostnames.some((h) => h.hostname.toLowerCase().includes(q));
}

export function ExposureInventory(): JSX.Element {
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  function refetch() {
    fetchInventory()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load inventory")
      );
  }

  useEffect(() => {
    refetch();
  }, []);

  const rescan = useRescan("/api/exposure/evaluate", refetch);

  if (error) {
    return <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>;
  }

  const allRows = useMemo(() => (data ? buildMatrixRows(data) : null), [data]);
  const visibleRows = useMemo(
    () => allRows ? allRows.filter((r) => matchesQuery(r, query)) : null,
    [allRows, query],
  );

  const counts: Record<ExposureStatus, number> = {
    critical: 0,
    warning: 0,
    safe: 0,
    not_evaluated: 0,
  };
  for (const r of allRows ?? []) counts[r.overallStatus]++;

  function jumpTo(status: ExposureStatus) {
    const target = (allRows ?? []).find((r) => r.overallStatus === status);
    if (!target) return;
    document.getElementById(`worker-row-${target.workerName}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  // The single most urgent finding, surfaced above the table (FR-013 in
  // specs/001, unchanged by this feature) — the design system's
  // account/module-scope alert banner (spec.md: AlertBanner itself is
  // explicitly out of scope for this feature).
  const criticalWorker = (allRows ?? []).find((r) => r.overallStatus === "critical");
  const criticalHostname = criticalWorker
    ? [...criticalWorker.customDomain.hostnames, ...criticalWorker.workersDev.hostnames]
      .find((h) => h.status === "critical")
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
          Exposure matrix
        </h1>
        <RescanButton pending={rescan.pending} error={rescan.error} onClick={rescan.trigger} />
      </div>
      {data && (
        <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
          Last evaluated {data.evaluated_at} · run {data.run_id}
        </p>
      )}

      {criticalWorker && criticalHostname && (
        <AlertBanner
          scope="module"
          finding={{
            severity: "critical",
            title: "A Worker is publicly reachable with no Access policy",
            target: criticalHostname.hostname,
            description: criticalHostname.reason,
          }}
        />
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          margin: "12px 0",
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter workers…"
          aria-label="Filter Workers"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-code-size)",
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            color: "var(--fg-secondary)",
            padding: "6px 10px",
            minWidth: 180,
          }}
        />
        {SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => jumpTo(s)}
            data-testid={`jump-to-row-${s}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: "1px solid var(--border)",
              background: "transparent",
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
        ))}
      </div>

      <ExposureMatrixTable rows={visibleRows} hasUnfilteredRows={(allRows?.length ?? 0) > 0} />
    </div>
  );
}
