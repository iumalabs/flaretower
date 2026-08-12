import type { JSX } from "react";
import { Logo } from "./Logo.tsx";

interface EmptyStateProps {
  heading: string;
  description: string;
  ctaLabel?: string;
  onCta?: () => void;
}

// The dimmed-logo/heading/description/CTA empty-state treatment
// (docs/design.zip's "EMPTY STATE" component pattern) — replaces every
// module page's previous plain-text "No evaluation runs yet" message.
export function EmptyState(
  { heading, description, ctaLabel, onCta }: EmptyStateProps,
): JSX.Element {
  return (
    <div
      style={{
        border: "1px dashed var(--border)",
        padding: "34px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        textAlign: "center",
      }}
    >
      <div style={{ opacity: 0.35 }}>
        <Logo variant="mono" theme="dark" size={26} />
      </div>
      <div
        style={{ fontSize: "var(--text-body-size)", fontWeight: 600, color: "var(--fg-primary)" }}
      >
        {heading}
      </div>
      <div
        style={{
          fontSize: "var(--text-code-size)",
          color: "var(--fg-faint)",
          maxWidth: 260,
          lineHeight: 1.6,
        }}
      >
        {description}
      </div>
      {ctaLabel && onCta && (
        <button
          type="button"
          onClick={onCta}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-code-size)",
            color: "var(--brand-primary)",
            border: "1px solid var(--brand-edge)",
            background: "var(--brand-wash)",
            padding: "6px 12px",
            marginTop: 4,
            letterSpacing: "0.06em",
            cursor: "pointer",
          }}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}
