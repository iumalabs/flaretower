// Deep-linking (issue #467/#480): a full page load must land on the page the
// URL names, not always fall back to Overview. Pure path<->PageKey mapping
// so it's testable without rendering React (tests/unit/page-routes.test.ts)
// — App.tsx wires this to window.location/history.
//
// "worker-detail" (App.tsx's PageKey, not a NAV_ITEMS entry) deliberately has
// no path here — it's reached only via in-app navigation (Workers table row
// click), never a bookmarkable URL, so pageForPath() never returns it and
// pathForPage() returns null for it (App.tsx skips the history update).
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
