import { Hono } from "hono";
import { buildWorkerInventory } from "../workers-access-exposure/inventory.ts";
import { fetchWorkersAnalytics } from "./analytics.ts";
import { fetchAccountAuditLog, filterWorkersRelevant } from "./audit-log.ts";
import { getWorkerLastDeployTimes } from "./inventory.ts";
import { classifyEnvironment, rollUpExposureStatus } from "./classify.ts";
import type {
  AccountSummary,
  ExposureStatus,
  RecentChangeEntry,
  UnavailableSource,
  WorkerDashboardRow,
  WorkersDashboard,
} from "./types.ts";

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export const workersDashboardRoutes = new Hono<{ Bindings: Env }>();

interface ExposureFindingRow {
  worker_name: string;
  status: ExposureStatus;
}

// Reads Module 1's `exposure_findings` table directly (constitution
// Principle III — no re-evaluation here, just a read) and rolls each
// Worker's per-hostname statuses up to one status per Worker
// (classify.ts's rollUpExposureStatus, data-model.md).
async function getExposureStatusByWorker(db: D1Database): Promise<Map<string, ExposureStatus[]>> {
  const latest = await db.prepare(
    `SELECT run_id FROM exposure_findings ORDER BY evaluated_at DESC LIMIT 1`,
  ).first<{ run_id: string }>();

  if (!latest) return new Map();

  const { results: rows } = await db.prepare(
    `SELECT worker_name, status FROM exposure_findings WHERE run_id = ?`,
  ).bind(latest.run_id).all<ExposureFindingRow>();

  const byWorker = new Map<string, ExposureStatus[]>();
  for (const row of rows) {
    const list = byWorker.get(row.worker_name) ?? [];
    list.push(row.status);
    byWorker.set(row.worker_name, list);
  }
  return byWorker;
}

export async function buildWorkersDashboard(env: Env): Promise<WorkersDashboard> {
  const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
  const now = new Date();
  const unavailable: UnavailableSource[] = [];

  // buildWorkerInventory() has its own internal fan-out (an initial 3-way
  // Promise.all, then up to 5 concurrent per-script fetches —
  // worker/concurrency.ts) — awaited to completion here rather than
  // included in the Promise.all below. Running it alongside the other 4
  // Cloudflare API calls (1 + 2 + 1 = 4 concurrent connections) would peak
  // at up to 3 + 4 = 7 simultaneous connections, over the Workers runtime's
  // 6-concurrent-connection-per-invocation limit — the same failure mode
  // issue #292 confirmed live for the Security module, fixed there with an
  // equivalent two-batch split.
  const inventory = await buildWorkerInventory(creds);

  const [exposureByWorker, lastDeployTimesResult, analyticsResult, auditLogResult] = await Promise
    .all([
      getExposureStatusByWorker(env.DB).catch((err: unknown) => {
        unavailable.push({ source: "exposure", error: errorMessage(err) });
        return new Map<string, ExposureStatus[]>();
      }),
      getWorkerLastDeployTimes(creds).catch((err: unknown) => {
        unavailable.push({ source: "exposure", error: `last-deploy times: ${errorMessage(err)}` });
        return new Map<string, string | null>();
      }),
      fetchWorkersAnalytics(creds, now).catch((err: unknown) => {
        unavailable.push({ source: "analytics", error: errorMessage(err) });
        return null;
      }),
      fetchAccountAuditLog(creds, new Date(now.getTime() - 24 * 60 * 60 * 1000)).catch(
        (err: unknown) => {
          unavailable.push({ source: "audit_log", error: errorMessage(err) });
          return null;
        },
      ),
    ]);

  // buildWorkerInventory's own degradation sentinel (research.md /
  // workers-access-exposure/inventory.ts) for a total script-list failure —
  // this module has nothing to enumerate either, since it's the same
  // underlying script list.
  const inventoryFailed = inventory.length === 1 && inventory[0].workerName === "(unavailable)";
  if (inventoryFailed) {
    unavailable.push({
      source: "exposure",
      error: inventory[0].hostnames[0]?.evaluationError ?? "could not list Worker scripts",
    });
  }
  const workerItems = inventoryFailed ? [] : inventory;

  const analyticsByScript = new Map(
    (analyticsResult?.current.perScript ?? []).map((s) => [s.scriptName, s]),
  );

  const workers: WorkerDashboardRow[] = workerItems.map((item) => {
    const hostnameKinds = item.hostnames.map((h) => h.kind);
    const analytics = analyticsByScript.get(item.workerName);
    return {
      workerName: item.workerName,
      environment: classifyEnvironment(hostnameKinds),
      routeCount: item.hostnames.length,
      lastDeployAt: lastDeployTimesResult.get(item.workerName) ?? null,
      requests24h: analytics?.requests ?? null,
      errors24h: analytics?.errors ?? null,
      cpuP50Ms: analytics?.cpuTimeP50Ms ?? null,
      exposureStatus: rollUpExposureStatus(exposureByWorker.get(item.workerName) ?? []),
    };
  });

  const summary = buildAccountSummary(workers, analyticsResult);

  const knownWorkerHostnames = new Set(
    workerItems.flatMap((item) => item.hostnames.map((h) => h.hostname)),
  );
  const recentChanges: RecentChangeEntry[] = auditLogResult
    ? filterWorkersRelevant(auditLogResult, knownWorkerHostnames)
    : [];

  return {
    generatedAt: now.toISOString(),
    summary,
    workers,
    recentChanges,
    unavailable,
  };
}

export function buildAccountSummary(
  workers: WorkerDashboardRow[],
  analyticsResult: Awaited<ReturnType<typeof fetchWorkersAnalytics>> | null,
): AccountSummary {
  const deployedByEnvironment = { production: 0, preview: 0 };
  for (const w of workers) deployedByEnvironment[w.environment]++;

  if (!analyticsResult) {
    return {
      deployedCount: workers.length,
      deployedByEnvironment,
      requests24hTotal: null,
      requests24hChangePct: null,
      errorRatePct: null,
      errors24hTotal: null,
      cpuP99Ms: null,
    };
  }

  const requests24hTotal = sumField(analyticsResult.current.perScript, "requests");
  const errors24hTotal = sumField(analyticsResult.current.perScript, "errors");
  const previousRequestsTotal = sumField(analyticsResult.previous.perScript, "requests");

  return {
    deployedCount: workers.length,
    deployedByEnvironment,
    requests24hTotal,
    requests24hChangePct: previousRequestsTotal > 0
      ? ((requests24hTotal - previousRequestsTotal) / previousRequestsTotal) * 100
      : null,
    errorRatePct: requests24hTotal > 0 ? (errors24hTotal / requests24hTotal) * 100 : null,
    errors24hTotal,
    cpuP99Ms: analyticsResult.current.cpuTimeP99Ms,
  };
}

function sumField(
  rows: readonly { requests: number; errors: number }[],
  field: "requests" | "errors",
): number {
  return rows.reduce((total, r) => total + r[field], 0);
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "unknown error";
}

export function serializeDashboard(dashboard: WorkersDashboard) {
  return {
    generated_at: dashboard.generatedAt,
    summary: {
      deployed_count: dashboard.summary.deployedCount,
      deployed_by_environment: dashboard.summary.deployedByEnvironment,
      requests_24h_total: dashboard.summary.requests24hTotal,
      requests_24h_change_pct: dashboard.summary.requests24hChangePct,
      error_rate_pct: dashboard.summary.errorRatePct,
      errors_24h_total: dashboard.summary.errors24hTotal,
      cpu_p99_ms: dashboard.summary.cpuP99Ms,
    },
    workers: dashboard.workers.map((w) => ({
      worker_name: w.workerName,
      environment: w.environment,
      route_count: w.routeCount,
      last_deploy_at: w.lastDeployAt,
      requests_24h: w.requests24h,
      errors_24h: w.errors24h,
      cpu_p50_ms: w.cpuP50Ms,
      exposure_status: w.exposureStatus,
    })),
    recent_changes: dashboard.recentChanges.map((c) => ({
      occurred_at: c.occurredAt,
      actor: c.actor,
      actor_source: c.actorSource,
      action: c.action,
      target: c.target,
      result_summary: c.resultSummary,
    })),
    unavailable: dashboard.unavailable,
  };
}

workersDashboardRoutes.get("/dashboard", async (c) => {
  const dashboard = await buildWorkersDashboard(c.env);
  return c.json(serializeDashboard(dashboard));
});
