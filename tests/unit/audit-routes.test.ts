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
    total: number;
    truncated: boolean;
  };

  assertEquals(body.unavailable, false);
  assertEquals(body.entries.length, 1);
  assertEquals(body.entries[0].actor, "user@example.com");
  assertEquals(body.entries[0].actor_source, "dashboard");
  assertEquals(body.total, 1);
  assertEquals(body.truncated, false);

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

Deno.test("GET /log - forwards truncated: true when the fetch cap is hit (specs/020-list-pagination)", async () => {
  // Every page full (100 entries) so fetchAccountAuditLog() keeps following
  // the cursor all the way to its 1000-entry cap instead of stopping early.
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(input as string);
    const page = url.searchParams.get("page");
    return Promise.resolve(
      new Response(
        JSON.stringify({
          result: Array.from({ length: 100 }, (_, i) => ({
            when: "2026-08-13T09:04:12Z",
            actor: { email: `user-${page}-${i}@example.com` },
            interface: { type: "dashboard" },
            action: { type: "zone.settings.change" },
            resource: { type: "zone" },
          })),
        }),
        { status: 200 },
      ),
    );
  }) as typeof fetch;

  const res = await app(NOOP_DB)("/log");
  const body = await res.json() as { total: number; truncated: boolean; entries: unknown[] };

  assertEquals(body.total, 1000);
  assertEquals(body.entries.length, 1000);
  assertEquals(body.truncated, true);
});

// specs/022-audit-list-pagination — a mock D1 that returns real alert rows
// across several distinct sources' alertsTable, matching the exact column
// shape queryOneSource() (inbox.ts) SELECTs: id, entity_label,
// previous_status, new_status, detected_at, acknowledged_at. Only tables
// named below produce rows; every other AUDIT_SOURCES table resolves to
// empty, matching how `.all()` on an unmocked-but-recognized table behaves.
function createAlertsMockD1(
  rowsByTable: Record<string, {
    id: string;
    entity_label: string;
    previous_status: string | null;
    new_status: string;
    detected_at: string;
    acknowledged_at: string | null;
  }[]>,
): D1Database {
  return {
    prepare(sql: string) {
      // specs/027-overview-dashboard-redesign — the alerts query now has a
      // reason correlated subquery ahead of its own outer FROM textually;
      // the last FROM match is always the outer (alerts) table (same fix
      // as audit-inbox.test.ts's mock).
      const fromMatches = [...sql.matchAll(/FROM\s+(\w+)/gi)];
      const table = fromMatches.at(-1)?.[1] ?? "";
      const statement = {
        bind() {
          return statement;
        },
        all<T>() {
          return Promise.resolve({ results: (rowsByTable[table] ?? []) as T[] });
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

function alertRow(overrides: Partial<{
  id: string;
  entity_label: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}> = {}) {
  return {
    id: "a1",
    entity_label: "example.com",
    previous_status: "safe",
    new_status: "warning",
    detected_at: "2026-08-10T00:00:00Z",
    acknowledged_at: null,
    ...overrides,
  };
}

// specs/022-audit-list-pagination — same two-query-per-source mock shape
// tests/unit/audit-changes.test.ts uses directly against computeChanges();
// duplicated here (rather than imported) since it's a small, route-test-
// local fixture, not shared production code.
function createMockChangesD1(
  latestRows: Record<string, Record<string, unknown>[]>,
  atCutoffRows: Record<string, Record<string, unknown>[]>,
): D1Database {
  return {
    prepare(sql: string) {
      const isCutoffQuery = /evaluated_at <= \?/.test(sql);
      const table = sql.match(/FROM\s+(\w+)/i)?.[1] ?? "";
      const statement = {
        bind() {
          return statement;
        },
        all<T>() {
          const rows = isCutoffQuery ? (atCutoffRows[table] ?? []) : (latestRows[table] ?? []);
          return Promise.resolve({ results: rows as T[] });
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

Deno.test("GET /alerts - paginates the merged cross-source result, page_size honored", async () => {
  const db = createAlertsMockD1({
    exposure_alerts: [
      alertRow({ id: "a1", entity_label: "b-host", detected_at: "2026-08-10T00:00:00Z" }),
    ],
    dns_alerts: [
      alertRow({ id: "a2", entity_label: "a-record", detected_at: "2026-08-11T00:00:00Z" }),
    ],
    zt_app_alerts: [
      alertRow({ id: "a3", entity_label: "c-app", detected_at: "2026-08-09T00:00:00Z" }),
    ],
  });

  const res = await app(db)("/alerts?page=1&page_size=2");
  assertEquals(res.status, 200);
  const body = await res.json() as {
    alerts: { id: string }[];
    pagination: { page: number; page_size: number; total: number; total_pages: number };
  };

  assertEquals(body.alerts.length, 2);
  assertEquals(body.pagination, { page: 1, page_size: 2, total: 3, total_pages: 2 });
});

Deno.test("GET /alerts - default sort is by detected_at descending (unchanged from pre-pagination behavior)", async () => {
  const db = createAlertsMockD1({
    exposure_alerts: [alertRow({ id: "older", detected_at: "2026-08-09T00:00:00Z" })],
    dns_alerts: [alertRow({ id: "newer", detected_at: "2026-08-11T00:00:00Z" })],
  });

  const res = await app(db)("/alerts");
  const body = await res.json() as { alerts: { id: string }[] };

  assertEquals(body.alerts.map((a) => a.id), ["newer", "older"]);
});

Deno.test("GET /alerts - sort_key=severity ranks critical first, matching Overview's ordering", async () => {
  const db = createAlertsMockD1({
    exposure_alerts: [alertRow({ id: "warn", new_status: "warning" })],
    dns_alerts: [alertRow({ id: "crit", new_status: "critical" })],
    zt_app_alerts: [alertRow({ id: "safe", new_status: "safe" })],
  });

  const res = await app(db)("/alerts?sort_key=severity");
  const body = await res.json() as { alerts: { id: string }[] };

  assertEquals(body.alerts.map((a) => a.id), ["crit", "warn", "safe"]);
});

Deno.test("GET /alerts - an invalid sort_key returns 400, not a silent fallback", async () => {
  const res = await app(createAlertsMockD1({}))("/alerts?sort_key=nope");
  assertEquals(res.status, 400);
});

Deno.test("GET /alerts - an invalid page_size returns 400, not a silent fallback", async () => {
  const res = await app(createAlertsMockD1({}))("/alerts?page_size=0");
  assertEquals(res.status, 400);
});

Deno.test("GET /alerts - critical_alert surfaces from the full set even when it's not on the requested page", async () => {
  const db = createAlertsMockD1({
    exposure_alerts: [alertRow({ id: "a1", detected_at: "2026-08-11T00:00:00Z" })],
    dns_alerts: [
      alertRow({ id: "crit", new_status: "critical", detected_at: "2026-08-09T00:00:00Z" }),
    ],
  });

  // page_size=1, default sort (detected desc) puts "a1" (newer) on page 1
  // and "crit" (older) on page 2 — critical_alert must still be non-null.
  const res = await app(db)("/alerts?page=1&page_size=1");
  const body = await res.json() as {
    alerts: { id: string }[];
    critical_alert: { id: string } | null;
  };

  assertEquals(body.alerts.map((a) => a.id), ["a1"]);
  assertEquals(body.critical_alert?.id, "crit");
});

Deno.test("GET /alerts - critical_alert is null when nothing is critical", async () => {
  const db = createAlertsMockD1({
    exposure_alerts: [alertRow({ id: "a1", new_status: "warning" })],
  });

  const res = await app(db)("/alerts");
  const body = await res.json() as { critical_alert: unknown };

  assertEquals(body.critical_alert, null);
});

Deno.test("GET /changes - paginates the merged cross-source result", async () => {
  const db = createMockChangesD1(
    {
      exposure_findings: [{ hostname: "b-host", status: "critical" }],
      dns_findings: [{
        zone_name: "a-record",
        record_name: "a-record",
        record_type: "A",
        status: "warning",
      }],
    },
    {
      exposure_findings: [{ hostname: "b-host", status: "safe" }],
      dns_findings: [{
        zone_name: "a-record",
        record_name: "a-record",
        record_type: "A",
        status: "safe",
      }],
    },
  );

  const res = await app(db)("/changes?since=2026-08-09T00:00:00Z&page_size=1");
  assertEquals(res.status, 200);
  const body = await res.json() as {
    changes: { entity_label: string }[];
    pagination: { total: number; total_pages: number };
  };

  assertEquals(body.changes.length, 1);
  assertEquals(body.pagination.total, 2);
  assertEquals(body.pagination.total_pages, 2);
});

Deno.test("GET /changes - sort_key=severity ranks critical first", async () => {
  const db = createMockChangesD1(
    {
      exposure_findings: [{ hostname: "warn-host", status: "warning" }],
      dns_findings: [{
        zone_name: "crit-rec",
        record_name: "crit-rec",
        record_type: "A",
        status: "critical",
      }],
    },
    {
      exposure_findings: [{ hostname: "warn-host", status: "safe" }],
      dns_findings: [{
        zone_name: "crit-rec",
        record_name: "crit-rec",
        record_type: "A",
        status: "safe",
      }],
    },
  );

  const res = await app(db)("/changes?since=2026-08-09T00:00:00Z&sort_key=severity");
  const body = await res.json() as { changes: { entity_label: string }[] };

  assertEquals(body.changes[0].entity_label.includes("crit-rec"), true);
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
