import { Hono } from "hono";
import { buildWorkerInventory, listAccessApplications } from "./inventory.ts";
import { evaluateInventory } from "./evaluate.ts";
import { diffForAlerts } from "./alerts.ts";
import type { ExposureStatus, WorkerEvaluation } from "./types.ts";

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export const exposureRoutes = new Hono<{ Bindings: Env }>();

// The most recent run's per-hostname status, read BEFORE the current run is
// inserted — this is what diffForAlerts() compares the new results against.
async function getPreviousStatuses(env: Env): Promise<Map<string, ExposureStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT hostname, status FROM exposure_findings
     WHERE run_id = (SELECT run_id FROM exposure_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ hostname: string; status: ExposureStatus }>();

  return new Map(rows.map((r) => [r.hostname, r.status]));
}

// Shared by POST /evaluate (interactive) and the scheduled handler (T030) —
// constitution Principle III: no divergent logic between the two entry
// points, so this is the one place that runs an evaluation, persists
// findings, and records new-vs-repeat alerts (FR-008/FR-009).
export async function runEvaluation(
  env: Env,
  trigger: "interactive" | "scheduled",
): Promise<
  { runId: string; evaluatedAt: string; results: WorkerEvaluation[]; newAlertCount: number }
> {
  const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
  const [inventory, apps, previousStatuses] = await Promise.all([
    buildWorkerInventory(creds),
    listAccessApplications(creds),
    getPreviousStatuses(env),
  ]);
  const results = evaluateInventory(inventory, apps);

  const runId = crypto.randomUUID();
  const evaluatedAt = new Date().toISOString();

  const findingStatements = results.flatMap((worker) =>
    worker.hostnames.map((h) =>
      env.DB.prepare(
        `INSERT INTO exposure_findings
           (id, worker_name, hostname, hostname_kind, status, reason, evaluated_at, run_id, run_trigger)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      )
    )
  );

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

  if (alertStatements.length > 0) {
    await env.DB.batch(alertStatements);
  }

  return { runId, evaluatedAt, results, newAlertCount: newAlerts.length };
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
    const list = byWorker.get(row.worker_name) ?? [];
    list.push(row);
    byWorker.set(row.worker_name, list);
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
     WHERE acknowledged_at IS NULL
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
exposureRoutes.post("/alerts/:id/acknowledge", async (c) => {
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
