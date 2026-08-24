import { Hono } from "hono";
import { requireRole } from "../../auth/access-jwt.ts";
import { buildWorkerInventory, listAccessApplications } from "./inventory.ts";
import { evaluateInventory } from "./evaluate.ts";
import { diffForAlerts, type OpenAlert, resolveForAlerts } from "./alerts.ts";
import type { ExposureStatus, WorkerEvaluation } from "./types.ts";

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export const exposureRoutes = new Hono<{ Bindings: Env }>();

// Sentinel `hostname` for a Worker that was successfully enumerated but has
// zero public hostnames (no custom domain, workers.dev disabled, no Preview
// URL — evaluateWorker()'s normal, error-free result for such a Worker).
// exposure_findings only has per-hostname rows, so without this marker a
// zero-hostname Worker contributes no rows to a run and GET /inventory
// (which groups strictly from exposure_findings) would silently drop it —
// contradicting spec.md US1/AC3, FR-006, and SC-002. One marker row per such
// Worker keeps it represented; the read path below strips markers back out
// of the `hostnames` array it returns, so callers just see `hostnames: []`.
// Mirrors dns/routes.ts's EMPTY_ZONE_RECORD_TYPE marker for an empty zone.
//
// `hostname_kind` reuses the existing 'custom_domain' enum value (the same
// sentinel-reuse this module's own inventory.ts already uses for its
// "(unavailable)" placeholder) rather than widening exposure_findings'
// CHECK constraint via a new D1 migration for one marker value — T037 (see
// its commit message) ruled that kind of schema change out of proportion
// for a convergence-scale fix.
const NO_HOSTNAMES_MARKER_HOSTNAME = "(no public hostnames)";

// The most recent run's per-hostname status, read BEFORE the current run is
// inserted — this is what diffForAlerts() compares the new results against.
async function getPreviousStatuses(env: Env): Promise<Map<string, ExposureStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT hostname, status FROM exposure_findings
     WHERE run_id = (SELECT run_id FROM exposure_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ hostname: string; status: ExposureStatus }>();

  return new Map(rows.map((r) => [r.hostname, r.status]));
}

// issue #481 — every alert still open (unacknowledged, unresolved), read
// BEFORE the current run so resolveForAlerts (alerts.ts) can decide which
// of them the run that's about to be inserted just resolved.
async function getOpenAlerts(env: Env): Promise<OpenAlert[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, hostname FROM exposure_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL`,
  ).all<OpenAlert>();
  return results;
}

// Shared by POST /evaluate (interactive) and the scheduled handler (T030) —
// constitution Principle III: no divergent logic between the two entry
// points, so this is the one place that runs an evaluation, persists
// findings, and records new-vs-repeat alerts (FR-008/FR-009).
export async function runEvaluation(
  env: Env,
  trigger: "interactive" | "scheduled",
): Promise<
  {
    runId: string;
    evaluatedAt: string;
    results: WorkerEvaluation[];
    newAlertCount: number;
    resolvedAlertCount: number;
  }
> {
  const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
  const [inventory, apps, previousStatuses, openAlerts] = await Promise.all([
    buildWorkerInventory(creds),
    listAccessApplications(creds),
    getPreviousStatuses(env),
    getOpenAlerts(env),
  ]);
  const results = evaluateInventory(inventory, apps);

  const runId = crypto.randomUUID();
  const evaluatedAt = new Date().toISOString();

  const findingStatements = results.flatMap((worker) => {
    // Zero hostnames is a legitimate, successfully-enumerated state — write
    // one marker row so the Worker still shows up in GET /inventory, rather
    // than contributing nothing to this run at all.
    if (worker.hostnames.length === 0) {
      return [
        env.DB.prepare(
          `INSERT INTO exposure_findings
             (id, worker_name, hostname, hostname_kind, status, reason, evaluated_at, run_id, run_trigger, covering_app_ids)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          worker.workerName,
          NO_HOSTNAMES_MARKER_HOSTNAME,
          "custom_domain",
          "safe",
          "Worker has no public hostnames (no custom domain, workers.dev disabled, no Preview URL)",
          evaluatedAt,
          runId,
          trigger,
          "[]",
        ),
      ];
    }

    return worker.hostnames.map((h) =>
      env.DB.prepare(
        `INSERT INTO exposure_findings
           (id, worker_name, hostname, hostname_kind, status, reason, evaluated_at, run_id, run_trigger, covering_app_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        worker.workerName,
        h.hostname,
        h.kind,
        h.status,
        h.reason,
        evaluatedAt,
        runId,
        trigger,
        JSON.stringify(h.coveringAppIds),
      )
    );
  });

  if (findingStatements.length > 0) {
    await env.DB.batch(findingStatements);
  }

  const newAlerts = diffForAlerts(results, previousStatuses);
  const alertStatements = newAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO exposure_alerts
         (id, hostname, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), a.hostname, a.previousStatus, a.newStatus, runId, evaluatedAt)
  );

  // issue #481 — auto-resolve any open alert whose hostname recovered.
  const resolvedIds = resolveForAlerts(results, openAlerts);
  const resolveStatements = resolvedIds.map((id) =>
    env.DB.prepare(`UPDATE exposure_alerts SET resolved_at = ? WHERE id = ?`).bind(
      evaluatedAt,
      id,
    )
  );

  const allAlertStatements = [...alertStatements, ...resolveStatements];
  if (allAlertStatements.length > 0) {
    await env.DB.batch(allAlertStatements);
  }

  return {
    runId,
    evaluatedAt,
    results,
    newAlertCount: newAlerts.length,
    resolvedAlertCount: resolvedIds.length,
  };
}

exposureRoutes.post("/evaluate", async (c) => {
  const { runId } = await runEvaluation(c.env, "interactive");
  return c.json({ run_id: runId }, 202);
});

interface FindingRow {
  worker_name: string;
  hostname: string;
  hostname_kind: string;
  status: string;
  reason: string;
}

export interface WorkerHostnameFinding {
  hostname: string;
  kind: string;
  status: string;
  reason: string;
  // specs/023-worker-detail-page (research.md §2) — [] for rows predating
  // migration 0014 (column is nullable) as well as the genuine no-coverage
  // case; both mean "nothing to join against zt_app_findings for."
  coveringAppIds: string[];
}

// specs/023-worker-detail-page (research.md §1): same latest-run-scoped query
// GET /inventory below already runs, narrowed to one Worker — exported so
// workers-dashboard/detail.ts can reuse it instead of re-deriving "the
// latest run's rows for this Worker" independently. `null` return means the
// Worker has no row at all (not even the no-hostnames marker) in the latest
// run — the detail endpoint's not-found case (FR-008); an empty array means
// the marker was present (the Worker legitimately has zero routes, FR-007).
export async function getWorkerHostnames(
  db: D1Database,
  workerName: string,
): Promise<WorkerHostnameFinding[] | null> {
  const latest = await db.prepare(
    `SELECT run_id FROM exposure_findings ORDER BY evaluated_at DESC LIMIT 1`,
  ).first<{ run_id: string }>();

  if (!latest) return null;

  const { results: rows } = await db.prepare(
    `SELECT hostname, hostname_kind, status, reason, covering_app_ids
     FROM exposure_findings WHERE run_id = ? AND worker_name = ?
     ORDER BY hostname`,
  ).bind(latest.run_id, workerName).all<FindingRow & { covering_app_ids: string | null }>();

  if (rows.length === 0) return null;

  return rows
    .filter((r) => r.hostname !== NO_HOSTNAMES_MARKER_HOSTNAME)
    .map((r) => ({
      hostname: r.hostname,
      kind: r.hostname_kind,
      status: r.status,
      reason: r.reason,
      coveringAppIds: r.covering_app_ids ? JSON.parse(r.covering_app_ids) as string[] : [],
    }));
}

exposureRoutes.get("/inventory", async (c) => {
  const latest = await c.env.DB.prepare(
    `SELECT run_id, evaluated_at FROM exposure_findings ORDER BY evaluated_at DESC LIMIT 1`,
  ).first<{ run_id: string; evaluated_at: string }>();

  if (!latest) {
    return c.json({ run_id: null, evaluated_at: null, workers: [] });
  }

  const { results: rows } = await c.env.DB.prepare(
    `SELECT worker_name, hostname, hostname_kind, status, reason
     FROM exposure_findings WHERE run_id = ?
     ORDER BY worker_name, hostname`,
  ).bind(latest.run_id).all<FindingRow>();

  const byWorker = new Map<string, FindingRow[]>();
  for (const row of rows) {
    // Ensures the worker key exists even when its only row is the
    // no-hostnames marker — the marker itself is never surfaced as a
    // hostname.
    const list = byWorker.get(row.worker_name) ?? [];
    byWorker.set(row.worker_name, list);
    if (row.hostname === NO_HOSTNAMES_MARKER_HOSTNAME) continue;
    list.push(row);
  }

  return c.json({
    run_id: latest.run_id,
    evaluated_at: latest.evaluated_at,
    workers: Array.from(byWorker.entries()).map(([worker_name, hostnames]) => ({
      worker_name,
      hostnames: hostnames.map((h) => ({
        hostname: h.hostname,
        kind: h.hostname_kind,
        status: h.status,
        reason: h.reason,
      })),
    })),
  });
});

interface AlertRow {
  id: string;
  hostname: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

exposureRoutes.get("/alerts", async (c) => {
  const { results: rows } = await c.env.DB.prepare(
    `SELECT id, hostname, previous_status, new_status, detected_at, acknowledged_at
     FROM exposure_alerts
     WHERE acknowledged_at IS NULL AND resolved_at IS NULL
     ORDER BY detected_at DESC`,
  ).all<AlertRow>();

  return c.json({
    alerts: rows.map((r) => ({
      id: r.id,
      hostname: r.hostname,
      previous_status: r.previous_status,
      new_status: r.new_status,
      detected_at: r.detected_at,
      acknowledged_at: r.acknowledged_at,
    })),
  });
});

// Not a Cloudflare account mutation (FR-012 scope boundary) — this is
// FlareTower's own state, so it is intentionally not written to
// `audit_log` (data-model.md's note on the baseline schema).
exposureRoutes.post("/alerts/:id/acknowledge", requireRole("admin"), async (c) => {
  const id = c.req.param("id");

  const existing = await c.env.DB.prepare(
    `SELECT acknowledged_at FROM exposure_alerts WHERE id = ?`,
  ).bind(id).first<{ acknowledged_at: string | null }>();

  if (!existing) {
    return c.json({ error: "alert not found" }, 404);
  }

  // Already acknowledged — idempotent success, not an error.
  if (existing.acknowledged_at) {
    return c.json({ id, acknowledged_at: existing.acknowledged_at });
  }

  const acknowledgedAt = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE exposure_alerts SET acknowledged_at = ? WHERE id = ?`,
  ).bind(acknowledgedAt, id).run();

  return c.json({ id, acknowledged_at: acknowledgedAt });
});
