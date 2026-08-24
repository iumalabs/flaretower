// New-vs-repeat diffing for the scheduled drift audit. Pure logic — no D1
// access here (constitution Principle III) — the caller (routes.ts) reads
// the previous run's per-hostname status from D1 and passes it in.
import type { ExposureStatus, WorkerEvaluation } from "./types.ts";

export interface AlertToRecord {
  hostname: string;
  previousStatus: ExposureStatus | null;
  newStatus: "warning" | "critical";
}

// FR-008: alert on a hostname newly in warning/critical state.
// FR-009: don't repeat-alert when the state is unchanged from the previous run.
// Spec Edge Cases: a hostname's very first-ever evaluation still alerts if
// it's warning/critical — there is no grace period (a hostname absent from
// `previousStatuses` is treated as "previously unknown," never as
// "previously safe").
export function diffForAlerts(
  results: WorkerEvaluation[],
  previousStatuses: ReadonlyMap<string, ExposureStatus>,
): AlertToRecord[] {
  const alerts: AlertToRecord[] = [];

  for (const worker of results) {
    for (const h of worker.hostnames) {
      if (h.status !== "warning" && h.status !== "critical") continue;

      const previous = previousStatuses.get(h.hostname) ?? null;
      if (previous === h.status) continue; // unchanged — no repeat alert

      alerts.push({ hostname: h.hostname, previousStatus: previous, newStatus: h.status });
    }
  }

  return alerts;
}

// issue #481 — the auto-resolve counterpart to diffForAlerts above: an open
// (unacknowledged, unresolved) alert whose hostname is back to "safe" in
// the run that just completed no longer belongs in the Unified Alerts
// Inbox/Overview. Deliberately checks `=== "safe"`, not `!== "warning"` (or
// `!== "critical"`) — a hostname missing from `results` entirely, or
// evaluated as "not_evaluated" (a transient per-check API failure), must
// NOT auto-resolve: that would silently hide a still-open alert behind a
// data gap rather than a genuine fix (mirrors this codebase's established
// "never fabricate a clean state" rule — e.g. summary.ts's `hasData`).
// Pure — no D1 access (constitution Principle III); routes.ts reads the
// open alerts, calls this, and writes the resulting ids' resolved_at.
export interface OpenAlert {
  id: string;
  hostname: string;
}

export function resolveForAlerts(
  results: WorkerEvaluation[],
  openAlerts: readonly OpenAlert[],
): string[] {
  const safeHostnames = new Set<string>();
  for (const worker of results) {
    for (const h of worker.hostnames) {
      if (h.status === "safe") safeHostnames.add(h.hostname);
    }
  }
  return openAlerts.filter((a) => safeHostnames.has(a.hostname)).map((a) => a.id);
}
