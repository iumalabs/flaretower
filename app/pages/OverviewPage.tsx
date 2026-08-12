import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus, ExposureStatusBadge } from "../components/ExposureStatusBadge.tsx";
import { LoadingSkeleton } from "../components/LoadingSkeleton.tsx";
import { EmptyState } from "../components/EmptyState.tsx";

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
}

interface SummaryResponse {
  modules: PostureSummaryEntry[];
  unavailable_sources: UnavailableSource[];
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
}

interface AlertsResponse {
  alerts: UnifiedAlert[];
  unavailable_sources: UnavailableSource[];
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
}

async function fetchSummary(): Promise<SummaryResponse> {
  const res = await fetch("/api/audit/summary");
  if (!res.ok) throw new Error(`GET /api/audit/summary failed: ${res.status}`);
  return await res.json();
}

async function fetchAlerts(): Promise<AlertsResponse> {
  const res = await fetch("/api/audit/alerts");
  if (!res.ok) throw new Error(`GET /api/audit/alerts failed: ${res.status}`);
  return await res.json();
}

async function fetchChanges(): Promise<ChangesResponse> {
  const res = await fetch("/api/audit/changes");
  if (!res.ok) throw new Error(`GET /api/audit/changes failed: ${res.status}`);
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
            {alert.detected_at}
          </span>
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-code-size)",
            color: "var(--fg-secondary)",
          }}
        >
          {alert.entity_label}
          <span style={{ color: "var(--fg-faint)" }}>· {alert.module}/{alert.kind}</span>
        </div>
      </div>
      <div style={{ flex: "none" }}>
        <button
          type="button"
          onClick={handleAcknowledge}
          disabled={pending}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            padding: "5px 10px",
            cursor: pending ? "default" : "pointer",
            color: "var(--fg-secondary)",
            font: "inherit",
            fontSize: "var(--text-body-size)",
          }}
        >
          {pending ? "Acknowledging…" : "Acknowledge"}
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

const SEVERITY_ORDER: Record<ExposureStatus, number> = {
  critical: 0,
  warning: 1,
  safe: 2,
  not_evaluated: 3,
};

export function OverviewPage(): JSX.Element {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertsResponse | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [changes, setChanges] = useState<ChangesResponse | null>(null);
  const [changesError, setChangesError] = useState<string | null>(null);

  useEffect(() => {
    fetchSummary().then(setSummary).catch((err: unknown) =>
      setSummaryError(err instanceof Error ? err.message : "failed to load posture summary")
    );
    fetchAlerts().then(setAlerts).catch((err: unknown) =>
      setAlertsError(err instanceof Error ? err.message : "failed to load alerts")
    );
    fetchChanges().then(setChanges).catch((err: unknown) =>
      setChangesError(err instanceof Error ? err.message : "failed to load changes")
    );
  }, []);

  function handleAcknowledged(id: string) {
    setAlerts((prev) => prev && { ...prev, alerts: prev.alerts.filter((a) => a.id !== id) });
  }

  const heading = (
    <h1
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-display-size)",
        fontWeight: "var(--text-display-weight)" as unknown as number,
        letterSpacing: "var(--text-display-ls)",
        margin: "0 0 16px",
      }}
    >
      Overview
    </h1>
  );

  if (summaryError) {
    return (
      <div>
        {heading}
        <p style={{ color: "var(--status-critical-fg)" }}>{summaryError}</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div>
        {heading}
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

  const sortedAlerts = alerts
    ? [...alerts.alerts].sort((a, b) => SEVERITY_ORDER[a.new_status] - SEVERITY_ORDER[b.new_status])
    : null;

  return (
    <div>
      {heading}

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
            {sortedAlerts && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-meta-size)",
                  color: "var(--fg-faint)",
                }}
              >
                {sortedAlerts.length} open · sorted by severity
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
        </div>

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
        </div>
      </div>
    </div>
  );
}
