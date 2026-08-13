import { Hono } from "hono";
import { type AccessIdentity, requireRole } from "../../auth/access-jwt.ts";
import { listOperators, type Role, setOperatorRole } from "./users.ts";

interface Env {
  DB: D1Database;
}

export const identityRoutes = new Hono<
  { Bindings: Env; Variables: { identity: AccessIdentity } }
>();

identityRoutes.use("*", requireRole("admin"));

identityRoutes.get("/users", async (c) => {
  const operators = await listOperators(c.env.DB);
  return c.json({
    users: operators.map((o) => ({
      sub: o.sub,
      email: o.email,
      idp: o.idp,
      role: o.role,
      created_at: o.createdAt,
      last_seen_at: o.lastSeenAt,
    })),
  });
});

function isValidRole(value: unknown): value is Role {
  return value === "member" || value === "admin";
}

identityRoutes.post("/users/:sub/role", async (c) => {
  const sub = c.req.param("sub");
  const body = await c.req.json().catch(() => null);
  const role = (body as { role?: unknown } | null)?.role;

  if (!isValidRole(role)) {
    return c.json({ error: `role must be "member" or "admin"` }, 400);
  }

  const actorSub = c.get("identity").sub;
  const result = await setOperatorRole(c.env.DB, actorSub, sub, role);
  if (result.outcome === "not_found") {
    return c.json({ error: "operator not found" }, 404);
  }

  return c.json({ sub: result.sub, role: result.role });
});
