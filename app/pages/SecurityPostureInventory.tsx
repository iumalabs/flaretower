import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus, ExposureStatusBadge } from "../components/ExposureStatusBadge.tsx";

interface CheckFinding {
  status: ExposureStatus;
  reason: string;
}

interface ZoneFinding {
  zone_id: string;
  zone_name: string;
  ssl_tls: CheckFinding;
  dnssec?: CheckFinding;
  waf?: CheckFinding;
  rate_limiting?: CheckFinding;
}

interface TurnstileWidget {
  sitekey: string;
  name: string;
  domains: string[];
}

interface SecurityInventoryResponse {
  run_id: string | null;
  evaluated_at: string | null;
  zones: ZoneFinding[];
  turnstile_widgets: TurnstileWidget[];
}

async function fetchSecurityInventory(): Promise<SecurityInventoryResponse> {
  const res = await fetch("/api/security/inventory");
  if (!res.ok) {
    throw new Error(`GET /api/security/inventory failed: ${res.status}`);
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

function ZoneSection({ zone }: { zone: ZoneFinding }): JSX.Element {
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
        {zone.zone_name}
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <Row
            badge={zone.ssl_tls.status}
            label="SSL/TLS mode"
            meta="ssl_tls"
            reason={zone.ssl_tls.reason}
          />
          {zone.dnssec && (
            <Row
              badge={zone.dnssec.status}
              label="DNSSEC"
              meta="dnssec"
              reason={zone.dnssec.reason}
            />
          )}
          {zone.waf && (
            <Row badge={zone.waf.status} label="WAF" meta="waf" reason={zone.waf.reason} />
          )}
          {zone.rate_limiting && (
            <Row
              badge={zone.rate_limiting.status}
              label="Rate limiting"
              meta="rate_limiting"
              reason={zone.rate_limiting.reason}
            />
          )}
        </tbody>
      </table>
    </section>
  );
}

export function SecurityPostureInventory(): JSX.Element {
  const [data, setData] = useState<SecurityInventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSecurityInventory()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load security posture inventory")
      );
  }, []);

  if (error) {
    return <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>;
  }

  if (!data) {
    return <p style={{ color: "var(--fg-muted)" }}>Loading security posture inventory…</p>;
  }

  if (data.zones.length === 0 && data.turnstile_widgets.length === 0) {
    return (
      <p style={{ color: "var(--fg-muted)" }}>
        No evaluation runs yet. Trigger one via <code>POST /api/security/evaluate</code>.
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
        Security posture inventory
      </h1>
      <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
        Last evaluated {data.evaluated_at} · run {data.run_id}
      </p>

      {data.zones.map((zone) => <ZoneSection key={zone.zone_id} zone={zone} />)}

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
          Turnstile widgets
        </h2>
        {data.turnstile_widgets.length === 0
          ? <p style={{ color: "var(--fg-muted)" }}>No Turnstile widgets configured.</p>
          : (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {data.turnstile_widgets.map((w) => (
                <li
                  key={w.sitekey}
                  style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-code-size)" }}
                >
                  {w.name}{" "}
                  <span style={{ color: "var(--fg-faint)" }}>· {w.domains.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}
