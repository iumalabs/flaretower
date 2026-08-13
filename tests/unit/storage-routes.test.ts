import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { boundToLabel, storageRoutes } from "../../worker/modules/storage/routes.ts";

Deno.test("boundToLabel - none when referenced by zero Workers", () => {
  assertEquals(boundToLabel([]), "none");
});

Deno.test("boundToLabel - the single Worker's name when referenced by exactly one", () => {
  assertEquals(boundToLabel(["auth-broker"]), "auth-broker");
});

Deno.test("boundToLabel - a count, not a name list, when referenced by more than one", () => {
  assertEquals(boundToLabel(["worker-a", "worker-b", "worker-c"]), "3 workers");
});

// A minimal mock focused only on the alert tables' SELECT/UPDATE shape
// (POST /alerts/:kind/:id/acknowledge). Mirrors tests/unit/routes.test.ts's
// (workers-access-exposure) equivalent addition and
// tests/unit/audit-inbox.test.ts's fixed mock: bind()'s arg order differs
// between the SELECT (.bind(id)) and the UPDATE (.bind(acknowledgedAt, id)).
interface AlertRow {
  id: string;
  acknowledged_at: string | null;
}

function createAlertMockD1(alertsByTable: Record<string, AlertRow[]>): D1Database {
  return {
    prepare(sql: string) {
      const table = sql.match(/FROM\s+(\w+)|UPDATE\s+(\w+)/i);
      const tableName = table?.[1] ?? table?.[2] ?? "";
      let bound: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) {
          bound = args;
          return statement;
        },
        first<T>() {
          const id = bound[0] as string;
          const row = (alertsByTable[tableName] ?? []).find((a) => a.id === id);
          return Promise.resolve((row ?? null) as T | null);
        },
        run() {
          const [acknowledgedAt, id] = bound as [string, string];
          const row = (alertsByTable[tableName] ?? []).find((a) => a.id === id);
          if (row) row.acknowledged_at = acknowledgedAt;
          return Promise.resolve({} as D1Result);
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

function appAsAdmin(db: D1Database) {
  const app = new Hono<
    { Bindings: { DB: D1Database }; Variables: { identity: { role: "admin" | "member" } } }
  >();
  app.use("*", async (c, next) => {
    c.set("identity", { role: "admin" });
    await next();
  });
  app.route("/", storageRoutes);
  return (path: string, init?: RequestInit) => app.request(path, init, { DB: db });
}

Deno.test("POST /alerts/:kind/:id/acknowledge - acknowledges an unacknowledged bucket alert and persists it", async () => {
  const alerts: AlertRow[] = [{ id: "a1", acknowledged_at: null }];
  const request = appAsAdmin(createAlertMockD1({ r2_bucket_alerts: alerts }));

  const res = await request("/alerts/bucket/a1/acknowledge", { method: "POST" });

  assertEquals(res.status, 200);
  const body = await res.json() as { id: string; acknowledged_at: string };
  assertEquals(alerts[0].acknowledged_at, body.acknowledged_at);
});

Deno.test("POST /alerts/:kind/:id/acknowledge - acknowledges an unacknowledged kv_namespace alert and persists it", async () => {
  const alerts: AlertRow[] = [{ id: "a2", acknowledged_at: null }];
  const request = appAsAdmin(createAlertMockD1({ kv_namespace_alerts: alerts }));

  const res = await request("/alerts/kv_namespace/a2/acknowledge", { method: "POST" });

  assertEquals(res.status, 200);
  const body = await res.json() as { id: string; acknowledged_at: string };
  assertEquals(alerts[0].acknowledged_at, body.acknowledged_at);
});

Deno.test("POST /alerts/:kind/:id/acknowledge - acknowledges an unacknowledged d1_database alert and persists it", async () => {
  const alerts: AlertRow[] = [{ id: "a3", acknowledged_at: null }];
  const request = appAsAdmin(createAlertMockD1({ d1_database_alerts: alerts }));

  const res = await request("/alerts/d1_database/a3/acknowledge", { method: "POST" });

  assertEquals(res.status, 200);
  const body = await res.json() as { id: string; acknowledged_at: string };
  assertEquals(alerts[0].acknowledged_at, body.acknowledged_at);
});

Deno.test("POST /alerts/:kind/:id/acknowledge - idempotent on an already-acknowledged alert", async () => {
  const alerts: AlertRow[] = [{ id: "a1", acknowledged_at: "2026-08-09T00:00:00Z" }];
  const request = appAsAdmin(createAlertMockD1({ r2_bucket_alerts: alerts }));

  const res = await request("/alerts/bucket/a1/acknowledge", { method: "POST" });

  assertEquals(res.status, 200);
  const body = await res.json() as { acknowledged_at: string };
  assertEquals(body.acknowledged_at, "2026-08-09T00:00:00Z");
});

Deno.test("POST /alerts/:kind/:id/acknowledge - 404 on an unknown kind", async () => {
  const request = appAsAdmin(createAlertMockD1({}));
  const res = await request("/alerts/not-a-kind/a1/acknowledge", { method: "POST" });
  assertEquals(res.status, 404);
});

Deno.test("POST /alerts/:kind/:id/acknowledge - 404 on an unknown id", async () => {
  const request = appAsAdmin(createAlertMockD1({ r2_bucket_alerts: [] }));
  const res = await request("/alerts/bucket/missing/acknowledge", { method: "POST" });
  assertEquals(res.status, 404);
});
