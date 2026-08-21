import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus, ExposureStatusBadge } from "../components/ExposureStatusBadge.tsx";
import { LoadingSkeleton } from "../components/LoadingSkeleton.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { useMultiRescan } from "../lib/use-multi-rescan.ts";
import { formatRelativeTime } from "../lib/format-relative-time.ts";

// Same wire shapes GET /api/audit/{summary,alerts,changes} already return
// (worker/modules/audit/routes.ts) — the Overview page is a pure consumer
// of Module 7's existing endpoints, computing nothing itself (research.md
// §3 / FR-017: no separate or divergent counting logic).
interface UnavailableSource {
  module: string;
  kind: string;
  error: string;
}

interface PostureCounts {
  safe: number;
  warning: number;
  critical: number;
  not_evaluated: number;
}

interface PostureSummaryEntry {
  module: string;
  kind: string;
  has_data: boolean;
  counts: PostureCounts;
  evaluated_at: string | null;
}

interface SummaryResponse {
  modules: PostureSummaryEntry[];
  unavailable_sources: UnavailableSource[];
  account_scope: { zone_count: number; worker_count: number };
}

interface UnifiedAlert {
  id: string;
  module: string;
  kind: string;
  entity_label: string;
  previous_status: ExposureStatus | null;
  new_status: ExposureStatus;
  detected_at: string;
  acknowledged_at: string | null;
  reason: string;
}

interface PaginationEnvelope {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

interface AlertsResponse {
  alerts: UnifiedAlert[];
  unavailable_sources: UnavailableSource[];
  pagination: PaginationEnvelope;
}

interface ChangeEntry {
  module: string;
  kind: string;
  entity_label: string;
  previous_status: ExposureStatus | null;
  current_status: ExposureStatus;
}

interface ChangesResponse {
  since: string;
  until: string;
  changes: ChangeEntry[];
  unavailable_sources: UnavailableSource[];
  pagination: PaginationEnvelope;
}

interface TrendDayPoint {
  date: string;
  has_data: boolean;
  counts: PostureCounts;
}

interface TrendResponse {
  days: TrendDayPoint[];
  unavailable_sources: UnavailableSource[];
}

async function fetchSummary(): Promise<SummaryResponse> {
  const res = await fetch("/api/audit/summary");
  if (!res.ok) throw new Error(`GET /api/audit/summary failed: ${res.status}`);
  return await res.json();
}

// specs/022-audit-list-pagination — Overview stays a bounded, most-severe-
// first glance rather than gaining full pager controls of its own: a fixed
// small page_size, always sorted by severity server-side (data-model.md),
// with `pagination.total` telling the "N more" indicator how much is
// hidden. Both endpoints already return this shape (spec 020's envelope).
const OVERVIEW_SLICE_SIZE = 5;

async function fetchAlerts(): Promise<AlertsResponse> {
  const res = await fetch(
    `/api/audit/alerts?page=1&page_size=${OVERVIEW_SLICE_SIZE}&sort_key=severity`,
  );
  if (!res.ok) throw new Error(`GET /api/audit/alerts failed: ${res.status}`);
  return await res.json();
}

async function fetchChanges(): Promise<ChangesResponse> {
  const res = await fetch(
    `/api/audit/changes?page=1&page_size=${OVERVIEW_SLICE_SIZE}&sort_key=severity`,
  );
  if (!res.ok) throw new Error(`GET /api/audit/changes failed: ${res.status}`);
  return await res.json();
}

async function fetchTrend(): Promise<TrendResponse> {
  const res = await fetch("/api/audit/trend");
  if (!res.ok) throw new Error(`GET /api/audit/trend failed: ${res.status}`);
  return await res.json();
}

async function acknowledgeAlert(module: string, kind: string, id: string): Promise<void> {
  const res = await fetch(`/api/audit/alerts/${module}/${kind}/${id}/acknowledge`, {
    method: "POST",
  });
  if (res.status === 403) throw new Error("You don't have permission to acknowledge alerts.");
  if (!res.ok) throw new Error(`Acknowledge failed: ${res.status}`);
}

interface MetricCardProps {
  status: ExposureStatus;
  label: string;
  value: number;
}

const METRIC_COLOR_VAR: Record<ExposureStatus, string> = {
  critical: "var(--status-critical-fg)",
  warning: "var(--status-warning)",
  safe: "var(--status-safe)",
  not_evaluated: "var(--status-neutral)",
};

function MetricCard({ status, label, value }: MetricCardProps): JSX.Element {
  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${METRIC_COLOR_VAR[status]}`,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 9,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ExposureStatusBadge status={status} />
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-metric-size)",
          fontWeight: "var(--text-metric-weight)" as unknown as number,
          letterSpacing: "var(--text-metric-ls)",
          lineHeight: 1,
          color: METRIC_COLOR_VAR[status],
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "var(--text-meta-size)", color: "var(--fg-faint)" }}>{label}</div>
    </div>
  );
}

// issue #429 — this label is the single button's text; the click itself
// still only ever performs the one real mutation this page has
// (acknowledge). specs/027's original FR-008 kept this label on a
// separate, purely decorative control next to a plain "Acknowledge"
// button — the design reference shows one button per row, not two, so
// the two were merged here rather than left duplicated. Deliberately a
// small module-level default rather than one label per finding kind: the
// inbox spans all seventeen source kinds, far more varied than any single
// module page's own action set, so a per-kind label would be unjustified
// complexity for text that names an action but doesn't perform it.
const CONTEXTUAL_ACTION_LABEL: Record<string, string> = {
  exposure: "Review exposure",
  dns: "Review DNS record",
  "zero-trust": "Review Access policy",
  pages: "Review Pages config",
  storage: "Review storage exposure",
  security: "Review security setting",
};

function contextualActionLabel(alert: UnifiedAlert): string {
  return CONTEXTUAL_ACTION_LABEL[alert.module] ?? "Review";
}

function FindingRow(
  { alert, onAcknowledged }: { alert: UnifiedAlert; onAcknowledged: (id: string) => void },
): JSX.Element {
  const [pending, setPending] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);
  const critical = alert.new_status === "critical";

  async function handleAcknowledge() {
    setPending(true);
    setAckError(null);
    try {
      await acknowledgeAlert(alert.module, alert.kind, alert.id);
      onAcknowledged(alert.id);
    } catch (err) {
      setAckError(err instanceof Error ? err.message : "failed to acknowledge alert");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "14px 18px",
        borderBottom: "1px solid var(--rule-hairline)",
        background: critical ? "var(--status-critical-row)" : "transparent",
        borderLeft: critical ? "3px solid var(--status-critical)" : "3px solid transparent",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ExposureStatusBadge status={alert.new_status} />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-meta-size)",
              color: "var(--fg-faint)",
            }}
          >
            {formatRelativeTime(alert.detected_at)}
          </span>
        </div>
        <div
          style={{
            fontSize: "var(--text-body-size)",
            color: "var(--fg-secondary)",
            lineHeight: 1.5,
            // Real reason text can run long — wrap, never truncate
            // (spec.md Edge Cases).
            overflowWrap: "break-word",
          }}
        >
          {alert.reason}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-code-size)",
            color: "var(--fg-faint)",
          }}
        >
          {alert.entity_label}
          <span>· {alert.module}/{alert.kind}</span>
        </div>
      </div>
      <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          type="button"
          onClick={handleAcknowledge}
          disabled={pending}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-meta-size)",
            letterSpacing: "0.03em",
            background: "none",
            border: "1px solid var(--border)",
            color: "var(--fg-secondary)",
            padding: "5px 10px",
            textAlign: "center",
            whiteSpace: "nowrap",
            cursor: pending ? "default" : "pointer",
            font: "inherit",
          }}
        >
          {pending ? "Acknowledging…" : contextualActionLabel(alert)}
        </button>
        {ackError && (
          <div style={{ color: "var(--status-critical-fg)", fontSize: "var(--text-meta-size)" }}>
            {ackError}
          </div>
        )}
      </div>
    </div>
  );
}

// specs/027-overview-dashboard-redesign — 14-day (or whatever `days` the
// backend computed) stacked critical/warning/safe trend, real data only
// (research.md §5). A day marked `has_data: false` (before the account's
// evaluation history began, FR-010) renders as an explicit dim marker,
// never a fabricated zero-height bar indistinguishable from "genuinely
// all clear that day."
function ExposureTrendChart(
  { trend, error }: { trend: TrendResponse | null; error: string | null },
): JSX.Element {
  if (error) {
    return <p style={{ color: "var(--status-critical-fg)", padding: 18 }}>{error}</p>;
  }
  if (!trend) {
    return <LoadingSkeleton rows={1} label="Loading trend…" />;
  }

  const dayTotal = (d: TrendDayPoint) =>
    d.counts.safe + d.counts.warning + d.counts.critical + d.counts.not_evaluated;
  const maxTotal = Math.max(1, ...trend.days.map(dayTotal));

  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "var(--text-body-size)", fontWeight: 600 }}>
          Exposure over time
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-meta-size)",
            color: "var(--fg-faint)",
          }}
        >
          {trend.days.length}d
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 88 }}>
        {trend.days.map((d) => {
          if (!d.has_data) {
            return (
              <div
                key={d.date}
                data-testid={`trend-day-${d.date}`}
                title={`${d.date}: no data`}
                style={{
                  flex: 1,
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                }}
              >
                <div style={{ height: 3, background: "var(--fg-faint)", opacity: 0.4 }} />
              </div>
            );
          }
          const total = dayTotal(d);
          return (
            <div
              key={d.date}
              data-testid={`trend-day-${d.date}`}
              title={`${d.date}: ${total} finding${total === 1 ? "" : "s"}`}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                gap: 2,
                height: "100%",
              }}
            >
              <div
                style={{
                  height: `${(d.counts.critical / maxTotal) * 100}%`,
                  background: "var(--status-critical-fg)",
                }}
              />
              <div
                style={{
                  height: `${(d.counts.warning / maxTotal) * 100}%`,
                  background: "var(--status-warning)",
                }}
              />
              <div
                style={{
                  height: `${(d.counts.safe / maxTotal) * 100}%`,
                  background: "var(--status-safe)",
                }}
              />
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-label-size)",
          color: "var(--fg-faint)",
        }}
      >
        <div>{trend.days[0]?.date}</div>
        <div>{trend.days.at(-1)?.date}</div>
      </div>
    </div>
  );
}

function UnavailableModulesNotice(
  { sources }: { sources: UnavailableSource[] },
): JSX.Element | null {
  if (sources.length === 0) return null;
  return (
    <div
      style={{
        marginBottom: 14,
        padding: "8px 12px",
        border: "1px solid var(--status-critical-fg)",
        color: "var(--status-critical-fg)",
        fontSize: "var(--text-body-size)",
      }}
    >
      {sources.map((s) => (
        <div key={`${s.module}/${s.kind}`}>
          {s.module}/{s.kind}{" "}
          could not be read — not counted below (shown as not-available, not zero).
        </div>
      ))}
    </div>
  );
}

export function OverviewPage(
  { onNavigateToAudit }: { onNavigateToAudit: () => void },
): JSX.Element {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertsResponse | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [changes, setChanges] = useState<ChangesResponse | null>(null);
  const [changesError, setChangesError] = useState<string | null>(null);
  const [trend, setTrend] = useState<TrendResponse | null>(null);
  const [trendError, setTrendError] = useState<string | null>(null);

  function refetchAll() {
    fetchSummary().then((s) => {
      setSummary(s);
      setSummaryError(null);
    }).catch((err: unknown) =>
      setSummaryError(err instanceof Error ? err.message : "failed to load posture summary")
    );
    fetchAlerts().then((a) => {
      setAlerts(a);
      setAlertsError(null);
    }).catch((err: unknown) =>
      setAlertsError(err instanceof Error ? err.message : "failed to load alerts")
    );
    fetchChanges().then((c) => {
      setChanges(c);
      setChangesError(null);
    }).catch((err: unknown) =>
      setChangesError(err instanceof Error ? err.message : "failed to load changes")
    );
    fetchTrend().then((t) => {
      setTrend(t);
      setTrendError(null);
    }).catch((err: unknown) =>
      setTrendError(err instanceof Error ? err.message : "failed to load trend")
    );
  }

  useEffect(() => {
    refetchAll();
  }, []);

  const multiRescan = useMultiRescan(refetchAll);

  function handleAcknowledged(id: string) {
    setAlerts((prev) => prev && { ...prev, alerts: prev.alerts.filter((a) => a.id !== id) });
  }

  // Most recent evaluation across every source that has one (FR-002) — the
  // account-wide "last scan" indicator, not a fabricated or per-module
  // figure.
  const lastScannedAt = summary
    ? summary.modules
      .filter((m) => m.has_data && m.evaluated_at)
      .map((m) => m.evaluated_at as string)
      .sort()
      .at(-1) ?? null
    : null;

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
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
          Overview
        </h1>
        {summary?.account_scope && (
          <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
            {summary.account_scope.zone_count} zones · {summary.account_scope.worker_count} workers
          </p>
        )}
        <p
          style={{
            fontSize: "var(--text-body-size)",
            color: "var(--fg-muted)",
            maxWidth: 520,
            margin: "4px 0 0",
          }}
        >
          The morning read on the whole account: what is exposed right now, what changed overnight,
          and which findings are waiting on a decision from you.
        </p>
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-meta-size)",
              color: "var(--fg-secondary)",
            }}
          >
            {lastScannedAt ? `last scanned ${formatRelativeTime(lastScannedAt)}` : "never scanned"}
          </div>
          {
            /* Real cadence (wrangler.jsonc's hourly Cron Trigger), never a
              fabricated number (research.md §1). */
          }
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-label-size)",
              color: "var(--fg-faint)",
            }}
          >
            runs hourly
          </div>
        </div>
        <div>
          <button
            type="button"
            onClick={multiRescan.trigger}
            disabled={multiRescan.pending}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-code-size)",
              letterSpacing: "0.06em",
              background: "var(--brand-primary)",
              color: "var(--bg-base)",
              border: "none",
              padding: "7px 12px",
              fontWeight: 600,
              cursor: multiRescan.pending ? "default" : "pointer",
            }}
          >
            {multiRescan.pending ? "SCANNING…" : "RE-SCAN"}
          </button>
          {multiRescan.errors.length > 0 && (
            <div
              style={{
                marginTop: 4,
                color: "var(--status-critical-fg)",
                fontSize: "var(--text-meta-size)",
                maxWidth: 220,
                textAlign: "right",
              }}
            >
              {multiRescan.errors.map((e) => e.label).join(", ")} failed to re-scan
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (summaryError) {
    return (
      <div>
        {header}
        <p style={{ color: "var(--status-critical-fg)" }}>{summaryError}</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div>
        {header}
        <LoadingSkeleton label="Loading account-wide posture…" />
      </div>
    );
  }

  // Aggregate across every source (FR-016/FR-017) — the exact same counts
  // each module's own inventory page already computes, just summed. A
  // module reported in unavailable_sources is excluded from the totals
  // entirely rather than folded in as zero (FR-018).
  const totals: PostureCounts = { safe: 0, warning: 0, critical: 0, not_evaluated: 0 };
  for (const entry of summary.modules) {
    const unavailable = summary.unavailable_sources.some(
      (s) => s.module === entry.module && s.kind === entry.kind,
    );
    if (unavailable || !entry.has_data) continue;
    totals.safe += entry.counts.safe;
    totals.warning += entry.counts.warning;
    totals.critical += entry.counts.critical;
    totals.not_evaluated += entry.counts.not_evaluated;
  }

  const allClear = totals.critical === 0 && totals.warning === 0 &&
    summary.unavailable_sources.length === 0 && (!alerts || alerts.alerts.length === 0);

  // Already severity-sorted server-side (fetchAlerts requests sort_key=severity)
  // — no client-side re-sort needed, specs/022-audit-list-pagination.
  const sortedAlerts = alerts ? alerts.alerts : null;
  const moreAlerts = alerts && alerts.pagination.total > OVERVIEW_SLICE_SIZE
    ? alerts.pagination.total - alerts.alerts.length
    : 0;
  const moreChanges = changes && changes.pagination.total > OVERVIEW_SLICE_SIZE
    ? changes.pagination.total - changes.changes.length
    : 0;

  return (
    <div>
      {header}

      <UnavailableModulesNotice sources={summary.unavailable_sources} />

      {allClear
        ? (
          <EmptyState
            heading="Nothing needs attention right now"
            description="Every evaluated module reports a clean posture and there are no outstanding alerts."
          />
        )
        : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 14,
              marginBottom: 20,
            }}
          >
            <MetricCard status="critical" label="critical findings" value={totals.critical} />
            <MetricCard status="warning" label="warning findings" value={totals.warning} />
            <MetricCard status="safe" label="protected" value={totals.safe} />
            <MetricCard
              status="not_evaluated"
              label="not applicable"
              value={totals.not_evaluated}
            />
          </div>
        )}

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 20 }}>
        <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 18px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: "var(--text-body-size)", fontWeight: 600 }}>Findings</span>
            {alerts && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-meta-size)",
                  color: "var(--fg-faint)",
                }}
              >
                {alerts.pagination.total} open · sorted by severity
              </span>
            )}
          </div>
          {alertsError
            ? <p style={{ color: "var(--status-critical-fg)", padding: 18 }}>{alertsError}</p>
            : !sortedAlerts
            ? <LoadingSkeleton label="Loading findings…" />
            : sortedAlerts.length === 0
            ? (
              <p style={{ color: "var(--fg-muted)", padding: 18 }}>
                No outstanding alerts across any module.
              </p>
            )
            : sortedAlerts.map((a) => (
              <FindingRow key={a.id} alert={a} onAcknowledged={handleAcknowledged} />
            ))}
          {moreAlerts > 0 && (
            <button
              type="button"
              data-testid="overview-alerts-more"
              onClick={onNavigateToAudit}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "none",
                border: "none",
                borderTop: "1px solid var(--rule-hairline)",
                padding: "10px 18px",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-meta-size)",
                color: "var(--fg-faint)",
                cursor: "pointer",
              }}
            >
              {moreAlerts} more — see full list
            </button>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <ExposureTrendChart trend={trend} error={trendError} />

          <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid var(--border)",
                fontSize: "var(--text-body-size)",
                fontWeight: 600,
              }}
            >
              Scan log
            </div>
            {changesError
              ? <p style={{ color: "var(--status-critical-fg)", padding: 18 }}>{changesError}</p>
              : !changes
              ? <LoadingSkeleton label="Loading recent activity…" />
              : changes.changes.length === 0
              ? (
                <p style={{ color: "var(--fg-muted)", padding: 18 }}>
                  No status changes since {changes.since}.
                </p>
              )
              : changes.changes.map((c) => (
                <div
                  key={`${c.module}/${c.kind}/${c.entity_label}`}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "baseline",
                    padding: "9px 18px",
                    borderBottom: "1px solid var(--rule-hairline)",
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      flex: "none",
                      background: METRIC_COLOR_VAR[c.current_status],
                    }}
                  />
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-meta-size)",
                      color: "var(--fg-muted)",
                      lineHeight: 1.5,
                    }}
                  >
                    {c.entity_label}
                    <span style={{ color: "var(--fg-faint)" }}>
                      · {c.module}/{c.kind} · {c.previous_status ?? "(new)"} → {c.current_status}
                    </span>
                  </div>
                </div>
              ))}
            {moreChanges > 0 && (
              <button
                type="button"
                data-testid="overview-changes-more"
                onClick={onNavigateToAudit}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  borderTop: "1px solid var(--rule-hairline)",
                  padding: "10px 18px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-meta-size)",
                  color: "var(--fg-faint)",
                  cursor: "pointer",
                }}
              >
                {moreChanges} more — see full list
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
