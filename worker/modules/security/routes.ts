import { Hono } from "hono";
import { buildSecurityInventory, listTurnstileWidgets } from "./inventory.ts";
import {
  evaluateDnssecs,
  evaluateRateLimitings,
  evaluateSslTlsModes,
  evaluateWafs,
} from "./evaluate.ts";
import type {
  DnssecEvaluation,
  RateLimitingEvaluation,
  SslTlsEvaluation,
  WafEvaluation,
} from "./types.ts";

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export const securityRoutes = new Hono<{ Bindings: Env }>();

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
  }
> {
  const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
  const { zones } = await buildSecurityInventory(creds);

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

  return { runId, evaluatedAt, sslTlsResults, dnssecResults, wafResults, rateLimitingResults };
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
