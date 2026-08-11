import { Hono } from "hono";
import { requireRole } from "../../auth/access-jwt.ts";
import { buildZeroTrustInventory } from "./inventory.ts";
import { evaluateApplications, evaluateServiceTokens } from "./evaluate.ts";
import { diffForAppAlerts, diffForTokenAlerts } from "./alerts.ts";
import type { AppEvaluation, AppStatus, TokenEvaluation, TokenStatus } from "./types.ts";

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export const zeroTrustRoutes = new Hono<{ Bindings: Env }>();

// The most recent run's per-entity status, read BEFORE the current run is
// inserted — same pattern as every prior module.
async function getPreviousAppStatuses(env: Env): Promise<Map<string, AppStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT app_id, status FROM zt_app_findings
     WHERE run_id = (SELECT run_id FROM zt_app_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ app_id: string; status: AppStatus }>();
  return new Map(rows.map((r) => [r.app_id, r.status]));
}

async function getPreviousTokenStatuses(env: Env): Promise<Map<string, TokenStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT token_id, status FROM zt_token_findings
     WHERE run_id = (SELECT run_id FROM zt_token_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ token_id: string; status: TokenStatus }>();
  return new Map(rows.map((r) => [r.token_id, r.status]));
}

// Shared by POST /evaluate (interactive) and the scheduled handler —
// constitution Principle III.
export async function runZeroTrustEvaluation(
  env: Env,
  trigger: "interactive" | "scheduled",
): Promise<
  {
    runId: string;
    evaluatedAt: string;
    appResults: AppEvaluation[];
    tokenResults: TokenEvaluation[];
    newAlertCount: number;
  }
> {
  const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
  const [{ applications, serviceTokens }, previousAppStatuses, previousTokenStatuses] =
    await Promise.all([
      buildZeroTrustInventory(creds),
      getPreviousAppStatuses(env),
      getPreviousTokenStatuses(env),
    ]);
  const appResults = evaluateApplications(applications);
  const tokenResults = evaluateServiceTokens(serviceTokens);

  const runId = crypto.randomUUID();
  const evaluatedAt = new Date().toISOString();

  const appStatements = appResults.map((a) =>
    env.DB.prepare(
      `INSERT INTO zt_app_findings (id, app_id, app_domain, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.appId,
      a.appDomain,
      a.status,
      a.reason,
      evaluatedAt,
      runId,
      trigger,
    )
  );

  const tokenStatements = tokenResults.map((t) =>
    env.DB.prepare(
      `INSERT INTO zt_token_findings (id, token_id, token_name, expires_at, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      t.tokenId,
      t.tokenName,
      t.expiresAt,
      t.status,
      t.reason,
      evaluatedAt,
      runId,
      trigger,
    )
  );

  const statements = [...appStatements, ...tokenStatements];
  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  const newAppAlerts = diffForAppAlerts(appResults, previousAppStatuses);
  const newTokenAlerts = diffForTokenAlerts(tokenResults, previousTokenStatuses);

  const appAlertStatements = newAppAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO zt_app_alerts (id, app_id, app_domain, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.appId,
      a.appDomain,
      a.previousStatus,
      a.newStatus,
      runId,
      evaluatedAt,
    )
  );

  const tokenAlertStatements = newTokenAlerts.map((t) =>
    env.DB.prepare(
      `INSERT INTO zt_token_alerts (id, token_id, token_name, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      t.tokenId,
      t.tokenName,
      t.previousStatus,
      t.newStatus,
      runId,
      evaluatedAt,
    )
  );

  const alertStatements = [...appAlertStatements, ...tokenAlertStatements];
  if (alertStatements.length > 0) {
    await env.DB.batch(alertStatements);
  }

  return {
    runId,
    evaluatedAt,
    appResults,
    tokenResults,
    newAlertCount: newAppAlerts.length + newTokenAlerts.length,
  };
}

zeroTrustRoutes.post("/evaluate", async (c) => {
  const { runId } = await runZeroTrustEvaluation(c.env, "interactive");
  return c.json({ run_id: runId }, 202);
});

interface AppFindingRow {
  app_id: string;
  app_domain: string;
  status: string;
  reason: string;
}

interface TokenFindingRow {
  token_id: string;
  token_name: string;
  expires_at: string | null;
  status: string;
  reason: string;
}

zeroTrustRoutes.get("/inventory", async (c) => {
  const latestApps = await c.env.DB.prepare(
    `SELECT run_id, evaluated_at FROM zt_app_findings ORDER BY evaluated_at DESC LIMIT 1`,
  ).first<{ run_id: string; evaluated_at: string }>();

  if (!latestApps) {
    return c.json({ run_id: null, evaluated_at: null, applications: [], service_tokens: [] });
  }

  const [{ results: appRows }, { results: tokenRows }] = await Promise.all([
    c.env.DB.prepare(
      `SELECT app_id, app_domain, status, reason FROM zt_app_findings WHERE run_id = ? ORDER BY app_domain`,
    ).bind(latestApps.run_id).all<AppFindingRow>(),
    c.env.DB.prepare(
      `SELECT token_id, token_name, expires_at, status, reason FROM zt_token_findings WHERE run_id = ? ORDER BY token_name`,
    ).bind(latestApps.run_id).all<TokenFindingRow>(),
  ]);

  return c.json({
    run_id: latestApps.run_id,
    evaluated_at: latestApps.evaluated_at,
    applications: appRows.map((a) => ({
      app_id: a.app_id,
      app_domain: a.app_domain,
      status: a.status,
      reason: a.reason,
    })),
    service_tokens: tokenRows.map((t) => ({
      token_id: t.token_id,
      token_name: t.token_name,
      expires_at: t.expires_at,
      status: t.status,
      reason: t.reason,
    })),
  });
});

interface AppAlertRow {
  id: string;
  app_id: string;
  app_domain: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

interface TokenAlertRow {
  id: string;
  token_id: string;
  token_name: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

// Merges both alert tables at the API layer with a `kind` discriminator
// (contracts/api.md) — the two tables stay separate in D1 (data-model.md
// §5's rationale), combined only for this response.
zeroTrustRoutes.get("/alerts", async (c) => {
  const [{ results: appRows }, { results: tokenRows }] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, app_id, app_domain, previous_status, new_status, detected_at, acknowledged_at
       FROM zt_app_alerts WHERE acknowledged_at IS NULL ORDER BY detected_at DESC`,
    ).all<AppAlertRow>(),
    c.env.DB.prepare(
      `SELECT id, token_id, token_name, previous_status, new_status, detected_at, acknowledged_at
       FROM zt_token_alerts WHERE acknowledged_at IS NULL ORDER BY detected_at DESC`,
    ).all<TokenAlertRow>(),
  ]);

  return c.json({
    alerts: [
      ...appRows.map((r) => ({
        id: r.id,
        kind: "application" as const,
        app_id: r.app_id,
        app_domain: r.app_domain,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
      ...tokenRows.map((r) => ({
        id: r.id,
        kind: "service_token" as const,
        token_id: r.token_id,
        token_name: r.token_name,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
    ],
  });
});

const ALERT_TABLE_BY_KIND: Record<string, string> = {
  application: "zt_app_alerts",
  service_token: "zt_token_alerts",
};

// Not a Cloudflare account mutation (FR-014 scope boundary) — not written
// to audit_log, same as every prior module's equivalent endpoint.
zeroTrustRoutes.post("/alerts/:kind/:id/acknowledge", requireRole("admin"), async (c) => {
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
