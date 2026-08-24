// New-vs-repeat diffing for the Security Posture scheduled drift audit.
// Pure logic — no D1 access here (constitution Principle III). Four
// separate diff functions, mirroring the four independent finding/alert
// table pairs (data-model.md §7 — all zone-keyed, kept separate so each
// alerts independently, following Module 4's established precedent).
import type {
  AlwaysHttpsEvaluation,
  BotFightModeEvaluation,
  DnssecEvaluation,
  MinTlsVersionEvaluation,
  ProtectionStatus,
  RateLimitingEvaluation,
  SettingStatus,
  SslTlsEvaluation,
  SslTlsStatus,
  WafEvaluation,
} from "./types.ts";

export interface SslTlsAlertToRecord {
  zoneId: string;
  zoneName: string;
  previousStatus: SslTlsStatus | null;
  newStatus: "warning" | "critical";
}

export interface DnssecAlertToRecord {
  zoneId: string;
  zoneName: string;
  previousStatus: ProtectionStatus | null;
  newStatus: "warning";
}

export interface WafAlertToRecord {
  zoneId: string;
  zoneName: string;
  previousStatus: ProtectionStatus | null;
  newStatus: "warning";
}

export interface RateLimitingAlertToRecord {
  zoneId: string;
  zoneName: string;
  previousStatus: ProtectionStatus | null;
  newStatus: "warning";
}

export interface BotFightModeAlertToRecord {
  zoneId: string;
  zoneName: string;
  previousStatus: SettingStatus | null;
  newStatus: "warning";
}

export interface AlwaysHttpsAlertToRecord {
  zoneId: string;
  zoneName: string;
  previousStatus: SettingStatus | null;
  newStatus: "warning";
}

export interface MinTlsAlertToRecord {
  zoneId: string;
  zoneName: string;
  previousStatus: SettingStatus | null;
  newStatus: "warning";
}

// FR-009/FR-010 + the spec's "no grace period on first run" edge case —
// same semantics as every prior module's diff function.
export function diffForSslTlsAlerts(
  results: SslTlsEvaluation[],
  previousStatuses: ReadonlyMap<string, SslTlsStatus>,
): SslTlsAlertToRecord[] {
  const alerts: SslTlsAlertToRecord[] = [];
  for (const r of results) {
    if (r.status !== "warning" && r.status !== "critical") continue;
    const previous = previousStatuses.get(r.zoneId) ?? null;
    if (previous === r.status) continue;
    alerts.push({
      zoneId: r.zoneId,
      zoneName: r.zoneName,
      previousStatus: previous,
      newStatus: r.status,
    });
  }
  return alerts;
}

export function diffForDnssecAlerts(
  results: DnssecEvaluation[],
  previousStatuses: ReadonlyMap<string, ProtectionStatus>,
): DnssecAlertToRecord[] {
  const alerts: DnssecAlertToRecord[] = [];
  for (const r of results) {
    if (r.status !== "warning") continue;
    const previous = previousStatuses.get(r.zoneId) ?? null;
    if (previous === r.status) continue;
    alerts.push({
      zoneId: r.zoneId,
      zoneName: r.zoneName,
      previousStatus: previous,
      newStatus: "warning",
    });
  }
  return alerts;
}

export function diffForWafAlerts(
  results: WafEvaluation[],
  previousStatuses: ReadonlyMap<string, ProtectionStatus>,
): WafAlertToRecord[] {
  const alerts: WafAlertToRecord[] = [];
  for (const r of results) {
    if (r.status !== "warning") continue;
    const previous = previousStatuses.get(r.zoneId) ?? null;
    if (previous === r.status) continue;
    alerts.push({
      zoneId: r.zoneId,
      zoneName: r.zoneName,
      previousStatus: previous,
      newStatus: "warning",
    });
  }
  return alerts;
}

export function diffForRateLimitingAlerts(
  results: RateLimitingEvaluation[],
  previousStatuses: ReadonlyMap<string, ProtectionStatus>,
): RateLimitingAlertToRecord[] {
  const alerts: RateLimitingAlertToRecord[] = [];
  for (const r of results) {
    if (r.status !== "warning") continue;
    const previous = previousStatuses.get(r.zoneId) ?? null;
    if (previous === r.status) continue;
    alerts.push({
      zoneId: r.zoneId,
      zoneName: r.zoneName,
      previousStatus: previous,
      newStatus: "warning",
    });
  }
  return alerts;
}

export function diffForBotFightModeAlerts(
  results: BotFightModeEvaluation[],
  previousStatuses: ReadonlyMap<string, SettingStatus>,
): BotFightModeAlertToRecord[] {
  const alerts: BotFightModeAlertToRecord[] = [];
  for (const r of results) {
    if (r.status !== "warning") continue;
    const previous = previousStatuses.get(r.zoneId) ?? null;
    if (previous === r.status) continue;
    alerts.push({
      zoneId: r.zoneId,
      zoneName: r.zoneName,
      previousStatus: previous,
      newStatus: "warning",
    });
  }
  return alerts;
}

export function diffForAlwaysHttpsAlerts(
  results: AlwaysHttpsEvaluation[],
  previousStatuses: ReadonlyMap<string, SettingStatus>,
): AlwaysHttpsAlertToRecord[] {
  const alerts: AlwaysHttpsAlertToRecord[] = [];
  for (const r of results) {
    if (r.status !== "warning") continue;
    const previous = previousStatuses.get(r.zoneId) ?? null;
    if (previous === r.status) continue;
    alerts.push({
      zoneId: r.zoneId,
      zoneName: r.zoneName,
      previousStatus: previous,
      newStatus: "warning",
    });
  }
  return alerts;
}

export function diffForMinTlsAlerts(
  results: MinTlsVersionEvaluation[],
  previousStatuses: ReadonlyMap<string, SettingStatus>,
): MinTlsAlertToRecord[] {
  const alerts: MinTlsAlertToRecord[] = [];
  for (const r of results) {
    if (r.status !== "warning") continue;
    const previous = previousStatuses.get(r.zoneId) ?? null;
    if (previous === r.status) continue;
    alerts.push({
      zoneId: r.zoneId,
      zoneName: r.zoneName,
      previousStatus: previous,
      newStatus: "warning",
    });
  }
  return alerts;
}

// issue #481 — the auto-resolve counterpart to every diffFor*Alerts above:
// an open (unacknowledged, unresolved) alert whose zone is back to "safe"
// in the run that just completed no longer belongs in the Unified Alerts
// Inbox/Overview. Deliberately checks `=== "safe"`, not `!== "warning"` (or
// `!== "critical"`) — a zone missing from `results` entirely, or evaluated
// as "not_evaluated" (a transient per-check API failure), must NOT
// auto-resolve: that would silently hide a still-open alert behind a data
// gap rather than a genuine fix (mirrors this codebase's established
// "never fabricate a clean state" rule — e.g. summary.ts's `hasData`).
// Pure — no D1 access (constitution Principle III); routes.ts reads the
// open alerts, calls this, and writes the resulting ids' resolved_at.
export interface OpenAlert {
  id: string;
  zoneId: string;
}

function resolvedAlertIds<T extends { zoneId: string; status: string }>(
  results: T[],
  openAlerts: readonly OpenAlert[],
): string[] {
  const safeZoneIds = new Set(results.filter((r) => r.status === "safe").map((r) => r.zoneId));
  return openAlerts.filter((a) => safeZoneIds.has(a.zoneId)).map((a) => a.id);
}

export function resolveForSslTlsAlerts(
  results: SslTlsEvaluation[],
  openAlerts: readonly OpenAlert[],
): string[] {
  return resolvedAlertIds(results, openAlerts);
}

export function resolveForDnssecAlerts(
  results: DnssecEvaluation[],
  openAlerts: readonly OpenAlert[],
): string[] {
  return resolvedAlertIds(results, openAlerts);
}

export function resolveForWafAlerts(
  results: WafEvaluation[],
  openAlerts: readonly OpenAlert[],
): string[] {
  return resolvedAlertIds(results, openAlerts);
}

export function resolveForRateLimitingAlerts(
  results: RateLimitingEvaluation[],
  openAlerts: readonly OpenAlert[],
): string[] {
  return resolvedAlertIds(results, openAlerts);
}

export function resolveForBotFightModeAlerts(
  results: BotFightModeEvaluation[],
  openAlerts: readonly OpenAlert[],
): string[] {
  return resolvedAlertIds(results, openAlerts);
}

export function resolveForAlwaysHttpsAlerts(
  results: AlwaysHttpsEvaluation[],
  openAlerts: readonly OpenAlert[],
): string[] {
  return resolvedAlertIds(results, openAlerts);
}

export function resolveForMinTlsAlerts(
  results: MinTlsVersionEvaluation[],
  openAlerts: readonly OpenAlert[],
): string[] {
  return resolvedAlertIds(results, openAlerts);
}
