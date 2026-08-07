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
