import { useEffect, useState } from "react";
import type { JSX } from "react";
import { ExposureInventory } from "./pages/ExposureInventory.tsx";
import { DnsInventory } from "./pages/DnsInventory.tsx";
import { ZeroTrustInventory } from "./pages/ZeroTrustInventory.tsx";
import { PagesInventory } from "./pages/PagesInventory.tsx";
import { StorageInventory } from "./pages/StorageInventory.tsx";
import { SecurityPostureInventory } from "./pages/SecurityPostureInventory.tsx";
import { AuditInventory } from "./pages/AuditInventory.tsx";
import { OverviewPage } from "./pages/OverviewPage.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { NAV_ITEMS } from "./nav-items.ts";
import {
  type AuditSummaryModuleEntry,
  computeModuleBadgeCounts,
} from "./lib/module-badge-counts.ts";

const PAGES = [
  { key: "overview", label: "Overview", render: () => <OverviewPage /> },
  { key: "exposure", label: "Workers & Access", render: () => <ExposureInventory /> },
  { key: "dns", label: "DNS", render: () => <DnsInventory /> },
  { key: "zero-trust", label: "Zero Trust", render: () => <ZeroTrustInventory /> },
  { key: "pages", label: "Pages", render: () => <PagesInventory /> },
  { key: "storage", label: "R2 / KV / D1", render: () => <StorageInventory /> },
  { key: "security", label: "Security Posture", render: () => <SecurityPostureInventory /> },
  { key: "audit", label: "Audit & Drift", render: () => <AuditInventory /> },
] as const;

type PageKey = typeof PAGES[number]["key"];

async function fetchModuleBadges(): Promise<AuditSummaryModuleEntry[]> {
  const res = await fetch("/api/audit/summary");
  if (!res.ok) {
    throw new Error(`GET /api/audit/summary failed: ${res.status}`);
  }
  const body = await res.json() as { modules: AuditSummaryModuleEntry[] };
  return body.modules;
}

// State-based nav — no router dependency yet (research.md §6 of
// specs/009-design-system-alignment: revisit once enough modules land
// that a real router earns its keep; constitution Principle IV/V's
// minimal-dependency spirit applies to the frontend too).
export function App(): JSX.Element {
  // "overview" is the default/initial page (tasks.md T033, User Story 3) —
  // "is anything wrong right now" answered before navigating anywhere.
  const [page, setPage] = useState<PageKey>("overview");
  const [badges, setBadges] = useState<{ key: string; count: number }[]>([]);
  const active = PAGES.find((p) => p.key === page) ?? PAGES[0];

  useEffect(() => {
    fetchModuleBadges()
      .then((modules) =>
        setBadges(
          computeModuleBadgeCounts(modules).map((b) => ({
            key: b.module,
            count: b.criticalCount,
          })),
        )
      )
      // Sidebar badges are advisory, not load-bearing — a failure to fetch
      // the account-wide summary must not block the rest of the app from
      // rendering (mirrors every module page's own resilient-degradation
      // convention), so this just leaves badges empty rather than surfacing
      // an error banner for a non-critical enhancement.
      .catch(() => setBadges([]));
  }, []);

  return (
    <div style={{ display: "flex" }}>
      <Sidebar
        items={NAV_ITEMS}
        activeKey={page}
        onSelect={(key) => setPage(key as PageKey)}
        badges={badges}
        footer={{ version: "self-hosted" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {active.render()}
      </div>
    </div>
  );
}
