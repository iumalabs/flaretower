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
          background: "none",
          border: "1px solid var(--border)",
          padding: "4px 10px",
          cursor: pending ? "default" : "pointer",
          color: "var(--fg-secondary)",
          font: "inherit",
          fontSize: "var(--text-body-size)",
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
