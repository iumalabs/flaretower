// New-vs-repeat diffing for the Storage scheduled drift audit. Pure
// logic — no D1 access here (constitution Principle III). Three separate
// diff functions, mirroring the three independent finding/alert table
// pairs (data-model.md §5 — R2 buckets, KV namespaces, and D1 databases
// each have a genuinely distinct identity space).
import type {
  BucketEvaluation,
  BucketStatus,
  D1DatabaseEvaluation,
  KvNamespaceEvaluation,
  UsageStatus,
} from "./types.ts";

export interface BucketAlertToRecord {
  bucketName: string;
  previousStatus: BucketStatus | null;
  newStatus: "warning" | "critical";
}

export interface KvNamespaceAlertToRecord {
  namespaceId: string;
  title: string;
  previousStatus: UsageStatus | null;
  newStatus: "warning";
}

export interface D1DatabaseAlertToRecord {
  databaseUuid: string;
  name: string;
  previousStatus: UsageStatus | null;
  newStatus: "warning";
}

// FR-011/FR-012 + the spec's "no grace period on first run" edge case —
// same semantics as every prior module's diff function.
export function diffForBucketAlerts(
  results: BucketEvaluation[],
  previousStatuses: ReadonlyMap<string, BucketStatus>,
): BucketAlertToRecord[] {
  const alerts: BucketAlertToRecord[] = [];
  for (const r of results) {
    if (r.status !== "warning" && r.status !== "critical") continue;
    const previous = previousStatuses.get(r.bucketName) ?? null;
    if (previous === r.status) continue;
    alerts.push({ bucketName: r.bucketName, previousStatus: previous, newStatus: r.status });
  }
  return alerts;
}

export function diffForKvNamespaceAlerts(
  results: KvNamespaceEvaluation[],
  previousStatuses: ReadonlyMap<string, UsageStatus>,
): KvNamespaceAlertToRecord[] {
  const alerts: KvNamespaceAlertToRecord[] = [];
  for (const r of results) {
    if (r.status !== "warning") continue;
    const previous = previousStatuses.get(r.namespaceId) ?? null;
    if (previous === r.status) continue;
    alerts.push({
      namespaceId: r.namespaceId,
      title: r.title,
      previousStatus: previous,
      newStatus: "warning",
    });
  }
  return alerts;
}

export function diffForD1DatabaseAlerts(
  results: D1DatabaseEvaluation[],
  previousStatuses: ReadonlyMap<string, UsageStatus>,
): D1DatabaseAlertToRecord[] {
  const alerts: D1DatabaseAlertToRecord[] = [];
  for (const r of results) {
    if (r.status !== "warning") continue;
    const previous = previousStatuses.get(r.databaseUuid) ?? null;
    if (previous === r.status) continue;
    alerts.push({
      databaseUuid: r.databaseUuid,
      name: r.name,
      previousStatus: previous,
      newStatus: "warning",
    });
  }
  return alerts;
}
