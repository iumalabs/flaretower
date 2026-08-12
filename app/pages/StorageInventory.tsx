import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus } from "../components/ExposureStatusBadge.tsx";
import {
  FindingsTable,
  type FindingsTableColumn,
  type FindingsTableRow,
} from "../components/FindingsTable.tsx";
import { AlertBanner } from "../components/AlertBanner.tsx";

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

function nameColumn<Row extends { reason: string }>(
  label: string,
  getName: (r: Row) => string,
  getMeta: (r: Row) => string,
): FindingsTableColumn<Row>[] {
  return [
    {
      key: "name",
      label,
      sortValue: getName,
      render: (r) => (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-code-size)",
            color: "var(--fg-secondary)",
          }}
        >
          {getName(r)}
          <span style={{ color: "var(--fg-faint)" }}>· {getMeta(r)}</span>
        </span>
      ),
    },
    {
      key: "reason",
      label: "Reason",
      width: "40%",
      render: (r) => (
        <span style={{ fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
          {r.reason}
        </span>
      ),
    },
  ];
}

const BUCKET_COLUMNS = nameColumn<BucketFinding>("Bucket", (r) => r.bucket_name, () => "bucket");
const KV_COLUMNS = nameColumn<KvFinding>("Namespace", (r) => r.title, (r) => r.namespace_id);
const D1_COLUMNS = nameColumn<D1Finding>("Database", (r) => r.name, (r) => r.database_uuid);

function SectionHeading({ children }: { children: string }): JSX.Element {
  return (
    <h2
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-section-size)",
        fontWeight: "var(--text-section-weight)" as unknown as number,
        margin: "24px 0 12px",
      }}
    >
      {children}
    </h2>
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

  const bucketRows: FindingsTableRow<BucketFinding>[] | null = data
    ? data.buckets.map((b) => ({ id: b.bucket_name, status: b.status, data: b }))
    : null;
  const kvRows: FindingsTableRow<KvFinding>[] | null = data
    ? data.kv_namespaces.map((k) => ({ id: k.namespace_id, status: k.status, data: k }))
    : null;
  const d1Rows: FindingsTableRow<D1Finding>[] | null = data
    ? data.d1_databases.map((d) => ({ id: d.database_uuid, status: d.status, data: d }))
    : null;

  // The single most urgent finding across all three sections (FR-013) —
  // a publicly exposed bucket is the highest-severity class this module
  // detects, checked first.
  const criticalBucket = bucketRows?.find((r) => r.status === "critical");
  const criticalKv = kvRows?.find((r) => r.status === "critical");
  const criticalD1 = d1Rows?.find((r) => r.status === "critical");
  const criticalFinding = criticalBucket
    ? {
      title: "An R2 bucket is publicly exposed",
      target: criticalBucket.data.bucket_name,
      reason: criticalBucket.data.reason,
    }
    : criticalKv
    ? {
      title: "A KV namespace needs attention",
      target: criticalKv.data.title,
      reason: criticalKv.data.reason,
    }
    : criticalD1
    ? {
      title: "A D1 database needs attention",
      target: criticalD1.data.name,
      reason: criticalD1.data.reason,
    }
    : null;

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
      {data && (
        <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
          Last evaluated {data.evaluated_at} · run {data.run_id}
        </p>
      )}

      {criticalFinding && (
        <AlertBanner
          scope="module"
          finding={{
            severity: "critical",
            title: criticalFinding.title,
            target: criticalFinding.target,
            description: criticalFinding.reason,
          }}
        />
      )}

      <SectionHeading>R2 buckets</SectionHeading>
      <FindingsTable
        columns={BUCKET_COLUMNS}
        rows={bucketRows}
        loadingLabel="Loading R2 buckets…"
        emptyState={{ heading: "No R2 buckets", description: "This account has no R2 buckets." }}
      />

      <SectionHeading>KV namespaces</SectionHeading>
      <FindingsTable
        columns={KV_COLUMNS}
        rows={kvRows}
        loadingLabel="Loading KV namespaces…"
        emptyState={{
          heading: "No KV namespaces",
          description: "This account has no KV namespaces.",
        }}
      />

      <SectionHeading>D1 databases</SectionHeading>
      <FindingsTable
        columns={D1_COLUMNS}
        rows={d1Rows}
        loadingLabel="Loading D1 databases…"
        emptyState={{
          heading: "No D1 databases",
          description: "This account has no D1 databases.",
        }}
      />
    </div>
  );
}
