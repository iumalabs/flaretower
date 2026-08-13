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

// The account/zone-scoped Audit Logs endpoint — read-only, per research.md
// §4's new `Audit Logs Read` scope.
export async function fetchAccountAuditLog(
  creds: CloudflareCredentials,
  since: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<RecentChangeEntry[]> {
  const url = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/audit_logs`,
  );
  url.searchParams.set("since", since.toISOString());
  url.searchParams.set("per_page", "100");

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
  const entries = body.result ?? [];

  return entries.map((e) => ({
    occurredAt: e.when ?? "",
    actor: e.actor?.email ?? e.actor?.type ?? "unknown",
    actorSource: e.interface?.type ?? "api",
    action: e.action?.type ?? "unknown action",
    target: e.resource?.type ?? "unknown",
    resultSummary: summarizeValueChange(e.oldValue, e.newValue),
  }));
}

function summarizeValueChange(oldValue: unknown, newValue: unknown): string | null {
  if (oldValue === undefined && newValue === undefined) return null;
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
