import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus, ExposureStatusBadge } from "../components/ExposureStatusBadge.tsx";

interface AppFinding {
  app_id: string;
  app_domain: string;
  status: ExposureStatus;
  reason: string;
}

interface TokenFinding {
  token_id: string;
  token_name: string;
  expires_at: string | null;
  status: ExposureStatus;
  reason: string;
}

interface ZeroTrustInventoryResponse {
  run_id: string | null;
  evaluated_at: string | null;
  applications: AppFinding[];
  service_tokens: TokenFinding[];
}

async function fetchZeroTrustInventory(): Promise<ZeroTrustInventoryResponse> {
  const res = await fetch("/api/zero-trust/inventory");
  if (!res.ok) {
    throw new Error(`GET /api/zero-trust/inventory failed: ${res.status}`);
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

export function ZeroTrustInventory(): JSX.Element {
  const [data, setData] = useState<ZeroTrustInventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchZeroTrustInventory()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load Zero Trust inventory")
      );
  }, []);

  if (error) {
    return <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>;
  }

  if (!data) {
    return <p style={{ color: "var(--fg-muted)" }}>Loading Zero Trust inventory…</p>;
  }

  if (data.applications.length === 0 && data.service_tokens.length === 0) {
    return (
      <p style={{ color: "var(--fg-muted)" }}>
        No evaluation runs yet. Trigger one via <code>POST /api/zero-trust/evaluate</code>.
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
        Zero Trust inventory
      </h1>
      <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
        Last evaluated {data.evaluated_at} · run {data.run_id}
      </p>

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
          Access applications
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {data.applications.map((a) => (
              <Row
                key={a.app_id}
                badge={a.status}
                label={a.app_domain}
                meta={a.app_id}
                reason={a.reason}
              />
            ))}
          </tbody>
        </table>
      </section>

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
          Service tokens
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {data.service_tokens.map((t) => (
              <Row
                key={t.token_id}
                badge={t.status}
                label={t.token_name}
                meta={t.expires_at ?? "no expiration set"}
                reason={t.reason}
              />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
