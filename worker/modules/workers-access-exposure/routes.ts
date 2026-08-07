import { Hono } from "hono";

interface Env {
  DB: D1Database;
}

// Real endpoints (GET /inventory, POST /evaluate, GET /alerts,
// POST /alerts/:id/acknowledge — contracts/api.md) land in T015, T016,
// T031, T032. This stub only proves the routing skeleton wires through.
export const exposureRoutes = new Hono<{ Bindings: Env }>();

exposureRoutes.all("*", (c) => c.text("not implemented", 501));
