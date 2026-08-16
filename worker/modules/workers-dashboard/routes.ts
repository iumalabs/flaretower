import { Hono } from "hono";
import { buildWorkerInventory } from "../workers-access-exposure/inventory.ts";
import { fetchWorkersAnalytics } from "./analytics.ts";
import { fetchAccountAuditLog, filterWorkersRelevant } from "./audit-log.ts";
import { getWorkerLastDeployTimes } from "./inventory.ts";
import { classifyEnvironment, rollUpExposureStatus } from "./classify.ts";
import { buildWorkerDetail, WORKER_NOT_FOUND } from "./detail.ts";
import { type PageQuery, paginateArray, PaginationParamError } from "../../pagination.ts";
import type {
  AccountSummary,
  ExposureStatus,
  RecentChangeEntry,
  UnavailableSource,
  WorkerDashboardRow,
  WorkerDetail,
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
        unavailable.push({ source: "last_deploy", error: errorMessage(err) });
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

  // The GraphQL query's own row cap (analytics.ts) was hit — current-window
  // totals are real but understated, not a fetch failure, so this doesn't
  // replace analyticsResult (requests24h etc. below still use the real,
  // partial data) — it only tells the caller the numbers may be incomplete.
  if (analyticsResult?.current.truncated) {
    unavailable.push({
      source: "analytics",
      error:
        `analytics truncated at ${analyticsResult.current.perScript.length} scripts; account-wide totals may undercount`,
    });
  }

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
    ? filterWorkersRelevant(auditLogResult.entries, knownWorkerHostnames)
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

// Same accessor logic as WorkersDashboardPage.tsx's COLUMNS[*].sortValue —
// duplicated here (not D1-backed like the other 5 modules' inventory
// routes, so there's no shared ORDER BY to parameterize) so client-visible
// sort order stays identical whether or not pagination changes which rows
// are on screen (specs/020-list-pagination research.md §2, FR-006).
const WORKER_SORT_ACCESSORS: Record<string, (w: WorkerDashboardRow) => string | number> = {
  worker: (w) => w.workerName,
  env: (w) => w.environment,
  routes: (w) => w.routeCount,
  requests: (w) => w.requests24h ?? -1,
  errors: (w) => w.errors24h ?? -1,
  cpu: (w) => w.cpuP50Ms ?? -1,
  "last-deploy": (w) => w.lastDeployAt ?? "",
};

// Pure, extracted from the route handler for the same reason
// buildAccountSummary/serializeDashboard already are (this file's own
// established convention) — buildWorkersDashboard() makes 4+ live
// Cloudflare API calls, so testing the route end-to-end would mean mocking
// all of them just to cover a couple lines of pagination wiring.
export function paginateWorkers(workers: WorkerDashboardRow[], query: PageQuery) {
  const { items, pagination } = paginateArray(workers, query, WORKER_SORT_ACCESSORS, "worker");
  return { workers: items, pagination };
}

workersDashboardRoutes.get("/dashboard", async (c) => {
  const dashboard = await buildWorkersDashboard(c.env);

  let paged: ReturnType<typeof paginateWorkers>;
  try {
    paged = paginateWorkers(dashboard.workers, {
      page: c.req.query("page"),
      page_size: c.req.query("page_size"),
      sort_key: c.req.query("sort_key"),
      sort_dir: c.req.query("sort_dir"),
    });
  } catch (err) {
    if (err instanceof PaginationParamError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }

  return c.json({
    ...serializeDashboard({ ...dashboard, workers: paged.workers }),
    workers_pagination: paged.pagination,
  });
});

// specs/023-worker-detail-page contracts/api.md
export function serializeWorkerDetail(detail: WorkerDetail) {
  return {
    worker_name: detail.workerName,
    environment: detail.environment,
    routes: detail.routes.map((r) => ({
      hostname: r.hostname,
      kind: r.kind,
      status: r.status,
      reason: r.reason,
      policy: r.policy
        ? {
          app_id: r.policy.appId,
          app_name: r.policy.appName,
          app_domain: r.policy.appDomain,
          policy_rules: r.policy.policyRules,
        }
        : null,
    })),
    recent_changes: detail.recentChanges.map((c) => ({
      occurred_at: c.occurredAt,
      actor: c.actor,
      actor_source: c.actorSource,
      action: c.action,
      target: c.target,
      result_summary: c.resultSummary,
    })),
    cloudflare_url: detail.cloudflareUrl,
    unavailable: detail.unavailable,
  };
}

workersDashboardRoutes.get("/:worker_name/detail", async (c) => {
  const workerName = c.req.param("worker_name");
  const detail = await buildWorkerDetail(c.env, workerName);

  if (detail === WORKER_NOT_FOUND) {
    return c.json({ error: "worker not found in latest evaluation run" }, 404);
  }

  return c.json(serializeWorkerDetail(detail));
});
