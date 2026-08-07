import { Hono } from "hono";

interface Env {
  DB: D1Database;
}

// Real endpoints (GET /inventory, POST /evaluate, GET /alerts,
// POST /alerts/:id/acknowledge — contracts/api.md) land across US1-US4.
export const dnsRoutes = new Hono<{ Bindings: Env }>();

dnsRoutes.all("*", (c) => c.text("not implemented", 501));
