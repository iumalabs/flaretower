import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus } from "../components/ExposureStatusBadge.tsx";
import {
  FindingsTable,
  type FindingsTableColumn,
  type FindingsTableRow,
} from "../components/FindingsTable.tsx";
import { AlertBanner } from "../components/AlertBanner.tsx";

interface HostnameFinding {
  hostname: string;
  kind: string;
  status: ExposureStatus;
  reason: string;
}

interface WorkerFinding {
  worker_name: string;
  hostnames: HostnameFinding[];
}

interface InventoryResponse {
  run_id: string | null;
  evaluated_at: string | null;
  workers: WorkerFinding[];
}

interface FlatFinding {
  worker_name: string;
  hostname: string;
  kind: string;
  reason: string;
}

async function fetchInventory(): Promise<InventoryResponse> {
  const res = await fetch("/api/exposure/inventory");
  if (!res.ok) {
    throw new Error(`GET /api/exposure/inventory failed: ${res.status}`);
  }
  return await res.json();
}

const COLUMNS: FindingsTableColumn<FlatFinding>[] = [
  {
    key: "worker",
    label: "Worker",
    width: "22%",
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
    key: "hostname",
    label: "Hostname",
    sortValue: (r) => r.hostname,
    render: (r) => (
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
    ),
  },
  {
    key: "reason",
    label: "Reason",
    width: "38%",
    render: (r) => (
      <span style={{ fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
        {r.reason}
      </span>
    ),
  },
];

export function ExposureInventory(): JSX.Element {
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInventory()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load inventory")
      );
  }, []);

  if (error) {
    return <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>;
  }

  const rows: FindingsTableRow<FlatFinding>[] | null = data
    ? data.workers.flatMap((w) =>
      w.hostnames.map((h) => ({
        id: `${w.worker_name}:${h.kind}:${h.hostname}`,
        status: h.status,
        data: { worker_name: w.worker_name, hostname: h.hostname, kind: h.kind, reason: h.reason },
      }))
    )
    : null;

  // The single most urgent finding, surfaced above the table (FR-013,
  // US2/AC3) — the design system's account/module-scope alert banner.
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
        Exposure inventory
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
            title: "A Worker is publicly reachable with no Access policy",
            target: criticalRow.data.hostname,
            description: criticalRow.data.reason,
          }}
        />
      )}

      <FindingsTable
        columns={COLUMNS}
        rows={rows}
        loadingLabel="Loading exposure inventory…"
        emptyState={{
          heading: "No Workers in this account",
          description: "No evaluation runs yet. Trigger one via POST /api/exposure/evaluate.",
        }}
      />
    </div>
  );
}
