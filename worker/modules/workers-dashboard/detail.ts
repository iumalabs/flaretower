// specs/023-worker-detail-page — composes one Worker's full picture from
// three modules' already-persisted findings (constitution Principle III: no
// new evaluation logic here, just reads of the latest run each module
// already wrote). Mirrors routes.ts's buildWorkersDashboard() structure.
import { classifyEnvironment } from "./classify.ts";
import { getWorkerHostnames } from "../workers-access-exposure/routes.ts";
import { fetchAccountAuditLog, filterWorkersRelevant } from "./audit-log.ts";
import type {
  RecentChangeEntry,
  WorkerDetail,
  WorkerDetailUnavailableSource,
  WorkerRouteEntry,
  WorkerRoutePolicy,
} from "./types.ts";

// specs/023-worker-detail-page (research.md §3, corrected during
// implementation) — a dedicated per-Worker page reads more naturally with
// the fuller history depth of Audit & Drift's own "Audit log" tab
// (worker/modules/audit/routes.ts's SEVEN_DAYS_MS) than with
// buildWorkersDashboard()'s own terser 24-hour panel.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

// Distinguishes "no such Worker in the latest evaluation run" (FR-008, a
// 404 at the route layer) from every other outcome — a plain `null` return
// from buildWorkerDetail() would be ambiguous with "found, but every field
// is empty," which is a real, different state (FR-007).
export const WORKER_NOT_FOUND = Symbol("worker-not-found");

interface ZtAppFindingRow {
  app_id: string;
  app_name: string | null;
  app_domain: string;
  policy_rules_json: string | null;
}

// specs/023-worker-detail-page (research.md §2) — direct cross-module D1
// read of zero-trust's own findings table, mirroring this same file's
// getExposureStatusByWorker()-equivalent precedent (routes.ts's
// getExposureStatusByWorker reads exposure_findings directly) rather than
// exporting a helper from the zero-trust module for a one-call join. Same
// "latest run_id" subquery idiom zero-trust/routes.ts's own
// getPreviousAppStatuses() already uses. `null` return means the query
// itself failed — distinct from "ran fine, found zero matching apps."
async function getAccessPoliciesByAppId(
  db: D1Database,
  appIds: readonly string[],
): Promise<Map<string, WorkerRoutePolicy> | null> {
  if (appIds.length === 0) return new Map();
  try {
    const placeholders = appIds.map(() => "?").join(", ");
    const { results: rows } = await db.prepare(
      `SELECT app_id, app_name, app_domain, policy_rules_json FROM zt_app_findings
       WHERE run_id = (SELECT run_id FROM zt_app_findings ORDER BY evaluated_at DESC LIMIT 1)
       AND app_id IN (${placeholders})`,
    ).bind(...appIds).all<ZtAppFindingRow>();

    return new Map(rows.map((r) => [
      r.app_id,
      {
        appId: r.app_id,
        appName: r.app_name,
        appDomain: r.app_domain,
        policyRules: r.policy_rules_json
          ? JSON.parse(r.policy_rules_json) as WorkerRoutePolicy["policyRules"]
          : [],
      },
    ]));
  } catch {
    return null;
  }
}

export async function buildWorkerDetail(
  env: Env,
  workerName: string,
): Promise<WorkerDetail | typeof WORKER_NOT_FOUND> {
  const findings = await getWorkerHostnames(env.DB, workerName);
  if (findings === null) return WORKER_NOT_FOUND;

  const unavailable: WorkerDetailUnavailableSource[] = [];

  const allAppIds = [...new Set(findings.flatMap((f) => f.coveringAppIds))];
  const policiesByAppId = await getAccessPoliciesByAppId(env.DB, allAppIds);
  if (policiesByAppId === null) {
    unavailable.push({ source: "policy", error: "could not read Access application policies" });
  }

  const hostnameSet = new Set(findings.map((f) => f.hostname));
  let recentChanges: RecentChangeEntry[] = [];
  try {
    const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
    const since = new Date(new Date().getTime() - SEVEN_DAYS_MS);
    const { entries } = await fetchAccountAuditLog(creds, since);
    recentChanges = filterWorkersRelevant(entries, hostnameSet);
  } catch (err) {
    unavailable.push({
      source: "recent_changes",
      error: err instanceof Error ? err.message : "unknown error fetching audit log",
    });
  }

  const routes: WorkerRouteEntry[] = findings.map((f) => {
    // A route can list more than one covering app (evaluateHostname's
    // "warning" branch — every covering app, not just the open ones); the
    // response shows one policy per route, so this picks the first one
    // actually found in the latest ZT run, per data-model.md's documented
    // fallback (an app_id absent from that run — evaluation runs for the
    // two modules aren't atomic with each other — degrades to `null`
    // rather than erroring the whole page).
    let policy: WorkerRoutePolicy | null = null;
    if (policiesByAppId) {
      for (const appId of f.coveringAppIds) {
        const found = policiesByAppId.get(appId);
        if (found) {
          policy = found;
          break;
        }
      }
    }
    return {
      hostname: f.hostname,
      kind: f.kind,
      status: f.status as WorkerRouteEntry["status"],
      reason: f.reason,
      policy,
    };
  });

  const environment = classifyEnvironment(
    findings.map((f) => f.kind as Parameters<typeof classifyEnvironment>[0][number]),
  );

  return {
    workerName,
    environment,
    routes,
    recentChanges,
    cloudflareUrl:
      `https://dash.cloudflare.com/${env.CF_ACCOUNT_ID}/workers/services/view/${workerName}/production`,
    unavailable,
  };
}
