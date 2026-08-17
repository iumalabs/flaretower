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
import { EmptyState } from "../components/EmptyState.tsx";
import { TabStrip } from "../components/TabStrip.tsx";
import { RescanButton } from "../components/RescanButton.tsx";
import { useRescan } from "../lib/use-rescan.ts";

interface PolicyRuleLine {
  verb: "ALLOW" | "REQUIRE" | "DENY";
  label: string;
}

interface AppFinding {
  app_id: string;
  app_name: string | null;
  app_domain: string;
  status: ExposureStatus;
  reason: string;
  policy_count: number | null;
  covered_hostname_count: number | null;
  identity_summary: string | null;
  session_duration: string | null;
  policy_rules: PolicyRuleLine[][];
}

interface TokenFinding {
  token_id: string;
  token_name: string;
  expires_at: string | null;
  status: ExposureStatus;
  reason: string;
}

interface AccessGroupEntry {
  group_id: string;
  name: string;
  rule_summary: string;
  referenced_by_app_count: number;
}

interface PaginationEnvelope {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

interface ZeroTrustInventoryResponse {
  run_id: string | null;
  evaluated_at: string | null;
  critical_finding:
    | { kind: "application" | "service_token"; title: string; target: string; description: string }
    | null;
  applications: AppFinding[];
  applications_pagination: PaginationEnvelope;
  service_tokens: TokenFinding[];
  service_tokens_pagination: PaginationEnvelope;
  access_groups: AccessGroupEntry[] | null;
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

async function fetchZeroTrustInventory(
  appState: CollectionPageState,
  tokenState: CollectionPageState,
): Promise<ZeroTrustInventoryResponse> {
  const query = new URLSearchParams();
  appendCollectionParams(query, "app", appState);
  appendCollectionParams(query, "token", tokenState);
  const res = await fetch(`/api/zero-trust/inventory?${query}`);
  if (!res.ok) {
    throw new Error(`GET /api/zero-trust/inventory failed: ${res.status}`);
  }
  return await res.json();
}

const NOT_AVAILABLE = "not available";

const APP_COLUMNS: FindingsTableColumn<AppFinding>[] = [
  {
    key: "application",
    label: "Application",
    width: "18%",
    sortValue: (r) => r.app_domain,
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {r.app_name ?? r.app_id}
      </span>
    ),
  },
  {
    key: "covers",
    label: "Covers",
    width: "20%",
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {r.app_domain}
        {r.covered_hostname_count !== null && r.covered_hostname_count > 1 && (
          <span style={{ color: "var(--fg-faint)" }}>+{r.covered_hostname_count - 1}</span>
        )}
      </span>
    ),
  },
  {
    key: "policies",
    label: "Policies",
    width: "8%",
    sortValue: (r) => r.policy_count ?? -1,
    render: (r) => (
      <span style={{ color: "var(--fg-muted)" }}>{r.policy_count ?? NOT_AVAILABLE}</span>
    ),
  },
  {
    key: "identity",
    label: "Identity",
    width: "16%",
    render: (r) => (
      <span style={{ fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
        {r.identity_summary ?? NOT_AVAILABLE}
      </span>
    ),
  },
  {
    key: "session",
    label: "Session",
    width: "10%",
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-faint)",
        }}
      >
        {r.session_duration ?? "not set"}
      </span>
    ),
  },
  {
    key: "reason",
    label: "Reason",
    render: (r) => (
      <span style={{ fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
        {r.reason}
      </span>
    ),
  },
];

const TOKEN_COLUMNS: FindingsTableColumn<TokenFinding>[] = [
  {
    key: "name",
    label: "Token",
    sortValue: (r) => r.token_name,
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {r.token_name}
        <span style={{ color: "var(--fg-faint)" }}>· {r.expires_at ?? "no expiration set"}</span>
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

const VERB_COLOR: Record<PolicyRuleLine["verb"], string> = {
  ALLOW: "var(--status-safe)",
  REQUIRE: "var(--brand-primary)",
  DENY: "var(--status-critical-fg)",
};

function PolicyDetailPanel({ app }: { app: AppFinding | undefined }): JSX.Element {
  return (
    <div
      style={{
        flex: "1.4 1 0",
        minWidth: 0,
        border: "1px solid var(--border)",
        background: "var(--bg-canvas)",
        padding: 16,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-label-size)",
          letterSpacing: "var(--text-label-ls)",
          color: "var(--fg-faint)",
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        Policy detail{app ? ` — ${app.app_name ?? app.app_id}` : ""}
      </div>
      {!app && (
        <div style={{ color: "var(--fg-faint)", fontSize: "var(--text-code-size)" }}>
          No application selected.
        </div>
      )}
      {app && app.policy_rules.length === 0 && (
        <div style={{ color: "var(--fg-faint)", fontSize: "var(--text-code-size)" }}>
          No policies attached to this application.
        </div>
      )}
      {app && app.policy_rules.map((lines, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "10px 0",
            borderTop: i > 0 ? "1px solid var(--rule-hairline)" : undefined,
          }}
        >
          {lines.map((line, j) => (
            <div key={j} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-label-size)",
                  letterSpacing: "var(--text-label-ls)",
                  color: VERB_COLOR[line.verb],
                  width: 60,
                  flex: "none",
                }}
              >
                {line.verb}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-code-size)",
                  color: "var(--fg-secondary)",
                }}
              >
                {line.label}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function GroupsPanel({ groups }: { groups: AccessGroupEntry[] | null }): JSX.Element {
  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 0,
        border: "1px solid var(--border)",
        background: "var(--bg-canvas)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-label-size)",
          letterSpacing: "var(--text-label-ls)",
          color: "var(--fg-faint)",
          textTransform: "uppercase",
        }}
      >
        Groups
      </div>
      {groups === null && (
        <div style={{ padding: 14, color: "var(--fg-faint)", fontSize: "var(--text-code-size)" }}>
          {NOT_AVAILABLE}
        </div>
      )}
      {groups !== null && groups.length === 0 && (
        <div style={{ padding: 14, color: "var(--fg-faint)", fontSize: "var(--text-code-size)" }}>
          No Access Groups in this account.
        </div>
      )}
      {groups !== null && groups.map((g) => (
        <div
          key={g.group_id}
          data-testid={`access-group-${g.group_id}`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            borderBottom: "1px solid var(--rule-hairline)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-code-size)",
                color: "var(--fg-secondary)",
              }}
            >
              {g.name}
            </span>
            <span style={{ fontSize: "var(--text-meta-size)", color: "var(--fg-faint)" }}>
              {g.rule_summary}
            </span>
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-label-size)",
              color: "var(--fg-faint)",
            }}
          >
            {g.referenced_by_app_count} app{g.referenced_by_app_count === 1 ? "" : "s"}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ZeroTrustInventory(): JSX.Element {
  const [data, setData] = useState<ZeroTrustInventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [appState, setAppState] = useState<CollectionPageState>(INITIAL_COLLECTION_STATE);
  const [tokenState, setTokenState] = useState<CollectionPageState>(INITIAL_COLLECTION_STATE);

  function refetch() {
    fetchZeroTrustInventory(appState, tokenState)
      .then((res) => {
        // Same FR-008 out-of-range recovery as every other paginated module.
        let needsRecovery = false;
        if (
          res.applications.length === 0 && res.applications_pagination.total > 0 &&
          appState.page > res.applications_pagination.total_pages
        ) {
          setAppState((s) => ({ ...s, page: res.applications_pagination.total_pages }));
          needsRecovery = true;
        }
        if (
          res.service_tokens.length === 0 && res.service_tokens_pagination.total > 0 &&
          tokenState.page > res.service_tokens_pagination.total_pages
        ) {
          setTokenState((s) => ({ ...s, page: res.service_tokens_pagination.total_pages }));
          needsRecovery = true;
        }
        if (needsRecovery) return;
        setData(res);
        setSelectedAppId((prev) => prev ?? res.applications[0]?.app_id ?? null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load Zero Trust inventory")
      );
  }

  useEffect(() => {
    refetch();
  }, [appState, tokenState]);

  const rescan = useRescan("/api/zero-trust/evaluate", refetch);

  if (error) {
    return <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>;
  }

  // `run_id === null` is the only reliable "never evaluated" signal — it
  // comes from the run-log table (worker/db/migrations/0008), written on
  // every run regardless of finding count. Array emptiness alone can't
  // distinguish "never ran" from "ran and legitimately found nothing," so
  // it must not gate this empty state (specs/003-zero-trust/tasks.md T026).
  if (data && data.run_id === null) {
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
            Zero Trust inventory
          </h1>
          <RescanButton pending={rescan.pending} error={rescan.error} onClick={rescan.trigger} />
        </div>
        <p style={{ color: "var(--fg-muted)" }}>
          No evaluation runs yet.
        </p>
      </div>
    );
  }

  const appRows: FindingsTableRow<AppFinding>[] | null = data
    ? data.applications.map((a) => ({ id: a.app_id, status: a.status, data: a }))
    : null;
  const tokenRows: FindingsTableRow<TokenFinding>[] | null = data
    ? data.service_tokens.map((t) => ({ id: t.token_id, status: t.status, data: t }))
    : null;

  // Computed server-side across the whole list, not just whichever page is
  // loaded (worker/modules/zero-trust/routes.ts) — FR-013's single most
  // urgent finding can't be hidden by pagination.
  const criticalFinding = data?.critical_finding ?? null;

  const selectedApp = data?.applications.find((a) => a.app_id === selectedAppId);

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

  const appPagination = makePagination(data?.applications_pagination, appState, setAppState);
  const tokenPagination = makePagination(
    data?.service_tokens_pagination,
    tokenState,
    setTokenState,
  );

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
          Zero Trust inventory
        </h1>
        <RescanButton pending={rescan.pending} error={rescan.error} onClick={rescan.trigger} />
      </div>
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
            description: criticalFinding.description,
          }}
        />
      )}

      <TabStrip
        tabs={[
          {
            key: "applications",
            label: "Access applications",
            content: (
              <div>
                {appRows && appRows.length === 0
                  ? (
                    <EmptyState
                      heading="No Access applications"
                      description="This account has no Access applications configured."
                    />
                  )
                  : (
                    <FindingsTable
                      columns={APP_COLUMNS}
                      rows={appRows}
                      loadingLabel="Loading applications…"
                      pagination={appPagination}
                    />
                  )}

                {appRows && appRows.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0" }}>
                    {data!.applications.map((a) => (
                      <button
                        key={a.app_id}
                        type="button"
                        onClick={() => setSelectedAppId(a.app_id)}
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "var(--text-label-size)",
                          color: a.app_id === selectedAppId
                            ? "var(--fg-primary)"
                            : "var(--fg-faint)",
                          border: `1px solid ${
                            a.app_id === selectedAppId ? "var(--brand-primary)" : "var(--border)"
                          }`,
                          background: a.app_id === selectedAppId
                            ? "var(--brand-wash)"
                            : "transparent",
                          padding: "4px 9px",
                          cursor: "pointer",
                        }}
                      >
                        {a.app_name ?? a.app_id}
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginTop: 12 }}>
                  <PolicyDetailPanel app={selectedApp} />
                </div>
              </div>
            ),
          },
          {
            key: "groups",
            label: "Access Groups",
            content: <GroupsPanel groups={data?.access_groups ?? null} />,
          },
          {
            key: "service-tokens",
            label: "Service tokens",
            content: (
              <FindingsTable
                columns={TOKEN_COLUMNS}
                rows={tokenRows}
                loadingLabel="Loading service tokens…"
                emptyState={{
                  heading: "No service tokens",
                  description: "This account has no service tokens configured.",
                }}
                pagination={tokenPagination}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
