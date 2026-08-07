import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus, ExposureStatusBadge } from "../components/ExposureStatusBadge.tsx";

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

async function fetchInventory(): Promise<InventoryResponse> {
  const res = await fetch("/api/exposure/inventory");
  if (!res.ok) {
    throw new Error(`GET /api/exposure/inventory failed: ${res.status}`);
  }
  return await res.json();
}

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

  if (!data) {
    return <p style={{ color: "var(--fg-muted)" }}>Loading exposure inventory…</p>;
  }

  if (data.workers.length === 0) {
    return (
      <p style={{ color: "var(--fg-muted)" }}>
        No evaluation runs yet. Trigger one via <code>POST /api/exposure/evaluate</code>.
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
        Exposure inventory
      </h1>
      <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
        Last evaluated {data.evaluated_at} · run {data.run_id}
      </p>

      {data.workers.map((worker) => (
        <section
          key={worker.worker_name}
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
            {worker.worker_name}
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {worker.hostnames.map((h) => (
                <tr
                  key={`${h.kind}:${h.hostname}`}
                  style={{ borderTop: "1px solid var(--rule-hairline)" }}
                >
                  <td style={{ padding: "8px 0", width: 120 }}>
                    <ExposureStatusBadge status={h.status} />
                  </td>
                  <td
                    style={{
                      padding: "8px 0",
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-code-size)",
                      color: "var(--fg-secondary)",
                    }}
                  >
                    {h.hostname}
                    <span style={{ color: "var(--fg-faint)" }}>· {h.kind}</span>
                  </td>
                  <td
                    style={{
                      padding: "8px 0",
                      fontSize: "var(--text-body-size)",
                      color: "var(--fg-muted)",
                    }}
                  >
                    {h.reason}
                  </td>
                </tr>
              ))}
              {worker.hostnames.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: "8px 0", color: "var(--fg-faint)" }}>
                    No public hostnames.
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
