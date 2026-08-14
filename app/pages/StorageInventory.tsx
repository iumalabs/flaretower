import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus } from "../components/ExposureStatusBadge.tsx";
import {
  FindingsTable,
  type FindingsTableColumn,
  type FindingsTablePagination,
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

interface PaginationEnvelope {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

interface StorageInventoryResponse {
  run_id: string | null;
  evaluated_at: string | null;
  total_resources: number;
  total_exposed: number;
  critical_finding: { title: string; target: string; reason: string } | null;
  buckets: BucketFinding[];
  buckets_pagination: PaginationEnvelope;
  kv_namespaces: KvFinding[];
  kv_namespaces_pagination: PaginationEnvelope;
  d1_databases: D1Finding[];
  d1_databases_pagination: PaginationEnvelope;
}

// One independent page/sort state per collection — `prefix` matches the
// backend's bucket_*/kv_*/d1_* query param naming (worker/modules/storage/routes.ts).
interface CollectionPageState {
  page: number;
  sortKey: string | null;
  sortDir: 1 | -1;
}

function appendCollectionParams(
  query: URLSearchParams,
  prefix: string,
  state: CollectionPageState,
): void {
  query.set(`${prefix}_page`, String(state.page));
  if (state.sortKey) {
    query.set(`${prefix}_sort_key`, state.sortKey);
    query.set(`${prefix}_sort_dir`, state.sortDir === 1 ? "asc" : "desc");
  }
}

async function fetchStorageInventory(
  bucket: CollectionPageState,
  kv: CollectionPageState,
  d1: CollectionPageState,
): Promise<StorageInventoryResponse> {
  const query = new URLSearchParams();
  appendCollectionParams(query, "bucket", bucket);
  appendCollectionParams(query, "kv", kv);
  appendCollectionParams(query, "d1", d1);
  const res = await fetch(`/api/storage/inventory?${query}`);
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

const INITIAL_COLLECTION_STATE: CollectionPageState = { page: 1, sortKey: null, sortDir: 1 };

export function StorageInventory(): JSX.Element {
  const [data, setData] = useState<StorageInventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bucketState, setBucketState] = useState<CollectionPageState>(INITIAL_COLLECTION_STATE);
  const [kvState, setKvState] = useState<CollectionPageState>(INITIAL_COLLECTION_STATE);
  const [d1State, setD1State] = useState<CollectionPageState>(INITIAL_COLLECTION_STATE);

  useEffect(() => {
    fetchStorageInventory(bucketState, kvState, d1State)
      .then((res) => {
        // Any one of the three collections' requested page can independently
        // fall out of range (its own result set shrank between loads) while
        // genuinely having records — recover that collection to its true
        // last page rather than showing it as empty (FR-008).
        let needsRecovery = false;
        if (
          res.buckets.length === 0 && res.buckets_pagination.total > 0 &&
          bucketState.page > res.buckets_pagination.total_pages
        ) {
          setBucketState((s) => ({ ...s, page: res.buckets_pagination.total_pages }));
          needsRecovery = true;
        }
        if (
          res.kv_namespaces.length === 0 && res.kv_namespaces_pagination.total > 0 &&
          kvState.page > res.kv_namespaces_pagination.total_pages
        ) {
          setKvState((s) => ({ ...s, page: res.kv_namespaces_pagination.total_pages }));
          needsRecovery = true;
        }
        if (
          res.d1_databases.length === 0 && res.d1_databases_pagination.total > 0 &&
          d1State.page > res.d1_databases_pagination.total_pages
        ) {
          setD1State((s) => ({ ...s, page: res.d1_databases_pagination.total_pages }));
          needsRecovery = true;
        }
        if (needsRecovery) return;
        setData(res);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load storage inventory")
      );
  }, [bucketState, kvState, d1State]);

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

  // FR-013's single most urgent finding across all three sections is now
  // computed server-side (worker/modules/storage/routes.ts), across each
  // collection's whole result set — not just whichever page happens to be
  // loaded — so pagination can't hide it.
  const criticalFinding = data?.critical_finding ?? null;

  function makeSortHandler(
    setState: (updater: (s: CollectionPageState) => CollectionPageState) => void,
  ) {
    return (key: string) => {
      setState((s) => ({
        page: 1,
        sortKey: key,
        sortDir: s.sortKey === key ? (s.sortDir === 1 ? -1 : 1) : 1,
      }));
    };
  }

  function makePagination(
    envelope: PaginationEnvelope | undefined,
    state: CollectionPageState,
    setState: (updater: (s: CollectionPageState) => CollectionPageState) => void,
  ): FindingsTablePagination | undefined {
    if (!envelope) return undefined;
    return {
      page: envelope.page,
      pageSize: envelope.page_size,
      total: envelope.total,
      onPageChange: (page) => setState((s) => ({ ...s, page })),
      sortKey: state.sortKey,
      sortDir: state.sortDir,
      onSortChange: makeSortHandler(setState),
    };
  }

  const bucketPagination = makePagination(data?.buckets_pagination, bucketState, setBucketState);
  const kvPagination = makePagination(data?.kv_namespaces_pagination, kvState, setKvState);
  const d1Pagination = makePagination(data?.d1_databases_pagination, d1State, setD1State);

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
          {data.total_resources} resource{data.total_resources === 1 ? "" : "s"} ·{" "}
          {data.total_exposed} publicly exposed · run {data.run_id}
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
        pagination={bucketPagination}
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
        pagination={kvPagination}
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
        pagination={d1Pagination}
      />
    </div>
  );
}
