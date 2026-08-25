import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus, ExposureStatusBadge } from "../components/ExposureStatusBadge.tsx";
import {
  FindingsTable,
  type FindingsTableColumn,
  type FindingsTablePagination,
  type FindingsTableRow,
} from "../components/FindingsTable.tsx";
import { AlertBanner } from "../components/AlertBanner.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { RescanButton } from "../components/RescanButton.tsx";
import { useRescan } from "../lib/use-rescan.ts";

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

interface ZoneSummary {
  zone_name: string;
  record_count: number;
}

interface PaginationEnvelope {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

interface DnsInventoryResponse {
  run_id: string | null;
  evaluated_at: string | null;
  total_records: number;
  total_dangling: number;
  zone_summaries: ZoneSummary[];
  selected_zone: string | null;
  critical_finding: { record_name: string; reason: string } | null;
  // issue #504 — summed across the whole selected zone (worker/modules/
  // dns/routes.ts), not just the current page, so it stays accurate once a
  // zone paginates and FindingsTable's own page-local chip counts would be
  // wrong.
  status_counts: Record<ExposureStatus, number>;
  records: DnsRecordFinding[];
  records_pagination: PaginationEnvelope;
}

const STATUS_ORDER: ExposureStatus[] = ["critical", "warning", "safe", "not_evaluated"];

interface FlatFinding {
  zone_name: string;
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

interface DnsPageParams {
  zone: string | null;
  page: number;
  sortKey: string | null;
  sortDir: 1 | -1;
}

async function fetchDnsInventory(params: DnsPageParams): Promise<DnsInventoryResponse> {
  const query = new URLSearchParams({ page: String(params.page) });
  if (params.zone) query.set("zone", params.zone);
  if (params.sortKey) {
    query.set("sort_key", params.sortKey);
    query.set("sort_dir", params.sortDir === 1 ? "asc" : "desc");
  }
  const res = await fetch(`/api/dns/inventory?${query}`);
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
    width: "6%",
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
    width: "20%",
    sortValue: (r) => r.record_name,
    render: (r) => (
      <span
        title={r.record_name}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "block",
        }}
      >
        {r.record_name}
      </span>
    ),
  },
  {
    key: "content",
    label: "Content",
    width: "18%",
    render: (r) => (
      <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <span
          title={r.content}
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
    width: "10%",
    render: (r) => <ProxyStatusPill proxyCapable={r.proxy_capable} proxied={r.proxied} />,
  },
  {
    key: "ttl",
    label: "TTL",
    width: "6%",
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
    // issue #409: deliberately left without an explicit width, same as
    // before — FindingsTable gives an unwidthed column flex:1 of whatever
    // the other 5 (all explicit %) columns don't claim, so it grows/shrinks
    // to fill remaining space without ever forcing new horizontal overflow
    // (an explicit % here, on top of the other columns' %s, would sum past
    // 100% of the row plus the table's own fixed status/spacer columns,
    // forcing a scrollbar that isn't needed today). The actual fix is the
    // 5 columns above claiming less (was 80% combined, now 60%) so this
    // column's flex:1 remainder is roughly double what it was — no longer
    // too narrow for a full-sentence reason string like "DNS-only —
    // bypasses Cloudflare protection", which used to wrap to 5 stacked
    // lines and balloon that row's height far past its neighbors'.
    render: (r) => (
      <span
        title={r.reason}
        style={{ fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}
      >
        {findingLabel(r.status, r.reason)}
      </span>
    ),
  },
];

// issue #433 — the design's own fixed short vocabulary for this column
// (DANGLING/ORIGIN EXPOSED/PUBLIC/OK/POLICY p=none), derived from the
// worker's own status+reason (worker/modules/dns/evaluate.ts) rather than
// showing that full sentence directly. `status === "critical"` here is
// ALWAYS a dangling-target match (evaluate.ts has no other critical path),
// so it never needs the reason text. The two `reason`s below are the
// exact fixed literals evaluate.ts's warning/safe branches produce; an
// unrecognized reason (a future evaluate.ts branch, or evaluationError's
// free-text failure message) falls back to the full sentence rather than a
// fabricated label — the row's `title` attribute always carries it too.
const FINDING_LABEL: Record<string, string> = {
  "DNS-only — bypasses Cloudflare protection": "ORIGIN EXPOSED",
  "DMARC policy provides no enforcement (p=none)": "POLICY p=none",
  "proxied through Cloudflare": "OK",
  "not proxy-capable": "PUBLIC",
};

function findingLabel(status: ExposureStatus, reason: string): string {
  if (status === "critical") return "DANGLING";
  if (status === "not_evaluated") return "N/A";
  return FINDING_LABEL[reason] ?? reason;
}

export function DnsInventory(): JSX.Element {
  const [data, setData] = useState<DnsInventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  function refetch() {
    fetchDnsInventory({ zone: selectedZone, page, sortKey, sortDir })
      .then((res) => {
        // The requested page no longer exists (e.g. the zone shrank between
        // loads) but the zone genuinely has records — recover to the true
        // last page rather than showing an empty zone (FR-008).
        if (
          res.records.length === 0 && res.records_pagination.total > 0 &&
          page > res.records_pagination.total_pages
        ) {
          setPage(res.records_pagination.total_pages);
          return;
        }
        setData(res);
        // Default to the first zone the backend picked (spec.md's own
        // convention) — only set once, when nothing is selected yet, so a
        // later re-fetch doesn't silently reset an operator's manual zone
        // selection.
        setSelectedZone((prev) => prev ?? res.selected_zone);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load DNS inventory")
      );
  }

  useEffect(() => {
    refetch();
  }, [selectedZone, page, sortKey, sortDir]);

  const rescan = useRescan("/api/dns/evaluate", refetch);

  if (error) {
    return <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>;
  }

  function switchZone(zoneName: string) {
    setSelectedZone(zoneName);
    setPage(1);
  }

  function handleSortChange(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
    setPage(1);
  }

  const rows: FindingsTableRow<FlatFinding>[] | null = data
    ? data.records.map((r) => ({
      id: `${data.selected_zone}:${r.type}:${r.record_name}:${r.content}`,
      status: r.status,
      data: {
        zone_name: data.selected_zone ?? "",
        record_name: r.record_name,
        type: r.type,
        content: r.content,
        proxy_capable: r.proxy_capable,
        proxied: r.proxied,
        ttl: r.ttl,
        is_platform_target: r.is_platform_target,
        status: r.status,
        reason: r.reason,
      },
    }))
    : null;

  const pagination: FindingsTablePagination | undefined = data
    ? {
      page: data.records_pagination.page,
      pageSize: data.records_pagination.page_size,
      total: data.records_pagination.total,
      onPageChange: setPage,
      sortKey,
      sortDir,
      onSortChange: handleSortChange,
    }
    : undefined;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
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
        <RescanButton pending={rescan.pending} error={rescan.error} onClick={rescan.trigger} />
      </div>
      {data && (
        <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
          {data.zone_summaries.length} zones · {data.total_records} records · {data.total_dangling}
          {" "}
          dangling target
          {data.total_dangling === 1 ? "" : "s"} · run {data.run_id}
        </p>
      )}

      {data?.critical_finding && (
        <AlertBanner
          scope="module"
          finding={{
            severity: "critical",
            title: "A DNS record needs attention",
            target: data.critical_finding.record_name,
            description: data.critical_finding.reason,
          }}
        />
      )}

      {data && data.zone_summaries.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 12,
            borderBottom: "1px solid var(--border)",
          }}
        >
          {data.zone_summaries.map((z) => {
            const active = z.zone_name === selectedZone;
            return (
              <button
                key={z.zone_name}
                type="button"
                onClick={() => switchZone(z.zone_name)}
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
                  {z.record_count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {
        /* issue #504 — FindingsTable hides its own (interactive, page-local)
          status chips once the zone paginates, since their counts would
          only reflect the current page. This is a read-only stand-in for
          that same visual slot, sourced from the whole-zone status_counts
          the backend now computes — restores the at-a-glance counts without
          claiming to filter across pages, which isn't supported. */
      }
      {data && data.records_pagination.total_pages > 1 && (
        <div style={{ display: "flex", gap: 8, padding: "10px 0", flexWrap: "wrap" }}>
          {STATUS_ORDER.filter((s) =>
            data.status_counts[s] > 0
          ).map((s) => (
            <div
              key={s}
              data-testid={`zone-status-count-${s}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                border: "1px solid var(--border)",
                padding: "5px 9px",
              }}
            >
              <ExposureStatusBadge status={s} />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-label-size)",
                  color: "var(--fg-faint)",
                }}
              >
                {data.status_counts[s]}
              </span>
            </div>
          ))}
        </div>
      )}

      {data && data.selected_zone && data.records.length === 0
        ? (
          <EmptyState
            heading={`No DNS records in ${data.selected_zone}`}
            description="This zone has no records to show."
          />
        )
        : (
          <FindingsTable
            // Remounts on every zone switch so FindingsTable's own local
            // expanded-row state resets — without this, an expanded row's id
            // from one zone could coincidentally collide with another zone's
            // row id and stay open unexpectedly.
            key={selectedZone ?? undefined}
            columns={COLUMNS}
            rows={rows}
            loadingLabel="Loading DNS inventory…"
            emptyState={{
              heading: "No DNS zones in this account",
              description: "No evaluation runs yet. Trigger one via POST /api/dns/evaluate.",
            }}
            pagination={pagination}
          />
        )}
    </div>
  );
}
