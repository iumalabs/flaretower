import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus } from "../components/ExposureStatusBadge.tsx";
import {
  FindingsTable,
  type FindingsTableColumn,
  type FindingsTableRow,
} from "../components/FindingsTable.tsx";
import { AlertBanner } from "../components/AlertBanner.tsx";

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

interface FlatAlert {
  alert: UnifiedAlert;
  onAcknowledged: (id: string) => void;
}

function AcknowledgeButton({ alert, onAcknowledged }: FlatAlert): JSX.Element {
  const [pending, setPending] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);

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
    <div style={{ textAlign: "right" }}>
      <button
        type="button"
        onClick={handleAcknowledge}
        disabled={pending}
        style={{
          background: "none",
          border: "1px solid var(--border)",
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
    </div>
  );
}

const ALERT_COLUMNS: (onAcknowledged: (id: string) => void) => FindingsTableColumn<UnifiedAlert>[] =
  (
    onAcknowledged,
  ) => [
    {
      key: "entity",
      label: "Entity",
      sortValue: (a) => a.entity_label,
      render: (a) => (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-code-size)",
            color: "var(--fg-secondary)",
          }}
        >
          {a.entity_label}
          <span style={{ color: "var(--fg-faint)" }}>· {a.module}/{a.kind}</span>
        </span>
      ),
    },
    {
      key: "change",
      label: "Change",
      render: (a) => (
        <span style={{ fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
          {a.previous_status ?? "(new)"} → {a.new_status} · {a.detected_at}
        </span>
      ),
    },
    {
      key: "action",
      label: "",
      width: "140px",
      render: (a) => <AcknowledgeButton alert={a} onAcknowledged={onAcknowledged} />,
    },
  ];

const CHANGE_COLUMNS: FindingsTableColumn<ChangeEntry>[] = [
  {
    key: "entity",
    label: "Entity",
    sortValue: (c) => c.entity_label,
    render: (c) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {c.entity_label}
        <span style={{ color: "var(--fg-faint)" }}>· {c.module}/{c.kind}</span>
      </span>
    ),
  },
  {
    key: "change",
    label: "Change",
    render: (c) => (
      <span style={{ fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
        {c.previous_status ?? "(new)"} → {c.current_status}
      </span>
    ),
  },
];

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

  const alertRows: FindingsTableRow<UnifiedAlert>[] | null = data
    ? data.alerts.map((a) => ({ id: a.id, status: a.new_status, data: a }))
    : null;
  const changeRows: FindingsTableRow<ChangeEntry>[] | null = changesData
    ? changesData.changes.map((c) => ({
      id: `${c.module}/${c.kind}/${c.entity_label}`,
      status: c.current_status,
      data: c,
    }))
    : changesError
    ? []
    : null;

  // The single most urgent outstanding alert, account-wide (FR-013,
  // US3/AC3 for the future Overview page's own banner — this module page
  // gets the same treatment for its own unacknowledged alerts today).
  const criticalAlert = alertRows?.find((r) => r.status === "critical");

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

      {criticalAlert && (
        <AlertBanner
          scope="account"
          finding={{
            severity: "critical",
            title: "An outstanding critical alert needs attention",
            target:
              `${criticalAlert.data.module}/${criticalAlert.data.kind} · ${criticalAlert.data.entity_label}`,
            description: `${
              criticalAlert.data.previous_status ?? "(new)"
            } → ${criticalAlert.data.new_status} · ${criticalAlert.data.detected_at}`,
          }}
        />
      )}

      <SectionHeading>Unified alerts inbox</SectionHeading>
      {data && <UnavailableSourcesNotice sources={data.unavailable_sources} />}
      <FindingsTable
        columns={ALERT_COLUMNS(handleAcknowledged)}
        rows={alertRows}
        loadingLabel="Loading audit inbox…"
        emptyState={{
          heading: "No outstanding alerts",
          description: "Every module's alerts are either resolved or acknowledged.",
        }}
      />

      <SectionHeading>What changed</SectionHeading>
      {changesData && <UnavailableSourcesNotice sources={changesData.unavailable_sources} />}
      {changesError
        ? <p style={{ color: "var(--status-critical-fg)" }}>{changesError}</p>
        : (
          <FindingsTable
            columns={CHANGE_COLUMNS}
            rows={changeRows}
            loadingLabel="Loading changes…"
            emptyState={{
              heading: "No status changes",
              description: changesData
                ? `No status changes since ${changesData.since}.`
                : "No status changes in the observed window.",
            }}
          />
        )}

      <SectionHeading>Account-wide posture summary</SectionHeading>
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
    </div>
  );
}
