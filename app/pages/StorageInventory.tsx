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
  custom_domain: string | null;
  bound_to: string;
}

interface KvFinding {
  namespace_id: string;
  title: string;
  status: ExposureStatus;
  reason: string;
  bound_to: string;
}

interface D1Finding {
  database_uuid: string;
  name: string;
  status: ExposureStatus;
  reason: string;
  bound_to: string;
  num_tables: number | null;
  file_size: number | null;
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

// specs/016-storage-dashboard research.md §1 — deliberately coarse (no
// fractional precision beyond one decimal), matching the mockup's own
// "840 MB"/"2.8 GB" style. null = the D1 detail fetch failed.
function formatBytes(bytes: number | null): string {
  if (bytes === null) return "not available";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function nameColumn<Row>(
  label: string,
  width: string,
  getName: (r: Row) => string,
  getMeta: (r: Row) => string,
): FindingsTableColumn<Row> {
  return {
    key: "name",
    label,
    width,
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
  };
}

// Shared across all 3 tables (the mockup's "one grammar" — research.md
// §2): which deployed Worker(s) reference this resource.
function boundToColumn<Row extends { bound_to: string }>(): FindingsTableColumn<Row> {
  return {
    key: "bound_to",
    label: "Bound to",
    width: "16%",
    sortValue: (r) => r.bound_to,
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: r.bound_to === "none" ? "var(--fg-faint)" : "var(--fg-secondary)",
        }}
      >
        {r.bound_to}
      </span>
    ),
  };
}

function reasonColumn<Row extends { reason: string }>(): FindingsTableColumn<Row> {
  return {
    key: "reason",
    label: "Reason",
    render: (r) => (
      <span style={{ fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
        {r.reason}
      </span>
    ),
  };
}

const BUCKET_COLUMNS: FindingsTableColumn<BucketFinding>[] = [
  nameColumn<BucketFinding>("Bucket", "22%", (r) => r.bucket_name, () => "bucket"),
  {
    key: "custom_domain",
    label: "Custom domain",
    width: "18%",
    sortValue: (r) => r.custom_domain ?? "",
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: r.custom_domain ? "var(--fg-secondary)" : "var(--fg-faint)",
        }}
      >
        {r.custom_domain ?? "none"}
      </span>
    ),
  },
  boundToColumn<BucketFinding>(),
  reasonColumn<BucketFinding>(),
];

const KV_COLUMNS: FindingsTableColumn<KvFinding>[] = [
  nameColumn<KvFinding>("Namespace", "26%", (r) => r.title, (r) => r.namespace_id),
  boundToColumn<KvFinding>(),
  reasonColumn<KvFinding>(),
];

const D1_COLUMNS: FindingsTableColumn<D1Finding>[] = [
  nameColumn<D1Finding>("Database", "22%", (r) => r.name, (r) => r.database_uuid),
  {
    key: "num_tables",
    label: "Tables",
    width: "10%",
    sortValue: (r) => r.num_tables ?? -1,
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: r.num_tables === null ? "var(--fg-faint)" : "var(--fg-secondary)",
        }}
      >
        {r.num_tables === null ? "not available" : r.num_tables}
      </span>
    ),
  },
  {
    key: "file_size",
    label: "Size",
    width: "12%",
    sortValue: (r) => r.file_size ?? -1,
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: r.file_size === null ? "var(--fg-faint)" : "var(--fg-secondary)",
        }}
      >
        {formatBytes(r.file_size)}
      </span>
    ),
  },
  boundToColumn<D1Finding>(),
  reasonColumn<D1Finding>(),
];

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

  // Real, computable numbers only (spec.md FR-006) — no total-size
  // figure, since this project has no honest source for aggregate
  // storage size across all 3 resource types (research.md §4).
  const resourceCount = data
    ? data.buckets.length + data.kv_namespaces.length + data.d1_databases.length
    : 0;
  const publiclyExposedCount = data
    ? [...bucketRows ?? [], ...kvRows ?? [], ...d1Rows ?? []].filter((r) => r.status === "critical")
      .length
    : 0;

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
        Storage
      </h1>
      {data && (
        <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
          {resourceCount} resource{resourceCount === 1 ? "" : "s"} · {publiclyExposedCount}{" "}
          publicly exposed · run {data.run_id}
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
