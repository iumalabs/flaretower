import type { JSX } from "react";
import { Logo } from "../components/Logo.tsx";

// spec 028 (tasks.md T012 routing target) — public, reachable regardless of
// session state. This is a minimal placeholder for the MVP PR (T006/T012
// only need /docs to exist and route correctly); the full 9-section content
// sourced from README.md/nav-items.ts (tasks.md Phase 5, T014-T023) is an
// explicitly agreed follow-up PR, not part of this one.
export function DocumentationPage(
  { onSignIn, onBack }: { onSignIn: () => void; onBack: () => void },
): JSX.Element {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--fg-primary)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-canvas)",
        }}
      >
        <div
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <button
            type="button"
            onClick={onBack}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
            aria-label="Back to home"
          >
            <Logo variant="lockup" size={22} />
          </button>
          <button
            type="button"
            onClick={onSignIn}
            style={{
              background: "var(--brand-primary)",
              color: "var(--bg-base)",
              border: "none",
              padding: "7px 14px",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-label-size)",
              letterSpacing: "var(--text-label-ls)",
            }}
          >
            SIGN IN
          </button>
        </div>
      </header>
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "56px 24px" }}>
        <h1 style={{ fontSize: 32, fontWeight: 600, margin: "0 0 16px" }}>Documentation</h1>
        <p style={{ color: "var(--fg-muted)", lineHeight: 1.6, margin: "0 0 12px" }}>
          Full setup and usage documentation is coming to this page shortly. In the meantime, see
          the project README for installation, deployment, and Cloudflare Access configuration
          steps.
        </p>
        <a
          href="https://github.com/iumalabs/flaretower#readme"
          style={{ color: "var(--brand-primary)" }}
        >
          github.com/iumalabs/flaretower
        </a>
      </main>
    </div>
  );
}
