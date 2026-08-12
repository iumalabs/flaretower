import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus } from "../components/ExposureStatusBadge.tsx";
import {
  FindingsTable,
  type FindingsTableColumn,
  type FindingsTableRow,
} from "../components/FindingsTable.tsx";
import { AlertBanner } from "../components/AlertBanner.tsx";

interface CheckFinding {
  status: ExposureStatus;
  reason: string;
}

interface ZoneFinding {
  zone_id: string;
  zone_name: string;
  ssl_tls: CheckFinding;
  dnssec?: CheckFinding;
  waf?: CheckFinding;
  rate_limiting?: CheckFinding;
}

interface TurnstileWidget {
  sitekey: string;
  name: string;
  domains: string[];
}

interface SecurityInventoryResponse {
  run_id: string | null;
  evaluated_at: string | null;
  zones: ZoneFinding[];
  // null = the Turnstile widgets list itself could not be fetched (e.g. a
  // scoped-down token, or a transient API error) — distinct from a
  // successfully fetched, confirmed-empty array. See
  // worker/modules/security/inventory.ts's SecurityInventory doc comment.
  turnstile_widgets: TurnstileWidget[] | null;
}

interface FlatCheck {
  zone_name: string;
  check: string;
  reason: string;
}

async function fetchSecurityInventory(): Promise<SecurityInventoryResponse> {
  const res = await fetch("/api/security/inventory");
  if (!res.ok) {
    throw new Error(`GET /api/security/inventory failed: ${res.status}`);
  }
  return await res.json();
}

const COLUMNS: FindingsTableColumn<FlatCheck>[] = [
  {
    key: "zone",
    label: "Zone",
    width: "24%",
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
    key: "check",
    label: "Check",
    width: "18%",
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {r.check}
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

const CHECK_LABEL: Record<string, string> = {
  ssl_tls: "SSL/TLS mode",
  dnssec: "DNSSEC",
  waf: "WAF",
  rate_limiting: "Rate limiting",
};

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

export function SecurityPostureInventory(): JSX.Element {
  const [data, setData] = useState<SecurityInventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSecurityInventory()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load security posture inventory")
      );
  }, []);

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
          Security posture inventory
        </h1>
        <p style={{ color: "var(--fg-muted)" }}>
          No evaluation runs yet. Trigger one via <code>POST /api/security/evaluate</code>.
        </p>
      </div>
    );
  }

  const rows: FindingsTableRow<FlatCheck>[] | null = data
    ? data.zones.flatMap((z) => {
      const checks: [string, CheckFinding | undefined][] = [
        ["ssl_tls", z.ssl_tls],
        ["dnssec", z.dnssec],
        ["waf", z.waf],
        ["rate_limiting", z.rate_limiting],
      ];
      return checks
        .filter((c): c is [string, CheckFinding] => c[1] !== undefined)
        .map(([kind, c]) => ({
          id: `${z.zone_id}:${kind}`,
          status: c.status,
          data: { zone_name: z.zone_name, check: CHECK_LABEL[kind], reason: c.reason },
        }));
    })
    : null;

  const criticalRow = rows?.find((r) => r.status === "critical");

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
        Security posture inventory
      </h1>
      {data && (
        <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
          Last evaluated {data.evaluated_at} · run {data.run_id}
        </p>
      )}

      {criticalRow && (
        <AlertBanner
          scope="module"
          finding={{
            severity: "critical",
            title: `${criticalRow.data.check} needs attention`,
            target: criticalRow.data.zone_name,
            description: criticalRow.data.reason,
          }}
        />
      )}

      <FindingsTable
        columns={COLUMNS}
        rows={rows}
        loadingLabel="Loading security posture inventory…"
        emptyState={{
          heading: "No zones in this account",
          description: "This account has no zones to evaluate.",
        }}
      />

      <SectionHeading>Turnstile widgets</SectionHeading>
      {data && data.turnstile_widgets === null
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
                {w.name} <span style={{ color: "var(--fg-faint)" }}>· {w.domains.join(", ")}</span>
              </li>
            ))}
          </ul>
        )
        : null}
    </div>
  );
}
