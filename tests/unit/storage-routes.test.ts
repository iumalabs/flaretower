import { assertEquals, assertThrows } from "@std/assert";
import { Hono } from "hono";
import {
  boundToLabel,
  buildStorageInventoryResponse,
  storageRoutes,
} from "../../worker/modules/storage/routes.ts";
import { PaginationParamError } from "../../worker/pagination.ts";

Deno.test("boundToLabel - none when referenced by zero Workers", () => {
  assertEquals(boundToLabel([]), "none");
});

Deno.test("boundToLabel - the single Worker's name when referenced by exactly one", () => {
  assertEquals(boundToLabel(["auth-broker"]), "auth-broker");
});

Deno.test("boundToLabel - a count, not a name list, when referenced by more than one", () => {
  assertEquals(boundToLabel(["worker-a", "worker-b", "worker-c"]), "3 workers");
});

// specs/020-list-pagination — buildStorageInventoryResponse() is pure
// (extracted from the route handler), so these exercise the 3-independent-
// collection pagination/sort/critical_finding logic directly, without a D1
// mock for the three findings tables.
function bucketRow(overrides: Partial<{
  bucket_name: string;
  status: string;
  reason: string;
  custom_domain: string | null;
  bound_to_workers: string | null;
}> = {}) {
  return {
    bucket_name: "b",
    status: "safe",
    reason: "private",
    custom_domain: null,
    bound_to_workers: null,
    ...overrides,
  };
}
function kvRow(overrides: Partial<{
  namespace_id: string;
  title: string;
  status: string;
  reason: string;
  bound_to_workers: string | null;
}> = {}) {
  return {
    namespace_id: "kv-1",
    title: "kv",
    status: "safe",
    reason: "referenced",
    bound_to_workers: null,
    ...overrides,
  };
}
function d1Row(overrides: Partial<{
  database_uuid: string;
  name: string;
  status: string;
  reason: string;
  bound_to_workers: string | null;
  num_tables: number | null;
  file_size: number | null;
}> = {}) {
  return {
    database_uuid: "db-1",
    name: "d1",
    status: "safe",
    reason: "referenced",
    bound_to_workers: null,
    num_tables: 3,
    file_size: 1024,
    ...overrides,
  };
}

Deno.test("buildStorageInventoryResponse - each collection paginates independently", () => {
  const buckets = Array.from({ length: 3 }, (_, i) => bucketRow({ bucket_name: `b${i}` }));
  const kv = Array.from(
    { length: 2 },
    (_, i) => kvRow({ namespace_id: `kv-${i}`, title: `kv${i}` }),
  );
  const d1 = [d1Row()];

  const res = buildStorageInventoryResponse(buckets, kv, d1, "run-1", "2026-08-14T00:00:00Z", {
    bucket: { page_size: "2" },
  });

  assertEquals(res.buckets.length, 2);
  assertEquals(res.buckets_pagination, { page: 1, page_size: 2, total: 3, total_pages: 2 });
  assertEquals(res.kv_namespaces.length, 2);
  assertEquals(res.kv_namespaces_pagination, { page: 1, page_size: 50, total: 2, total_pages: 1 });
  assertEquals(res.d1_databases.length, 1);
  assertEquals(res.total_resources, 6);
});

Deno.test("buildStorageInventoryResponse - critical_finding priority: bucket > kv > d1", () => {
  const buckets = [
    bucketRow({ bucket_name: "exposed", status: "critical", reason: "public r2.dev" }),
  ];
  const kv = [kvRow({ status: "critical", reason: "unreferenced" })];
  const d1 = [d1Row({ status: "critical", reason: "unreferenced" })];

  const res = buildStorageInventoryResponse(buckets, kv, d1, "run-1", "t", {});
  assertEquals(res.critical_finding, {
    title: "An R2 bucket is publicly exposed",
    target: "exposed",
    reason: "public r2.dev",
  });
  assertEquals(res.total_exposed, 3);
});

Deno.test("buildStorageInventoryResponse - critical_finding falls through to kv, then d1, then null", () => {
  const safeBucket = [bucketRow()];
  const criticalKv = [kvRow({ title: "orphan-kv", status: "critical", reason: "unreferenced" })];
  const res1 = buildStorageInventoryResponse(safeBucket, criticalKv, [], "run-1", "t", {});
  assertEquals(res1.critical_finding?.title, "A KV namespace needs attention");
  assertEquals(res1.critical_finding?.target, "orphan-kv");

  const res2 = buildStorageInventoryResponse([], [], [], "run-1", "t", {});
  assertEquals(res2.critical_finding, null);
});

Deno.test("buildStorageInventoryResponse - critical_finding reflects the whole collection, not just the paginated page", () => {
  // Default sort is by name ascending — "a-safe" sorts onto page 1,
  // "z-critical" onto page 2 (page_size 1), and must still be found.
  const buckets = [
    bucketRow({ bucket_name: "a-safe" }),
    bucketRow({ bucket_name: "z-critical", status: "critical", reason: "exposed" }),
  ];
  const res = buildStorageInventoryResponse(buckets, [], [], "run-1", "t", {
    bucket: { page: "1", page_size: "1" },
  });
  assertEquals(res.buckets.map((b) => b.bucket_name), ["a-safe"]);
  assertEquals(res.critical_finding?.target, "z-critical");
});

Deno.test("buildStorageInventoryResponse - sorts a collection by a whitelisted key, descending", () => {
  const d1 = [
    d1Row({ name: "small", num_tables: 1 }),
    d1Row({ name: "big", num_tables: 9 }),
  ];
  const res = buildStorageInventoryResponse([], [], d1, "run-1", "t", {
    d1: { sort_key: "num_tables", sort_dir: "desc" },
  });
  assertEquals(res.d1_databases.map((d) => d.name), ["big", "small"]);
});

Deno.test("buildStorageInventoryResponse - rejects an invalid sort_key for any one collection", () => {
  assertThrows(
    () =>
      buildStorageInventoryResponse([], [kvRow()], [], "run-1", "t", { kv: { sort_key: "nope" } }),
    PaginationParamError,
  );
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
