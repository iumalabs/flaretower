import { Hono } from "hono";
import { requireRole } from "../../auth/access-jwt.ts";
import { acknowledgeAlert, queryUnifiedAlerts } from "./inbox.ts";
import { computeChanges } from "./changes.ts";
import { computePostureSummary } from "./summary.ts";
import type { UnavailableSource } from "./sources.ts";

// Same wire shape from all three endpoints (FR-010 / spec.md Edge Cases
// bullet 2) — a source whose D1 read rejected outright, distinct from
// that source legitimately having no data.
function toUnavailableSourcesJson(sources: UnavailableSource[]) {
  return sources.map((s) => ({ module: s.module, kind: s.kind, error: s.error }));
}

interface Env {
  DB: D1Database;
}

export const auditRoutes = new Hono<{ Bindings: Env }>();

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

auditRoutes.get("/alerts", async (c) => {
  const { alerts, unavailableSources } = await queryUnifiedAlerts(c.env.DB);
  return c.json({
    alerts: alerts.map((a) => ({
      id: a.id,
      module: a.module,
      kind: a.kind,
      entity_label: a.entityLabel,
      previous_status: a.previousStatus,
      new_status: a.newStatus,
      detected_at: a.detectedAt,
      acknowledged_at: a.acknowledgedAt,
    })),
    unavailable_sources: toUnavailableSourcesJson(unavailableSources),
  });
});

auditRoutes.post("/alerts/:module/:kind/:id/acknowledge", requireRole("admin"), async (c) => {
  const module = c.req.param("module");
  const kind = c.req.param("kind");
  const id = c.req.param("id");

  const result = await acknowledgeAlert(c.env.DB, module, kind, id);

  if (result.outcome === "unknown_source") {
    return c.json({ error: `unknown source: ${module}/${kind}` }, 404);
  }
  if (result.outcome === "not_found") {
    return c.json({ error: "alert not found" }, 404);
  }
  return c.json({ id: result.id, acknowledged_at: result.acknowledgedAt });
});

auditRoutes.get("/changes", async (c) => {
  const now = new Date();
  const sinceParam = c.req.query("since");
  const since = sinceParam ?? new Date(now.getTime() - TWENTY_FOUR_HOURS_MS).toISOString();

  const { changes, unavailableSources } = await computeChanges(c.env.DB, since);

  return c.json({
    since,
    until: now.toISOString(),
    changes: changes.map((ch) => ({
      module: ch.module,
      kind: ch.kind,
      entity_label: ch.entityLabel,
      previous_status: ch.previousStatus,
      current_status: ch.currentStatus,
    })),
    unavailable_sources: toUnavailableSourcesJson(unavailableSources),
  });
});

auditRoutes.get("/summary", async (c) => {
  const { modules, unavailableSources } = await computePostureSummary(c.env.DB);
  return c.json({
    modules: modules.map((entry) => ({
      module: entry.module,
      kind: entry.kind,
      has_data: entry.hasData,
      counts: entry.counts,
    })),
    unavailable_sources: toUnavailableSourcesJson(unavailableSources),
  });
});

// Joins the shared scheduled handler as a seventh independent evaluation
// (constitution Principle III) — computes the same default 24-hour digest
// GET /api/audit/changes would, and logs the count. No new alert table is
// written (research.md §4); _trigger is kept only for signature symmetry
// with every other module's run*Evaluation(env, trigger) entry point.
export async function runAuditDigest(
  env: Env,
  _trigger: "interactive" | "scheduled",
): Promise<{ changeCount: number }> {
  const since = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString();
  const { changes } = await computeChanges(env.DB, since);
  return { changeCount: changes.length };
}
