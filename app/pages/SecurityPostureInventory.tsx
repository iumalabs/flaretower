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
import { TabStrip } from "../components/TabStrip.tsx";

interface CheckFinding {
  status: ExposureStatus;
  reason: string;
}

interface ZoneFinding {
  zone_id: string;
  zone_name: string;
  overall_status: ExposureStatus;
  ssl_tls: CheckFinding;
  dnssec?: CheckFinding;
  waf?: CheckFinding;
  rate_limiting?: CheckFinding;
  bot_fight_mode?: CheckFinding;
  always_use_https?: CheckFinding;
  min_tls_version?: CheckFinding;
}

interface TurnstileWidget {
  sitekey: string;
  name: string;
  domains: string[];
}

interface ZoneCertificate {
  zone_id: string;
  zone_name: string;
  hosts: string[];
  issuer: string;
  expires_on: string | null;
  status: ExposureStatus;
}

interface CustomWafRule {
  zone_id: string;
  zone_name: string;
  description: string;
  expression: string;
  action: string;
  enabled: boolean;
  status: ExposureStatus;
}

interface PaginationEnvelope {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

interface SecurityInventoryResponse {
  run_id: string | null;
  evaluated_at: string | null;
  critical_finding: { zone_name: string; description: string } | null;
  zones: ZoneFinding[];
  zones_pagination: PaginationEnvelope;
  // null = the zone list itself couldn't be fetched at all (live-fetched
  // on every request, not persisted — specs/017-security-dashboard
  // research.md §5/§6), distinct from a successfully fetched, confirmed-
  // empty array. Pagination envelope is null in lockstep with the array.
  certificates: ZoneCertificate[] | null;
  certificates_pagination: PaginationEnvelope | null;
  waf_custom_rules: CustomWafRule[] | null;
  waf_custom_rules_pagination: PaginationEnvelope | null;
  // null = the Turnstile widgets list itself could not be fetched (e.g. a
  // scoped-down token, or a transient API error) — distinct from a
  // successfully fetched, confirmed-empty array. See
  // worker/modules/security/inventory.ts's SecurityInventory doc comment.
  turnstile_widgets: TurnstileWidget[] | null;
}

interface CollectionPageState {
  page: number;
  sortKey: string | null;
  sortDir: 1 | -1;
}

const INITIAL_COLLECTION_STATE: CollectionPageState = { page: 1, sortKey: null, sortDir: 1 };

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

async function fetchSecurityInventory(
  zoneState: CollectionPageState,
  certState: CollectionPageState,
  wafRuleState: CollectionPageState,
): Promise<SecurityInventoryResponse> {
  const query = new URLSearchParams();
  appendCollectionParams(query, "zone", zoneState);
  appendCollectionParams(query, "certificate", certState);
  appendCollectionParams(query, "waf_rule", wafRuleState);
  const res = await fetch(`/api/security/inventory?${query}`);
  if (!res.ok) {
    throw new Error(`GET /api/security/inventory failed: ${res.status}`);
  }
  return await res.json();
}

// A per-check pill inside a zone row's cell — distinct from FindingsTable's
// own leftmost badge (which carries the row's overall_status).
function CheckCell({ check }: { check: CheckFinding | undefined }): JSX.Element {
  if (!check) {
    return <ExposureStatusBadge status="not_evaluated" />;
  }
  return <ExposureStatusBadge status={check.status} />;
}

const CHECK_COLUMNS: FindingsTableColumn<ZoneFinding>[] = [
  {
    key: "zone",
    label: "Zone",
    width: "15%",
    sortValue: (r) => r.zone_name,
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {r.zone_name}
      </span>
    ),
  },
  {
    key: "ssl_tls",
    label: "SSL/TLS",
    width: "10%",
    render: (r) => <CheckCell check={r.ssl_tls} />,
  },
  {
    key: "dnssec",
    label: "DNSSEC",
    width: "10%",
    render: (r) => <CheckCell check={r.dnssec} />,
  },
  {
    key: "waf",
    label: "WAF",
    width: "10%",
    render: (r) => <CheckCell check={r.waf} />,
  },
  {
    key: "rate_limiting",
    label: "Rate limiting",
    width: "11%",
    render: (r) => <CheckCell check={r.rate_limiting} />,
  },
  {
    key: "bot_fight_mode",
    label: "Bot fight mode",
    width: "12%",
    render: (r) => <CheckCell check={r.bot_fight_mode} />,
  },
  {
    key: "always_use_https",
    label: "Always HTTPS",
    width: "12%",
    render: (r) => <CheckCell check={r.always_use_https} />,
  },
  {
    key: "min_tls_version",
    label: "Min TLS",
    width: "10%",
    render: (r) => <CheckCell check={r.min_tls_version} />,
  },
];

// specs/017-security-dashboard research.md §5 — deliberately coarse (day
// precision only), matching this rollout's established convention for
// "how long" displays (e.g. Pages' build-recency).
function formatExpiry(expiresOn: string | null): string {
  if (expiresOn === null) return "not available";
  const days = Math.round((new Date(expiresOn).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return "expired";
  return `expires in ${days}d`;
}

const CERTIFICATE_COLUMNS: FindingsTableColumn<ZoneCertificate>[] = [
  {
    key: "zone",
    label: "Zone",
    width: "20%",
    sortValue: (r) => r.zone_name,
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {r.zone_name}
      </span>
    ),
  },
  {
    key: "hosts",
    label: "Host(s)",
    width: "30%",
    render: (r) => (
      <span style={{ fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
        {r.hosts.length > 0 ? r.hosts.join(", ") : "none"}
      </span>
    ),
  },
  {
    key: "issuer",
    label: "Issuer",
    width: "25%",
    render: (r) => (
      <span style={{ fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
        {r.issuer || "not available"}
      </span>
    ),
  },
  {
    key: "expires_on",
    label: "Expiry",
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {formatExpiry(r.expires_on)}
      </span>
    ),
  },
];

const WAF_CUSTOM_RULE_COLUMNS: FindingsTableColumn<CustomWafRule>[] = [
  {
    key: "zone",
    label: "Zone",
    width: "16%",
    sortValue: (r) => r.zone_name,
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {r.zone_name}
      </span>
    ),
  },
  {
    key: "description",
    label: "Rule",
    width: "20%",
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {r.description || "(unnamed rule)"}
      </span>
    ),
  },
  {
    key: "expression",
    label: "Expression",
    width: "40%",
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-faint)",
        }}
      >
        {r.expression}
      </span>
    ),
  },
  {
    key: "action",
    label: "Action",
    render: (r) => (
      <span style={{ fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
        {r.enabled ? r.action : "disabled"}
      </span>
    ),
  },
];

function zoneChecks(zone: ZoneFinding): Array<[string, CheckFinding | undefined]> {
  return [
    ["SSL/TLS", zone.ssl_tls],
    ["DNSSEC", zone.dnssec],
    ["WAF", zone.waf],
    ["Rate limiting", zone.rate_limiting],
    ["Bot fight mode", zone.bot_fight_mode],
    ["Always HTTPS", zone.always_use_https],
    ["Min TLS version", zone.min_tls_version],
  ];
}

function zoneDetail(zone: ZoneFinding): JSX.Element {
  const rows = zoneChecks(zone);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.filter(([, c]) => c !== undefined).map(([label, c]) => (
        <div key={label} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-label-size)",
              color: "var(--fg-faint)",
              width: 110,
              flex: "none",
            }}
          >
            {label}
          </span>
          <span style={{ fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
            {c!.reason}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SecurityPostureInventory(): JSX.Element {
  const [data, setData] = useState<SecurityInventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoneState, setZoneState] = useState<CollectionPageState>(INITIAL_COLLECTION_STATE);
  const [certState, setCertState] = useState<CollectionPageState>(INITIAL_COLLECTION_STATE);
  const [wafRuleState, setWafRuleState] = useState<CollectionPageState>(INITIAL_COLLECTION_STATE);

  useEffect(() => {
    fetchSecurityInventory(zoneState, certState, wafRuleState)
      .then((res) => {
        // Same FR-008 out-of-range recovery as every other paginated
        // module — each of the 3 collections can independently fall out of
        // range if its own result set shrank between loads.
        let needsRecovery = false;
        if (
          res.zones.length === 0 && res.zones_pagination.total > 0 &&
          zoneState.page > res.zones_pagination.total_pages
        ) {
          setZoneState((s) => ({ ...s, page: res.zones_pagination.total_pages }));
          needsRecovery = true;
        }
        if (
          res.certificates_pagination && res.certificates?.length === 0 &&
          res.certificates_pagination.total > 0 &&
          certState.page > res.certificates_pagination.total_pages
        ) {
          setCertState((s) => ({ ...s, page: res.certificates_pagination!.total_pages }));
          needsRecovery = true;
        }
        if (
          res.waf_custom_rules_pagination && res.waf_custom_rules?.length === 0 &&
          res.waf_custom_rules_pagination.total > 0 &&
          wafRuleState.page > res.waf_custom_rules_pagination.total_pages
        ) {
          setWafRuleState((s) => ({ ...s, page: res.waf_custom_rules_pagination!.total_pages }));
          needsRecovery = true;
        }
        if (needsRecovery) return;
        setData(res);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load security posture inventory")
      );
  }, [zoneState, certState, wafRuleState]);

  if (error) {
    return <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>;
  }

  // `run_id === null` is the backend's authoritative "no evaluation run
  // yet" signal (worker/modules/security/routes.ts) — a zone/widget
  // array-length check is wrong here, since a real completed run against a
  // genuinely zero-zone account also produces empty arrays and must render
  // as a confirmed-empty result, not this message (specs/006-security-posture/tasks.md T026).
  if (data && data.run_id === null) {
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
          Security posture
        </h1>
        <p style={{ color: "var(--fg-muted)" }}>
          No evaluation runs yet. Trigger one via <code>POST /api/security/evaluate</code>.
        </p>
      </div>
    );
  }

  const rows: FindingsTableRow<ZoneFinding>[] | null = data
    ? data.zones.map((z) => ({
      id: z.zone_id,
      status: z.overall_status,
      data: z,
      detail: zoneDetail(z),
    }))
    : null;

  // Computed server-side across the whole zones list, not just whichever
  // page is loaded (worker/modules/security/routes.ts) — pagination can't
  // hide a critical zone simply because it's on a different page.
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
    envelope: PaginationEnvelope | null | undefined,
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

  const zonePagination = makePagination(data?.zones_pagination, zoneState, setZoneState);
  const certPagination = makePagination(data?.certificates_pagination, certState, setCertState);
  const wafRulePagination = makePagination(
    data?.waf_custom_rules_pagination,
    wafRuleState,
    setWafRuleState,
  );

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
        Security posture
      </h1>
      {data && (
        <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
          {data.zones_pagination.total} zone{data.zones_pagination.total === 1 ? "" : "s"} · run
          {" "}
          {data.run_id}
        </p>
      )}

      {criticalFinding && (
        <AlertBanner
          scope="module"
          finding={{
            severity: "critical",
            title: "A zone has a critical security gap",
            target: criticalFinding.zone_name,
            description: criticalFinding.description,
          }}
        />
      )}

      <TabStrip
        tabs={[
          {
            key: "zones",
            label: "Zones",
            content: (
              <FindingsTable
                columns={CHECK_COLUMNS}
                rows={rows}
                loadingLabel="Loading security posture inventory…"
                emptyState={{
                  heading: "No zones in this account",
                  description: "This account has no zones to evaluate.",
                }}
                pagination={zonePagination}
              />
            ),
          },
          {
            key: "certificates",
            label: "Certificates",
            content: data && data.certificates === null
              ? (
                <p style={{ color: "var(--status-critical-fg)" }}>
                  Certificates could not be evaluated.
                </p>
              )
              : (
                <FindingsTable
                  columns={CERTIFICATE_COLUMNS}
                  rows={data
                    ? data.certificates!.map((c) => ({
                      id: `cert:${c.zone_id}`,
                      status: c.status,
                      data: c,
                    }))
                    : null}
                  loadingLabel="Loading certificates…"
                  emptyState={{
                    heading: "No certificates found",
                    description: "This account has no zones with an active certificate.",
                  }}
                  pagination={certPagination}
                />
              ),
          },
          {
            key: "waf-rules",
            label: "WAF custom rules",
            content: data && data.waf_custom_rules === null
              ? (
                <p style={{ color: "var(--status-critical-fg)" }}>
                  WAF custom rules could not be evaluated.
                </p>
              )
              : (
                <FindingsTable
                  columns={WAF_CUSTOM_RULE_COLUMNS}
                  rows={data
                    ? data.waf_custom_rules!.map((r, i) => ({
                      id: `waf-rule:${r.zone_id}:${i}`,
                      status: r.status,
                      data: r,
                    }))
                    : null}
                  loadingLabel="Loading WAF custom rules…"
                  emptyState={{
                    heading: "No custom WAF rules configured",
                    description: "No zone in this account has a custom WAF rule deployed.",
                  }}
                  pagination={wafRulePagination}
                />
              ),
          },
          {
            key: "turnstile",
            label: "Turnstile widgets",
            content: data && data.turnstile_widgets === null
              ? (
                <p style={{ color: "var(--status-critical-fg)" }}>
                  Turnstile widgets could not be evaluated.
                </p>
              )
              : data && data.turnstile_widgets !== null && data.turnstile_widgets.length === 0
              ? <p style={{ color: "var(--fg-muted)" }}>No Turnstile widgets configured.</p>
              : data
              ? (
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.turnstile_widgets!.map((w) => (
                    <li
                      key={w.sitekey}
                      style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-code-size)" }}
                    >
                      {w.name}{" "}
                      <span style={{ color: "var(--fg-faint)" }}>· {w.domains.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              )
              : null,
          },
        ]}
      />
    </div>
  );
}
