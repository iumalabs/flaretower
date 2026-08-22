import type { JSX } from "react";

interface RescanButtonProps {
  pending: boolean;
  error: string | null;
  onClick: () => void;
}

export function RescanButton({ pending, error, onClick }: RescanButtonProps): JSX.Element {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        style={{
          // issue #450 — this is the page-header toolbar's primary action,
          // matching Overview's and Workers' own RE-SCAN button styling
          // (brand-orange fill), not a secondary/ghost control.
          background: "var(--brand-primary)",
          color: "var(--bg-base)",
          border: "none",
          padding: "4px 10px",
          cursor: pending ? "default" : "pointer",
          font: "inherit",
          fontSize: "var(--text-body-size)",
          fontWeight: 600,
        }}
      >
        {pending ? "Scanning…" : "Re-scan"}
      </button>
      {error && (
        <div style={{ color: "var(--status-critical-fg)", fontSize: "var(--text-body-size)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
