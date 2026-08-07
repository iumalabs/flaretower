import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus, ExposureStatusBadge } from "../components/ExposureStatusBadge.tsx";

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

async function fetchDnsInventory(): Promise<DnsInventoryResponse> {
  const res = await fetch("/api/dns/inventory");
  if (!res.ok) {
    throw new Error(`GET /api/dns/inventory failed: ${res.status}`);
  }
  return await res.json();
}

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

  if (!data) {
    return <p style={{ color: "var(--fg-muted)" }}>Loading DNS inventory…</p>;
  }

  if (data.zones.length === 0) {
    return (
      <p style={{ color: "var(--fg-muted)" }}>
        No evaluation runs yet. Trigger one via <code>POST /api/dns/evaluate</code>.
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
        DNS inventory
      </h1>
      <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
        Last evaluated {data.evaluated_at} · run {data.run_id}
      </p>

      {data.zones.map((zone) => (
        <section
          key={zone.zone_name}
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
            {zone.zone_name}
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {zone.records.map((r) => {
                const critical = r.status === "critical";
                return (
                  <tr
                    key={`${r.type}:${r.record_name}:${r.content}`}
                    style={{
                      borderTop: "1px solid var(--rule-hairline)",
                      borderLeft: critical
                        ? "3px solid var(--status-critical)"
                        : "3px solid transparent",
                      background: critical ? "var(--status-critical-row)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "8px 0 8px 8px", width: 120 }}>
                      <ExposureStatusBadge status={r.status} />
                    </td>
                    <td
                      style={{
                        padding: "8px 0",
                        fontFamily: "var(--font-mono)",
                        fontSize: "var(--text-code-size)",
                        color: "var(--fg-secondary)",
                      }}
                    >
                      {r.record_name}
                      <span style={{ color: "var(--fg-faint)" }}>
                        · {r.type} → {r.content}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "8px 0",
                        fontSize: "var(--text-body-size)",
                        color: "var(--fg-muted)",
                      }}
                    >
                      {r.reason}
                    </td>
                  </tr>
                );
              })}
              {zone.records.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: "8px 0", color: "var(--fg-faint)" }}>
                    No records.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
