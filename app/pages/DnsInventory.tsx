import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus } from "../components/ExposureStatusBadge.tsx";
import {
  FindingsTable,
  type FindingsTableColumn,
  type FindingsTableRow,
} from "../components/FindingsTable.tsx";
import { AlertBanner } from "../components/AlertBanner.tsx";

interface DnsRecordFinding {
  record_name: string;
  type: string;
  content: string;
  proxy_capable: boolean;
  proxied: boolean | null;
  status: ExposureStatus;
  reason: string;
}

interface ZoneFinding {
  zone_name: string;
  records: DnsRecordFinding[];
}

interface DnsInventoryResponse {
  run_id: string | null;
  evaluated_at: string | null;
  zones: ZoneFinding[];
}

interface FlatFinding {
  zone_name: string;
  record_name: string;
  type: string;
  content: string;
  reason: string;
}

async function fetchDnsInventory(): Promise<DnsInventoryResponse> {
  const res = await fetch("/api/dns/inventory");
  if (!res.ok) {
    throw new Error(`GET /api/dns/inventory failed: ${res.status}`);
  }
  return await res.json();
}

const COLUMNS: FindingsTableColumn<FlatFinding>[] = [
  {
    key: "zone",
    label: "Zone",
    width: "18%",
    sortValue: (r) => r.zone_name,
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {r.zone_name}
      </span>
    ),
  },
  {
    key: "record",
    label: "Record",
    sortValue: (r) => r.record_name,
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {r.record_name}
        <span style={{ color: "var(--fg-faint)" }}>· {r.type} → {r.content}</span>
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

export function DnsInventory(): JSX.Element {
  const [data, setData] = useState<DnsInventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDnsInventory()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load DNS inventory")
      );
  }, []);

  if (error) {
    return <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>;
  }

  const rows: FindingsTableRow<FlatFinding>[] | null = data
    ? data.zones.flatMap((z) =>
      // A zone with zero records must still appear (specs/002-dns/tasks.md
      // T026) — flatMap would otherwise silently drop it from this flat
      // table, exactly the omission bug that fix closed on the backend.
      z.records.length === 0
        ? [{
          id: `${z.zone_name}:(empty)`,
          status: "safe" as ExposureStatus,
          data: {
            zone_name: z.zone_name,
            record_name: "(no records)",
            type: "",
            content: "",
            reason: "No DNS records in this zone.",
          },
        }]
        : z.records.map((r) => ({
          id: `${z.zone_name}:${r.type}:${r.record_name}:${r.content}`,
          status: r.status,
          data: {
            zone_name: z.zone_name,
            record_name: r.record_name,
            type: r.type,
            content: r.content,
            reason: r.reason,
          },
        }))
    )
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
        DNS inventory
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
            title: "A DNS record needs attention",
            target: criticalRow.data.record_name,
            description: criticalRow.data.reason,
          }}
        />
      )}

      <FindingsTable
        columns={COLUMNS}
        rows={rows}
        loadingLabel="Loading DNS inventory…"
        emptyState={{
          heading: "No DNS zones in this account",
          description: "No evaluation runs yet. Trigger one via POST /api/dns/evaluate.",
        }}
      />
    </div>
  );
}
