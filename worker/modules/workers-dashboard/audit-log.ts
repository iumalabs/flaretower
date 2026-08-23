// Cloudflare's real Audit Logs API (research.md §3) — a genuinely
// different data source from this project's own Module 7/8 "Audit &
// Drift" finding-status digest (worker/modules/audit/changes.ts), which
// has no actor/action vocabulary at all. Built as a standalone, cleanly
// reusable module (types + fetch + filter) — specs/018 (Audit dashboard)
// reuses this as-is rather than re-implementing (research.md §3's
// sequencing note), so keep this module's own interface generic rather
// than narrowed to only what this page's own panel needs.
import { withGlobalFetchSlot } from "../../concurrency.ts";
import type { CloudflareCredentials } from "../workers-access-exposure/inventory.ts";
import type { RecentChangeEntry } from "./types.ts";

interface RawAuditLogEntry {
  when?: string;
  action?: { type?: string; result?: boolean };
  actor?: { email?: string; type?: string };
  owner?: { id?: string };
  resource?: { type?: string; product?: string };
  interface?: { type?: string };
  newValue?: unknown;
  oldValue?: unknown;
}

interface RawAuditLogResponse {
  result?: RawAuditLogEntry[];
}

export interface AuditLogFetchResult {
  entries: RecentChangeEntry[];
  // True when AUDIT_LOG_FETCH_CAP was hit before Cloudflare's own pages ran
  // out — the result is real but not exhaustive (specs/020-list-pagination
  // FR-012's "no silent caps" requirement: callers must surface this, never
  // present a capped result as complete).
  truncated: boolean;
}

// Matches the order of magnitude of analytics.ts's own ANALYTICS_ROW_LIMIT —
// both exist for the same reason (Cloudflare's own API is unbounded per
// account; this project's "no silent caps" convention requires a defined,
// surfaced stopping point rather than fetching forever).
const AUDIT_LOG_FETCH_CAP = 1000;
const PAGE_SIZE = 100;

// The account/zone-scoped Audit Logs endpoint — read-only, per research.md
// §4's new `Audit Logs Read` scope. Follows Cloudflare's own page/per_page
// pagination itself (specs/020-list-pagination research.md §1 — this API is
// offset-based, not an opaque cursor token) up to AUDIT_LOG_FETCH_CAP, so a
// caller sees every event in the window rather than only the first 100.
export async function fetchAccountAuditLog(
  creds: CloudflareCredentials,
  since: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<AuditLogFetchResult> {
  const entries: RecentChangeEntry[] = [];
  let page = 1;

  while (true) {
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/audit_logs`,
    );
    url.searchParams.set("since", since.toISOString());
    url.searchParams.set("per_page", String(PAGE_SIZE));
    url.searchParams.set("page", String(page));

    // Gated by the invocation-wide semaphore (worker/concurrency.ts) — every
    // module's cfFetch() goes through it, so the true total in-flight
    // connection count across all of them together never exceeds the
    // Workers runtime's 6-per-invocation limit, not just this one module's
    // own fan-out.
    const res = await withGlobalFetchSlot(() =>
      fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${creds.apiToken}` },
      })
    );

    if (!res.ok) {
      throw new Error(`Cloudflare Audit Logs API returned HTTP ${res.status}`);
    }

    const body = await res.json() as RawAuditLogResponse;
    const rawPage = body.result ?? [];

    for (const e of rawPage) {
      entries.push({
        occurredAt: e.when ?? "",
        actor: e.actor?.email ?? e.actor?.type ?? "unknown",
        actorSource: e.interface?.type ?? "api",
        action: e.action?.type ?? "unknown action",
        target: e.resource?.type ?? "unknown",
        resultSummary: summarizeValueChange(e.oldValue, e.newValue),
      });
    }

    // Cap check first: a page can both hit the cap AND be Cloudflare's last
    // page at once, and "capped" must win — an untrimmed, over-cap result
    // reported as "not truncated" would violate FR-012 (no silent caps).
    if (entries.length >= AUDIT_LOG_FETCH_CAP) {
      return { entries: entries.slice(0, AUDIT_LOG_FETCH_CAP), truncated: true };
    }

    // A shorter-than-requested page means this was Cloudflare's last page —
    // no more data to follow the cursor into.
    if (rawPage.length < PAGE_SIZE) {
      return { entries, truncated: false };
    }
    page++;
  }
}

// issue #467 — Cloudflare's audit log API returns oldValue/newValue as
// empty strings (not omitted/undefined) for several action types
// (update_consumer_settings, script_deploy, script_update,
// script_schedules, script_on_subdomain, patch_settings), which the
// undefined-only guard didn't catch: JSON.stringify("") is the string '""'
// (quote characters included), so those rows rendered the literal
// '"" -> ""' instead of falling through to the UI's own "—" fallback
// (app/pages/AuditInventory.tsx). Checking for "" alongside undefined,
// rather than a full falsy check, deliberately still shows a real diff
// when either side is legitimately `0` or `false` (e.g. a boolean setting
// toggle) — only "nothing on either side" counts as nothing to show.
function isEmptyAuditValue(value: unknown): boolean {
  return value === undefined || value === "";
}

function summarizeValueChange(oldValue: unknown, newValue: unknown): string | null {
  if (isEmptyAuditValue(oldValue) && isEmptyAuditValue(newValue)) return null;
  return `${JSON.stringify(oldValue) ?? "?"} -> ${JSON.stringify(newValue) ?? "?"}`;
}

// A change is Workers-relevant if its resource is a Worker script/route
// directly (`resource.product` mentioning "workers"), OR — since Access
// application/policy bindings show up under the "access" product, not
// "workers" — if its target references a hostname this account's Workers
// inventory already knows about (passed in by the caller, which already
// has Module 1's hostname list). This is the cross-reference spec.md FR-008
// needs for entries like "Bound route to Access application."
export function filterWorkersRelevant(
  entries: readonly RecentChangeEntry[],
  knownWorkerHostnames: ReadonlySet<string>,
): RecentChangeEntry[] {
  return entries.filter((e) => {
    const target = e.target.toLowerCase();
    if (target.includes("worker")) return true;
    // The hostname itself usually appears in the change's before/after
    // value (a route pattern, an Access app's `domain` field), not in
    // `resource.type` — so the cross-reference scans `resultSummary` too,
    // not just `target`.
    const haystack = `${target} ${(e.resultSummary ?? "").toLowerCase()}`;
    for (const hostname of knownWorkerHostnames) {
      if (haystack.includes(hostname.toLowerCase())) return true;
    }
    return false;
  });
}
