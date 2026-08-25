// Deep-linking (issue #467/#480): a full page load must land on the page the
// URL names, not always fall back to Overview. Pure path<->PageKey mapping
// so it's testable without rendering React (tests/unit/page-routes.test.ts)
// — App.tsx wires this to window.location/history.
//
// "worker-detail" (App.tsx's PageKey, not a NAV_ITEMS entry) has no path
// here — it's parameterized (needs a worker name, not just a key) so it's
// handled separately by pathForWorkerDetail/workerNameFromPath below, not
// by this flat key<->path mapping. pathForPage/pageForPath never return it.
export function pathForPage(key: string): string | null {
  return key === "overview" ? "/" : `/${key}`;
}

export function pageForPath(pathname: string, validKeys: readonly string[]): string {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/") {
    return "overview";
  }
  const key = normalized.slice(1);
  return validKeys.includes(key) ? key : "overview";
}

// issue #495 — worker-detail's URL is `/workers/<name>`, one level below the
// Workers list's own `/workers` (matches pathForPage("workers") exactly, so
// the two never collide: `/workers` alone has no second segment).
export function pathForWorkerDetail(workerName: string): string {
  return `/workers/${encodeURIComponent(workerName)}`;
}

// null when pathname isn't a `/workers/<name>` shape at all (including bare
// `/workers`, which is the list page, not a detail page) — App.tsx falls
// through to the regular pageForPath() resolution in that case.
export function workerNameFromPath(pathname: string): string | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const match = /^\/workers\/([^/]+)$/.exec(normalized);
  return match ? decodeURIComponent(match[1]) : null;
}
