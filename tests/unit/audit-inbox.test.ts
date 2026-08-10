import { assertEquals } from "@std/assert";
import { acknowledgeAlert, queryUnifiedAlerts } from "../../worker/modules/audit/inbox.ts";

// A minimal fake D1Database: routes by the table name found in the SQL
// string, returns pre-shaped rows for that table (the label SQL
// expression itself is SQLite's concern, not this module's — trusted
// and verified live via wrangler d1 execute, same as every prior
// module's approach to SQL correctness).
function createMockD1(
  tableRows: Record<string, Record<string, unknown>[]>,
  failingTables: Set<string> = new Set(),
): D1Database {
  return {
    prepare(sql: string) {
      const table = sql.match(/FROM\s+(\w+)/i)?.[1] ?? sql.match(/UPDATE\s+(\w+)/i)?.[1] ?? "";
      let boundId: string | undefined;
      const statement = {
        bind(...args: unknown[]) {
          boundId = args[0] as string | undefined;
          return statement;
        },
        all<T>() {
          if (failingTables.has(table)) {
            return Promise.reject(new Error(`mock failure for ${table}`));
          }
          return Promise.resolve({ results: (tableRows[table] ?? []) as T[] });
        },
        first<T>() {
          if (failingTables.has(table)) {
            return Promise.reject(new Error(`mock failure for ${table}`));
          }
          const rows = tableRows[table] ?? [];
          const row = rows.find((r) => r.id === boundId);
          return Promise.resolve((row ?? null) as T | null);
        },
        run() {
          const rows = tableRows[table];
          const row = rows?.find((r) => r.id === boundId);
          if (row) row.acknowledged_at = "2026-08-10T12:00:00Z";
          return Promise.resolve({} as D1Result);
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

Deno.test("queryUnifiedAlerts - merges alerts from multiple sources, sorted by detected_at descending", async () => {
  const db = createMockD1({
    exposure_alerts: [
      {
        id: "a1",
        entity_label: "worker.example.com",
        previous_status: "safe",
        new_status: "critical",
        detected_at: "2026-08-10T05:00:00Z",
        acknowledged_at: null,
      },
    ],
    ssl_tls_alerts: [
      {
        id: "a2",
        entity_label: "example.com",
        previous_status: "safe",
        new_status: "critical",
        detected_at: "2026-08-10T06:00:00Z",
        acknowledged_at: null,
      },
    ],
  });

  const alerts = await queryUnifiedAlerts(db);

  assertEquals(alerts.length, 2);
  assertEquals(alerts[0].id, "a2"); // most recent first
  assertEquals(alerts[0].module, "security");
  assertEquals(alerts[1].id, "a1");
  assertEquals(alerts[1].module, "exposure");
});

Deno.test("queryUnifiedAlerts - a per-source read failure doesn't blank out the others", async () => {
  const db = createMockD1(
    {
      ssl_tls_alerts: [
        {
          id: "a2",
          entity_label: "example.com",
          previous_status: "safe",
          new_status: "critical",
          detected_at: "2026-08-10T06:00:00Z",
          acknowledged_at: null,
        },
      ],
    },
    new Set(["exposure_alerts"]),
  );

  const alerts = await queryUnifiedAlerts(db);

  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].id, "a2");
});

Deno.test("queryUnifiedAlerts - empty result when no source has any outstanding alerts", async () => {
  const db = createMockD1({});
  const alerts = await queryUnifiedAlerts(db);
  assertEquals(alerts, []);
});

Deno.test("acknowledgeAlert - unknown module/kind pair returns unknown_source", async () => {
  const db = createMockD1({});
  const result = await acknowledgeAlert(db, "not-a-module", "not-a-kind", "a1");
  assertEquals(result.outcome, "unknown_source");
});

Deno.test("acknowledgeAlert - unknown id returns not_found", async () => {
  const db = createMockD1({ exposure_alerts: [] });
  const result = await acknowledgeAlert(db, "exposure", "hostname", "missing-id");
  assertEquals(result.outcome, "not_found");
});

Deno.test("acknowledgeAlert - acknowledges an unacknowledged alert", async () => {
  const db = createMockD1({
    exposure_alerts: [{ id: "a1", acknowledged_at: null }],
  });
  const result = await acknowledgeAlert(db, "exposure", "hostname", "a1");
  assertEquals(result.outcome, "ok");
  if (result.outcome === "ok") {
    assertEquals(result.id, "a1");
    assertEquals(typeof result.acknowledgedAt, "string");
  }
});

Deno.test("acknowledgeAlert - idempotent on an already-acknowledged alert", async () => {
  const db = createMockD1({
    exposure_alerts: [{ id: "a1", acknowledged_at: "2026-08-09T00:00:00Z" }],
  });
  const result = await acknowledgeAlert(db, "exposure", "hostname", "a1");
  assertEquals(result.outcome, "ok");
  if (result.outcome === "ok") {
    assertEquals(result.acknowledgedAt, "2026-08-09T00:00:00Z");
  }
});
