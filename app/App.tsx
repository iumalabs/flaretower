import { useState } from "react";
import type { JSX } from "react";
import { ExposureInventory } from "./pages/ExposureInventory.tsx";
import { DnsInventory } from "./pages/DnsInventory.tsx";

type Page = "exposure" | "dns";

// Minimal state-based nav — no router dependency yet. Revisit once enough
// modules land that a real router earns its keep (constitution Principle
// IV/V's minimal-dependency spirit applies to the frontend too).
export function App(): JSX.Element {
  const [page, setPage] = useState<Page>("exposure");

  return (
    <div>
      <nav
        style={{
          display: "flex",
          gap: 16,
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          marginBottom: 16,
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-label-size)",
          letterSpacing: "var(--text-label-ls)",
          textTransform: "uppercase",
        }}
      >
        <button
          type="button"
          onClick={() => setPage("exposure")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            color: page === "exposure" ? "var(--brand-primary)" : "var(--fg-faint)",
            font: "inherit",
          }}
        >
          Workers &amp; Access
        </button>
        <button
          type="button"
          onClick={() => setPage("dns")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            color: page === "dns" ? "var(--brand-primary)" : "var(--fg-faint)",
            font: "inherit",
          }}
        >
          DNS
        </button>
      </nav>
      {page === "exposure" ? <ExposureInventory /> : <DnsInventory />}
    </div>
  );
}
