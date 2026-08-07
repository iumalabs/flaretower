import { Hono } from "hono";
import { buildStorageInventory } from "./inventory.ts";
import { evaluateBuckets, evaluateD1Databases, evaluateKvNamespaces } from "./evaluate.ts";
import type { BucketEvaluation, D1DatabaseEvaluation, KvNamespaceEvaluation } from "./types.ts";

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export const storageRoutes = new Hono<{ Bindings: Env }>();

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
  }
> {
  const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
  const { buckets, kvNamespaces, d1Databases } = await buildStorageInventory(creds);

  const bucketResults = evaluateBuckets(buckets);
  const kvResults = evaluateKvNamespaces(kvNamespaces);
  const d1Results = evaluateD1Databases(d1Databases);

  const runId = crypto.randomUUID();
  const evaluatedAt = new Date().toISOString();

  const bucketStatements = bucketResults.map((b) =>
    env.DB.prepare(
      `INSERT INTO r2_bucket_findings (id, bucket_name, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), b.bucketName, b.status, b.reason, evaluatedAt, runId, trigger)
  );

  const kvStatements = kvResults.map((k) =>
    env.DB.prepare(
      `INSERT INTO kv_namespace_findings (id, namespace_id, title, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      k.namespaceId,
      k.title,
      k.status,
      k.reason,
      evaluatedAt,
      runId,
      trigger,
    )
  );

  const d1Statements = d1Results.map((d) =>
    env.DB.prepare(
      `INSERT INTO d1_database_findings (id, database_uuid, name, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      d.databaseUuid,
      d.name,
      d.status,
      d.reason,
      evaluatedAt,
      runId,
      trigger,
    )
  );

  const statements = [...bucketStatements, ...kvStatements, ...d1Statements];
  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  return { runId, evaluatedAt, bucketResults, kvResults, d1Results };
}

storageRoutes.post("/evaluate", async (c) => {
  const { runId } = await runStorageEvaluation(c.env, "interactive");
  return c.json({ run_id: runId }, 202);
});

interface BucketFindingRow {
  bucket_name: string;
  status: string;
  reason: string;
}

interface KvFindingRow {
  namespace_id: string;
  title: string;
  status: string;
  reason: string;
}

interface D1FindingRow {
  database_uuid: string;
  name: string;
  status: string;
  reason: string;
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

storageRoutes.get("/inventory", async (c) => {
  const latest = await getLatestRun(c.env);

  if (!latest) {
    return c.json({
      run_id: null,
      evaluated_at: null,
      buckets: [],
      kv_namespaces: [],
      d1_databases: [],
    });
  }

  const [{ results: bucketRows }, { results: kvRows }, { results: d1Rows }] = await Promise.all([
    c.env.DB.prepare(
      `SELECT bucket_name, status, reason FROM r2_bucket_findings WHERE run_id = ? ORDER BY bucket_name`,
    ).bind(latest.run_id).all<BucketFindingRow>(),
    c.env.DB.prepare(
      `SELECT namespace_id, title, status, reason FROM kv_namespace_findings WHERE run_id = ? ORDER BY title`,
    ).bind(latest.run_id).all<KvFindingRow>(),
    c.env.DB.prepare(
      `SELECT database_uuid, name, status, reason FROM d1_database_findings WHERE run_id = ? ORDER BY name`,
    ).bind(latest.run_id).all<D1FindingRow>(),
  ]);

  return c.json({
    run_id: latest.run_id,
    evaluated_at: latest.evaluated_at,
    buckets: bucketRows.map((b) => ({
      bucket_name: b.bucket_name,
      status: b.status,
      reason: b.reason,
    })),
    kv_namespaces: kvRows.map((k) => ({
      namespace_id: k.namespace_id,
      title: k.title,
      status: k.status,
      reason: k.reason,
    })),
    d1_databases: d1Rows.map((d) => ({
      database_uuid: d.database_uuid,
      name: d.name,
      status: d.status,
      reason: d.reason,
    })),
  });
});
