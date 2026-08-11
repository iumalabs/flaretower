import { Hono } from "hono";

interface Env {
  DB: D1Database;
}

// Stub until User Story 2 (T010-T011) implements GET /users and
// POST /users/:sub/role.
export const identityRoutes = new Hono<{ Bindings: Env }>();
