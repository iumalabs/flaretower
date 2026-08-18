import type { JSX } from "react";
import type { ExposureStatus } from "./ExposureStatusBadge.tsx";

export interface RoutePolicyData {
  app_id: string;
  app_name: string | null;
  app_domain: string;
  policy_rules: { verb: "ALLOW" | "REQUIRE" | "DENY"; label: string }[][];
}

// Same verb/color convention as app/pages/ZeroTrustInventory.tsx's own
// PolicyDetailPanel — this renders the identical policy_rules shape for
// whichever application covers this specific route, not a re-derivation.
const VERB_COLOR: Record<"ALLOW" | "REQUIRE" | "DENY", string> = {
  ALLOW: "var(--status-safe)",
  REQUIRE: "var(--brand-primary)",
  DENY: "var(--status-critical-fg)",
};

export function RoutePolicy(
  { policy, status }: { policy: RoutePolicyData | null; status: ExposureStatus },
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
