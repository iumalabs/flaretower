import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus } from "../components/ExposureStatusBadge.tsx";
import {
  FindingsTable,
  type FindingsTableColumn,
  type FindingsTableRow,
} from "../components/FindingsTable.tsx";
import { AlertBanner } from "../components/AlertBanner.tsx";
import { EmptyState } from "../components/EmptyState.tsx";

interface DnsRecordFinding {
  record_name: string;
  type: string;
  content: string;
  proxy_capable: boolean;
  proxied: boolean | null;
  ttl: number | null;
  is_platform_target: boolean;
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
  proxy_capable: boolean;
  proxied: boolean | null;
  ttl: number | null;
  is_platform_target: boolean;
  reason: string;
}

async function fetchDnsInventory(): Promise<DnsInventoryResponse> {
  const res = await fetch("/api/dns/inventory");
  if (!res.ok) {
    throw new Error(`GET /api/dns/inventory failed: ${res.status}`);
  }
  return await res.json();
}

// Distinct from the Finding status pill FindingsTable already renders
// (leftmost, on `row.status`) — this is DNS-specific (specs/013-dns-dashboard
// User Story 2), so kept local rather than a shared component.
function ProxyStatusPill(
  { proxyCapable, proxied }: { proxyCapable: boolean; proxied: boolean | null },
): JSX.Element {
  const label = !proxyCapable ? "N/A" : proxied ? "PROXIED" : "DNS ONLY";
  const color = !proxyCapable
    ? "var(--status-neutral)"
    : proxied
    ? "var(--status-safe)"
    : "var(--status-warning)";
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-label-size)",
        letterSpacing: "var(--text-label-ls)",
        color,
      }}
    >
      {label}
    </span>
  );
}

const COLUMNS: FindingsTableColumn<FlatFinding>[] = [
  {
    key: "type",
    label: "Type",
    width: "8%",
    sortValue: (r) => r.type,
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-faint)",
        }}
      >
        {r.type}
      </span>
    ),
  },
  {
    key: "name",
    label: "Name",
    width: "26%",
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
      </span>
    ),
  },
  {
    key: "content",
    label: "Content",
    width: "26%",
    render: (r) => (
      <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-code-size)",
            color: "var(--fg-secondary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {r.content}
        </span>
        {r.is_platform_target && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-label-size)",
              color: "var(--status-neutral)",
              border: "1px solid var(--status-neutral-border)",
              padding: "1px 5px",
              whiteSpace: "nowrap",
            }}
          >
            PUBLIC
          </span>
        )}
      </span>
    ),
  },
  {
    key: "proxy",
    label: "Proxy",
    width: "12%",
    render: (r) => <ProxyStatusPill proxyCapable={r.proxy_capable} proxied={r.proxied} />,
  },
  {
    key: "ttl",
    label: "TTL",
    width: "8%",
    sortValue: (r) => r.ttl ?? -1,
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-faint)",
        }}
      >
        {r.ttl === null ? "—" : r.ttl === 1 ? "auto" : r.ttl}
      </span>
    ),
  },
  {
    key: "reason",
    label: "Finding",
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
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  useEffect(() => {
    fetchDnsInventory()
      .then((res) => {
        setData(res);
        // Default to the first zone (spec.md's own convention) — only set
        // once, when nothing is selected yet, so a later re-fetch doesn't
        // silently reset an operator's manual zone selection.
        setSelectedZone((prev) => prev ?? res.zones[0]?.zone_name ?? null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load DNS inventory")
      );
  }, []);

  if (error) {
    return <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>;
  }

  const zone = data?.zones.find((z) => z.zone_name === selectedZone) ?? null;

  const rows: FindingsTableRow<FlatFinding>[] | null = zone
    ? zone.records.map((r) => ({
      id: `${zone.zone_name}:${r.type}:${r.record_name}:${r.content}`,
      status: r.status,
      data: {
        zone_name: zone.zone_name,
        record_name: r.record_name,
        type: r.type,
        content: r.content,
        proxy_capable: r.proxy_capable,
        proxied: r.proxied,
        ttl: r.ttl,
        is_platform_target: r.is_platform_target,
        reason: r.reason,
      },
    }))
    : (data ? [] : null); // data loaded but no zones at all -> [], not still-loading null

  const criticalRow = rows?.find((r) => r.status === "critical");
  const totalRecords = data?.zones.reduce((sum, z) => sum + z.records.length, 0) ?? 0;
  const totalDangling = data?.zones.reduce(
    (sum, z) => sum + z.records.filter((r) => r.status === "critical").length,
    0,
  ) ?? 0;

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
        DNS records
      </h1>
      {data && (
        <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
          {data.zones.length} zones · {totalRecords} records · {totalDangling} dangling target
          {totalDangling === 1 ? "" : "s"} · run {data.run_id}
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

      {data && data.zones.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 12,
            borderBottom: "1px solid var(--border)",
          }}
        >
          {data.zones.map((z) => {
            const active = z.zone_name === selectedZone;
            return (
              <button
                key={z.zone_name}
                type="button"
                onClick={() => setSelectedZone(z.zone_name)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "10px 14px",
                  background: "transparent",
                  border: "none",
                  borderBottom: `2px solid ${active ? "var(--brand-primary)" : "transparent"}`,
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-code-size)",
                    color: active ? "var(--fg-primary)" : "var(--fg-muted)",
                  }}
                >
                  {z.zone_name}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-label-size)",
                    color: "var(--fg-faint)",
                  }}
                >
                  {z.records.length}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {zone && zone.records.length === 0
        ? (
          <EmptyState
            heading={`No DNS records in ${zone.zone_name}`}
            description="This zone has no records to show."
          />
        )
        : (
          <FindingsTable
            columns={COLUMNS}
            rows={rows}
            loadingLabel="Loading DNS inventory…"
            emptyState={{
              heading: "No DNS zones in this account",
              description: "No evaluation runs yet. Trigger one via POST /api/dns/evaluate.",
            }}
          />
        )}
    </div>
  );
}
