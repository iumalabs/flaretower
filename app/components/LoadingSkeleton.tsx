import type { JSX } from "react";

interface LoadingSkeletonProps {
  rows?: number;
  label?: string;
}

// Shimmer-animated placeholder rows (docs/design.zip's "LOADING STATE"
// pattern, ftShimmer keyframe) — replaces every module page's previous
// plain-text "Loading…" message. The keyframe itself is defined once,
// globally, in app/styles/tokens.css (ft-shimmer) rather than per-
// component, since every instance of this component needs the same
// animation.
export function LoadingSkeleton({ rows = 5, label }: LoadingSkeletonProps): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          padding: "0 0 10px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ width: "34%", height: 9, background: "var(--surface-3)" }} />
        <div style={{ width: "26%", height: 9, background: "var(--surface-3)" }} />
        <div style={{ width: "18%", height: 9, background: "var(--surface-3)" }} />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            padding: "11px 0",
            borderBottom: "1px solid var(--rule-hairline)",
            animation: "ft-shimmer 1.6s ease-in-out infinite",
            animationDelay: `${i * 0.12}s`,
          }}
        >
          <div
            style={{ width: `${22 + (i % 3) * 4}%`, height: 10, background: "var(--surface-3)" }}
          />
          <div
            style={{ width: `${26 + (i % 3) * 4}%`, height: 10, background: "var(--surface-3)" }}
          />
          <div
            style={{ width: `${16 + (i % 3) * 4}%`, height: 10, background: "var(--surface-3)" }}
          />
          <div
            style={{ width: 52, height: 16, background: "var(--surface-3)", marginLeft: "auto" }}
          />
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 12 }}>
        <div style={{ position: "relative", width: 7, height: 7 }}>
          <div style={{ position: "absolute", inset: 0, background: "var(--brand-primary)" }} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "var(--brand-primary)",
              animation: "ft-pulse 1.8s ease-out infinite",
            }}
          />
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-code-size)",
            color: "var(--fg-muted)",
          }}
        >
          {label ?? "Loading…"}
        </div>
      </div>
    </div>
  );
}
