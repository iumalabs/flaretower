import { Hono } from "hono";
import { requireRole } from "../../auth/access-jwt.ts";
import { type PageQuery, paginateArray, PaginationParamError } from "../../pagination.ts";
import { buildPagesInventory } from "./inventory.ts";
import {
  evaluateCustomDomains,
  evaluateDeployments,
  evaluateDomainAccesses,
  evaluateSubdomainExposures,
} from "./evaluate.ts";
import {
  diffForDeploymentAlerts,
  diffForDomainAlerts,
  diffForSubdomainAlerts,
  domainKey,
  type DomainOpenAlert,
  type OpenAlert,
  resolveForDeploymentAlerts,
  resolveForDomainAlerts,
  resolveForSubdomainAlerts,
} from "./alerts.ts";
import type {
  DeploymentEvaluation,
  DeploymentStatus,
  DomainAccessEvaluation,
  DomainEvaluation,
  DomainStatus,
  SubdomainEvaluation,
  SubdomainStatus,
} from "./types.ts";

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export const pagesRoutes = new Hono<{ Bindings: Env }>();

// The most recent run's per-entity status, read BEFORE the current run is
// inserted — same pattern as every prior module.
async function getPreviousDomainStatuses(env: Env): Promise<Map<string, DomainStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT project_name, domain_name, status FROM pages_domain_findings
     WHERE run_id = (SELECT run_id FROM pages_domain_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ project_name: string; domain_name: string; status: DomainStatus }>();
  return new Map(rows.map((r) => [domainKey(r.project_name, r.domain_name), r.status]));
}

async function getPreviousSubdomainStatuses(env: Env): Promise<Map<string, SubdomainStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT project_name, status FROM pages_subdomain_findings
     WHERE run_id = (SELECT run_id FROM pages_subdomain_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ project_name: string; status: SubdomainStatus }>();
  return new Map(rows.map((r) => [r.project_name, r.status]));
}

async function getPreviousDeploymentStatuses(env: Env): Promise<Map<string, DeploymentStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT project_name, status FROM pages_deployment_findings
     WHERE run_id = (SELECT run_id FROM pages_deployment_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ project_name: string; status: DeploymentStatus }>();
  return new Map(rows.map((r) => [r.project_name, r.status]));
}

// issue #481 — every alert still open (unacknowledged, unresolved), read
// BEFORE the current run so resolveFor*Alerts (alerts.ts) can decide which
// of them the run that's about to be inserted just resolved.
async function getOpenDomainAlerts(env: Env): Promise<DomainOpenAlert[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, project_name AS projectName, domain_name AS domainName FROM pages_domain_alerts
     WHERE acknowledged_at IS NULL AND resolved_at IS NULL`,
  ).all<DomainOpenAlert>();
  return results;
}

async function getOpenSubdomainAlerts(env: Env): Promise<OpenAlert[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, project_name AS projectName FROM pages_subdomain_alerts
     WHERE acknowledged_at IS NULL AND resolved_at IS NULL`,
  ).all<OpenAlert>();
  return results;
}

async function getOpenDeploymentAlerts(env: Env): Promise<OpenAlert[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, project_name AS projectName FROM pages_deployment_alerts
     WHERE acknowledged_at IS NULL AND resolved_at IS NULL`,
  ).all<OpenAlert>();
  return results;
}

// Shared by POST /evaluate (interactive) and the scheduled handler —
// constitution Principle III.
export async function runPagesEvaluation(
  env: Env,
  trigger: "interactive" | "scheduled",
): Promise<
  {
    runId: string;
    evaluatedAt: string;
    domainResults: DomainEvaluation[];
    domainAccessResults: DomainAccessEvaluation[];
    subdomainResults: SubdomainEvaluation[];
    deploymentResults: DeploymentEvaluation[];
    newAlertCount: number;
    resolvedAlertCount: number;
  }
> {
  const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
  const [
    { projects, accessApplications },
    previousDomainStatuses,
    previousSubdomainStatuses,
    previousDeploymentStatuses,
    openDomainAlerts,
    openSubdomainAlerts,
    openDeploymentAlerts,
  ] = await Promise.all([
    buildPagesInventory(creds),
    getPreviousDomainStatuses(env),
    getPreviousSubdomainStatuses(env),
    getPreviousDeploymentStatuses(env),
    getOpenDomainAlerts(env),
    getOpenSubdomainAlerts(env),
    getOpenDeploymentAlerts(env),
  ]);

  const domainResults = evaluateCustomDomains(projects);
  const domainAccessResults = evaluateDomainAccesses(projects, accessApplications);
  const subdomainResults = evaluateSubdomainExposures(projects, accessApplications);
  const deploymentResults = evaluateDeployments(projects);

  const runId = crypto.randomUUID();
  const evaluatedAt = new Date().toISOString();

  // Merged into the same pages_domain_findings row rather than a separate
  // table (issue #457) — same (project_name, domain_name) identity as
  // domainResults, just two independent findings about the same domain.
  const domainAccessByKey = new Map(
    domainAccessResults.map((a) => [domainKey(a.projectName, a.domainName), a]),
  );

  const domainStatements = domainResults.map((d) => {
    const access = domainAccessByKey.get(domainKey(d.projectName, d.domainName));
    return env.DB.prepare(
      `INSERT INTO pages_domain_findings
         (id, project_name, domain_name, status, reason, evaluated_at, run_id, run_trigger,
          access_status, access_reason, covering_app_id, covering_app_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      d.projectName,
      d.domainName,
      d.status,
      d.reason,
      evaluatedAt,
      runId,
      trigger,
      access?.status ?? null,
      access?.reason ?? null,
      access?.coveringAppId ?? null,
      access?.coveringAppName ?? null,
    );
  });

  const subdomainStatements = subdomainResults.map((s) =>
    env.DB.prepare(
      `INSERT INTO pages_subdomain_findings (id, project_name, subdomain, status, reason, evaluated_at, run_id, run_trigger, production_branch)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      s.projectName,
      s.subdomain,
      s.status,
      s.reason,
      evaluatedAt,
      runId,
      trigger,
      s.productionBranch,
    )
  );

  const deploymentStatements = deploymentResults.map((d) =>
    env.DB.prepare(
      `INSERT INTO pages_deployment_findings (id, project_name, deployment_id, status, reason, evaluated_at, run_id, run_trigger, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      d.projectName,
      d.deploymentId,
      d.status,
      d.reason,
      evaluatedAt,
      runId,
      trigger,
      d.createdAt,
    )
  );

  const statements = [...domainStatements, ...subdomainStatements, ...deploymentStatements];
  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  const newDomainAlerts = diffForDomainAlerts(domainResults, previousDomainStatuses);
  const newSubdomainAlerts = diffForSubdomainAlerts(subdomainResults, previousSubdomainStatuses);
  const newDeploymentAlerts = diffForDeploymentAlerts(
    deploymentResults,
    previousDeploymentStatuses,
  );

  // issue #481 — the ids resolveFor*Alerts (alerts.ts) says just recovered
  // to safe, turned into one UPDATE statement per id against its own
  // alerts table.
  function resolveStatements(table: string, ids: string[]): D1PreparedStatement[] {
    return ids.map((id) =>
      env.DB.prepare(`UPDATE ${table} SET resolved_at = ? WHERE id = ?`).bind(evaluatedAt, id)
    );
  }

  const resolvedDomainAlertStatements = resolveStatements(
    "pages_domain_alerts",
    resolveForDomainAlerts(domainResults, openDomainAlerts),
  );
  const resolvedSubdomainAlertStatements = resolveStatements(
    "pages_subdomain_alerts",
    resolveForSubdomainAlerts(subdomainResults, openSubdomainAlerts),
  );
  const resolvedDeploymentAlertStatements = resolveStatements(
    "pages_deployment_alerts",
    resolveForDeploymentAlerts(deploymentResults, openDeploymentAlerts),
  );

  const domainAlertStatements = newDomainAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO pages_domain_alerts (id, project_name, domain_name, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.projectName,
      a.domainName,
      a.previousStatus,
      a.newStatus,
      runId,
      evaluatedAt,
    )
  );

  const subdomainAlertStatements = newSubdomainAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO pages_subdomain_alerts (id, project_name, subdomain, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.projectName,
      a.subdomain,
      a.previousStatus,
      a.newStatus,
      runId,
      evaluatedAt,
    )
  );

  const deploymentAlertStatements = newDeploymentAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO pages_deployment_alerts (id, project_name, deployment_id, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.projectName,
      a.deploymentId,
      a.previousStatus,
      a.newStatus,
      runId,
      evaluatedAt,
    )
  );

  const alertStatements = [
    ...domainAlertStatements,
    ...subdomainAlertStatements,
    ...deploymentAlertStatements,
    ...resolvedDomainAlertStatements,
    ...resolvedSubdomainAlertStatements,
    ...resolvedDeploymentAlertStatements,
  ];
  if (alertStatements.length > 0) {
    await env.DB.batch(alertStatements);
  }

  return {
    runId,
    evaluatedAt,
    domainResults,
    domainAccessResults,
    subdomainResults,
    deploymentResults,
    newAlertCount: newDomainAlerts.length + newSubdomainAlerts.length + newDeploymentAlerts.length,
    resolvedAlertCount: resolvedDomainAlertStatements.length +
      resolvedSubdomainAlertStatements.length + resolvedDeploymentAlertStatements.length,
  };
}

pagesRoutes.post("/evaluate", async (c) => {
  const { runId } = await runPagesEvaluation(c.env, "interactive");
  return c.json({ run_id: runId }, 202);
});

interface DomainFindingRow {
  project_name: string;
  domain_name: string;
  status: string;
  reason: string;
  // issue #457 — nullable: rows written before migration 0015 have none.
  access_status: string | null;
  access_reason: string | null;
  covering_app_id: string | null;
  // issue #466 — nullable: rows written before migration 0016 have none.
  covering_app_name: string | null;
}

interface SubdomainFindingRow {
  project_name: string;
  subdomain: string;
  status: string;
  reason: string;
  production_branch: string | null;
}

interface DeploymentFindingRow {
  project_name: string;
  deployment_id: string | null;
  status: string;
  reason: string;
  created_at: string | null;
}

// specs/015-pages-dashboard research.md §2 — the first *active* (safe)
// domain among a project's already-evaluated custom domains, or null
// ("none") if it has zero active domains. A project can have more than
// one; the table shows exactly one, this is a display simplification, not
// a claim it's the project's only domain (spec.md Edge Cases).
export function deriveProductionDomain(domains: readonly DomainFindingRow[]): string | null {
  return domains.find((d) => d.status === "safe")?.domain_name ?? null;
}

// issue #457 — the same domain deriveProductionDomain picks, so the
// header's "Production domain" and this Access status always describe
// the identical hostname, never two different domains from the same
// project.
export function deriveProductionDomainAccess(
  domains: readonly DomainFindingRow[],
): {
  status: string | null;
  reason: string | null;
  covering_app_id: string | null;
  covering_app_name: string | null;
} | null {
  const production = domains.find((d) => d.status === "safe");
  if (!production) return null;
  return {
    status: production.access_status,
    reason: production.access_reason,
    covering_app_id: production.covering_app_id,
    covering_app_name: production.covering_app_name,
  };
}

interface ProjectRowOut {
  project_name: string;
  production_domain: string | null;
  production_domain_access: {
    status: string | null;
    reason: string | null;
    covering_app_id: string | null;
    covering_app_name: string | null;
  } | null;
  production_branch: string | null;
  last_build_status: string | null;
  last_build_reason: string | null;
  last_build_created_at: string | null;
  health_status: string;
  health_reason: string;
  subdomain: { subdomain: string; status: string; reason: string };
  deployment: { deployment_id: string | null; status: string; reason: string } | null;
  domains: Array<
    {
      domain_name: string;
      status: string;
      reason: string;
      access_status: string | null;
      access_reason: string | null;
      covering_app_id: string | null;
      covering_app_name: string | null;
    }
  >;
}

const PROJECT_SORT: Record<string, (r: ProjectRowOut) => string | number> = {
  project: (r) => r.project_name,
  domain: (r) => r.production_domain ?? "",
  branch: (r) => r.production_branch ?? "",
};

// Pure — same extraction rationale as every other paginated module.
export function buildPagesInventoryResponse(
  projects: ProjectRowOut[],
  runId: string | null,
  evaluatedAt: string | null,
  query: PageQuery,
) {
  const page = paginateArray(projects, query, PROJECT_SORT, "project");
  // Computed across the whole list, not just the paginated page — same
  // pagination-must-not-hide-a-critical-row fix as every prior module.
  const criticalProject = projects.find((p) => p.health_status === "critical") ?? null;

  return {
    run_id: runId,
    evaluated_at: evaluatedAt,
    critical_finding: criticalProject
      ? { project_name: criticalProject.project_name, reason: criticalProject.health_reason }
      : null,
    projects: page.items,
    projects_pagination: page.pagination,
  };
}

// Every project always produces exactly one pages_subdomain_findings row
// per run (data-model.md), even a project with zero custom domains — the
// most reliable table to source "did a run happen" from.
pagesRoutes.get("/inventory", async (c) => {
  const query: PageQuery = {
    page: c.req.query("page"),
    page_size: c.req.query("page_size"),
    sort_key: c.req.query("sort_key"),
    sort_dir: c.req.query("sort_dir"),
  };

  const latest = await c.env.DB.prepare(
    `SELECT run_id, evaluated_at FROM pages_subdomain_findings ORDER BY evaluated_at DESC LIMIT 1`,
  ).first<{ run_id: string; evaluated_at: string }>();

  try {
    if (!latest) {
      return c.json(buildPagesInventoryResponse([], null, null, query));
    }

    const [{ results: subdomainRows }, { results: deploymentRows }, { results: domainRows }] =
      await Promise.all([
        c.env.DB.prepare(
          `SELECT project_name, subdomain, status, reason, production_branch FROM pages_subdomain_findings WHERE run_id = ? ORDER BY project_name`,
        ).bind(latest.run_id).all<SubdomainFindingRow>(),
        c.env.DB.prepare(
          `SELECT project_name, deployment_id, status, reason, created_at FROM pages_deployment_findings WHERE run_id = ?`,
        ).bind(latest.run_id).all<DeploymentFindingRow>(),
        c.env.DB.prepare(
          `SELECT project_name, domain_name, status, reason, access_status, access_reason, covering_app_id, covering_app_name
           FROM pages_domain_findings WHERE run_id = ? ORDER BY domain_name`,
        ).bind(latest.run_id).all<DomainFindingRow>(),
      ]);

    const deploymentByProject = new Map(deploymentRows.map((d) => [d.project_name, d]));
    const domainsByProject = new Map<string, DomainFindingRow[]>();
    for (const row of domainRows) {
      const existing = domainsByProject.get(row.project_name) ?? [];
      existing.push(row);
      domainsByProject.set(row.project_name, existing);
    }

    const projects: ProjectRowOut[] = subdomainRows.map((s) => {
      const deployment = deploymentByProject.get(s.project_name) ?? null;
      const domains = domainsByProject.get(s.project_name) ?? [];
      return {
        project_name: s.project_name,
        // New top-level convenience fields (contracts/api.md,
        // data-model.md's PagesProjectRow) — additive alongside the
        // existing subdomain/deployment/domains objects below, unchanged.
        production_domain: deriveProductionDomain(domains),
        production_domain_access: deriveProductionDomainAccess(domains),
        production_branch: s.production_branch,
        last_build_status: deployment?.status ?? null,
        last_build_reason: deployment?.reason ?? null,
        last_build_created_at: deployment?.created_at ?? null,
        health_status: s.status,
        health_reason: s.reason,
        subdomain: {
          subdomain: s.subdomain,
          status: s.status,
          reason: s.reason,
        },
        deployment: deployment && {
          deployment_id: deployment.deployment_id,
          status: deployment.status,
          reason: deployment.reason,
        },
        domains: domains.map((d) => ({
          domain_name: d.domain_name,
          status: d.status,
          reason: d.reason,
          access_status: d.access_status,
          access_reason: d.access_reason,
          covering_app_id: d.covering_app_id,
          covering_app_name: d.covering_app_name,
        })),
      };
    });

    return c.json(buildPagesInventoryResponse(projects, latest.run_id, latest.evaluated_at, query));
  } catch (err) {
    if (err instanceof PaginationParamError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
});

interface DomainAlertRow {
  id: string;
  project_name: string;
  domain_name: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

interface SubdomainAlertRow {
  id: string;
  project_name: string;
  subdomain: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

interface DeploymentAlertRow {
  id: string;
  project_name: string;
  deployment_id: string | null;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

// Merges all three alert tables at the API layer with a `kind`
// discriminator (contracts/api.md) — the tables stay separate in D1
// (data-model.md §3's rationale), combined only for this response.
pagesRoutes.get("/alerts", async (c) => {
  const [{ results: domainRows }, { results: subdomainRows }, { results: deploymentRows }] =
    await Promise.all([
      c.env.DB.prepare(
        `SELECT id, project_name, domain_name, previous_status, new_status, detected_at, acknowledged_at
         FROM pages_domain_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL ORDER BY detected_at DESC`,
      ).all<DomainAlertRow>(),
      c.env.DB.prepare(
        `SELECT id, project_name, subdomain, previous_status, new_status, detected_at, acknowledged_at
         FROM pages_subdomain_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL ORDER BY detected_at DESC`,
      ).all<SubdomainAlertRow>(),
      c.env.DB.prepare(
        `SELECT id, project_name, deployment_id, previous_status, new_status, detected_at, acknowledged_at
         FROM pages_deployment_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL ORDER BY detected_at DESC`,
      ).all<DeploymentAlertRow>(),
    ]);

  return c.json({
    alerts: [
      ...domainRows.map((r) => ({
        id: r.id,
        kind: "domain" as const,
        project_name: r.project_name,
        domain_name: r.domain_name,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
      ...subdomainRows.map((r) => ({
        id: r.id,
        kind: "subdomain" as const,
        project_name: r.project_name,
        subdomain: r.subdomain,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
      ...deploymentRows.map((r) => ({
        id: r.id,
        kind: "deployment" as const,
        project_name: r.project_name,
        deployment_id: r.deployment_id,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
    ],
  });
});

const ALERT_TABLE_BY_KIND: Record<string, string> = {
  domain: "pages_domain_alerts",
  subdomain: "pages_subdomain_alerts",
  deployment: "pages_deployment_alerts",
};

// Not a Cloudflare account mutation (FR-014 scope boundary) — not written
// to audit_log, same as every prior module's equivalent endpoint.
pagesRoutes.post("/alerts/:kind/:id/acknowledge", requireRole("admin"), async (c) => {
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
