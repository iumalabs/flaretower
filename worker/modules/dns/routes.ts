import { Hono } from "hono";
import { buildDnsInventory, listDanglingInsights } from "./inventory.ts";
import { evaluateDnsInventory } from "./evaluate.ts";
import type { ZoneEvaluation } from "./types.ts";

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export const dnsRoutes = new Hono<{ Bindings: Env }>();

// Shared by POST /evaluate (interactive) and the scheduled handler —
// constitution Principle III.
export async function runDnsEvaluation(
  env: Env,
  trigger: "interactive" | "scheduled",
): Promise<{ runId: string; evaluatedAt: string; results: ZoneEvaluation[] }> {
  const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
  const [zones, danglingInsights] = await Promise.all([
    buildDnsInventory(creds),
    listDanglingInsights(creds),
  ]);
  const results = evaluateDnsInventory(zones, danglingInsights);

  const runId = crypto.randomUUID();
  const evaluatedAt = new Date().toISOString();

  const statements = results.flatMap((zone) =>
    zone.records.map((r) =>
      env.DB.prepare(
        `INSERT INTO dns_findings
           (id, zone_name, record_name, record_type, content, proxy_capable, proxied, status, reason, evaluated_at, run_id, run_trigger)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        zone.zoneName,
        r.recordName,
        r.recordType,
        r.content,
        r.proxyCapable ? 1 : 0,
        r.proxied === null ? null : (r.proxied ? 1 : 0),
        r.status,
        r.reason,
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

dnsRoutes.post("/evaluate", async (c) => {
  const { runId } = await runDnsEvaluation(c.env, "interactive");
  return c.json({ run_id: runId }, 202);
});

interface FindingRow {
  zone_name: string;
  record_name: string;
  record_type: string;
  content: string;
  proxy_capable: number;
  proxied: number | null;
  status: string;
  reason: string;
}

dnsRoutes.get("/inventory", async (c) => {
  const latest = await c.env.DB.prepare(
    `SELECT run_id, evaluated_at FROM dns_findings ORDER BY evaluated_at DESC LIMIT 1`,
  ).first<{ run_id: string; evaluated_at: string }>();

  if (!latest) {
    return c.json({ run_id: null, evaluated_at: null, zones: [] });
  }

  const { results: rows } = await c.env.DB.prepare(
    `SELECT zone_name, record_name, record_type, content, proxy_capable, proxied, status, reason
     FROM dns_findings WHERE run_id = ?
     ORDER BY zone_name, record_name, record_type`,
  ).bind(latest.run_id).all<FindingRow>();

  const byZone = new Map<string, FindingRow[]>();
  for (const row of rows) {
    const list = byZone.get(row.zone_name) ?? [];
    list.push(row);
    byZone.set(row.zone_name, list);
  }

  return c.json({
    run_id: latest.run_id,
    evaluated_at: latest.evaluated_at,
    zones: Array.from(byZone.entries()).map(([zone_name, records]) => ({
      zone_name,
      records: records.map((r) => ({
        record_name: r.record_name,
        type: r.record_type,
        content: r.content,
        proxy_capable: r.proxy_capable === 1,
        proxied: r.proxied === null ? null : r.proxied === 1,
        status: r.status,
        reason: r.reason,
      })),
    })),
  });
});

// GET /alerts and POST /alerts/:id/acknowledge land in US4.
dnsRoutes.all("/alerts", (c) => c.text("not implemented", 501));
dnsRoutes.all("/alerts/*", (c) => c.text("not implemented", 501));
