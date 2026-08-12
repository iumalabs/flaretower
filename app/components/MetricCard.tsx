import type { JSX } from "react";

export interface MetricCardProps {
  label: string;
  // `null` renders the "not available" state (worker/modules'
  // FR-007-style degradation convention) instead of a fabricated value.
  value: string | number | null;
  context?: string;
  notAvailableLabel?: string;
}

// The repeated metric-card row pattern shared across the design's new
// per-module dashboards (§08-§14) — label, large value, small context
// line. Kept generic/presentational (no data-fetching, no module-specific
// knowledge) so specs 013-018 reuse this unchanged rather than each
// building their own (plan.md's Structure Decision).
export function MetricCard(
  { label, value, context, notAvailableLabel = "not available" }: MetricCardProps,
): JSX.Element {
  const unavailable = value === null;
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        border: "1px solid var(--border)",
        background: "var(--bg-canvas)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-label-size)",
          letterSpacing: "var(--text-label-ls)",
          color: "var(--fg-faint)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: unavailable ? "var(--text-code-size)" : "var(--text-display-size)",
          fontWeight: unavailable ? 400 : ("var(--text-display-weight)" as unknown as number),
          color: unavailable ? "var(--fg-faint)" : "var(--fg-primary)",
          fontStyle: unavailable ? "italic" : "normal",
        }}
      >
        {unavailable ? notAvailableLabel : value}
      </div>
      {context && !unavailable && (
        <div style={{ fontSize: "var(--text-meta-size)", color: "var(--fg-faint)" }}>
          {context}
        </div>
      )}
    </div>
  );
}
