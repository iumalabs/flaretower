import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { identityRoutes } from "../../worker/modules/identity/routes.ts";
import type { AccessIdentity } from "../../worker/auth/access-jwt.ts";

interface UserRow {
  sub: string;
  email: string;
  idp: string;
  role: string;
  created_at: string;
  last_seen_at: string;
}

interface AuditLogRow {
  id: string;
  actor_sub: string;
  action: string;
  before_json: string;
  after_json: string;
  created_at: string;
}

// setOperatorRole() now batches its role UPDATE with an audit_log INSERT
// (worker/audit-log.ts's writeAuditEntry()) via db.batch() rather than a
// bare .run() — batch() below just runs each statement through the same
// run() logic, and the SELECT used for the pre-UPDATE existence check
// widened from `sub` only to `sub, role` (spec 019).
function createMockD1(initialRows: UserRow[]): { db: D1Database; auditLog: AuditLogRow[] } {
  const rows = initialRows.map((r) => ({ ...r }));
  const auditLog: AuditLogRow[] = [];

  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) {
          bound = args;
          return statement;
        },
        all<T>() {
          return Promise.resolve({ results: rows as unknown as T[] });
        },
        first<T>() {
          if (/^SELECT sub, role FROM users WHERE sub = \?/i.test(sql)) {
            const sub = bound[0] as string;
            const row = rows.find((r) => r.sub === sub);
            return Promise.resolve(
              (row ? { sub: row.sub, role: row.role } : null) as T | null,
            );
          }
          const sub = bound[0] as string;
          const row = rows.find((r) => r.sub === sub);
          return Promise.resolve((row ?? null) as T | null);
        },
        run() {
          if (/^UPDATE users SET role/i.test(sql)) {
            const [role, sub] = bound as string[];
            const row = rows.find((r) => r.sub === sub);
            if (row) row.role = role;
          } else if (/^INSERT INTO audit_log/i.test(sql)) {
            const [id, actor_sub, action, before_json, after_json, created_at] = bound as string[];
            auditLog.push({ id, actor_sub, action, before_json, after_json, created_at });
          }
          return Promise.resolve({} as D1Result);
        },
      };
      return statement;
    },
    batch(statements: { run(): Promise<D1Result> }[]) {
      return Promise.all(statements.map((s) => s.run()));
    },
  } as unknown as D1Database;

  return { db, auditLog };
}

// identityRoutes itself only applies requireRole("admin") — it doesn't set
// `identity` (that's accessAuth's job, mounted ahead of it in worker/index.ts).
// This wraps it with a test-only stand-in for that step, so each test can
// drive the caller's role directly.
function appAs(identity: AccessIdentity, db: D1Database) {
  const app = new Hono<{ Bindings: { DB: D1Database }; Variables: { identity: AccessIdentity } }>();
  app.use("*", async (c, next) => {
    c.set("identity", identity);
    await next();
  });
  app.route("/", identityRoutes);
  return (path: string, init?: RequestInit) => app.request(path, init, { DB: db });
}

const ADMIN: AccessIdentity = { sub: "admin-1", email: "admin@example.com", role: "admin" };
const MEMBER: AccessIdentity = { sub: "member-1", email: "member@example.com", role: "member" };

const ROWS: UserRow[] = [
  {
    sub: "admin-1",
    email: "admin@example.com",
    idp: "google-apps",
    role: "admin",
    created_at: "2026-08-01T00:00:00.000Z",
    last_seen_at: "2026-08-11T00:00:00.000Z",
  },
  {
    sub: "member-1",
    email: "member@example.com",
    idp: "github",
    role: "member",
    created_at: "2026-08-02T00:00:00.000Z",
    last_seen_at: "2026-08-10T00:00:00.000Z",
  },
];

Deno.test("GET /users - returns the roster for an admin caller", async () => {
  const request = appAs(ADMIN, createMockD1(ROWS).db);
  const res = await request("/users");

  assertEquals(res.status, 200);
  const body = await res.json() as { users: { sub: string }[] };
  assertEquals(body.users.length, 2);
  assertEquals(body.users[0].sub, "admin-1");
});

Deno.test("GET /users - rejects a member caller", async () => {
  const request = appAs(MEMBER, createMockD1(ROWS).db);
  const res = await request("/users");

  assertEquals(res.status, 403);
});

Deno.test("POST /users/:sub/role - 400 on an invalid role value", async () => {
  const request = appAs(ADMIN, createMockD1(ROWS).db);
  const res = await request("/users/member-1/role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "superadmin" }),
  });

  assertEquals(res.status, 400);
});

Deno.test("POST /users/:sub/role - 404 on an unknown sub", async () => {
  const { db, auditLog } = createMockD1(ROWS);
  const request = appAs(ADMIN, db);
  const res = await request("/users/nobody/role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "admin" }),
  });

  assertEquals(res.status, 404);
  assertEquals(auditLog.length, 0);
});

Deno.test("POST /users/:sub/role - 200 and updates the role on a valid request", async () => {
  const request = appAs(ADMIN, createMockD1(ROWS).db);
  const res = await request("/users/member-1/role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "admin" }),
  });

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { sub: "member-1", role: "admin" });
});

Deno.test("POST /users/:sub/role - rejects a member caller", async () => {
  const request = appAs(MEMBER, createMockD1(ROWS).db);
  const res = await request("/users/member-1/role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "admin" }),
  });

  assertEquals(res.status, 403);
});

Deno.test("POST /users/:sub/role - records the calling admin as the audit entry's actor (spec 019)", async () => {
  const { db, auditLog } = createMockD1(ROWS);
  const request = appAs(ADMIN, db);
  const res = await request("/users/member-1/role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "admin" }),
  });

  assertEquals(res.status, 200);
  assertEquals(auditLog.length, 1);
  assertEquals(auditLog[0].actor_sub, ADMIN.sub);
  assertEquals(auditLog[0].action, "identity.role_change");
  assertEquals(JSON.parse(auditLog[0].before_json), { sub: "member-1", role: "member" });
  assertEquals(JSON.parse(auditLog[0].after_json), { sub: "member-1", role: "admin" });
});
