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
      // specs/027-overview-dashboard-redesign — queryOneSource's query now
      // has a correlated subquery (reasonSubquery) in its SELECT list,
      // whose own "FROM {findingsTable}" appears textually *before* the
      // outer query's "FROM {alertsTable}". The *last* FROM in the string
      // is always the outer one (subqueries in a SELECT list can only
      // precede it, never follow), so take the last match, not the first.
      const fromMatches = [...sql.matchAll(/FROM\s+(\w+)/gi)];
      const table = fromMatches.at(-1)?.[1] ?? sql.match(/UPDATE\s+(\w+)/i)?.[1] ?? "";
      let bound: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) {
          bound = args;
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
          const id = bound[0] as string | undefined;
          const row = rows.find((r) => r.id === id);
          return Promise.resolve((row ?? null) as T | null);
        },
        // Only ever called for acknowledgeAlert()'s UPDATE, whose real bind
        // order is (acknowledgedAt, id) — worker/modules/audit/inbox.ts.
        // Previously this assumed bind()'s first arg was always the id
        // (true for the SELECT above, false here), so it silently never
        // matched any row and the UPDATE simulation was a no-op — the one
        // test exercising this path only checked the function's own
        // independently-computed return value, so the mock bug went
        // unnoticed rather than failing.
        run() {
          const [acknowledgedAt, id] = bound as [string, string];
          const rows = tableRows[table];
          const row = rows?.find((r) => r.id === id);
          if (row) row.acknowledged_at = acknowledgedAt;
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

  const { alerts, unavailableSources } = await queryUnifiedAlerts(db);

  assertEquals(alerts.length, 2);
  assertEquals(alerts[0].id, "a2"); // most recent first
  assertEquals(alerts[0].module, "security");
  assertEquals(alerts[1].id, "a1");
  assertEquals(alerts[1].module, "exposure");
  assertEquals(unavailableSources, []);
});

// specs/027-overview-dashboard-redesign — the `reason` column itself is
// computed by a correlated subquery embedded in the outer SQL string
// (reasonSubquery, sources.ts); this mock can't simulate SQLite's own
// subquery evaluation (real correctness is verified live via wrangler d1
// execute, same convention this file's header comment already documents
// for the label SQL expression), so these tests only cover the JS-level
// plumbing: whatever value the row carries in its `reason` field passes
// through, and a missing one falls back to the explicit placeholder.
Deno.test("queryUnifiedAlerts - passes a real reason value through unchanged", async () => {
  const db = createMockD1({
    exposure_alerts: [
      {
        id: "a1",
        entity_label: "worker.example.com",
        previous_status: "safe",
        new_status: "critical",
        detected_at: "2026-08-10T05:00:00Z",
        acknowledged_at: null,
        reason: "no Access application covers this hostname",
      },
    ],
  });

  const { alerts } = await queryUnifiedAlerts(db);
  assertEquals(alerts[0].reason, "no Access application covers this hostname");
});

Deno.test("queryUnifiedAlerts - a null reason (join found no matching finding row) falls back to an explicit placeholder", async () => {
  const db = createMockD1({
    exposure_alerts: [
      {
        id: "a1",
        entity_label: "worker.example.com",
        previous_status: "safe",
        new_status: "critical",
        detected_at: "2026-08-10T05:00:00Z",
        acknowledged_at: null,
        reason: null,
      },
    ],
  });

  const { alerts } = await queryUnifiedAlerts(db);
  assertEquals(alerts[0].reason, "reason unavailable");
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

  const { alerts } = await queryUnifiedAlerts(db);

  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].id, "a2");
});

Deno.test("queryUnifiedAlerts - empty result when no source has any outstanding alerts", async () => {
  const db = createMockD1({});
  const { alerts, unavailableSources } = await queryUnifiedAlerts(db);
  assertEquals(alerts, []);
  assertEquals(unavailableSources, []);
});

Deno.test("queryUnifiedAlerts - a rejected source is reported as unavailable, distinct from a source with zero rows", async () => {
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
      // dns_alerts is intentionally absent: this source legitimately has
      // zero rows and must NOT show up in unavailableSources.
    },
    new Set(["exposure_alerts"]),
  );

  const { unavailableSources } = await queryUnifiedAlerts(db);

  assertEquals(unavailableSources.length, 1);
  assertEquals(unavailableSources[0].module, "exposure");
  assertEquals(unavailableSources[0].kind, "hostname");
  assertEquals(unavailableSources[0].error.includes("exposure_alerts"), true);
  assertEquals(unavailableSources.some((s) => s.module === "dns"), false);
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
  const alerts: Record<string, unknown>[] = [{ id: "a1", acknowledged_at: null }];
  const db = createMockD1({ exposure_alerts: alerts });
  const result = await acknowledgeAlert(db, "exposure", "hostname", "a1");
  assertEquals(result.outcome, "ok");
  if (result.outcome === "ok") {
    assertEquals(result.id, "a1");
    assertEquals(typeof result.acknowledgedAt, "string");
    // The write actually persisted — not just the function's own
    // independently-computed return value, which (before the mock fix
    // above) could stay "ok" even if the real UPDATE never matched a row.
    assertEquals(alerts[0].acknowledged_at, result.acknowledgedAt);
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
