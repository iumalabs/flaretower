import { useState } from "react";
import type { JSX } from "react";
import { ExposureInventory } from "./pages/ExposureInventory.tsx";
import { DnsInventory } from "./pages/DnsInventory.tsx";
import { ZeroTrustInventory } from "./pages/ZeroTrustInventory.tsx";
import { PagesInventory } from "./pages/PagesInventory.tsx";
import { StorageInventory } from "./pages/StorageInventory.tsx";
import { SecurityPostureInventory } from "./pages/SecurityPostureInventory.tsx";
import { AuditInventory } from "./pages/AuditInventory.tsx";

const PAGES = [
  { key: "exposure", label: "Workers & Access", render: () => <ExposureInventory /> },
  { key: "dns", label: "DNS", render: () => <DnsInventory /> },
  { key: "zero-trust", label: "Zero Trust", render: () => <ZeroTrustInventory /> },
  { key: "pages", label: "Pages", render: () => <PagesInventory /> },
  { key: "storage", label: "R2 / KV / D1", render: () => <StorageInventory /> },
  { key: "security", label: "Security Posture", render: () => <SecurityPostureInventory /> },
  { key: "audit", label: "Audit & Drift", render: () => <AuditInventory /> },
] as const;

type PageKey = typeof PAGES[number]["key"];

// Minimal state-based nav — no router dependency yet. Revisit once enough
// modules land that a real router earns its keep (constitution Principle
// IV/V's minimal-dependency spirit applies to the frontend too).
export function App(): JSX.Element {
  const [page, setPage] = useState<PageKey>("exposure");
  const active = PAGES.find((p) => p.key === page) ?? PAGES[0];

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
        {PAGES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPage(p.key)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              color: page === p.key ? "var(--brand-primary)" : "var(--fg-faint)",
              font: "inherit",
            }}
          >
            {p.label}
          </button>
        ))}
      </nav>
      {active.render()}
    </div>
  );
}
