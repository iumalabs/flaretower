import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus, ExposureStatusBadge } from "../components/ExposureStatusBadge.tsx";

interface UnifiedAlert {
  id: string;
  module: string;
  kind: string;
  entity_label: string;
  previous_status: ExposureStatus | null;
  new_status: ExposureStatus;
  detected_at: string;
  acknowledged_at: string | null;
}

interface AlertsResponse {
  alerts: UnifiedAlert[];
}

async function fetchAlerts(): Promise<AlertsResponse> {
  const res = await fetch("/api/audit/alerts");
  if (!res.ok) {
    throw new Error(`GET /api/audit/alerts failed: ${res.status}`);
  }
  return await res.json();
}

function AlertRow({ alert }: { alert: UnifiedAlert }): JSX.Element {
  const critical = alert.new_status === "critical";
  return (
    <tr
      style={{
        borderTop: "1px solid var(--rule-hairline)",
        borderLeft: critical ? "3px solid var(--status-critical)" : "3px solid transparent",
        background: critical ? "var(--status-critical-row)" : "transparent",
      }}
    >
      <td style={{ padding: "8px 0 8px 8px", width: 120 }}>
        <ExposureStatusBadge status={alert.new_status} />
      </td>
      <td
        style={{
          padding: "8px 0",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {alert.entity_label}
        <span style={{ color: "var(--fg-faint)" }}>· {alert.module}/{alert.kind}</span>
      </td>
      <td style={{ padding: "8px 0", fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
        {alert.previous_status ?? "(new)"} → {alert.new_status} · {alert.detected_at}
      </td>
    </tr>
  );
}

export function AuditInventory(): JSX.Element {
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAlerts()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load audit alerts")
      );
  }, []);

  if (error) {
    return <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>;
  }

  if (!data) {
    return <p style={{ color: "var(--fg-muted)" }}>Loading audit inbox…</p>;
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
        Audit & Drift
      </h1>

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
          Unified alerts inbox
        </h2>
        {data.alerts.length === 0
          ? <p style={{ color: "var(--fg-muted)" }}>No outstanding alerts across any module.</p>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {data.alerts.map((a) => <AlertRow key={a.id} alert={a} />)}
              </tbody>
            </table>
          )}
      </section>
    </div>
  );
}
