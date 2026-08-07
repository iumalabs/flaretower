import { Hono } from "hono";

interface Env {
  DB: D1Database;
}

// Real endpoints land across US1-US4.
export const pagesRoutes = new Hono<{ Bindings: Env }>();

pagesRoutes.all("*", (c) => c.text("not implemented", 501));
