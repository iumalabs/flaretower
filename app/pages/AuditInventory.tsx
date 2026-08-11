import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus, ExposureStatusBadge } from "../components/ExposureStatusBadge.tsx";

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

// A source whose D1 read rejected outright, distinct from that source
// legitimately having no data (FR-010 / spec.md Edge Cases bullet 2) —
// same shape from all three of /alerts, /changes, /summary.
interface UnavailableSource {
  module: string;
  kind: string;
  error: string;
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

async function fetchAlerts(): Promise<AlertsResponse> {
  const res = await fetch("/api/audit/alerts");
  if (!res.ok) {
    throw new Error(`GET /api/audit/alerts failed: ${res.status}`);
  }
  return await res.json();
}

async function fetchChanges(): Promise<ChangesResponse> {
  const res = await fetch("/api/audit/changes");
  if (!res.ok) {
    throw new Error(`GET /api/audit/changes failed: ${res.status}`);
  }
  return await res.json();
}

async function fetchSummary(): Promise<SummaryResponse> {
  const res = await fetch("/api/audit/summary");
  if (!res.ok) {
    throw new Error(`GET /api/audit/summary failed: ${res.status}`);
  }
  return await res.json();
}

async function acknowledgeAlert(module: string, kind: string, id: string): Promise<void> {
  const res = await fetch(`/api/audit/alerts/${module}/${kind}/${id}/acknowledge`, {
    method: "POST",
  });
  if (res.status === 403) {
    throw new Error("You don't have permission to acknowledge alerts.");
  }
  if (!res.ok) {
    throw new Error(`Acknowledge failed: ${res.status}`);
  }
}

function AlertRow(
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
    <tr
      style={{
        borderTop: "1px solid var(--rule-hairline)",
        borderLeft: critical ? "3px solid var(--status-critical)" : "3px solid transparent",
        background: critical ? "var(--status-critical-row)" : "transparent",
      }}
    >
      <td style={{ padding: "8px 0 8px 8px", width: 120 }}>
        <ExposureStatusBadge status={alert.new_status} />
      </td>
      <td
        style={{
          padding: "8px 0",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {alert.entity_label}
        <span style={{ color: "var(--fg-faint)" }}>· {alert.module}/{alert.kind}</span>
      </td>
      <td style={{ padding: "8px 0", fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
        {alert.previous_status ?? "(new)"} → {alert.new_status} · {alert.detected_at}
      </td>
      <td style={{ padding: "8px 8px 8px 0", textAlign: "right" }}>
        <button
          type="button"
          onClick={handleAcknowledge}
          disabled={pending}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "4px 10px",
            cursor: pending ? "default" : "pointer",
            color: "var(--fg-secondary)",
            font: "inherit",
            fontSize: "var(--text-body-size)",
          }}
        >
          {pending ? "Acknowledging…" : "Acknowledge"}
        </button>
        {ackError && (
          <div style={{ color: "var(--status-critical-fg)", fontSize: "var(--text-body-size)" }}>
            {ackError}
          </div>
        )}
      </td>
    </tr>
  );
}

function ChangeRow({ change }: { change: ChangeEntry }): JSX.Element {
  return (
    <tr style={{ borderTop: "1px solid var(--rule-hairline)" }}>
      <td
        style={{
          padding: "8px 0",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {change.entity_label}
        <span style={{ color: "var(--fg-faint)" }}>· {change.module}/{change.kind}</span>
      </td>
      <td style={{ padding: "8px 0", fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
        {change.previous_status ?? "(new)"} → {change.current_status}
      </td>
    </tr>
  );
}

// Renders the sources GET /alerts, /changes, or /summary reported as
// unreadable — distinct from "currently zero" so a real D1 outage never
// reads as a clean bill of health (FR-010 / spec.md Edge Cases bullet 2).
function UnavailableSourcesNotice(
  { sources }: { sources: UnavailableSource[] },
): JSX.Element | null {
  if (sources.length === 0) return null;
  return (
    <div
      style={{
        marginBottom: 12,
        padding: "8px 12px",
        border: "1px solid var(--status-critical-fg)",
        borderRadius: 4,
        color: "var(--status-critical-fg)",
        fontSize: "var(--text-body-size)",
      }}
    >
      {sources.map((s) => (
        <div key={`${s.module}/${s.kind}`}>
          {s.module}/{s.kind} data not available — {s.error}
        </div>
      ))}
    </div>
  );
}

function SummaryRow(
  { entry, unavailable }: { entry: PostureSummaryEntry; unavailable: boolean },
): JSX.Element {
  return (
    <tr style={{ borderTop: "1px solid var(--rule-hairline)" }}>
      <td
        style={{
          padding: "8px 0",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {entry.module}/{entry.kind}
      </td>
      <td style={{ padding: "8px 0", fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
        {unavailable
          ? <span style={{ color: "var(--status-critical-fg)" }}>(not available)</span>
          : entry.has_data
          ? (
            `${entry.counts.safe} safe · ${entry.counts.warning} warning · ${entry.counts.critical} critical · ${entry.counts.not_evaluated} not evaluated`
          )
          : <span style={{ color: "var(--fg-faint)" }}>no data yet</span>}
      </td>
    </tr>
  );
}

export function AuditInventory(): JSX.Element {
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changesData, setChangesData] = useState<ChangesResponse | null>(null);
  const [changesError, setChangesError] = useState<string | null>(null);
  const [summaryData, setSummaryData] = useState<SummaryResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    fetchAlerts()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load audit alerts")
      );
    fetchChanges()
      .then(setChangesData)
      .catch((err: unknown) =>
        setChangesError(err instanceof Error ? err.message : "failed to load audit changes")
      );
    fetchSummary()
      .then(setSummaryData)
      .catch((err: unknown) =>
        setSummaryError(err instanceof Error ? err.message : "failed to load audit summary")
      );
  }, []);

  function handleAcknowledged(id: string) {
    setData((prev) => prev && { ...prev, alerts: prev.alerts.filter((a) => a.id !== id) });
  }

  if (error) {
    return <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>;
  }

  if (!data) {
    return <p style={{ color: "var(--fg-muted)" }}>Loading audit inbox…</p>;
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
        Audit & Drift
      </h1>

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
          Unified alerts inbox
        </h2>
        <UnavailableSourcesNotice sources={data.unavailable_sources} />
        {data.alerts.length === 0
          ? <p style={{ color: "var(--fg-muted)" }}>No outstanding alerts across any module.</p>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {data.alerts.map((a) => (
                  <AlertRow key={a.id} alert={a} onAcknowledged={handleAcknowledged} />
                ))}
              </tbody>
            </table>
          )}
      </section>

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
          What changed
        </h2>
        {changesData && <UnavailableSourcesNotice sources={changesData.unavailable_sources} />}
        {changesError
          ? <p style={{ color: "var(--status-critical-fg)" }}>{changesError}</p>
          : !changesData
          ? <p style={{ color: "var(--fg-muted)" }}>Loading changes…</p>
          : changesData.changes.length === 0
          ? (
            <p style={{ color: "var(--fg-muted)" }}>
              No status changes since {changesData.since}.
            </p>
          )
          : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {changesData.changes.map((c) => (
                  <ChangeRow key={`${c.module}/${c.kind}/${c.entity_label}`} change={c} />
                ))}
              </tbody>
            </table>
          )}
      </section>

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
          Account-wide posture summary
        </h2>
        {summaryData && <UnavailableSourcesNotice sources={summaryData.unavailable_sources} />}
        {summaryError
          ? <p style={{ color: "var(--status-critical-fg)" }}>{summaryError}</p>
          : !summaryData
          ? <p style={{ color: "var(--fg-muted)" }}>Loading summary…</p>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {summaryData.modules.map((entry) => {
                  const unavailable = summaryData.unavailable_sources.some(
                    (s) => s.module === entry.module && s.kind === entry.kind,
                  );
                  return (
                    <SummaryRow
                      key={`${entry.module}/${entry.kind}`}
                      entry={entry}
                      unavailable={unavailable}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
      </section>
    </div>
  );
}
