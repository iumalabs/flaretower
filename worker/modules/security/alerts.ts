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
