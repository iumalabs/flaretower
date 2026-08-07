import { Hono } from "hono";

interface Env {
  DB: D1Database;
}

// Real endpoints land across US1-US4.
export const zeroTrustRoutes = new Hono<{ Bindings: Env }>();

zeroTrustRoutes.all("*", (c) => c.text("not implemented", 501));
