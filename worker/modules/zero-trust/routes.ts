import { Hono } from "hono";
import { buildZeroTrustInventory } from "./inventory.ts";
import { evaluateApplications, evaluateServiceTokens } from "./evaluate.ts";
import type { AppEvaluation, TokenEvaluation } from "./types.ts";

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export const zeroTrustRoutes = new Hono<{ Bindings: Env }>();

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
  }
> {
  const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
  const { applications, serviceTokens } = await buildZeroTrustInventory(creds);
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

  return { runId, evaluatedAt, appResults, tokenResults };
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

// GET /alerts and POST /alerts/:kind/:id/acknowledge land in US4.
zeroTrustRoutes.all("/alerts", (c) => c.text("not implemented", 501));
zeroTrustRoutes.all("/alerts/*", (c) => c.text("not implemented", 501));
