// Unified outstanding-alerts inbox: reads directly from all seventeen
// sources' alert tables, merges, and sorts. No evaluation happens
// here — every alert already exists; this only re-presents it
// (data-model.md).
import {
  AUDIT_SOURCES,
  type AuditSource,
  errorMessage,
  findAuditSource,
  labelSqlExpr,
  reasonSubquery,
  type UnavailableSource,
} from "./sources.ts";

const REASON_UNAVAILABLE = "reason unavailable";

export interface UnifiedAlert {
  id: string;
  module: string;
  kind: string;
  entityLabel: string;
  previousStatus: string | null;
  newStatus: string;
  detectedAt: string;
  acknowledgedAt: string | null;
  // specs/027-overview-dashboard-redesign — the finding's own real reason
  // text, joined through from its findings table (research.md §3).
  // REASON_UNAVAILABLE when the join finds no matching row (that run's
  // finding row was since superseded/pruned) rather than blanking the row.
  reason: string;
}

interface RawAlertRow {
  id: string;
  entity_label: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
  reason: string | null;
}

async function queryOneSource(db: D1Database, source: AuditSource): Promise<UnifiedAlert[]> {
  const { results } = await db.prepare(
    `SELECT a.id, (${labelSqlExpr(source.alertLabelColumns, "a")}) AS entity_label,
            a.previous_status, a.new_status, a.detected_at, a.acknowledged_at,
            ${reasonSubquery(source, "a")} AS reason
     FROM ${source.alertsTable} a
     WHERE a.acknowledged_at IS NULL AND a.resolved_at IS NULL
     ORDER BY a.detected_at DESC`,
  ).all<RawAlertRow>();

  return results.map((r) => ({
    id: r.id,
    module: source.module,
    kind: source.kind,
    entityLabel: r.entity_label,
    previousStatus: r.previous_status,
    newStatus: r.new_status,
    detectedAt: r.detected_at,
    acknowledgedAt: r.acknowledged_at,
    reason: r.reason ?? REASON_UNAVAILABLE,
  }));
}

export interface UnifiedAlertsResult {
  alerts: UnifiedAlert[];
  // Sources whose alert-table read rejected outright — kept separate from
  // `alerts` so a genuine read failure never gets folded into "this
  // source currently has zero outstanding alerts" (FR-010).
  unavailableSources: UnavailableSource[];
}

// A per-source read failure does not blank out the other sixteen
// (spec FR-010) — Promise.allSettled, not Promise.all.
export async function queryUnifiedAlerts(db: D1Database): Promise<UnifiedAlertsResult> {
  const results = await Promise.allSettled(
    AUDIT_SOURCES.map((source) => queryOneSource(db, source)),
  );

  const alerts: UnifiedAlert[] = [];
  const unavailableSources: UnavailableSource[] = [];

  results.forEach((result, i) => {
    const source = AUDIT_SOURCES[i];
    if (result.status === "fulfilled") {
      alerts.push(...result.value);
    } else {
      unavailableSources.push({
        module: source.module,
        kind: source.kind,
        error: `could not read ${source.alertsTable}: ${errorMessage(result.reason)}`,
      });
    }
  });

  alerts.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
  return { alerts, unavailableSources };
}

export type AcknowledgeResult =
  | { outcome: "ok"; id: string; acknowledgedAt: string }
  | { outcome: "unknown_source" }
  | { outcome: "not_found" };

// Writes through to the exact same row the owning module's own
// acknowledge endpoint would (spec FR-002) — same idempotent/404
// semantics as every prior module's acknowledge endpoint.
export async function acknowledgeAlert(
  db: D1Database,
  module: string,
  kind: string,
  id: string,
): Promise<AcknowledgeResult> {
  const source = findAuditSource(module, kind);
  if (!source) return { outcome: "unknown_source" };

  const existing = await db.prepare(
    `SELECT acknowledged_at FROM ${source.alertsTable} WHERE id = ?`,
  ).bind(id).first<{ acknowledged_at: string | null }>();

  if (!existing) return { outcome: "not_found" };

  if (existing.acknowledged_at) {
    return { outcome: "ok", id, acknowledgedAt: existing.acknowledged_at };
  }

  const acknowledgedAt = new Date().toISOString();
  await db.prepare(
    `UPDATE ${source.alertsTable} SET acknowledged_at = ? WHERE id = ?`,
  ).bind(acknowledgedAt, id).run();

  return { outcome: "ok", id, acknowledgedAt };
}
