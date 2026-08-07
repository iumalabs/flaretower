import { Hono } from "hono";
import { buildPagesInventory } from "./inventory.ts";
import {
  evaluateCustomDomains,
  evaluateDeployments,
  evaluateSubdomainExposures,
} from "./evaluate.ts";
import type { DeploymentEvaluation, DomainEvaluation, SubdomainEvaluation } from "./types.ts";

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export const pagesRoutes = new Hono<{ Bindings: Env }>();

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
    subdomainResults: SubdomainEvaluation[];
    deploymentResults: DeploymentEvaluation[];
  }
> {
  const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
  const { projects, accessApplications } = await buildPagesInventory(creds);

  const domainResults = evaluateCustomDomains(projects);
  const subdomainResults = evaluateSubdomainExposures(projects, accessApplications);
  const deploymentResults = evaluateDeployments(projects);

  const runId = crypto.randomUUID();
  const evaluatedAt = new Date().toISOString();

  const domainStatements = domainResults.map((d) =>
    env.DB.prepare(
      `INSERT INTO pages_domain_findings (id, project_name, domain_name, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      d.projectName,
      d.domainName,
      d.status,
      d.reason,
      evaluatedAt,
      runId,
      trigger,
    )
  );

  const subdomainStatements = subdomainResults.map((s) =>
    env.DB.prepare(
      `INSERT INTO pages_subdomain_findings (id, project_name, subdomain, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      s.projectName,
      s.subdomain,
      s.status,
      s.reason,
      evaluatedAt,
      runId,
      trigger,
    )
  );

  const deploymentStatements = deploymentResults.map((d) =>
    env.DB.prepare(
      `INSERT INTO pages_deployment_findings (id, project_name, deployment_id, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      d.projectName,
      d.deploymentId,
      d.status,
      d.reason,
      evaluatedAt,
      runId,
      trigger,
    )
  );

  const statements = [...domainStatements, ...subdomainStatements, ...deploymentStatements];
  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  return { runId, evaluatedAt, domainResults, subdomainResults, deploymentResults };
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
}

interface SubdomainFindingRow {
  project_name: string;
  subdomain: string;
  status: string;
  reason: string;
}

interface DeploymentFindingRow {
  project_name: string;
  deployment_id: string | null;
  status: string;
  reason: string;
}

// Every project always produces exactly one pages_subdomain_findings row
// per run (data-model.md), even a project with zero custom domains — the
// most reliable table to source "did a run happen" from.
pagesRoutes.get("/inventory", async (c) => {
  const latest = await c.env.DB.prepare(
    `SELECT run_id, evaluated_at FROM pages_subdomain_findings ORDER BY evaluated_at DESC LIMIT 1`,
  ).first<{ run_id: string; evaluated_at: string }>();

  if (!latest) {
    return c.json({ run_id: null, evaluated_at: null, projects: [] });
  }

  const [{ results: subdomainRows }, { results: deploymentRows }, { results: domainRows }] =
    await Promise.all([
      c.env.DB.prepare(
        `SELECT project_name, subdomain, status, reason FROM pages_subdomain_findings WHERE run_id = ? ORDER BY project_name`,
      ).bind(latest.run_id).all<SubdomainFindingRow>(),
      c.env.DB.prepare(
        `SELECT project_name, deployment_id, status, reason FROM pages_deployment_findings WHERE run_id = ?`,
      ).bind(latest.run_id).all<DeploymentFindingRow>(),
      c.env.DB.prepare(
        `SELECT project_name, domain_name, status, reason FROM pages_domain_findings WHERE run_id = ? ORDER BY domain_name`,
      ).bind(latest.run_id).all<DomainFindingRow>(),
    ]);

  const deploymentByProject = new Map(deploymentRows.map((d) => [d.project_name, d]));
  const domainsByProject = new Map<string, DomainFindingRow[]>();
  for (const row of domainRows) {
    const existing = domainsByProject.get(row.project_name) ?? [];
    existing.push(row);
    domainsByProject.set(row.project_name, existing);
  }

  return c.json({
    run_id: latest.run_id,
    evaluated_at: latest.evaluated_at,
    projects: subdomainRows.map((s) => {
      const deployment = deploymentByProject.get(s.project_name) ?? null;
      return {
        project_name: s.project_name,
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
        domains: (domainsByProject.get(s.project_name) ?? []).map((d) => ({
          domain_name: d.domain_name,
          status: d.status,
          reason: d.reason,
        })),
      };
    }),
  });
});
