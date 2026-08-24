// New-vs-repeat diffing for the Zero Trust scheduled drift audit. Pure
// logic — no D1 access here (constitution Principle III). Two separate
// diff functions, mirroring the two independent finding/alert table pairs
// (data-model.md §5 — applications and service tokens have different
// identity shapes).
import type { AppEvaluation, AppStatus, TokenEvaluation, TokenStatus } from "./types.ts";

export interface AppAlertToRecord {
  appId: string;
  appDomain: string;
  previousStatus: AppStatus | null;
  newStatus: "warning";
}

export interface TokenAlertToRecord {
  tokenId: string;
  tokenName: string;
  previousStatus: TokenStatus | null;
  newStatus: "warning" | "critical";
}

// FR-010/FR-011 + the spec's "no grace period on first run" edge case —
// same semantics as every prior module's diff function.
export function diffForAppAlerts(
  results: AppEvaluation[],
  previousStatuses: ReadonlyMap<string, AppStatus>,
): AppAlertToRecord[] {
  const alerts: AppAlertToRecord[] = [];
  for (const r of results) {
    if (r.status !== "warning") continue;
    const previous = previousStatuses.get(r.appId) ?? null;
    if (previous === r.status) continue;
    alerts.push({
      appId: r.appId,
      appDomain: r.appDomain,
      previousStatus: previous,
      newStatus: "warning",
    });
  }
  return alerts;
}

export function diffForTokenAlerts(
  results: TokenEvaluation[],
  previousStatuses: ReadonlyMap<string, TokenStatus>,
): TokenAlertToRecord[] {
  const alerts: TokenAlertToRecord[] = [];
  for (const r of results) {
    if (r.status !== "warning" && r.status !== "critical") continue;
    const previous = previousStatuses.get(r.tokenId) ?? null;
    if (previous === r.status) continue;
    alerts.push({
      tokenId: r.tokenId,
      tokenName: r.tokenName,
      previousStatus: previous,
      newStatus: r.status,
    });
  }
  return alerts;
}

// issue #481 — the auto-resolve counterpart to diffForAppAlerts/
// diffForTokenAlerts above: an open (unacknowledged, unresolved) alert
// whose app/token is back to "safe" in the run that just completed no
// longer belongs in the Unified Alerts Inbox/Overview. Deliberately checks
// `=== "safe"`, not `!== "warning"` (or `!== "critical"`) — an entity
// missing from `results` entirely, or evaluated as "not_evaluated" (a
// transient per-check API failure), must NOT auto-resolve: that would
// silently hide a still-open alert behind a data gap rather than a genuine
// fix (mirrors this codebase's established "never fabricate a clean state"
// rule — e.g. summary.ts's `hasData`). Pure — no D1 access (constitution
// Principle III); routes.ts reads the open alerts, calls this, and writes
// the resulting ids' resolved_at.
export interface OpenAppAlert {
  id: string;
  appId: string;
}

export interface OpenTokenAlert {
  id: string;
  tokenId: string;
}

export function resolveForAppAlerts(
  results: AppEvaluation[],
  openAlerts: readonly OpenAppAlert[],
): string[] {
  const safeAppIds = new Set(results.filter((r) => r.status === "safe").map((r) => r.appId));
  return openAlerts.filter((a) => safeAppIds.has(a.appId)).map((a) => a.id);
}

export function resolveForTokenAlerts(
  results: TokenEvaluation[],
  openAlerts: readonly OpenTokenAlert[],
): string[] {
  const safeTokenIds = new Set(results.filter((r) => r.status === "safe").map((r) => r.tokenId));
  return openAlerts.filter((a) => safeTokenIds.has(a.tokenId)).map((a) => a.id);
}
