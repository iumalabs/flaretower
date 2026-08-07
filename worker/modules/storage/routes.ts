import { Hono } from "hono";

interface Env {
  DB: D1Database;
}

// Real endpoints land across US1-US4.
export const storageRoutes = new Hono<{ Bindings: Env }>();

storageRoutes.all("*", (c) => c.text("not implemented", 501));
