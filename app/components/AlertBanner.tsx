import type { JSX } from "react";

export interface AlertBannerFinding {
  severity: "critical" | "warning";
  title: string;
  target: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface AlertBannerProps {
  finding: AlertBannerFinding;
  scope: "module" | "account";
}

const CRITICAL = {
  bg: "var(--status-critical-bg)",
  border: "var(--status-critical-border)",
  titleColor: "var(--status-critical-fg)",
  bodyColor: "var(--status-critical-fg)",
  btnBg: "var(--status-critical)",
  btnColor: "var(--bg-base)",
};

const WARNING = {
  bg: "transparent",
  border: "var(--status-warning-border)",
  titleColor: "var(--status-warning)",
  bodyColor: "var(--fg-muted)",
  btnBg: "transparent",
  btnColor: "var(--fg-muted)",
};

// The account/module-scope critical banner (docs/design.zip's
// "ALERT BANNER" component pattern) — surfaces the single most urgent
// finding above a FindingsTable or on the Overview page. `scope` only
// changes the copy prefix, not the visual treatment (the design source
// uses the identical banner shape for both contexts).
export function AlertBanner({ finding, scope }: AlertBannerProps): JSX.Element {
  const c = finding.severity === "critical" ? CRITICAL : WARNING;
  const prefix = scope === "account" ? "This account" : "This module";

  return (
    <div
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderLeft: `3px solid ${c.border}`,
        padding: finding.severity === "critical" ? "14px 16px" : "12px 16px",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ fontSize: "var(--text-body-size)", fontWeight: 600, color: c.titleColor }}>
          {finding.title}
        </div>
        <div style={{ fontSize: "var(--text-code-size)", color: c.bodyColor, lineHeight: 1.55 }}>
          {prefix}: <span style={{ fontFamily: "var(--font-mono)" }}>{finding.target}</span>
          {" — "}
          {finding.description}
        </div>
        {finding.actionLabel && finding.onAction && (
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button
              type="button"
              onClick={finding.onAction}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-label-size)",
                letterSpacing: "0.06em",
                background: c.btnBg,
                color: c.btnColor,
                border: finding.severity === "warning" ? `1px solid ${c.border}` : "none",
                padding: "5px 10px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {finding.actionLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
