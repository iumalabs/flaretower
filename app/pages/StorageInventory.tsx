import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus, ExposureStatusBadge } from "../components/ExposureStatusBadge.tsx";

interface BucketFinding {
  bucket_name: string;
  status: ExposureStatus;
  reason: string;
}

interface KvFinding {
  namespace_id: string;
  title: string;
  status: ExposureStatus;
  reason: string;
}

interface D1Finding {
  database_uuid: string;
  name: string;
  status: ExposureStatus;
  reason: string;
}

interface StorageInventoryResponse {
  run_id: string | null;
  evaluated_at: string | null;
  buckets: BucketFinding[];
  kv_namespaces: KvFinding[];
  d1_databases: D1Finding[];
}

async function fetchStorageInventory(): Promise<StorageInventoryResponse> {
  const res = await fetch("/api/storage/inventory");
  if (!res.ok) {
    throw new Error(`GET /api/storage/inventory failed: ${res.status}`);
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

function Section({ title, children }: { title: string; children: JSX.Element[] }): JSX.Element {
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
        {title}
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>{children}</tbody>
      </table>
    </section>
  );
}

export function StorageInventory(): JSX.Element {
  const [data, setData] = useState<StorageInventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStorageInventory()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load storage inventory")
      );
  }, []);

  if (error) {
    return <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>;
  }

  if (!data) {
    return <p style={{ color: "var(--fg-muted)" }}>Loading storage inventory…</p>;
  }

  if (
    data.buckets.length === 0 && data.kv_namespaces.length === 0 && data.d1_databases.length === 0
  ) {
    return (
      <p style={{ color: "var(--fg-muted)" }}>
        No evaluation runs yet. Trigger one via <code>POST /api/storage/evaluate</code>.
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
        Storage inventory
      </h1>
      <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
        Last evaluated {data.evaluated_at} · run {data.run_id}
      </p>

      <Section title="R2 buckets">
        {data.buckets.map((b) => (
          <Row
            key={b.bucket_name}
            badge={b.status}
            label={b.bucket_name}
            meta="bucket"
            reason={b.reason}
          />
        ))}
      </Section>

      <Section title="KV namespaces">
        {data.kv_namespaces.map((k) => (
          <Row
            key={k.namespace_id}
            badge={k.status}
            label={k.title}
            meta={k.namespace_id}
            reason={k.reason}
          />
        ))}
      </Section>

      <Section title="D1 databases">
        {data.d1_databases.map((d) => (
          <Row
            key={d.database_uuid}
            badge={d.status}
            label={d.name}
            meta={d.database_uuid}
            reason={d.reason}
          />
        ))}
      </Section>
    </div>
  );
}
