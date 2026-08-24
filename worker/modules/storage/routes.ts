import { Hono } from "hono";
import { requireRole } from "../../auth/access-jwt.ts";
import { buildStorageInventory } from "./inventory.ts";
import { evaluateBuckets, evaluateD1Databases, evaluateKvNamespaces } from "./evaluate.ts";
import {
  diffForBucketAlerts,
  diffForD1DatabaseAlerts,
  diffForKvNamespaceAlerts,
  type OpenAlert,
  resolveForBucketAlerts,
  resolveForD1DatabaseAlerts,
  resolveForKvNamespaceAlerts,
} from "./alerts.ts";
import { type PageQuery, paginateArray, PaginationParamError } from "../../pagination.ts";
import type {
  BucketEvaluation,
  BucketStatus,
  D1DatabaseEvaluation,
  KvNamespaceEvaluation,
  UsageStatus,
} from "./types.ts";

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export const storageRoutes = new Hono<{ Bindings: Env }>();

// issue #465 — D1 read queries can be served by a read replica that lags
// behind the primary (Cloudflare's documented D1 replication behavior).
// getPrevious*Statuses below runs in a fresh Worker invocation every time
// (the scheduled hourly run, or a manual/account-wide RE-SCAN), so a stale
// replica here means "the most recent run" silently isn't the most recent
// run — some OTHER, still-more-recent invocation's write hasn't propagated
// to whichever replica this read landed on yet. Confirmed live: the same
// D1 database repeatedly re-fired a fresh "safe -> warning" alert while its
// real status had stayed "warning" the entire time — the previous-status
// read was seeing an older run than the one that actually preceded it.
// `env.DB.withSession("first-primary")` forces this invocation's first
// query to hit the primary (which always has every committed write),
// eliminating that lag for exactly the read that needs it. The batched
// INSERTs later in this function are unaffected — D1 writes always go to
// the primary regardless of session.
// Exported for tests/unit/storage-routes.test.ts to verify the reads below
// actually go through a "first-primary" session, not env.DB directly.
export function previousStatusReader(env: Env): D1DatabaseSession {
  return env.DB.withSession("first-primary");
}

// The most recent run's per-entity status, read BEFORE the current run is
// inserted — same pattern as every prior module.
export async function getPreviousBucketStatuses(
  reader: D1DatabaseSession,
): Promise<Map<string, BucketStatus>> {
  const { results: rows } = await reader.prepare(
    `SELECT bucket_name, status FROM r2_bucket_findings
     WHERE run_id = (SELECT run_id FROM r2_bucket_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ bucket_name: string; status: BucketStatus }>();
  return new Map(rows.map((r) => [r.bucket_name, r.status]));
}

export async function getPreviousKvNamespaceStatuses(
  reader: D1DatabaseSession,
): Promise<Map<string, UsageStatus>> {
  const { results: rows } = await reader.prepare(
    `SELECT namespace_id, status FROM kv_namespace_findings
     WHERE run_id = (SELECT run_id FROM kv_namespace_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ namespace_id: string; status: UsageStatus }>();
  return new Map(rows.map((r) => [r.namespace_id, r.status]));
}

export async function getPreviousD1DatabaseStatuses(
  reader: D1DatabaseSession,
): Promise<Map<string, UsageStatus>> {
  const { results: rows } = await reader.prepare(
    `SELECT database_uuid, status FROM d1_database_findings
     WHERE run_id = (SELECT run_id FROM d1_database_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ database_uuid: string; status: UsageStatus }>();
  return new Map(rows.map((r) => [r.database_uuid, r.status]));
}

// issue #481 — every alert still open (unacknowledged, unresolved), read
// BEFORE the current run so resolveFor*Alerts (alerts.ts) can decide which
// of them the run that's about to be inserted just resolved. Same
// withSession("first-primary") reader as getPrevious*Statuses above
// (issue #465) — this is exactly the same class of stale-replica risk.
export async function getOpenBucketAlerts(reader: D1DatabaseSession): Promise<OpenAlert[]> {
  const { results } = await reader.prepare(
    `SELECT id, bucket_name AS entityId FROM r2_bucket_alerts
     WHERE acknowledged_at IS NULL AND resolved_at IS NULL`,
  ).all<OpenAlert>();
  return results;
}

export async function getOpenKvNamespaceAlerts(reader: D1DatabaseSession): Promise<OpenAlert[]> {
  const { results } = await reader.prepare(
    `SELECT id, namespace_id AS entityId FROM kv_namespace_alerts
     WHERE acknowledged_at IS NULL AND resolved_at IS NULL`,
  ).all<OpenAlert>();
  return results;
}

export async function getOpenD1DatabaseAlerts(reader: D1DatabaseSession): Promise<OpenAlert[]> {
  const { results } = await reader.prepare(
    `SELECT id, database_uuid AS entityId FROM d1_database_alerts
     WHERE acknowledged_at IS NULL AND resolved_at IS NULL`,
  ).all<OpenAlert>();
  return results;
}

// Shared by POST /evaluate (interactive) and the scheduled handler —
// constitution Principle III.
export async function runStorageEvaluation(
  env: Env,
  trigger: "interactive" | "scheduled",
): Promise<
  {
    runId: string;
    evaluatedAt: string;
    bucketResults: BucketEvaluation[];
    kvResults: KvNamespaceEvaluation[];
    d1Results: D1DatabaseEvaluation[];
    newAlertCount: number;
    resolvedAlertCount: number;
  }
> {
  const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
  const reader = previousStatusReader(env);
  const [
    { buckets, kvNamespaces, d1Databases, accessApplications, bindingReferences },
    previousBucketStatuses,
    previousKvNamespaceStatuses,
    previousD1DatabaseStatuses,
    openBucketAlerts,
    openKvNamespaceAlerts,
    openD1DatabaseAlerts,
  ] = await Promise.all([
    buildStorageInventory(creds),
    getPreviousBucketStatuses(reader),
    getPreviousKvNamespaceStatuses(reader),
    getPreviousD1DatabaseStatuses(reader),
    getOpenBucketAlerts(reader),
    getOpenKvNamespaceAlerts(reader),
    getOpenD1DatabaseAlerts(reader),
  ]);

  const bucketResults = evaluateBuckets(
    buckets,
    accessApplications,
    bindingReferences.r2BucketBoundTo,
  );
  const kvResults = evaluateKvNamespaces(
    kvNamespaces,
    bindingReferences.kvNamespaceIds,
    bindingReferences.allBindingsConfirmed,
    bindingReferences.kvNamespaceBoundTo,
  );
  const d1Results = evaluateD1Databases(
    d1Databases,
    bindingReferences.d1DatabaseIds,
    bindingReferences.allBindingsConfirmed,
    bindingReferences.d1DatabaseBoundTo,
  );

  const runId = crypto.randomUUID();
  const evaluatedAt = new Date().toISOString();

  const bucketStatements = bucketResults.map((b) =>
    env.DB.prepare(
      `INSERT INTO r2_bucket_findings (id, bucket_name, status, reason, evaluated_at, run_id, run_trigger, custom_domain, bound_to_workers)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      b.bucketName,
      b.status,
      b.reason,
      evaluatedAt,
      runId,
      trigger,
      b.customDomain,
      JSON.stringify(b.boundToWorkers),
    )
  );

  const kvStatements = kvResults.map((k) =>
    env.DB.prepare(
      `INSERT INTO kv_namespace_findings (id, namespace_id, title, status, reason, evaluated_at, run_id, run_trigger, bound_to_workers)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      k.namespaceId,
      k.title,
      k.status,
      k.reason,
      evaluatedAt,
      runId,
      trigger,
      JSON.stringify(k.boundToWorkers),
    )
  );

  const d1Statements = d1Results.map((d) =>
    env.DB.prepare(
      `INSERT INTO d1_database_findings (id, database_uuid, name, status, reason, evaluated_at, run_id, run_trigger, bound_to_workers, num_tables, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      d.databaseUuid,
      d.name,
      d.status,
      d.reason,
      evaluatedAt,
      runId,
      trigger,
      JSON.stringify(d.boundToWorkers),
      d.numTables,
      d.fileSizeBytes,
    )
  );

  const statements = [...bucketStatements, ...kvStatements, ...d1Statements];
  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  const newBucketAlerts = diffForBucketAlerts(bucketResults, previousBucketStatuses);
  const newKvAlerts = diffForKvNamespaceAlerts(kvResults, previousKvNamespaceStatuses);
  const newD1Alerts = diffForD1DatabaseAlerts(d1Results, previousD1DatabaseStatuses);

  // issue #481 — the ids resolveFor*Alerts (alerts.ts) says just recovered
  // to safe, turned into one UPDATE statement per id against its own
  // alerts table.
  function resolveStatements(table: string, ids: string[]): D1PreparedStatement[] {
    return ids.map((id) =>
      env.DB.prepare(`UPDATE ${table} SET resolved_at = ? WHERE id = ?`).bind(evaluatedAt, id)
    );
  }

  const resolvedBucketAlertStatements = resolveStatements(
    "r2_bucket_alerts",
    resolveForBucketAlerts(bucketResults, openBucketAlerts),
  );
  const resolvedKvAlertStatements = resolveStatements(
    "kv_namespace_alerts",
    resolveForKvNamespaceAlerts(kvResults, openKvNamespaceAlerts),
  );
  const resolvedD1AlertStatements = resolveStatements(
    "d1_database_alerts",
    resolveForD1DatabaseAlerts(d1Results, openD1DatabaseAlerts),
  );

  const bucketAlertStatements = newBucketAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO r2_bucket_alerts (id, bucket_name, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), a.bucketName, a.previousStatus, a.newStatus, runId, evaluatedAt)
  );

  const kvAlertStatements = newKvAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO kv_namespace_alerts (id, namespace_id, title, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.namespaceId,
      a.title,
      a.previousStatus,
      a.newStatus,
      runId,
      evaluatedAt,
    )
  );

  const d1AlertStatements = newD1Alerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO d1_database_alerts (id, database_uuid, name, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.databaseUuid,
      a.name,
      a.previousStatus,
      a.newStatus,
      runId,
      evaluatedAt,
    )
  );

  const alertStatements = [
    ...bucketAlertStatements,
    ...kvAlertStatements,
    ...d1AlertStatements,
    ...resolvedBucketAlertStatements,
    ...resolvedKvAlertStatements,
    ...resolvedD1AlertStatements,
  ];
  if (alertStatements.length > 0) {
    await env.DB.batch(alertStatements);
  }

  return {
    runId,
    evaluatedAt,
    bucketResults,
    kvResults,
    d1Results,
    newAlertCount: newBucketAlerts.length + newKvAlerts.length + newD1Alerts.length,
    resolvedAlertCount: resolvedBucketAlertStatements.length + resolvedKvAlertStatements.length +
      resolvedD1AlertStatements.length,
  };
}

storageRoutes.post("/evaluate", async (c) => {
  const { runId } = await runStorageEvaluation(c.env, "interactive");
  return c.json({ run_id: runId }, 202);
});

interface BucketFindingRow {
  bucket_name: string;
  status: string;
  reason: string;
  custom_domain: string | null;
  bound_to_workers: string | null;
}

interface KvFindingRow {
  namespace_id: string;
  title: string;
  status: string;
  reason: string;
  bound_to_workers: string | null;
}

interface D1FindingRow {
  database_uuid: string;
  name: string;
  status: string;
  reason: string;
  bound_to_workers: string | null;
  num_tables: number | null;
  file_size: number | null;
}

// specs/016-storage-dashboard data-model.md — "none" for zero referencing
// Workers, the single name for exactly one, a count for more than one
// (never a truncated name list).
export function boundToLabel(workers: readonly string[]): string {
  if (workers.length === 0) return "none";
  if (workers.length === 1) return workers[0];
  return `${workers.length} workers`;
}

// bound_to_workers predates this migration for rows written before it, so
// the column can be NULL — treated the same as "confirmed zero" (`[]`)
// rather than a parse error.
function parseBoundToWorkers(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Unlike Modules 1-4, buckets/namespaces/databases are three fully
// independent counts — zero buckets doesn't imply zero namespaces or
// databases — so "did a run happen" is determined by taking the latest
// evaluated_at across all three finding tables, not by assuming any one
// of them always has at least one row.
async function getLatestRun(env: Env): Promise<{ run_id: string; evaluated_at: string } | null> {
  const [bucket, kv, d1] = await Promise.all([
    env.DB.prepare(
      `SELECT run_id, evaluated_at FROM r2_bucket_findings ORDER BY evaluated_at DESC LIMIT 1`,
    )
      .first<{ run_id: string; evaluated_at: string }>(),
    env.DB.prepare(
      `SELECT run_id, evaluated_at FROM kv_namespace_findings ORDER BY evaluated_at DESC LIMIT 1`,
    ).first<{ run_id: string; evaluated_at: string }>(),
    env.DB.prepare(
      `SELECT run_id, evaluated_at FROM d1_database_findings ORDER BY evaluated_at DESC LIMIT 1`,
    )
      .first<{ run_id: string; evaluated_at: string }>(),
  ]);

  const candidates = [bucket, kv, d1].filter((c): c is { run_id: string; evaluated_at: string } =>
    c !== null
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.evaluated_at.localeCompare(a.evaluated_at));
  return candidates[0];
}

interface BucketOut {
  bucket_name: string;
  status: string;
  reason: string;
  custom_domain: string | null;
  bound_to_workers: string[];
  bound_to: string;
}
interface KvOut {
  namespace_id: string;
  title: string;
  status: string;
  reason: string;
  bound_to_workers: string[];
  bound_to: string;
}
interface D1Out {
  database_uuid: string;
  name: string;
  status: string;
  reason: string;
  bound_to_workers: string[];
  bound_to: string;
  num_tables: number | null;
  file_size: number | null;
}

const BUCKET_SORT: Record<string, (r: BucketOut) => string | number> = {
  name: (r) => r.bucket_name,
  custom_domain: (r) => r.custom_domain ?? "",
  bound_to: (r) => r.bound_to,
};
const KV_SORT: Record<string, (r: KvOut) => string | number> = {
  name: (r) => r.title,
  bound_to: (r) => r.bound_to,
};
const D1_SORT: Record<string, (r: D1Out) => string | number> = {
  name: (r) => r.name,
  num_tables: (r) => r.num_tables ?? -1,
  file_size: (r) => r.file_size ?? -1,
  bound_to: (r) => r.bound_to,
};

export interface StorageInventoryQuery {
  bucket?: PageQuery;
  kv?: PageQuery;
  d1?: PageQuery;
}

// Pure — extracted for the same reason DNS/Workers' pagination logic was:
// three independent collections, each needing its own page/sort, plus
// account-wide totals and a single cross-collection critical_finding that
// must reflect all three collections' full data, not just whichever page
// happens to be showing (research.md §2's Storage note; same
// pagination-must-not-hide-a-critical-row fix as DNS's critical_finding).
export function buildStorageInventoryResponse(
  bucketRows: BucketFindingRow[],
  kvRows: KvFindingRow[],
  d1Rows: D1FindingRow[],
  runId: string | null,
  evaluatedAt: string | null,
  query: StorageInventoryQuery,
) {
  const buckets: BucketOut[] = bucketRows.map((b) => {
    const boundToWorkers = parseBoundToWorkers(b.bound_to_workers);
    return {
      bucket_name: b.bucket_name,
      status: b.status,
      reason: b.reason,
      custom_domain: b.custom_domain,
      bound_to_workers: boundToWorkers,
      bound_to: boundToLabel(boundToWorkers),
    };
  });
  const kvNamespaces: KvOut[] = kvRows.map((k) => {
    const boundToWorkers = parseBoundToWorkers(k.bound_to_workers);
    return {
      namespace_id: k.namespace_id,
      title: k.title,
      status: k.status,
      reason: k.reason,
      bound_to_workers: boundToWorkers,
      bound_to: boundToLabel(boundToWorkers),
    };
  });
  const d1Databases: D1Out[] = d1Rows.map((d) => {
    const boundToWorkers = parseBoundToWorkers(d.bound_to_workers);
    return {
      database_uuid: d.database_uuid,
      name: d.name,
      status: d.status,
      reason: d.reason,
      bound_to_workers: boundToWorkers,
      bound_to: boundToLabel(boundToWorkers),
      num_tables: d.num_tables,
      file_size: d.file_size,
    };
  });

  const totalResources = buckets.length + kvNamespaces.length + d1Databases.length;
  const totalExposed =
    [...buckets, ...kvNamespaces, ...d1Databases].filter((r) => r.status === "critical").length;

  // Same priority order as the frontend previously computed client-side:
  // bucket > kv > d1, first critical row wins within each.
  const criticalBucket = buckets.find((r) => r.status === "critical");
  const criticalKv = kvNamespaces.find((r) => r.status === "critical");
  const criticalD1 = d1Databases.find((r) => r.status === "critical");
  const criticalFinding = criticalBucket
    ? {
      title: "An R2 bucket is publicly exposed",
      target: criticalBucket.bucket_name,
      reason: criticalBucket.reason,
    }
    : criticalKv
    ? {
      title: "A KV namespace needs attention",
      target: criticalKv.title,
      reason: criticalKv.reason,
    }
    : criticalD1
    ? { title: "A D1 database needs attention", target: criticalD1.name, reason: criticalD1.reason }
    : null;

  const bucketPage = paginateArray(buckets, query.bucket ?? {}, BUCKET_SORT, "name");
  const kvPage = paginateArray(kvNamespaces, query.kv ?? {}, KV_SORT, "name");
  const d1Page = paginateArray(d1Databases, query.d1 ?? {}, D1_SORT, "name");

  return {
    run_id: runId,
    evaluated_at: evaluatedAt,
    total_resources: totalResources,
    total_exposed: totalExposed,
    critical_finding: criticalFinding,
    buckets: bucketPage.items,
    buckets_pagination: bucketPage.pagination,
    kv_namespaces: kvPage.items,
    kv_namespaces_pagination: kvPage.pagination,
    d1_databases: d1Page.items,
    d1_databases_pagination: d1Page.pagination,
  };
}

storageRoutes.get("/inventory", async (c) => {
  const query: StorageInventoryQuery = {
    bucket: {
      page: c.req.query("bucket_page"),
      page_size: c.req.query("bucket_page_size"),
      sort_key: c.req.query("bucket_sort_key"),
      sort_dir: c.req.query("bucket_sort_dir"),
    },
    kv: {
      page: c.req.query("kv_page"),
      page_size: c.req.query("kv_page_size"),
      sort_key: c.req.query("kv_sort_key"),
      sort_dir: c.req.query("kv_sort_dir"),
    },
    d1: {
      page: c.req.query("d1_page"),
      page_size: c.req.query("d1_page_size"),
      sort_key: c.req.query("d1_sort_key"),
      sort_dir: c.req.query("d1_sort_dir"),
    },
  };

  const latest = await getLatestRun(c.env);

  try {
    if (!latest) {
      return c.json(buildStorageInventoryResponse([], [], [], null, null, query));
    }

    const [{ results: bucketRows }, { results: kvRows }, { results: d1Rows }] = await Promise.all([
      c.env.DB.prepare(
        `SELECT bucket_name, status, reason, custom_domain, bound_to_workers FROM r2_bucket_findings WHERE run_id = ? ORDER BY bucket_name`,
      ).bind(latest.run_id).all<BucketFindingRow>(),
      c.env.DB.prepare(
        `SELECT namespace_id, title, status, reason, bound_to_workers FROM kv_namespace_findings WHERE run_id = ? ORDER BY title`,
      ).bind(latest.run_id).all<KvFindingRow>(),
      c.env.DB.prepare(
        `SELECT database_uuid, name, status, reason, bound_to_workers, num_tables, file_size FROM d1_database_findings WHERE run_id = ? ORDER BY name`,
      ).bind(latest.run_id).all<D1FindingRow>(),
    ]);

    return c.json(
      buildStorageInventoryResponse(
        bucketRows,
        kvRows,
        d1Rows,
        latest.run_id,
        latest.evaluated_at,
        query,
      ),
    );
  } catch (err) {
    if (err instanceof PaginationParamError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
});

interface BucketAlertRow {
  id: string;
  bucket_name: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

interface KvAlertRow {
  id: string;
  namespace_id: string;
  title: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

interface D1AlertRow {
  id: string;
  database_uuid: string;
  name: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

// Merges all three alert tables at the API layer with a `kind`
// discriminator (contracts/api.md) — the tables stay separate in D1
// (data-model.md §5's rationale), combined only for this response.
storageRoutes.get("/alerts", async (c) => {
  const [{ results: bucketRows }, { results: kvRows }, { results: d1Rows }] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, bucket_name, previous_status, new_status, detected_at, acknowledged_at
       FROM r2_bucket_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL ORDER BY detected_at DESC`,
    ).all<BucketAlertRow>(),
    c.env.DB.prepare(
      `SELECT id, namespace_id, title, previous_status, new_status, detected_at, acknowledged_at
       FROM kv_namespace_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL ORDER BY detected_at DESC`,
    ).all<KvAlertRow>(),
    c.env.DB.prepare(
      `SELECT id, database_uuid, name, previous_status, new_status, detected_at, acknowledged_at
       FROM d1_database_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL ORDER BY detected_at DESC`,
    ).all<D1AlertRow>(),
  ]);

  return c.json({
    alerts: [
      ...bucketRows.map((r) => ({
        id: r.id,
        kind: "bucket" as const,
        bucket_name: r.bucket_name,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
      ...kvRows.map((r) => ({
        id: r.id,
        kind: "kv_namespace" as const,
        namespace_id: r.namespace_id,
        title: r.title,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
      ...d1Rows.map((r) => ({
        id: r.id,
        kind: "d1_database" as const,
        database_uuid: r.database_uuid,
        name: r.name,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
    ],
  });
});

const ALERT_TABLE_BY_KIND: Record<string, string> = {
  bucket: "r2_bucket_alerts",
  kv_namespace: "kv_namespace_alerts",
  d1_database: "d1_database_alerts",
};

// Not a Cloudflare account mutation (FR-015 scope boundary) — not written
// to audit_log, same as every prior module's equivalent endpoint.
storageRoutes.post("/alerts/:kind/:id/acknowledge", requireRole("admin"), async (c) => {
  const kind = c.req.param("kind");
  const id = c.req.param("id");
  const table = ALERT_TABLE_BY_KIND[kind];

  if (!table) {
    return c.json({ error: `unknown alert kind: ${kind}` }, 404);
  }

  const existing = await c.env.DB.prepare(
    `SELECT acknowledged_at FROM ${table} WHERE id = ?`,
  ).bind(id).first<{ acknowledged_at: string | null }>();

  if (!existing) {
    return c.json({ error: "alert not found" }, 404);
  }

  if (existing.acknowledged_at) {
    return c.json({ id, acknowledged_at: existing.acknowledged_at });
  }

  const acknowledgedAt = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE ${table} SET acknowledged_at = ? WHERE id = ?`,
  ).bind(acknowledgedAt, id).run();

  return c.json({ id, acknowledged_at: acknowledgedAt });
});
