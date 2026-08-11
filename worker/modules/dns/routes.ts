import { Hono } from "hono";
import { requireRole } from "../../auth/access-jwt.ts";
import { buildDnsInventory, listDanglingInsights } from "./inventory.ts";
import { evaluateDnsInventory } from "./evaluate.ts";
import { diffForDnsAlerts, dnsRecordKey } from "./alerts.ts";
import type { DnsExposureStatus, ZoneEvaluation } from "./types.ts";

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export const dnsRoutes = new Hono<{ Bindings: Env }>();

// The most recent run's per-record status, read BEFORE the current run is
// inserted — same pattern as Module 1's getPreviousStatuses, keyed by
// dnsRecordKey (zone+name+type+content) per data-model.md's note.
async function getPreviousDnsStatuses(env: Env): Promise<Map<string, DnsExposureStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT zone_name, record_name, record_type, content, status FROM dns_findings
     WHERE run_id = (SELECT run_id FROM dns_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<
    {
      zone_name: string;
      record_name: string;
      record_type: string;
      content: string;
      status: DnsExposureStatus;
    }
  >();

  return new Map(
    rows.map((r) => [dnsRecordKey(r.zone_name, r.record_name, r.record_type, r.content), r.status]),
  );
}

// Shared by POST /evaluate (interactive) and the scheduled handler —
// constitution Principle III.
export async function runDnsEvaluation(
  env: Env,
  trigger: "interactive" | "scheduled",
): Promise<
  { runId: string; evaluatedAt: string; results: ZoneEvaluation[]; newAlertCount: number }
> {
  const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
  const [zones, danglingInsights, previousStatuses] = await Promise.all([
    buildDnsInventory(creds),
    listDanglingInsights(creds),
    getPreviousDnsStatuses(env),
  ]);
  const results = evaluateDnsInventory(zones, danglingInsights);

  const runId = crypto.randomUUID();
  const evaluatedAt = new Date().toISOString();

  const findingStatements = results.flatMap((zone) =>
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

  if (findingStatements.length > 0) {
    await env.DB.batch(findingStatements);
  }

  const newAlerts = diffForDnsAlerts(results, previousStatuses);
  const alertStatements = newAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO dns_alerts
         (id, zone_name, record_name, record_type, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.zoneName,
      a.recordName,
      a.recordType,
      a.previousStatus,
      a.newStatus,
      runId,
      evaluatedAt,
    )
  );

  if (alertStatements.length > 0) {
    await env.DB.batch(alertStatements);
  }

  return { runId, evaluatedAt, results, newAlertCount: newAlerts.length };
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

interface AlertRow {
  id: string;
  zone_name: string;
  record_name: string;
  record_type: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

dnsRoutes.get("/alerts", async (c) => {
  const { results: rows } = await c.env.DB.prepare(
    `SELECT id, zone_name, record_name, record_type, previous_status, new_status, detected_at, acknowledged_at
     FROM dns_alerts
     WHERE acknowledged_at IS NULL
     ORDER BY detected_at DESC`,
  ).all<AlertRow>();

  return c.json({
    alerts: rows.map((r) => ({
      id: r.id,
      zone_name: r.zone_name,
      record_name: r.record_name,
      record_type: r.record_type,
      previous_status: r.previous_status,
      new_status: r.new_status,
      detected_at: r.detected_at,
      acknowledged_at: r.acknowledged_at,
    })),
  });
});

// Not a Cloudflare account mutation (FR-012 scope boundary) — not written
// to audit_log, same as Module 1's equivalent endpoint.
dnsRoutes.post("/alerts/:id/acknowledge", requireRole("admin"), async (c) => {
  const id = c.req.param("id");

  const existing = await c.env.DB.prepare(
    `SELECT acknowledged_at FROM dns_alerts WHERE id = ?`,
  ).bind(id).first<{ acknowledged_at: string | null }>();

  if (!existing) {
    return c.json({ error: "alert not found" }, 404);
  }

  if (existing.acknowledged_at) {
    return c.json({ id, acknowledged_at: existing.acknowledged_at });
  }

  const acknowledgedAt = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE dns_alerts SET acknowledged_at = ? WHERE id = ?`,
  ).bind(acknowledgedAt, id).run();

  return c.json({ id, acknowledged_at: acknowledgedAt });
});
