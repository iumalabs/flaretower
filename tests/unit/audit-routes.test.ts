import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { auditRoutes } from "../../worker/modules/audit/routes.ts";

// specs/018-audit-dashboard: GET /log calls fetchAccountAuditLog(), which
// uses the ambient global `fetch` (ties into the same underlying Audit
// Logs API call workers-dashboard/audit-log.ts's own tests exercise) —
// stubbed per-test below rather than left to make a real network call.

function app(db: D1Database) {
  const hono = new Hono<
    { Bindings: { DB: D1Database; CF_ACCOUNT_ID: string; CF_API_TOKEN: string } }
  >();
  hono.route("/", auditRoutes);
  return (path: string) =>
    hono.request(path, undefined, { DB: db, CF_ACCOUNT_ID: "acct-1", CF_API_TOKEN: "tok" });
}

const NOOP_DB = {} as unknown as D1Database;

// computeChanges() (changes.ts) queries all 17 AUDIT_SOURCES regardless of
// `since` — this mock just needs every query to resolve to zero rows,
// enough to prove a well-formed `since` reaches computeChanges() at all
// (as opposed to being rejected by the validation added below).
function createEmptyMockD1(): D1Database {
  return {
    prepare() {
      const statement = {
        bind() {
          return statement;
        },
        all<T>() {
          return Promise.resolve({ results: [] as T[] });
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

Deno.test("GET /log - maps real entries, since defaults to 7 days before now", async () => {
  let capturedUrl = "";
  globalThis.fetch = ((input: RequestInfo | URL) => {
    capturedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          result: [
            {
              when: "2026-08-13T09:04:12Z",
              actor: { email: "user@example.com" },
              interface: { type: "dashboard" },
              action: { type: "zone.settings.change" },
              resource: { type: "zone" },
              oldValue: "off",
              newValue: "on",
            },
          ],
        }),
        { status: 200 },
      ),
    );
  }) as typeof fetch;

  const res = await app(NOOP_DB)("/log");
  assertEquals(res.status, 200);
  const body = await res.json() as {
    since: string;
    until: string;
    unavailable: boolean;
    entries: Array<{ occurred_at: string; actor: string; actor_source: string }>;
  };

  assertEquals(body.unavailable, false);
  assertEquals(body.entries.length, 1);
  assertEquals(body.entries[0].actor, "user@example.com");
  assertEquals(body.entries[0].actor_source, "dashboard");

  const sinceMs = new Date(body.since).getTime();
  const untilMs = new Date(body.until).getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  assertEquals(Math.round((untilMs - sinceMs) / sevenDaysMs), 1);
  assertEquals(capturedUrl.includes("since="), true);
});

Deno.test("GET /log - unavailable: true (not a thrown error) when the Cloudflare API call rejects", async () => {
  globalThis.fetch = (() => Promise.reject(new Error("network error"))) as typeof fetch;

  const res = await app(NOOP_DB)("/log");
  assertEquals(res.status, 200);
  const body = await res.json() as { unavailable: boolean; entries: unknown[] };

  assertEquals(body.unavailable, true);
  assertEquals(body.entries, []);
});

Deno.test("GET /log - unavailable: true when the Cloudflare API responds with a non-2xx status", async () => {
  globalThis.fetch =
    (() => Promise.resolve(new Response("forbidden", { status: 403 }))) as typeof fetch;

  const res = await app(NOOP_DB)("/log");
  assertEquals(res.status, 200);
  const body = await res.json() as { unavailable: boolean; entries: unknown[] };

  assertEquals(body.unavailable, true);
  assertEquals(body.entries, []);
});

Deno.test("GET /changes - 400 on a malformed since value", async () => {
  const res = await app(NOOP_DB)("/changes?since=banana");
  assertEquals(res.status, 400);
  const body = await res.json() as { error: string };
  assertEquals(body.error.includes("banana"), true);
});

Deno.test("GET /changes - a well-formed ISO8601 since value is accepted", async () => {
  const res = await app(createEmptyMockD1())("/changes?since=2026-08-01T00:00:00.000Z");
  assertEquals(res.status, 200);
  const body = await res.json() as { since: string };
  assertEquals(body.since, "2026-08-01T00:00:00.000Z");
});

Deno.test("GET /changes - a missing since defaults to 24 hours ago rather than 400ing", async () => {
  const res = await app(createEmptyMockD1())("/changes");
  assertEquals(res.status, 200);
});

// POST /alerts/:module/:kind/:id/acknowledge is a thin wrapper over
// inbox.ts's acknowledgeAlert() (already covered, including persistence,
// by tests/unit/audit-inbox.test.ts) — this only exercises the HTTP-layer
// wiring: requireRole("admin") gating, param extraction, and status-code
// mapping (200 on success, 404 for both unknown_source and not_found).
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
  const hono = new Hono<
    {
      Bindings: { DB: D1Database; CF_ACCOUNT_ID: string; CF_API_TOKEN: string };
      Variables: { identity: { role: "admin" | "member" } };
    }
  >();
  hono.use("*", async (c, next) => {
    c.set("identity", { role: "admin" });
    await next();
  });
  hono.route("/", auditRoutes);
  return (path: string) =>
    hono.request(path, { method: "POST" }, {
      DB: db,
      CF_ACCOUNT_ID: "acct-1",
      CF_API_TOKEN: "tok",
    });
}

Deno.test("POST /alerts/:module/:kind/:id/acknowledge - acknowledges a real source's alert and persists it", async () => {
  const alerts: AlertRow[] = [{ id: "a1", acknowledged_at: null }];
  const request = appAsAdmin(createAlertMockD1({ exposure_alerts: alerts }));

  const res = await request("/alerts/exposure/hostname/a1/acknowledge");

  assertEquals(res.status, 200);
  const body = await res.json() as { id: string; acknowledged_at: string };
  assertEquals(body.id, "a1");
  assertEquals(alerts[0].acknowledged_at, body.acknowledged_at);
});

Deno.test("POST /alerts/:module/:kind/:id/acknowledge - 404 on an unregistered module/kind pair", async () => {
  const request = appAsAdmin(createAlertMockD1({}));
  const res = await request("/alerts/not-a-module/not-a-kind/a1/acknowledge");
  assertEquals(res.status, 404);
});

Deno.test("POST /alerts/:module/:kind/:id/acknowledge - 404 on an unknown id for a real source", async () => {
  const request = appAsAdmin(createAlertMockD1({ exposure_alerts: [] }));
  const res = await request("/alerts/exposure/hostname/missing/acknowledge");
  assertEquals(res.status, 404);
});
