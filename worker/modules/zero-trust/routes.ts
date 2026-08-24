import { Hono } from "hono";
import { requireRole } from "../../auth/access-jwt.ts";
import { type PageQuery, paginateArray, PaginationParamError } from "../../pagination.ts";
import { buildZeroTrustInventory, listAccessGroups, listIdentityProviders } from "./inventory.ts";
import { evaluateApplications, evaluateServiceTokens } from "./evaluate.ts";
import {
  diffForAppAlerts,
  diffForTokenAlerts,
  type OpenAppAlert,
  type OpenTokenAlert,
  resolveForAppAlerts,
  resolveForTokenAlerts,
} from "./alerts.ts";
import { summarizeGroupRules } from "./rule-humanizer.ts";
import type {
  AccessGroup,
  AppEvaluation,
  AppStatus,
  PolicyRuleLine,
  TokenEvaluation,
  TokenStatus,
} from "./types.ts";

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export const zeroTrustRoutes = new Hono<{ Bindings: Env }>();

// issue #470 (same class as #465, already fixed for storage and security)
// — D1 read queries can be served by a read replica that lags behind the
// primary (Cloudflare's documented D1 replication behavior). Every read
// below runs in a fresh Worker invocation every time (the scheduled hourly
// run, or a manual/account-wide RE-SCAN), so a stale replica means "the
// most recent run"/"currently open alerts" silently isn't accurate — some
// OTHER, still-more-recent invocation's write hasn't propagated to
// whichever replica this read landed on yet. `env.DB.withSession
// ("first-primary")` forces this invocation's first query to hit the
// primary (which always has every committed write), eliminating that lag
// for exactly the reads that need it. The batched INSERT/UPDATE statements
// later in this file are unaffected — D1 writes always go to the primary
// regardless of session.
export function previousStatusReader(env: Env): D1DatabaseSession {
  return env.DB.withSession("first-primary");
}

// The most recent run's per-entity status, read BEFORE the current run is
// inserted — same pattern as every prior module.
async function getPreviousAppStatuses(reader: D1DatabaseSession): Promise<Map<string, AppStatus>> {
  const { results: rows } = await reader.prepare(
    `SELECT app_id, status FROM zt_app_findings
     WHERE run_id = (SELECT run_id FROM zt_app_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ app_id: string; status: AppStatus }>();
  return new Map(rows.map((r) => [r.app_id, r.status]));
}

async function getPreviousTokenStatuses(
  reader: D1DatabaseSession,
): Promise<Map<string, TokenStatus>> {
  const { results: rows } = await reader.prepare(
    `SELECT token_id, status FROM zt_token_findings
     WHERE run_id = (SELECT run_id FROM zt_token_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ token_id: string; status: TokenStatus }>();
  return new Map(rows.map((r) => [r.token_id, r.status]));
}

// issue #481 — every alert still open (unacknowledged, unresolved), read
// BEFORE the current run so resolveForAppAlerts/resolveForTokenAlerts
// (alerts.ts) can decide which of them the run that's about to be
// inserted just resolved. Row shape stays snake_case (matching the raw D1
// columns, same as getPreviousAppStatuses/getPreviousTokenStatuses above)
// and is mapped to the camelCase OpenAppAlert/OpenTokenAlert explicitly —
// D1 does not rename columns to match a generic type parameter, so typing
// `.all<OpenAppAlert>()` directly against a `SELECT id, app_id` (no `AS`)
// would silently leave `.appId` undefined on every row.
async function getOpenAppAlerts(reader: D1DatabaseSession): Promise<OpenAppAlert[]> {
  const { results } = await reader.prepare(
    `SELECT id, app_id FROM zt_app_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL`,
  ).all<{ id: string; app_id: string }>();
  return results.map((r) => ({ id: r.id, appId: r.app_id }));
}

async function getOpenTokenAlerts(reader: D1DatabaseSession): Promise<OpenTokenAlert[]> {
  const { results } = await reader.prepare(
    `SELECT id, token_id FROM zt_token_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL`,
  ).all<{ id: string; token_id: string }>();
  return results.map((r) => ({ id: r.id, tokenId: r.token_id }));
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
    resolvedAlertCount: number;
  }
> {
  const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
  const reader = previousStatusReader(env);
  // Identity providers and groups are fetched here too (not persisted
  // themselves, research.md §3) purely to resolve login_method/group rule
  // names into policyRules at evaluation time — GET /inventory separately
  // live-fetches groups again for the Groups panel itself (routes.ts
  // below), so a group renamed between evaluation runs may briefly show a
  // stale name in a persisted policy line until the next run, matching
  // this project's existing "findings are as of the last evaluation run"
  // convention everywhere else.
  const [
    { applications, serviceTokens },
    previousAppStatuses,
    previousTokenStatuses,
    identityProviders,
    groups,
    openAppAlerts,
    openTokenAlerts,
  ] = await Promise.all([
    buildZeroTrustInventory(creds),
    getPreviousAppStatuses(reader),
    getPreviousTokenStatuses(reader),
    listIdentityProviders(creds).catch(() => []),
    listAccessGroups(creds),
    getOpenAppAlerts(reader),
    getOpenTokenAlerts(reader),
  ]);
  const identityProviderNames = new Map(identityProviders.map((p) => [p.id, p.name]));
  const groupNames = new Map((groups ?? []).map((g) => [g.groupId, g.name]));
  const appResults = evaluateApplications(applications, identityProviderNames, groupNames);
  const tokenResults = evaluateServiceTokens(serviceTokens);

  const runId = crypto.randomUUID();
  const evaluatedAt = new Date().toISOString();

  const appStatements = appResults.map((a) =>
    env.DB.prepare(
      `INSERT INTO zt_app_findings
         (id, app_id, app_domain, status, reason, evaluated_at, run_id, run_trigger,
          app_name, policy_count, covered_hostname_count, identity_summary, session_duration, policy_rules_json,
          referenced_group_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.appId,
      a.appDomain,
      a.status,
      a.reason,
      evaluatedAt,
      runId,
      trigger,
      a.appName,
      a.policyCount,
      a.coveredHostnameCount,
      a.identitySummary,
      a.sessionDuration,
      JSON.stringify(a.policyRules),
      JSON.stringify(a.referencedGroupIds),
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

  // Written unconditionally — even a run against a genuinely empty account
  // (0 apps, 0 tokens) must leave a trace, so GET /inventory can tell
  // "ran, found nothing" apart from "never ran" (T026). This is also the
  // shared source of truth GET /inventory uses to find the latest run,
  // instead of inferring it from zt_app_findings alone (T025).
  const runLogStatement = env.DB.prepare(
    `INSERT INTO zt_evaluation_runs (run_id, evaluated_at, run_trigger, app_count, token_count)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(runId, evaluatedAt, trigger, appResults.length, tokenResults.length);

  const statements = [runLogStatement, ...appStatements, ...tokenStatements];
  await env.DB.batch(statements);

  const newAppAlerts = diffForAppAlerts(appResults, previousAppStatuses);
  const newTokenAlerts = diffForTokenAlerts(tokenResults, previousTokenStatuses);

  // issue #481 — the ids resolveForAppAlerts/resolveForTokenAlerts
  // (alerts.ts) say just recovered to safe, turned into one UPDATE
  // statement per id against its own alerts table.
  function resolveStatements(table: string, ids: string[]): D1PreparedStatement[] {
    return ids.map((id) =>
      env.DB.prepare(`UPDATE ${table} SET resolved_at = ? WHERE id = ?`).bind(evaluatedAt, id)
    );
  }

  const resolvedAppAlertStatements = resolveStatements(
    "zt_app_alerts",
    resolveForAppAlerts(appResults, openAppAlerts),
  );
  const resolvedTokenAlertStatements = resolveStatements(
    "zt_token_alerts",
    resolveForTokenAlerts(tokenResults, openTokenAlerts),
  );

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

  const alertStatements = [
    ...appAlertStatements,
    ...tokenAlertStatements,
    ...resolvedAppAlertStatements,
    ...resolvedTokenAlertStatements,
  ];
  if (alertStatements.length > 0) {
    await env.DB.batch(alertStatements);
  }

  return {
    runId,
    evaluatedAt,
    appResults,
    tokenResults,
    newAlertCount: newAppAlerts.length + newTokenAlerts.length,
    resolvedAlertCount: resolvedAppAlertStatements.length + resolvedTokenAlertStatements.length,
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
  app_name: string | null;
  policy_count: number | null;
  covered_hostname_count: number | null;
  identity_summary: string | null;
  session_duration: string | null;
  policy_rules_json: string | null;
  referenced_group_ids: string | null;
}

function serializeAccessGroup(
  g: AccessGroup,
  identityProviderNames: ReadonlyMap<string, string>,
  groupNames: ReadonlyMap<string, string>,
  referencedByAppCount: number,
) {
  return {
    group_id: g.groupId,
    name: g.name,
    rule_summary: summarizeGroupRules(g.include, identityProviderNames, groupNames),
    referenced_by_app_count: referencedByAppCount,
  };
}

// Exact id match against every application's persisted referenced_group_ids
// (research.md §3) — an unreferenced group correctly counts 0 (spec.md
// FR-005), never omitted from the caller's loop over the live groups list.
function countAppReferences(groupId: string, appRows: AppFindingRow[]): number {
  let count = 0;
  for (const row of appRows) {
    if (!row.referenced_group_ids) continue;
    const ids = JSON.parse(row.referenced_group_ids) as string[];
    if (ids.includes(groupId)) count++;
  }
  return count;
}

interface TokenFindingRow {
  token_id: string;
  token_name: string;
  expires_at: string | null;
  status: string;
  reason: string;
}

// specs/014-access-dashboard research.md §3 — Access Groups are live-read
// on every request, independent of the evaluate/persist pipeline above;
// a total fetch failure surfaces as `access_groups: null` (spec.md FR-008),
// and MUST NOT block the applications/tokens part of this same response.
async function fetchAccessGroupsPanel(
  env: Env,
  appRows: AppFindingRow[],
): Promise<ReturnType<typeof serializeAccessGroup>[] | null> {
  const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
  const [groups, identityProviders] = await Promise.all([
    listAccessGroups(creds),
    listIdentityProviders(creds).catch(() => []),
  ]);
  if (groups === null) return null;

  const identityProviderNames = new Map(identityProviders.map((p) => [p.id, p.name]));
  const groupNames = new Map(groups.map((g) => [g.groupId, g.name]));
  return groups.map((g) =>
    serializeAccessGroup(
      g,
      identityProviderNames,
      groupNames,
      countAppReferences(g.groupId, appRows),
    )
  );
}

interface AppFindingOut {
  app_id: string;
  app_name: string | null;
  app_domain: string;
  status: string;
  reason: string;
  policy_count: number | null;
  covered_hostname_count: number | null;
  identity_summary: string | null;
  session_duration: string | null;
  policy_rules: PolicyRuleLine[][];
}
interface TokenFindingOut {
  token_id: string;
  token_name: string;
  expires_at: string | null;
  status: string;
  reason: string;
}

const APP_SORT: Record<string, (r: AppFindingOut) => string | number> = {
  application: (r) => r.app_domain,
  policies: (r) => r.policy_count ?? -1,
};
const TOKEN_SORT: Record<string, (r: TokenFindingOut) => string | number> = {
  name: (r) => r.token_name,
};

export interface ZeroTrustInventoryQuery {
  app?: PageQuery;
  token?: PageQuery;
}

// Pure — same extraction rationale as every other paginated module.
// access_groups is deliberately NOT paginated here (out of scope, plain
// list UI, not a FindingsTable — research.md §2 only requires confirming
// each module's actual shape, not that every list in it gets a pager).
export function buildZeroTrustInventoryResponse(
  applications: AppFindingOut[],
  serviceTokens: TokenFindingOut[],
  accessGroups: ReturnType<typeof serializeAccessGroup>[] | null,
  runId: string | null,
  evaluatedAt: string | null,
  query: ZeroTrustInventoryQuery,
) {
  const appPage = paginateArray(applications, query.app ?? {}, APP_SORT, "application");
  const tokenPage = paginateArray(serviceTokens, query.token ?? {}, TOKEN_SORT, "name");

  // Same priority as the frontend previously computed client-side:
  // applications checked first (a higher-severity exposure class than an
  // expired token), across the WHOLE list, not just the paginated page.
  const criticalApp = applications.find((a) => a.status === "critical");
  const criticalToken = serviceTokens.find((t) => t.status === "critical");
  const criticalFinding = criticalApp
    ? {
      kind: "application" as const,
      title: "An Access application has no effective policy",
      target: criticalApp.app_domain,
      description: criticalApp.reason,
    }
    : criticalToken
    ? {
      kind: "service_token" as const,
      title: "A service token needs attention",
      target: criticalToken.token_name,
      description: criticalToken.reason,
    }
    : null;

  return {
    run_id: runId,
    evaluated_at: evaluatedAt,
    critical_finding: criticalFinding,
    applications: appPage.items,
    applications_pagination: appPage.pagination,
    service_tokens: tokenPage.items,
    service_tokens_pagination: tokenPage.pagination,
    access_groups: accessGroups,
  };
}

zeroTrustRoutes.get("/inventory", async (c) => {
  const query: ZeroTrustInventoryQuery = {
    app: {
      page: c.req.query("app_page"),
      page_size: c.req.query("app_page_size"),
      sort_key: c.req.query("app_sort_key"),
      sort_dir: c.req.query("app_sort_dir"),
    },
    token: {
      page: c.req.query("token_page"),
      page_size: c.req.query("token_page_size"),
      sort_key: c.req.query("token_sort_key"),
      sort_dir: c.req.query("token_sort_dir"),
    },
  };

  // The latest run is determined from zt_evaluation_runs — a shared,
  // run-scoped source of truth — not from either findings table alone.
  // Gating on zt_app_findings alone (the prior behavior) silently dropped
  // legitimate zt_token_findings whenever the account had zero Access
  // applications for that run (T025). A run row also exists even when a
  // run found zero apps AND zero tokens (T026), so `null` here means
  // "never evaluated," never "evaluated, found nothing."
  const latestRun = await c.env.DB.prepare(
    `SELECT run_id, evaluated_at FROM zt_evaluation_runs ORDER BY evaluated_at DESC LIMIT 1`,
  ).first<{ run_id: string; evaluated_at: string }>();

  try {
    if (!latestRun) {
      const accessGroups = await fetchAccessGroupsPanel(c.env, []);
      return c.json(buildZeroTrustInventoryResponse([], [], accessGroups, null, null, query));
    }

    const [{ results: appRows }, { results: tokenRows }] = await Promise.all([
      c.env.DB.prepare(
        `SELECT app_id, app_domain, status, reason, app_name, policy_count, covered_hostname_count,
                identity_summary, session_duration, policy_rules_json, referenced_group_ids
         FROM zt_app_findings WHERE run_id = ? ORDER BY app_domain`,
      ).bind(latestRun.run_id).all<AppFindingRow>(),
      c.env.DB.prepare(
        `SELECT token_id, token_name, expires_at, status, reason FROM zt_token_findings WHERE run_id = ? ORDER BY token_name`,
      ).bind(latestRun.run_id).all<TokenFindingRow>(),
    ]);

    const accessGroups = await fetchAccessGroupsPanel(c.env, appRows);

    const applications: AppFindingOut[] = appRows.map((a) => ({
      app_id: a.app_id,
      app_name: a.app_name,
      app_domain: a.app_domain,
      status: a.status,
      reason: a.reason,
      policy_count: a.policy_count,
      covered_hostname_count: a.covered_hostname_count,
      identity_summary: a.identity_summary,
      session_duration: a.session_duration,
      policy_rules: a.policy_rules_json
        ? JSON.parse(a.policy_rules_json) as PolicyRuleLine[][]
        : [],
    }));
    const serviceTokens: TokenFindingOut[] = tokenRows.map((t) => ({
      token_id: t.token_id,
      token_name: t.token_name,
      expires_at: t.expires_at,
      status: t.status,
      reason: t.reason,
    }));

    return c.json(
      buildZeroTrustInventoryResponse(
        applications,
        serviceTokens,
        accessGroups,
        latestRun.run_id,
        latestRun.evaluated_at,
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
       FROM zt_app_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL ORDER BY detected_at DESC`,
    ).all<AppAlertRow>(),
    c.env.DB.prepare(
      `SELECT id, token_id, token_name, previous_status, new_status, detected_at, acknowledged_at
       FROM zt_token_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL ORDER BY detected_at DESC`,
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
