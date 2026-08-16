import { useEffect, useState } from "react";
import type { JSX } from "react";
import { type ExposureStatus, ExposureStatusBadge } from "../components/ExposureStatusBadge.tsx";
import { EmptyState } from "../components/EmptyState.tsx";

interface RouteEntry {
  hostname: string;
  kind: string;
  status: ExposureStatus;
  reason: string;
  policy: {
    app_id: string;
    app_name: string | null;
    app_domain: string;
    policy_rules: { verb: "ALLOW" | "REQUIRE" | "DENY"; label: string }[][];
  } | null;
}

interface RecentChange {
  occurred_at: string;
  actor: string;
  actor_source: string;
  action: string;
  target: string;
  result_summary: string | null;
}

interface WorkerDetailResponse {
  worker_name: string;
  environment: "production" | "preview";
  routes: RouteEntry[];
  recent_changes: RecentChange[];
  cloudflare_url: string;
  unavailable: Array<{ source: "policy" | "recent_changes"; error: string }>;
}

interface WorkerDetailPageProps {
  workerName: string;
  onBack: () => void;
}

// Same verb/color convention as app/pages/ZeroTrustInventory.tsx's own
// PolicyDetailPanel — this renders the identical policy_rules shape for
// whichever application covers this specific route, not a re-derivation.
const VERB_COLOR: Record<"ALLOW" | "REQUIRE" | "DENY", string> = {
  ALLOW: "var(--status-safe)",
  REQUIRE: "var(--brand-primary)",
  DENY: "var(--status-critical-fg)",
};

function RoutePolicy(
  { policy, status }: { policy: RouteEntry["policy"]; status: ExposureStatus },
): JSX.Element {
  if (!policy) {
    // issue #416: a `critical` route is the only case where `policy: null`
    // actually means "nothing covers this route" — the reason evaluate.ts
    // gives that status in the first place. Every other status (safe/
    // warning/not_evaluated) got here via a `reason` string that already
    // names a covering Access application (data-model.md) — a `null`
    // policy for one of those means the join just couldn't resolve it
    // right now (most commonly: the exposure evaluation run that produced
    // this route predates the covering_app_ids column being populated, or
    // the two modules' evaluation runs are momentarily out of step —
    // research.md §2), not that coverage doesn't exist. Saying "no policy
    // covers this route" in that case directly contradicts the reason text
    // shown one line above it.
    const message = status === "critical"
      ? "No Access application policy covers this route."
      : "Policy details unavailable for this route right now.";
    return (
      <div
        data-testid="route-policy-unavailable"
        style={{
          marginTop: 8,
          marginLeft: 24,
          fontSize: "var(--text-code-size)",
          color: "var(--fg-faint)",
        }}
      >
        {message}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8, marginLeft: 24, display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-label-size)",
          letterSpacing: "var(--text-label-ls)",
          color: "var(--fg-faint)",
          textTransform: "uppercase",
        }}
      >
        {policy.app_name ?? policy.app_id}
      </div>
      {policy.policy_rules.length === 0 && (
        <div style={{ color: "var(--fg-faint)", fontSize: "var(--text-code-size)" }}>
          No policies attached to this application.
        </div>
      )}
      {policy.policy_rules.map((lines, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            paddingTop: i > 0 ? 6 : 0,
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

async function fetchWorkerDetail(workerName: string): Promise<WorkerDetailResponse | "not_found"> {
  const res = await fetch(`/api/workers/${encodeURIComponent(workerName)}/detail`);
  if (res.status === 404) return "not_found";
  if (!res.ok) {
    throw new Error(`GET /api/workers/${workerName}/detail failed: ${res.status}`);
  }
  return await res.json();
}

export function WorkerDetailPage({ workerName, onBack }: WorkerDetailPageProps): JSX.Element {
  const [data, setData] = useState<WorkerDetailResponse | "not_found" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    fetchWorkerDetail(workerName)
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load Worker detail")
      );
  }, [workerName]);

  const backLink = (
    <button
      type="button"
      onClick={onBack}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-meta-size)",
        color: "var(--fg-faint)",
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        textDecoration: "underline",
      }}
    >
      ← Back to Workers
    </button>
  );

  if (error) {
    return (
      <div>
        {backLink}
        <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>
      </div>
    );
  }

  if (data === "not_found") {
    return (
      <div>
        {backLink}
        <EmptyState
          heading="Worker not found"
          description={`"${workerName}" was not found in the latest evaluation run. It may have been removed or renamed.`}
        />
      </div>
    );
  }

  return (
    <div>
      {backLink}
      <h1
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-display-size)",
          fontWeight: "var(--text-display-weight)" as unknown as number,
          letterSpacing: "var(--text-display-ls)",
          margin: "8px 0 4px",
        }}
      >
        {workerName}
      </h1>
      {data && (
        <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-meta-size)", marginTop: 0 }}>
          {data.environment} ·{" "}
          <a href={data.cloudflare_url} target="_blank" rel="noreferrer">
            Open in Cloudflare
          </a>
        </p>
      )}

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-label-size)",
          letterSpacing: "var(--text-label-ls)",
          color: "var(--fg-faint)",
          textTransform: "uppercase",
          margin: "20px 0 10px",
        }}
      >
        Routes
      </div>

      {data === null && <p style={{ color: "var(--fg-faint)" }}>Loading Worker detail…</p>}

      {data && data.routes.length === 0 && (
        <EmptyState
          heading="Exposure does not apply"
          description="This Worker has no public HTTP routes — no custom domain, workers.dev, or Preview URL."
        />
      )}

      {data && data.unavailable.some((u) => u.source === "policy") && (
        <p style={{ color: "var(--status-critical-fg)", fontSize: "var(--text-code-size)" }}>
          Access policy detail unavailable: {data.unavailable.find((u) =>
            u.source === "policy"
          )?.error}
        </p>
      )}

      {data && data.routes.length > 0 && (
        <div style={{ border: "1px solid var(--border)", background: "var(--bg-canvas)" }}>
          {data.routes.map((r) => (
            <div
              key={`${r.kind}:${r.hostname}`}
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--rule-hairline)",
                background: r.status === "critical" ? "var(--status-critical-row)" : "transparent",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <ExposureStatusBadge status={r.status} />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-code-size)",
                    color: "var(--fg-secondary)",
                    minWidth: 0,
                  }}
                >
                  {r.hostname}
                  <span style={{ color: "var(--fg-faint)" }}>· {r.kind}</span>
                </span>
                <span style={{ fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
                  {r.reason}
                </span>
              </div>
              <RoutePolicy policy={r.policy} status={r.status} />
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-label-size)",
              letterSpacing: "var(--text-label-ls)",
              color: "var(--fg-faint)",
              textTransform: "uppercase",
              margin: "20px 0 10px",
            }}
          >
            Recent changes
          </div>
          {data.unavailable.some((u) => u.source === "recent_changes")
            ? (
              <p
                data-testid="recent-changes-unavailable"
                style={{ color: "var(--status-critical-fg)", fontSize: "var(--text-code-size)" }}
              >
                Recent changes unavailable:{" "}
                {data.unavailable.find((u) => u.source === "recent_changes")?.error}
              </p>
            )
            : data.recent_changes.length === 0
            ? (
              <p style={{ color: "var(--fg-faint)", fontSize: "var(--text-code-size)" }}>
                No recent changes for this Worker.
              </p>
            )
            : (
              <div style={{ border: "1px solid var(--border)", background: "var(--bg-canvas)" }}>
                {data.recent_changes.map((c, i) => (
                  <div
                    key={`${c.occurred_at}-${i}`}
                    data-testid={`recent-change-${i}`}
                    style={{ padding: "10px 12px", borderBottom: "1px solid var(--rule-hairline)" }}
                  >
                    <div style={{ fontSize: "var(--text-body-size)", color: "var(--fg-primary)" }}>
                      {c.action}
                    </div>
                    <div
                      style={{
                        fontSize: "var(--text-meta-size)",
                        color: "var(--fg-faint)",
                        marginTop: 2,
                      }}
                    >
                      {c.actor} · {c.actor_source} · {c.occurred_at}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </>
      )}
    </div>
  );
}
