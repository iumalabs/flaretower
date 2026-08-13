import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { deriveProductionDomain, pagesRoutes } from "../../worker/modules/pages/routes.ts";

function domainRow(
  status: string,
  domainName: string,
): { project_name: string; domain_name: string; status: string; reason: string } {
  return { project_name: "marketing-site", domain_name: domainName, status, reason: "test" };
}

Deno.test("deriveProductionDomain - returns the first safe-status domain", () => {
  const domains = [
    domainRow("warning", "staging.example.com"),
    domainRow("safe", "example.com"),
    domainRow("safe", "www.example.com"),
  ];
  assertEquals(deriveProductionDomain(domains), "example.com");
});

Deno.test("deriveProductionDomain - null when the project has zero active domains", () => {
  const domains = [
    domainRow("warning", "staging.example.com"),
    domainRow("not_evaluated", "broken.example.com"),
  ];
  assertEquals(deriveProductionDomain(domains), null);
});

Deno.test("deriveProductionDomain - null when the project has zero custom domains at all", () => {
  assertEquals(deriveProductionDomain([]), null);
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
  app.route("/", pagesRoutes);
  return (path: string, init?: RequestInit) => app.request(path, init, { DB: db });
}

Deno.test("POST /alerts/:kind/:id/acknowledge - acknowledges an unacknowledged domain alert and persists it", async () => {
  const alerts: AlertRow[] = [{ id: "a1", acknowledged_at: null }];
  const request = appAsAdmin(createAlertMockD1({ pages_domain_alerts: alerts }));

  const res = await request("/alerts/domain/a1/acknowledge", { method: "POST" });

  assertEquals(res.status, 200);
  const body = await res.json() as { id: string; acknowledged_at: string };
  assertEquals(alerts[0].acknowledged_at, body.acknowledged_at);
});

Deno.test("POST /alerts/:kind/:id/acknowledge - acknowledges an unacknowledged subdomain alert and persists it", async () => {
  const alerts: AlertRow[] = [{ id: "a2", acknowledged_at: null }];
  const request = appAsAdmin(createAlertMockD1({ pages_subdomain_alerts: alerts }));

  const res = await request("/alerts/subdomain/a2/acknowledge", { method: "POST" });

  assertEquals(res.status, 200);
  const body = await res.json() as { id: string; acknowledged_at: string };
  assertEquals(alerts[0].acknowledged_at, body.acknowledged_at);
});

Deno.test("POST /alerts/:kind/:id/acknowledge - acknowledges an unacknowledged deployment alert and persists it", async () => {
  const alerts: AlertRow[] = [{ id: "a3", acknowledged_at: null }];
  const request = appAsAdmin(createAlertMockD1({ pages_deployment_alerts: alerts }));

  const res = await request("/alerts/deployment/a3/acknowledge", { method: "POST" });

  assertEquals(res.status, 200);
  const body = await res.json() as { id: string; acknowledged_at: string };
  assertEquals(alerts[0].acknowledged_at, body.acknowledged_at);
});

Deno.test("POST /alerts/:kind/:id/acknowledge - idempotent on an already-acknowledged alert", async () => {
  const alerts: AlertRow[] = [{ id: "a1", acknowledged_at: "2026-08-09T00:00:00Z" }];
  const request = appAsAdmin(createAlertMockD1({ pages_domain_alerts: alerts }));

  const res = await request("/alerts/domain/a1/acknowledge", { method: "POST" });

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
  const request = appAsAdmin(createAlertMockD1({ pages_domain_alerts: [] }));
  const res = await request("/alerts/domain/missing/acknowledge", { method: "POST" });
  assertEquals(res.status, 404);
});
