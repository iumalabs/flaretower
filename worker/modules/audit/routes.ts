import { Hono } from "hono";
import { acknowledgeAlert, queryUnifiedAlerts } from "./inbox.ts";

interface Env {
  DB: D1Database;
}

export const auditRoutes = new Hono<{ Bindings: Env }>();

auditRoutes.get("/alerts", async (c) => {
  const alerts = await queryUnifiedAlerts(c.env.DB);
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
  });
});

auditRoutes.post("/alerts/:module/:kind/:id/acknowledge", async (c) => {
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
