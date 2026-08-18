import { assertEquals } from "@std/assert";
import { computeTrend } from "../../worker/modules/audit/trend.ts";

// computeTrend issues two queries per source: a seed query (state as of
// the window start — same ROW_NUMBER/PARTITION BY shape changes.ts's own
// mock already trusts, distinguished by `evaluated_at <= ?`) and a window
// query (every row from the window onward, distinguished by
// `evaluated_at >= ?`). Both hit the same findings table.
function createMockD1(
  seedRows: Record<string, Record<string, unknown>[]>,
  windowRows: Record<string, Record<string, unknown>[]>,
  failingTables: Set<string> = new Set(),
): D1Database {
  return {
    prepare(sql: string) {
      const isSeedQuery = /evaluated_at <= \?/.test(sql);
      const table = sql.match(/FROM\s+(\w+)/i)?.[1] ?? "";
      const statement = {
        bind() {
          return statement;
        },
        all<T>() {
          if (failingTables.has(table)) {
            return Promise.reject(new Error(`mock failure for ${table}`));
          }
          const rows = isSeedQuery ? (seedRows[table] ?? []) : (windowRows[table] ?? []);
          return Promise.resolve({ results: rows as T[] });
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

// A fixed "now" so day boundaries are deterministic across test runs —
// days=3 with now=Aug 18 00:30 UTC gives boundaries at Aug 16/17/18
// (UTC midnight each).
const NOW = new Date("2026-08-18T00:30:00Z");

Deno.test("computeTrend - a source with only seed data (no window rows) holds that status across every day", async () => {
  const db = createMockD1(
    { ssl_tls_findings: [{ zone_id: "z1", zone_name: "example.com", status: "safe" }] },
    {},
  );

  const { days } = await computeTrend(db, 3, NOW);

  assertEquals(days.length, 3);
  for (const day of days) {
    assertEquals(day.hasData, true);
    assertEquals(day.counts, { safe: 1, warning: 0, critical: 0, not_evaluated: 0 });
  }
});

Deno.test("computeTrend - a status change lands on the correct day boundary, not before or after", async () => {
  const db = createMockD1(
    { ssl_tls_findings: [{ zone_id: "z1", zone_name: "example.com", status: "safe" }] },
    {
      ssl_tls_findings: [
        // Lands after Aug 16's boundary, at-or-before Aug 17's.
        {
          zone_id: "z1",
          zone_name: "example.com",
          status: "critical",
          evaluated_at: "2026-08-17T00:00:00.000Z",
        },
      ],
    },
  );

  const { days } = await computeTrend(db, 3, NOW);

  assertEquals(days[0].date, "2026-08-16");
  assertEquals(days[0].counts, { safe: 1, warning: 0, critical: 0, not_evaluated: 0 });
  assertEquals(days[1].date, "2026-08-17");
  assertEquals(days[1].counts, { safe: 0, warning: 0, critical: 1, not_evaluated: 0 });
  assertEquals(days[2].date, "2026-08-18");
  assertEquals(days[2].counts, { safe: 0, warning: 0, critical: 1, not_evaluated: 0 });
});

Deno.test("computeTrend - a row exactly at a day boundary counts toward that day, not the next one", async () => {
  const db = createMockD1(
    { ssl_tls_findings: [{ zone_id: "z1", zone_name: "example.com", status: "safe" }] },
    {
      ssl_tls_findings: [
        // Exactly Aug 17's UTC-midnight boundary.
        {
          zone_id: "z1",
          zone_name: "example.com",
          status: "critical",
          evaluated_at: "2026-08-17T00:00:00.000Z",
        },
      ],
    },
  );

  const { days } = await computeTrend(db, 3, NOW);

  const aug17 = days.find((d) => d.date === "2026-08-17");
  assertEquals(aug17?.counts.critical, 1);
  assertEquals(aug17?.counts.safe, 0);
});

Deno.test("computeTrend - a day with no data from any source is marked hasData: false, not a fabricated zero", async () => {
  const db = createMockD1({}, {});

  const { days } = await computeTrend(db, 3, NOW);

  for (const day of days) {
    assertEquals(day.hasData, false);
    assertEquals(day.counts, { safe: 0, warning: 0, critical: 0, not_evaluated: 0 });
  }
});

Deno.test("computeTrend - a day is only hasData:false when EVERY source lacks it, not just one", async () => {
  const db = createMockD1(
    { ssl_tls_findings: [{ zone_id: "z1", zone_name: "example.com", status: "safe" }] },
    {},
  );

  const { days } = await computeTrend(db, 3, NOW);

  // ssl_tls has data for every day (seed carries forward); the other 16
  // sources have none — the merged day must still be hasData: true.
  for (const day of days) {
    assertEquals(day.hasData, true);
  }
});

Deno.test("computeTrend - a per-source read failure is reported as unavailable, doesn't blank the other sources' days", async () => {
  const db = createMockD1(
    {
      ssl_tls_findings: [{ zone_id: "z1", zone_name: "example.com", status: "safe" }],
      r2_bucket_findings: [{ bucket_name: "uploads", status: "warning" }],
    },
    {},
    new Set(["ssl_tls_findings"]),
  );

  const { days, unavailableSources } = await computeTrend(db, 3, NOW);

  assertEquals(unavailableSources.length, 1);
  assertEquals(unavailableSources[0].module, "security");
  assertEquals(unavailableSources[0].kind, "ssl_tls");
  // r2_bucket's own data still contributes to every day.
  for (const day of days) {
    assertEquals(day.hasData, true);
    assertEquals(day.counts.warning, 1);
  }
});

Deno.test("computeTrend - multiple sources' counts merge into the same day", async () => {
  const db = createMockD1(
    {
      ssl_tls_findings: [{ zone_id: "z1", zone_name: "example.com", status: "critical" }],
      r2_bucket_findings: [{ bucket_name: "uploads", status: "warning" }],
    },
    {},
  );

  const { days } = await computeTrend(db, 1, NOW);

  assertEquals(days[0].counts, { safe: 0, warning: 1, critical: 1, not_evaluated: 0 });
});
