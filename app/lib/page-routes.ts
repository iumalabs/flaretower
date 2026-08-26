// Deep-linking (issue #467/#480): a full page load must land on the page the
// URL names, not always fall back to Overview. Pure path<->PageKey mapping
// so it's testable without rendering React (tests/unit/page-routes.test.ts)
// — App.tsx wires this to window.location/history.
//
// "worker-detail" (App.tsx's PageKey, not a NAV_ITEMS entry) has no path
// here — it's parameterized (needs a worker name, not just a key) so it's
// handled separately by pathForWorkerDetail/workerNameFromPath below, not
// by this flat key<->path mapping. pathForPage/pageForPath never return it.
//
// issue #516 — the entire authenticated app now lives under one path
// prefix, `/app`, so the Cloudflare Access Application protecting it can
// use a single, unambiguous "protect /app/* (and /api/*)" allow-list
// instead of the previous "protect everything except a couple of public
// paths" bypass policy (research.md's own §1/§2 for spec 028 already
// flagged that shape as fragile — this is what replaces it). "overview"
// is `/app` itself, same convention as before ("/" was overview's own
// path) just shifted one level down. "landing" and "overview" are no
// longer the same path — "landing" is now always "/", genuinely distinct
// from "overview" (`/app`), so App.tsx keeps them as two separate PageKey
// values rather than one path branching on session state.
export function pathForPage(key: string): string | null {
  if (key === "landing") return "/";
  if (key === "docs") return "/docs";
  // issue #528 — same public, session-independent treatment as "docs".
  if (key === "changelog") return "/changelog";
  if (key === "overview") return "/app";
  return `/app/${key}`;
}

// Any pathname this doesn't otherwise recognize — including every
// pre-#516 bookmark to the old unprefixed dashboard paths (`/workers`,
// `/exposure`, ...) — resolves to "landing", not "overview". Those old
// paths are no longer Access-protected at the edge (only `/app/*` and
// `/api/*` are, per the Access Application's new path pattern — see
// README's required manual step), so silently treating them as valid
// `/app/*`-equivalent routes would render dashboard *shell* at an
// unprotected URL. "landing" is always safe to fall back to: it shows no
// account data regardless of session state, and (App.tsx's own boot
// effect) bounces an already-authenticated visitor into `/app` for them.
export function pageForPath(pathname: string, validKeys: readonly string[]): string {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/") return "landing";
  if (normalized === "/docs") return validKeys.includes("docs") ? "docs" : "landing";
  if (normalized === "/changelog") {
    return validKeys.includes("changelog") ? "changelog" : "landing";
  }
  if (normalized === "/app") return "overview";
  if (normalized.startsWith("/app/")) {
    const key = normalized.slice("/app/".length);
    return validKeys.includes(key) ? key : "overview";
  }
  return "landing";
}

// issue #495 — worker-detail's URL is `/app/workers/<name>`, one level
// below the Workers list's own `/app/workers` (matches
// pathForPage("workers") exactly, so the two never collide: `/app/workers`
// alone has no third segment). issue #516 — gained the `/app` prefix along
// with every other authenticated route.
export function pathForWorkerDetail(workerName: string): string {
  return `/app/workers/${encodeURIComponent(workerName)}`;
}

// null when pathname isn't a `/app/workers/<name>` shape at all (including
// bare `/app/workers`, which is the list page, not a detail page) —
// App.tsx falls through to the regular pageForPath() resolution in that
// case.
export function workerNameFromPath(pathname: string): string | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const match = /^\/app\/workers\/([^/]+)$/.exec(normalized);
  return match ? decodeURIComponent(match[1]) : null;
}
