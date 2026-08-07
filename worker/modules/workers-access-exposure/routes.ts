import { Hono } from "hono";
import { buildWorkerInventory, listAccessApplications } from "./inventory.ts";
import { evaluateInventory } from "./evaluate.ts";
import type { WorkerEvaluation } from "./types.ts";

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export const exposureRoutes = new Hono<{ Bindings: Env }>();

// Shared by POST /evaluate (interactive) and the scheduled handler (T030) —
// constitution Principle III: no divergent logic between the two entry
// points, so this is the one place that runs an evaluation and persists it.
export async function runEvaluation(
  env: Env,
  trigger: "interactive" | "scheduled",
): Promise<{ runId: string; evaluatedAt: string; results: WorkerEvaluation[] }> {
  const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
  const [inventory, apps] = await Promise.all([
    buildWorkerInventory(creds),
    listAccessApplications(creds),
  ]);
  const results = evaluateInventory(inventory, apps);

  const runId = crypto.randomUUID();
  const evaluatedAt = new Date().toISOString();

  const statements = results.flatMap((worker) =>
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

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  return { runId, evaluatedAt, results };
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

// GET /alerts and POST /alerts/:id/acknowledge land in T031/T032 (US4).
exposureRoutes.all("/alerts", (c) => c.text("not implemented", 501));
exposureRoutes.all("/alerts/*", (c) => c.text("not implemented", 501));
