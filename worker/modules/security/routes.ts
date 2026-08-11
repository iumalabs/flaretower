import { Hono } from "hono";
import { requireRole } from "../../auth/access-jwt.ts";
import { buildSecurityInventory, listTurnstileWidgets } from "./inventory.ts";
import {
  evaluateDnssecs,
  evaluateRateLimitings,
  evaluateSslTlsModes,
  evaluateWafs,
} from "./evaluate.ts";
import {
  diffForDnssecAlerts,
  diffForRateLimitingAlerts,
  diffForSslTlsAlerts,
  diffForWafAlerts,
} from "./alerts.ts";
import type {
  DnssecEvaluation,
  ProtectionStatus,
  RateLimitingEvaluation,
  SslTlsEvaluation,
  SslTlsStatus,
  WafEvaluation,
} from "./types.ts";

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export const securityRoutes = new Hono<{ Bindings: Env }>();

// The most recent run's per-entity status, read BEFORE the current run
// is inserted — same pattern as every prior module.
async function getPreviousSslTlsStatuses(env: Env): Promise<Map<string, SslTlsStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT zone_id, status FROM ssl_tls_findings
     WHERE run_id = (SELECT run_id FROM ssl_tls_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ zone_id: string; status: SslTlsStatus }>();
  return new Map(rows.map((r) => [r.zone_id, r.status]));
}

async function getPreviousDnssecStatuses(env: Env): Promise<Map<string, ProtectionStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT zone_id, status FROM dnssec_findings
     WHERE run_id = (SELECT run_id FROM dnssec_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ zone_id: string; status: ProtectionStatus }>();
  return new Map(rows.map((r) => [r.zone_id, r.status]));
}

async function getPreviousWafStatuses(env: Env): Promise<Map<string, ProtectionStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT zone_id, status FROM waf_findings
     WHERE run_id = (SELECT run_id FROM waf_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ zone_id: string; status: ProtectionStatus }>();
  return new Map(rows.map((r) => [r.zone_id, r.status]));
}

async function getPreviousRateLimitingStatuses(env: Env): Promise<Map<string, ProtectionStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT zone_id, status FROM rate_limiting_findings
     WHERE run_id = (SELECT run_id FROM rate_limiting_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ zone_id: string; status: ProtectionStatus }>();
  return new Map(rows.map((r) => [r.zone_id, r.status]));
}

// Shared by POST /evaluate (interactive) and the scheduled handler —
// constitution Principle III.
export async function runSecurityEvaluation(
  env: Env,
  trigger: "interactive" | "scheduled",
): Promise<
  {
    runId: string;
    evaluatedAt: string;
    sslTlsResults: SslTlsEvaluation[];
    dnssecResults: DnssecEvaluation[];
    wafResults: WafEvaluation[];
    rateLimitingResults: RateLimitingEvaluation[];
    newAlertCount: number;
  }
> {
  const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
  const [
    { zones },
    previousSslTlsStatuses,
    previousDnssecStatuses,
    previousWafStatuses,
    previousRateLimitingStatuses,
  ] = await Promise.all([
    buildSecurityInventory(creds),
    getPreviousSslTlsStatuses(env),
    getPreviousDnssecStatuses(env),
    getPreviousWafStatuses(env),
    getPreviousRateLimitingStatuses(env),
  ]);

  const sslTlsResults = evaluateSslTlsModes(zones);
  const dnssecResults = evaluateDnssecs(zones);
  const wafResults = evaluateWafs(zones);
  const rateLimitingResults = evaluateRateLimitings(zones);

  const runId = crypto.randomUUID();
  const evaluatedAt = new Date().toISOString();

  const sslTlsStatements = sslTlsResults.map((s) =>
    env.DB.prepare(
      `INSERT INTO ssl_tls_findings (id, zone_id, zone_name, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      s.zoneId,
      s.zoneName,
      s.status,
      s.reason,
      evaluatedAt,
      runId,
      trigger,
    )
  );

  const dnssecStatements = dnssecResults.map((d) =>
    env.DB.prepare(
      `INSERT INTO dnssec_findings (id, zone_id, zone_name, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      d.zoneId,
      d.zoneName,
      d.status,
      d.reason,
      evaluatedAt,
      runId,
      trigger,
    )
  );

  const wafStatements = wafResults.map((w) =>
    env.DB.prepare(
      `INSERT INTO waf_findings (id, zone_id, zone_name, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      w.zoneId,
      w.zoneName,
      w.status,
      w.reason,
      evaluatedAt,
      runId,
      trigger,
    )
  );

  const rateLimitingStatements = rateLimitingResults.map((r) =>
    env.DB.prepare(
      `INSERT INTO rate_limiting_findings (id, zone_id, zone_name, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      r.zoneId,
      r.zoneName,
      r.status,
      r.reason,
      evaluatedAt,
      runId,
      trigger,
    )
  );

  const statements = [
    ...sslTlsStatements,
    ...dnssecStatements,
    ...wafStatements,
    ...rateLimitingStatements,
  ];
  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  const newSslTlsAlerts = diffForSslTlsAlerts(sslTlsResults, previousSslTlsStatuses);
  const newDnssecAlerts = diffForDnssecAlerts(dnssecResults, previousDnssecStatuses);
  const newWafAlerts = diffForWafAlerts(wafResults, previousWafStatuses);
  const newRateLimitingAlerts = diffForRateLimitingAlerts(
    rateLimitingResults,
    previousRateLimitingStatuses,
  );

  const sslTlsAlertStatements = newSslTlsAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO ssl_tls_alerts (id, zone_id, zone_name, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.zoneId,
      a.zoneName,
      a.previousStatus,
      a.newStatus,
      runId,
      evaluatedAt,
    )
  );

  const dnssecAlertStatements = newDnssecAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO dnssec_alerts (id, zone_id, zone_name, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.zoneId,
      a.zoneName,
      a.previousStatus,
      a.newStatus,
      runId,
      evaluatedAt,
    )
  );

  const wafAlertStatements = newWafAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO waf_alerts (id, zone_id, zone_name, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.zoneId,
      a.zoneName,
      a.previousStatus,
      a.newStatus,
      runId,
      evaluatedAt,
    )
  );

  const rateLimitingAlertStatements = newRateLimitingAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO rate_limiting_alerts (id, zone_id, zone_name, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.zoneId,
      a.zoneName,
      a.previousStatus,
      a.newStatus,
      runId,
      evaluatedAt,
    )
  );

  const alertStatements = [
    ...sslTlsAlertStatements,
    ...dnssecAlertStatements,
    ...wafAlertStatements,
    ...rateLimitingAlertStatements,
  ];
  if (alertStatements.length > 0) {
    await env.DB.batch(alertStatements);
  }

  return {
    runId,
    evaluatedAt,
    sslTlsResults,
    dnssecResults,
    wafResults,
    rateLimitingResults,
    newAlertCount: newSslTlsAlerts.length + newDnssecAlerts.length + newWafAlerts.length +
      newRateLimitingAlerts.length,
  };
}

securityRoutes.post("/evaluate", async (c) => {
  const { runId } = await runSecurityEvaluation(c.env, "interactive");
  return c.json({ run_id: runId }, 202);
});

interface SslTlsFindingRow {
  zone_id: string;
  zone_name: string;
  status: string;
  reason: string;
}

interface DnssecFindingRow {
  zone_id: string;
  status: string;
  reason: string;
}

interface WafFindingRow {
  zone_id: string;
  status: string;
  reason: string;
}

interface RateLimitingFindingRow {
  zone_id: string;
  status: string;
  reason: string;
}

// Every zone always produces exactly one ssl_tls_findings row per run
// (data-model.md) — the most reliable table to source "did a run
// happen" from, same pattern as Module 4's pages_subdomain_findings.
securityRoutes.get("/inventory", async (c) => {
  const creds = { accountId: c.env.CF_ACCOUNT_ID, apiToken: c.env.CF_API_TOKEN };

  const [latest, turnstileWidgets] = await Promise.all([
    c.env.DB.prepare(
      `SELECT run_id, evaluated_at FROM ssl_tls_findings ORDER BY evaluated_at DESC LIMIT 1`,
    ).first<{ run_id: string; evaluated_at: string }>(),
    listTurnstileWidgets(creds).catch(() => []),
  ]);

  if (!latest) {
    return c.json({
      run_id: null,
      evaluated_at: null,
      zones: [],
      turnstile_widgets: turnstileWidgets.map((w) => ({
        sitekey: w.sitekey,
        name: w.name,
        domains: w.domains,
      })),
    });
  }

  const [
    { results: sslTlsRows },
    { results: dnssecRows },
    { results: wafRows },
    { results: rateLimitingRows },
  ] = await Promise.all([
    c.env.DB.prepare(
      `SELECT zone_id, zone_name, status, reason FROM ssl_tls_findings WHERE run_id = ? ORDER BY zone_name`,
    ).bind(latest.run_id).all<SslTlsFindingRow>(),
    c.env.DB.prepare(
      `SELECT zone_id, status, reason FROM dnssec_findings WHERE run_id = ?`,
    ).bind(latest.run_id).all<DnssecFindingRow>(),
    c.env.DB.prepare(
      `SELECT zone_id, status, reason FROM waf_findings WHERE run_id = ?`,
    ).bind(latest.run_id).all<WafFindingRow>(),
    c.env.DB.prepare(
      `SELECT zone_id, status, reason FROM rate_limiting_findings WHERE run_id = ?`,
    ).bind(latest.run_id).all<RateLimitingFindingRow>(),
  ]);

  const dnssecByZone = new Map(dnssecRows.map((r) => [r.zone_id, r]));
  const wafByZone = new Map(wafRows.map((r) => [r.zone_id, r]));
  const rateLimitingByZone = new Map(rateLimitingRows.map((r) => [r.zone_id, r]));

  return c.json({
    run_id: latest.run_id,
    evaluated_at: latest.evaluated_at,
    zones: sslTlsRows.map((s) => {
      const dnssec = dnssecByZone.get(s.zone_id);
      const waf = wafByZone.get(s.zone_id);
      const rateLimiting = rateLimitingByZone.get(s.zone_id);
      return {
        zone_id: s.zone_id,
        zone_name: s.zone_name,
        ssl_tls: { status: s.status, reason: s.reason },
        dnssec: dnssec && { status: dnssec.status, reason: dnssec.reason },
        waf: waf && { status: waf.status, reason: waf.reason },
        rate_limiting: rateLimiting && { status: rateLimiting.status, reason: rateLimiting.reason },
      };
    }),
    turnstile_widgets: turnstileWidgets.map((w) => ({
      sitekey: w.sitekey,
      name: w.name,
      domains: w.domains,
    })),
  });
});

interface SslTlsAlertRow {
  id: string;
  zone_id: string;
  zone_name: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

interface DnssecAlertRow {
  id: string;
  zone_id: string;
  zone_name: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

interface WafAlertRow {
  id: string;
  zone_id: string;
  zone_name: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

interface RateLimitingAlertRow {
  id: string;
  zone_id: string;
  zone_name: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

// Merges all four alert tables at the API layer with a `kind`
// discriminator (contracts/api.md) — the tables stay separate in D1
// (data-model.md §7's rationale), combined only for this response.
securityRoutes.get("/alerts", async (c) => {
  const [
    { results: sslTlsRows },
    { results: dnssecRows },
    { results: wafRows },
    { results: rateLimitingRows },
  ] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, zone_id, zone_name, previous_status, new_status, detected_at, acknowledged_at
       FROM ssl_tls_alerts WHERE acknowledged_at IS NULL ORDER BY detected_at DESC`,
    ).all<SslTlsAlertRow>(),
    c.env.DB.prepare(
      `SELECT id, zone_id, zone_name, previous_status, new_status, detected_at, acknowledged_at
       FROM dnssec_alerts WHERE acknowledged_at IS NULL ORDER BY detected_at DESC`,
    ).all<DnssecAlertRow>(),
    c.env.DB.prepare(
      `SELECT id, zone_id, zone_name, previous_status, new_status, detected_at, acknowledged_at
       FROM waf_alerts WHERE acknowledged_at IS NULL ORDER BY detected_at DESC`,
    ).all<WafAlertRow>(),
    c.env.DB.prepare(
      `SELECT id, zone_id, zone_name, previous_status, new_status, detected_at, acknowledged_at
       FROM rate_limiting_alerts WHERE acknowledged_at IS NULL ORDER BY detected_at DESC`,
    ).all<RateLimitingAlertRow>(),
  ]);

  return c.json({
    alerts: [
      ...sslTlsRows.map((r) => ({
        id: r.id,
        kind: "ssl_tls" as const,
        zone_id: r.zone_id,
        zone_name: r.zone_name,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
      ...dnssecRows.map((r) => ({
        id: r.id,
        kind: "dnssec" as const,
        zone_id: r.zone_id,
        zone_name: r.zone_name,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
      ...wafRows.map((r) => ({
        id: r.id,
        kind: "waf" as const,
        zone_id: r.zone_id,
        zone_name: r.zone_name,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
      ...rateLimitingRows.map((r) => ({
        id: r.id,
        kind: "rate_limiting" as const,
        zone_id: r.zone_id,
        zone_name: r.zone_name,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
    ],
  });
});

const ALERT_TABLE_BY_KIND: Record<string, string> = {
  ssl_tls: "ssl_tls_alerts",
  dnssec: "dnssec_alerts",
  waf: "waf_alerts",
  rate_limiting: "rate_limiting_alerts",
};

// Not a Cloudflare account mutation (FR-013 scope boundary) — not
// written to audit_log, same as every prior module's equivalent
// endpoint.
securityRoutes.post("/alerts/:kind/:id/acknowledge", requireRole("admin"), async (c) => {
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
