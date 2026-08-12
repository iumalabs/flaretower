import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus } from "../components/ExposureStatusBadge.tsx";
import {
  FindingsTable,
  type FindingsTableColumn,
  type FindingsTableRow,
} from "../components/FindingsTable.tsx";
import { AlertBanner } from "../components/AlertBanner.tsx";

interface AppFinding {
  app_id: string;
  app_domain: string;
  status: ExposureStatus;
  reason: string;
}

interface TokenFinding {
  token_id: string;
  token_name: string;
  expires_at: string | null;
  status: ExposureStatus;
  reason: string;
}

interface ZeroTrustInventoryResponse {
  run_id: string | null;
  evaluated_at: string | null;
  applications: AppFinding[];
  service_tokens: TokenFinding[];
}

async function fetchZeroTrustInventory(): Promise<ZeroTrustInventoryResponse> {
  const res = await fetch("/api/zero-trust/inventory");
  if (!res.ok) {
    throw new Error(`GET /api/zero-trust/inventory failed: ${res.status}`);
  }
  return await res.json();
}

const APP_COLUMNS: FindingsTableColumn<AppFinding>[] = [
  {
    key: "domain",
    label: "Domain",
    sortValue: (r) => r.app_domain,
    render: (r) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-secondary)",
        }}
      >
        {r.app_domain}
        <span style={{ color: "var(--fg-faint)" }}>· {r.app_id}</span>
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

export function ZeroTrustInventory(): JSX.Element {
  const [data, setData] = useState<ZeroTrustInventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchZeroTrustInventory()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load Zero Trust inventory")
      );
  }, []);

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
        <p style={{ color: "var(--fg-muted)" }}>
          No evaluation runs yet. Trigger one via <code>POST /api/zero-trust/evaluate</code>.
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

  // The single most urgent finding across both sections (FR-013) —
  // applications checked first, since an open Access application is a
  // higher-severity exposure class than an expired token.
  const criticalApp = appRows?.find((r) => r.status === "critical");
  const criticalToken = tokenRows?.find((r) => r.status === "critical");

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
        Zero Trust inventory
      </h1>
      {data && (
        <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
          Last evaluated {data.evaluated_at} · run {data.run_id}
        </p>
      )}

      {(criticalApp || criticalToken) && (
        <AlertBanner
          scope="module"
          finding={criticalApp
            ? {
              severity: "critical",
              title: "An Access application has no effective policy",
              target: criticalApp.data.app_domain,
              description: criticalApp.data.reason,
            }
            : {
              severity: "critical",
              title: "A service token needs attention",
              target: criticalToken!.data.token_name,
              description: criticalToken!.data.reason,
            }}
        />
      )}

      <SectionHeading>Access applications</SectionHeading>
      <FindingsTable
        columns={APP_COLUMNS}
        rows={appRows}
        loadingLabel="Loading applications…"
        emptyState={{
          heading: "No Access applications",
          description: "This account has no Access applications configured.",
        }}
      />

      <SectionHeading>Service tokens</SectionHeading>
      <FindingsTable
        columns={TOKEN_COLUMNS}
        rows={tokenRows}
        loadingLabel="Loading service tokens…"
        emptyState={{
          heading: "No service tokens",
          description: "This account has no service tokens configured.",
        }}
      />
    </div>
  );
}
