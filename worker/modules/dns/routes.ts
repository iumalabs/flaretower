import { Hono } from "hono";
import { requireRole } from "../../auth/access-jwt.ts";
import { buildDnsInventory, listDanglingInsights } from "./inventory.ts";
import { evaluateDnsInventory, isPlatformTargetDomain } from "./evaluate.ts";
import { diffForDnsAlerts, dnsRecordKey, type OpenAlert, resolveForDnsAlerts } from "./alerts.ts";
import { type PageQuery, paginateArray, PaginationParamError } from "../../pagination.ts";
import type { DnsExposureStatus, ZoneEvaluation } from "./types.ts";

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export const dnsRoutes = new Hono<{ Bindings: Env }>();

// Sentinel `record_type` for a zone that was successfully enumerated but has
// zero DNS records (a legitimate, valid state — buildDnsInventory correctly
// produces this). dns_findings only has per-record rows, so without this
// marker a zero-record zone contributes no rows to a run and GET /inventory
// (which groups strictly from dns_findings) would silently drop it —
// contradicting FR-003/US1-AC3/SC-002. One marker row per empty zone keeps
// the zone represented; the read path below strips markers back out of the
// `records` array it returns, so callers just see `records: []`.
const EMPTY_ZONE_RECORD_TYPE = "(empty)";

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

// issue #481 — every dns_alerts row still open (unacknowledged,
// unresolved), read BEFORE the current run so resolveForDnsAlerts
// (alerts.ts) can decide which of them the run about to be inserted just
// resolved.
async function getOpenDnsAlerts(env: Env): Promise<OpenAlert[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, zone_name AS zoneName, record_name AS recordName, record_type AS recordType
     FROM dns_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL`,
  ).all<OpenAlert>();
  return results;
}

// Shared by POST /evaluate (interactive) and the scheduled handler —
// constitution Principle III.
export async function runDnsEvaluation(
  env: Env,
  trigger: "interactive" | "scheduled",
): Promise<
  {
    runId: string;
    evaluatedAt: string;
    results: ZoneEvaluation[];
    newAlertCount: number;
    resolvedAlertCount: number;
  }
> {
  const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
  const [zones, danglingInsights, previousStatuses, openAlerts] = await Promise.all([
    buildDnsInventory(creds),
    listDanglingInsights(creds),
    getPreviousDnsStatuses(env),
    getOpenDnsAlerts(env),
  ]);
  const results = evaluateDnsInventory(zones, danglingInsights);

  const runId = crypto.randomUUID();
  const evaluatedAt = new Date().toISOString();

  const findingStatements = results.flatMap((zone) => {
    // Zero records is a legitimate, successfully-enumerated state — write
    // one marker row so the zone still shows up in GET /inventory, rather
    // than contributing nothing to this run at all.
    if (zone.records.length === 0) {
      return [
        env.DB.prepare(
          `INSERT INTO dns_findings
             (id, zone_name, record_name, record_type, content, proxy_capable, proxied, ttl, status, reason, evaluated_at, run_id, run_trigger)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          zone.zoneName,
          "",
          EMPTY_ZONE_RECORD_TYPE,
          "",
          0,
          null,
          null,
          "safe",
          "zone has no DNS records",
          evaluatedAt,
          runId,
          trigger,
        ),
      ];
    }

    return zone.records.map((r) =>
      env.DB.prepare(
        `INSERT INTO dns_findings
           (id, zone_name, record_name, record_type, content, proxy_capable, proxied, ttl, status, reason, evaluated_at, run_id, run_trigger)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        zone.zoneName,
        r.recordName,
        r.recordType,
        r.content,
        r.proxyCapable ? 1 : 0,
        r.proxied === null ? null : (r.proxied ? 1 : 0),
        r.ttl,
        r.status,
        r.reason,
        evaluatedAt,
        runId,
        trigger,
      )
    );
  });

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

  const resolvedIds = resolveForDnsAlerts(results, openAlerts);
  const resolveStatements = resolvedIds.map((id) =>
    env.DB.prepare(`UPDATE dns_alerts SET resolved_at = ? WHERE id = ?`).bind(evaluatedAt, id)
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
  ttl: number | null;
  status: string;
  reason: string;
}

interface DnsRecordOut {
  record_name: string;
  type: string;
  content: string;
  proxy_capable: boolean;
  proxied: boolean | null;
  ttl: number | null;
  is_platform_target: boolean;
  status: string;
  reason: string;
}

export interface DnsInventoryQuery extends PageQuery {
  zone?: string;
}

// Only the 3 columns the frontend actually renders as sortable
// (DnsInventory.tsx's COLUMNS) — content/proxy/reason have no sortValue
// there today, so there's nothing to whitelist for them.
const DNS_RECORD_SORT: Record<string, (r: DnsRecordOut) => string | number> = {
  type: (r) => r.type,
  name: (r) => r.record_name,
  ttl: (r) => r.ttl ?? -1,
};

// Pure — extracted so the zone-summary/pagination logic is testable without
// a D1 mock (GET /inventory's own single unfiltered-by-zone SELECT is
// unchanged, so the existing mock-D1 test harness for that query still
// applies unmodified). Takes every row for the run (across all zones, as
// today) and does the per-zone grouping, account-wide totals, zone
// selection, and pagination/sort in plain JS.
export function buildDnsInventoryResponse(
  rows: FindingRow[],
  runId: string | null,
  evaluatedAt: string | null,
  query: DnsInventoryQuery,
) {
  const byZone = new Map<string, FindingRow[]>();
  for (const row of rows) {
    // Ensures the zone key exists even when its only row is the empty-zone
    // marker — the marker itself is never surfaced as a "record".
    const list = byZone.get(row.zone_name) ?? [];
    byZone.set(row.zone_name, list);
    if (row.record_type === EMPTY_ZONE_RECORD_TYPE) continue;
    list.push(row);
  }

  const zoneSummaries = Array.from(byZone.entries()).map(([zone_name, records]) => ({
    zone_name,
    record_count: records.length,
  }));
  const totalRecords = zoneSummaries.reduce((sum, z) => sum + z.record_count, 0);
  const totalDangling =
    rows.filter((r) => r.record_type !== EMPTY_ZONE_RECORD_TYPE && r.status === "critical").length;

  // Defaults to the first zone (query order == `ORDER BY zone_name` below,
  // same "first zone" convention DnsInventory.tsx used to pick client-side)
  // when no `zone` is requested. An unrecognized `zone` name is treated as
  // lenient-empty (0 records) rather than a 400 — the frontend only ever
  // sends a name it already got from zone_summaries, so this only matters
  // for a stale/manual query, and "no records" is a safe, honest answer.
  const selectedZone = query.zone ?? zoneSummaries[0]?.zone_name ?? null;
  const zoneRecords = selectedZone ? (byZone.get(selectedZone) ?? []) : [];

  const outRecords: DnsRecordOut[] = zoneRecords.map((r) => ({
    record_name: r.record_name,
    type: r.record_type,
    content: r.content,
    proxy_capable: r.proxy_capable === 1,
    proxied: r.proxied === null ? null : r.proxied === 1,
    ttl: r.ttl,
    is_platform_target: isPlatformTargetDomain(r.content),
    status: r.status,
    reason: r.reason,
  }));

  const { items: records, pagination } = paginateArray(outRecords, query, DNS_RECORD_SORT, "name");

  // Scoped to the whole selected zone, not just the current page — the
  // frontend's alert banner surfaces the zone's worst finding regardless of
  // which page happens to be showing (pagination must not hide a critical
  // record that's simply on a different page).
  const criticalFinding = outRecords.find((r) => r.status === "critical") ?? null;

  return {
    run_id: runId,
    evaluated_at: evaluatedAt,
    total_records: totalRecords,
    total_dangling: totalDangling,
    zone_summaries: zoneSummaries,
    selected_zone: selectedZone,
    critical_finding: criticalFinding
      ? { record_name: criticalFinding.record_name, reason: criticalFinding.reason }
      : null,
    records,
    records_pagination: pagination,
  };
}

dnsRoutes.get("/inventory", async (c) => {
  const query: DnsInventoryQuery = {
    zone: c.req.query("zone"),
    page: c.req.query("page"),
    page_size: c.req.query("page_size"),
    sort_key: c.req.query("sort_key"),
    sort_dir: c.req.query("sort_dir"),
  };

  const latest = await c.env.DB.prepare(
    `SELECT run_id, evaluated_at FROM dns_findings ORDER BY evaluated_at DESC LIMIT 1`,
  ).first<{ run_id: string; evaluated_at: string }>();

  try {
    if (!latest) {
      return c.json(buildDnsInventoryResponse([], null, null, query));
    }

    const { results: rows } = await c.env.DB.prepare(
      `SELECT zone_name, record_name, record_type, content, proxy_capable, proxied, ttl, status, reason
       FROM dns_findings WHERE run_id = ?
       ORDER BY zone_name, record_name, record_type`,
    ).bind(latest.run_id).all<FindingRow>();

    return c.json(buildDnsInventoryResponse(rows, latest.run_id, latest.evaluated_at, query));
  } catch (err) {
    if (err instanceof PaginationParamError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
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
     WHERE acknowledged_at IS NULL AND resolved_at IS NULL
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
