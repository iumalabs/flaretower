import { useEffect, useState } from "react";
import type { JSX } from "react";
import { ExposureInventory } from "./pages/ExposureInventory.tsx";
import { WorkersDashboardPage } from "./pages/WorkersDashboardPage.tsx";
import { DnsInventory } from "./pages/DnsInventory.tsx";
import { ZeroTrustInventory } from "./pages/ZeroTrustInventory.tsx";
import { PagesInventory } from "./pages/PagesInventory.tsx";
import { StorageInventory } from "./pages/StorageInventory.tsx";
import { SecurityPostureInventory } from "./pages/SecurityPostureInventory.tsx";
import { AuditInventory } from "./pages/AuditInventory.tsx";
import { OverviewPage } from "./pages/OverviewPage.tsx";
import { TokenToolsPage } from "./pages/TokenToolsPage.tsx";
import { WorkerDetailPage } from "./pages/WorkerDetailPage.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { PageErrorBoundary } from "./components/PageErrorBoundary.tsx";
import { NAV_ITEMS } from "./nav-items.ts";
import {
  type AuditSummaryModuleEntry,
  computeModuleBadgeCounts,
} from "./lib/module-badge-counts.ts";

const PAGES = [
  // onNavigateToAudit is a no-op here — this entry's render() is never
  // actually invoked (the JSX below special-cases "overview" so it gets
  // the real setPage-backed callback instead); this placeholder only
  // exists to satisfy OverviewPage's required prop for the type checker.
  {
    key: "overview",
    label: "Overview",
    render: () => <OverviewPage onNavigateToAudit={() => {}} />,
  },
  // render() here is never actually invoked (specs/023-worker-detail-page) —
  // the JSX below special-cases "workers" the same way it already
  // special-cases "overview", so its page/sort state and onSelectWorker
  // callback can be lifted up here instead of local to the page (FR-011:
  // state must survive navigating to a Worker's detail page and back). This
  // placeholder only exists to satisfy WorkersDashboardPage's required props
  // for the type checker.
  {
    key: "workers",
    label: "Workers",
    render: () => (
      <WorkersDashboardPage
        page={1}
        sortKey={null}
        sortDir={1}
        onPageChange={() => {}}
        onSortChange={() => {}}
        onSelectWorker={() => {}}
      />
    ),
  },
  { key: "exposure", label: "Exposure", render: () => <ExposureInventory /> },
  { key: "dns", label: "DNS", render: () => <DnsInventory /> },
  { key: "zero-trust", label: "Zero Trust", render: () => <ZeroTrustInventory /> },
  { key: "pages", label: "Pages", render: () => <PagesInventory /> },
  { key: "storage", label: "R2 / KV / D1", render: () => <StorageInventory /> },
  { key: "security", label: "Security Posture", render: () => <SecurityPostureInventory /> },
  { key: "audit", label: "Audit & Drift", render: () => <AuditInventory /> },
  { key: "token-tools", label: "Token Tools", render: () => <TokenToolsPage /> },
] as const;

// "worker-detail" is deliberately not a PAGES entry (it has no sidebar nav
// item and no render() to fall back to) — always reached via the explicit
// special-case below, never via `active.render()`.
type PageKey = typeof PAGES[number]["key"] | "worker-detail";

async function fetchModuleBadges(): Promise<AuditSummaryModuleEntry[]> {
  const res = await fetch("/api/audit/summary");
  if (!res.ok) {
    throw new Error(`GET /api/audit/summary failed: ${res.status}`);
  }
  const body = await res.json() as { modules: AuditSummaryModuleEntry[] };
  return body.modules;
}

// The Workers nav item's badge is a deployed-Worker count, not a critical
// finding count — it has no place in /api/audit/summary's per-module
// critical-count rollup (computeModuleBadgeCounts), so it's fetched and
// merged into the same `badges` list separately (nav-items.ts's
// `badgeTone: "neutral"` is what keeps it from rendering in critical-red).
async function fetchWorkersDeployedCount(): Promise<number> {
  const res = await fetch("/api/workers/dashboard");
  if (!res.ok) {
    throw new Error(`GET /api/workers/dashboard failed: ${res.status}`);
  }
  const body = await res.json() as { summary: { deployed_count: number } };
  return body.summary.deployed_count;
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

  // specs/023-worker-detail-page (FR-011, data-model.md's Frontend
  // navigation state) — lifted out of WorkersDashboardPage so navigating to
  // a Worker's detail page and back preserves the table's page/sort state
  // instead of it resetting on remount.
  const [workersPage, setWorkersPage] = useState(1);
  const [workersSortKey, setWorkersSortKey] = useState<string | null>(null);
  const [workersSortDir, setWorkersSortDir] = useState<1 | -1>(1);
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);

  function handleWorkersSortChange(key: string) {
    if (workersSortKey === key) {
      setWorkersSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setWorkersSortKey(key);
      setWorkersSortDir(1);
    }
    setWorkersPage(1);
  }

  function handleSelectWorker(workerName: string) {
    setSelectedWorker(workerName);
    setPage("worker-detail");
  }

  function handleBackFromWorkerDetail() {
    setSelectedWorker(null);
    setPage("workers");
  }

  useEffect(() => {
    // Both badge sources merge via functional updates (each replacing only
    // its own keys) rather than either setBadges() call overwriting the
    // other outright — the two fetches race, and a plain replacement would
    // let whichever resolves last silently wipe out the other's badge.
    fetchModuleBadges()
      .then((modules) =>
        setBadges((prev) => [
          ...prev.filter((b) => b.key === "workers"),
          ...computeModuleBadgeCounts(modules).map((b) => ({
            key: b.module,
            count: b.criticalCount,
          })),
        ])
      )
      // Sidebar badges are advisory, not load-bearing — a failure to fetch
      // the account-wide summary must not block the rest of the app from
      // rendering (mirrors every module page's own resilient-degradation
      // convention), so this just leaves the critical-count badges empty
      // rather than surfacing an error banner for a non-critical enhancement.
      .catch(() => setBadges((prev) => prev.filter((b) => b.key === "workers")));

    fetchWorkersDeployedCount()
      .then((count) =>
        setBadges((prev) => [...prev.filter((b) => b.key !== "workers"), { key: "workers", count }])
      )
      // Same resilient-degradation convention as fetchModuleBadges above —
      // advisory, not load-bearing.
      .catch(() => {});
  }, []);

  return (
    <div style={{ display: "flex" }}>
      <Sidebar
        items={NAV_ITEMS}
        activeKey={page}
        onSelect={(key) => setPage(key as PageKey)}
        badges={badges}
        footer={{ version: __APP_VERSION__ ? `v${__APP_VERSION__} · self-hosted` : "self-hosted" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <PageErrorBoundary key={page}>
          {
            // specs/022-audit-list-pagination — Overview's "N more" links need
            // to reach Audit & Drift; it's the only page needing a navigation
            // callback, so it's special-cased here rather than widening every
            // PAGES entry's render() signature for one caller.
            page === "overview"
              ? <OverviewPage onNavigateToAudit={() => setPage("audit")} />
              // specs/023-worker-detail-page — "workers" needs its
              // page/sort state lifted (FR-011) and an onSelectWorker
              // callback; "worker-detail" isn't a PAGES entry at all.
              : page === "workers"
              ? (
                <WorkersDashboardPage
                  page={workersPage}
                  sortKey={workersSortKey}
                  sortDir={workersSortDir}
                  onPageChange={setWorkersPage}
                  onSortChange={handleWorkersSortChange}
                  onSelectWorker={handleSelectWorker}
                />
              )
              : page === "worker-detail"
              ? (
                <WorkerDetailPage
                  workerName={selectedWorker ?? ""}
                  onBack={handleBackFromWorkerDetail}
                />
              )
              : active.render()
          }
        </PageErrorBoundary>
      </div>
    </div>
  );
}
