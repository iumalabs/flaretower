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
import { LandingPage } from "./pages/LandingPage.tsx";
import { DocumentationPage } from "./pages/DocumentationPage.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { PageErrorBoundary } from "./components/PageErrorBoundary.tsx";
import { Logo } from "./components/Logo.tsx";
import { NAV_ITEMS } from "./nav-items.ts";
import {
  type AuditSummaryModuleEntry,
  computeModuleBadgeCounts,
} from "./lib/module-badge-counts.ts";
import {
  pageForPath,
  pathForPage,
  pathForWorkerDetail,
  workerNameFromPath,
} from "./lib/page-routes.ts";
import { fetchSession, type SessionIdentity } from "./lib/session.ts";

const PAGES = [
  // onNavigateToAudit/onNavigateToModule are no-ops here — this entry's
  // render() is never actually invoked (the JSX below special-cases
  // "overview" so it gets the real navigate-backed callbacks instead);
  // this placeholder only exists to satisfy OverviewPage's required props
  // for the type checker.
  {
    key: "overview",
    label: "Overview",
    render: () => <OverviewPage onNavigateToAudit={() => {}} onNavigateToModule={() => {}} />,
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
// special-case below, never via `active.render()`. spec 028 — "docs" is the
// same: no sidebar item, no render() placeholder, always reached via its
// own top-level special-case in the return statement below (it doesn't
// render inside the authenticated Sidebar+content shell at all). There's
// no separate "landing" page key — the landing page and the authenticated
// Overview dashboard are two different things page==="overview" can render,
// picked by session state, not two different `page` values.
type PageKey = typeof PAGES[number]["key"] | "worker-detail" | "docs";

const NAV_KEYS = NAV_ITEMS.map((item) => item.key);

// spec 028 — "docs" is a real, public page-routes.ts key (see its own
// comment on "landing"/"docs"), included here so pageForPath()/popstate
// resolve /docs correctly instead of falling back to overview. "landing"
// is deliberately NOT in this list — it shares "/" with "overview" at the
// path level, and which of the two actually renders is a session-state
// decision made below, not a pathname-parsing one.
const ROUTABLE_KEYS = [...NAV_KEYS, "docs"];

// issue #495 — a full page load on /workers/<name> must land directly on
// that worker's detail page (with the right worker selected), not fall
// back to Overview the way a bare, unresolvable path already correctly
// does since #480. Checked before the generic pageForPath() resolution
// since /workers/<name> isn't one of ROUTABLE_KEYS' flat page keys.
function resolvePageFromLocation(): { page: PageKey; workerName: string | null } {
  const workerName = workerNameFromPath(globalThis.location.pathname);
  if (workerName) {
    return { page: "worker-detail", workerName };
  }
  return {
    page: pageForPath(globalThis.location.pathname, ROUTABLE_KEYS) as PageKey,
    workerName: null,
  };
}

// spec 028 (research.md §1/§2) — "/" itself becomes Access-public once
// this feature ships (excluded from the Access Application's protected-
// path coverage — see README.md's required manual deploy step), so it can
// no longer be the path "Sign in" targets: Access never even sees a
// request to an excluded path, authenticated or not, so nothing would
// challenge a signed-out visitor who's carried back to "/" — they'd just
// see the landing page again. "/workers" stays fully Access-protected
// exactly as every other dashboard route does today (spec.md Assumptions),
// making it a stable, always-real trigger for Access's actual challenge —
// once that completes, the browser lands on /workers with a valid session,
// and the SPA's own session probe + #480's deep-link resolution render the
// Workers dashboard directly.
const SIGN_IN_PATH = "/workers";

function handleSignIn() {
  globalThis.location.assign(SIGN_IN_PATH);
}

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
  // "is anything wrong right now" answered before navigating anywhere — but
  // a full page load on any other route (bookmark, refresh, shared link)
  // must land on THAT page, not silently fall back to it (issue #480).
  const [page, setPage] = useState<PageKey>(() => resolvePageFromLocation().page);
  const [badges, setBadges] = useState<{ key: string; count: number }[]>([]);
  const active = PAGES.find((p) => p.key === page) ?? PAGES[0];

  // spec 028 — undefined: the session probe hasn't resolved yet (the one
  // window where "/" can't yet be shown as either the landing page or the
  // authenticated dashboard without risking a flash of the wrong one).
  // null: confirmed no session. An identity object: authenticated.
  const [session, setSession] = useState<SessionIdentity | null | undefined>(undefined);

  useEffect(() => {
    fetchSession().then(setSession);
  }, []);

  // Keeps the URL in sync with in-app navigation (sidebar clicks, the
  // Overview "N more" link) so a refresh/bookmark taken from that URL later
  // lands back on the same page (issue #480) — history.pushState only, no
  // reload. "worker-detail" is reached through navigateToWorker() below
  // instead (its path needs a worker name pathForPage() doesn't take), so
  // this is a no-op push for it and the URL stays whatever it already was.
  function navigate(key: PageKey) {
    setPage(key);
    const path = pathForPage(key);
    if (path && globalThis.location.pathname !== path) {
      globalThis.history.pushState(null, "", path);
    }
  }

  // issue #495 — same URL-sync purpose as navigate() above, but for the
  // parameterized worker-detail route (/workers/<name>) that plain
  // pathForPage(key) can't express.
  function navigateToWorker(workerName: string) {
    setSelectedWorker(workerName);
    setPage("worker-detail");
    const path = pathForWorkerDetail(workerName);
    if (globalThis.location.pathname !== path) {
      globalThis.history.pushState(null, "", path);
    }
  }

  // Browser back/forward: the URL changes without any of the click handlers
  // below running, so the page state has to be re-derived from the new
  // location directly (setPage, not navigate — pushing again on a popstate
  // would fight the browser's own history navigation).
  useEffect(() => {
    function onPopState() {
      const resolved = resolvePageFromLocation();
      setPage(resolved.page);
      setSelectedWorker(resolved.workerName);
    }
    globalThis.addEventListener("popstate", onPopState);
    return () => globalThis.removeEventListener("popstate", onPopState);
  }, []);

  // specs/023-worker-detail-page (FR-011, data-model.md's Frontend
  // navigation state) — lifted out of WorkersDashboardPage so navigating to
  // a Worker's detail page and back preserves the table's page/sort state
  // instead of it resetting on remount.
  const [workersPage, setWorkersPage] = useState(1);
  const [workersSortKey, setWorkersSortKey] = useState<string | null>(null);
  const [workersSortDir, setWorkersSortDir] = useState<1 | -1>(1);
  // issue #495 — initialized from the URL too (resolvePageFromLocation),
  // not always null, so a full page load on /workers/<name> renders that
  // worker's detail directly instead of falling back to Overview with no
  // worker selected.
  const [selectedWorker, setSelectedWorker] = useState<string | null>(
    () => resolvePageFromLocation().workerName,
  );

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
    navigateToWorker(workerName);
  }

  function handleBackFromWorkerDetail() {
    setSelectedWorker(null);
    navigate("workers");
  }

  useEffect(() => {
    // spec 028 (SC-005) — these two badge fetches hit Access-protected
    // /api/* endpoints; skip them entirely until the session probe has
    // confirmed an actual identity, rather than firing them unconditionally
    // on mount and letting them 403 for a signed-out landing-page visitor.
    if (!session) return;

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
  }, [session]);

  // spec 028 — the one new top-level fork: /docs is public and has no
  // Sidebar/authenticated shell of its own, reachable regardless of
  // session state (spec.md Edge Cases), so it's handled before anything
  // shell-related below.
  if (page === "docs") {
    return (
      <DocumentationPage
        onSignIn={handleSignIn}
        onBack={() => navigate("overview")}
      />
    );
  }

  if (page === "overview") {
    // The one window where "/" can't yet be shown as either the landing
    // page or the authenticated dashboard without risking a flash of the
    // wrong one — session is still resolving.
    if (session === undefined) {
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            background: "var(--bg-base)",
          }}
        >
          <Logo variant="mono" size={32} />
        </div>
      );
    }
    if (session === null) {
      return <LandingPage onSignIn={handleSignIn} onNavigateToDocs={() => navigate("docs")} />;
    }
  }

  return (
    <div style={{ display: "flex" }}>
      <Sidebar
        items={NAV_ITEMS}
        activeKey={page}
        onSelect={(key) => navigate(key as PageKey)}
        badges={badges}
        footer={{ version: __APP_VERSION__ ? `v${__APP_VERSION__} · self-hosted` : "self-hosted" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <PageErrorBoundary key={page}>
          {
            // specs/022-audit-list-pagination — Overview's "N more" links need
            // to reach Audit & Drift; it's the only page needing a navigation
            // callback, so it's special-cased here rather than widening every
            // PAGES entry's render() signature for one caller. issue #497 —
            // onNavigateToModule lets each finding row's "Review X" action
            // actually take the operator to that finding's module page,
            // rather than the mutating (and misleadingly-labeled) acknowledge
            // action it was collapsed into by #429.
            page === "overview"
              ? (
                <OverviewPage
                  onNavigateToAudit={() => navigate("audit")}
                  onNavigateToModule={(module) => navigate(module as PageKey)}
                />
              )
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
