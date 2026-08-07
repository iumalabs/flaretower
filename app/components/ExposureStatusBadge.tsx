import type { JSX } from "react";

export type ExposureStatus = "safe" | "warning" | "critical" | "not_evaluated";

// Status is carried by shape as well as color (design system's own
// "shape carries the state" greyscale test) — never color alone, so the
// badge stays legible for color-blind operators and in monochrome contexts.
const SHAPES: Record<ExposureStatus, JSX.Element> = {
  critical: <path d="M6 0.8 L11.2 10.4 L0.8 10.4 Z" />, // triangle
  warning: <path d="M6 0.6 L11.4 6 L6 11.4 L0.6 6 Z" />, // diamond
  safe: <circle cx="6" cy="6" r="5.4" />, // circle
  not_evaluated: <rect x="0.6" y="4.8" width="10.8" height="2.4" />, // bar
};

const LABELS: Record<ExposureStatus, string> = {
  critical: "CRITICAL",
  warning: "WARNING",
  safe: "PROTECTED",
  not_evaluated: "N/A",
};

const COLOR_VAR: Record<ExposureStatus, string> = {
  critical: "var(--status-critical-fg)",
  warning: "var(--status-warning)",
  safe: "var(--status-safe)",
  not_evaluated: "var(--status-neutral)",
};

const BG_VAR: Record<ExposureStatus, string> = {
  critical: "var(--status-critical-bg)",
  warning: "var(--status-warning-bg)",
  safe: "var(--status-safe-bg)",
  not_evaluated: "var(--status-neutral-bg)",
};

const BORDER_VAR: Record<ExposureStatus, string> = {
  critical: "var(--status-critical-border)",
  warning: "var(--status-warning-border)",
  safe: "var(--status-safe-border)",
  not_evaluated: "var(--status-neutral-border)",
};

export function ExposureStatusBadge({ status }: { status: ExposureStatus }): JSX.Element {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 8px",
        borderRadius: 4,
        background: BG_VAR[status],
        border: `1px solid ${BORDER_VAR[status]}`,
        color: COLOR_VAR[status],
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-label-size)",
        fontWeight: "var(--text-label-weight)" as unknown as number,
        letterSpacing: "var(--text-label-ls)",
        textTransform: "uppercase",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill={COLOR_VAR[status]} aria-hidden="true">
        {SHAPES[status]}
      </svg>
      {LABELS[status]}
    </span>
  );
}
