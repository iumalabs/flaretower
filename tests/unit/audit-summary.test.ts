import { assertEquals } from "@std/assert";
import { computePostureSummary } from "../../worker/modules/audit/summary.ts";

// computePostureSummary issues two queries per source: a "latest run_id"
// lookup (`ORDER BY evaluated_at DESC LIMIT 1`), then a status-count
// GROUP BY filtered to that run_id. Keyed on which shape the SQL is, since
// both hit the same findings table.
function createMockD1(
  latestRunByTable: Record<string, { run_id: string } | null>,
  countsByRunId: Record<string, { status: string; count: number }[]>,
  failingTables: Set<string> = new Set(),
): D1Database {
  return {
    prepare(sql: string) {
      const isCountQuery = /GROUP BY status/i.test(sql);
      const table = sql.match(/FROM\s+(\w+)/i)?.[1] ?? "";
      let boundRunId: string | undefined;
      const statement = {
        bind(...args: unknown[]) {
          boundRunId = args[0] as string | undefined;
          return statement;
        },
        first<T>() {
          if (failingTables.has(table)) {
            return Promise.reject(new Error(`mock failure for ${table}`));
          }
          return Promise.resolve((latestRunByTable[table] ?? null) as T | null);
        },
        all<T>() {
          if (failingTables.has(table)) {
            return Promise.reject(new Error(`mock failure for ${table}`));
          }
          if (isCountQuery) {
            return Promise.resolve({ results: (countsByRunId[boundRunId ?? ""] ?? []) as T[] });
          }
          return Promise.resolve({ results: [] as T[] });
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

Deno.test("computePostureSummary - a source with a completed run reports correct per-status counts", async () => {
  const db = createMockD1(
    { ssl_tls_findings: { run_id: "r1" } },
    { r1: [{ status: "safe", count: 3 }, { status: "critical", count: 1 }] },
  );

  const summary = await computePostureSummary(db);
  const sslEntry = summary.find((e) => e.module === "security" && e.kind === "ssl_tls");

  assertEquals(sslEntry?.hasData, true);
  assertEquals(sslEntry?.counts, { safe: 3, warning: 0, critical: 1, not_evaluated: 0 });
});

Deno.test("computePostureSummary - a source that has never run reports has_data false with zero counts, not confirmed-clean", async () => {
  const db = createMockD1({}, {});

  const summary = await computePostureSummary(db);
  const dnsEntry = summary.find((e) => e.module === "dns" && e.kind === "record");

  assertEquals(dnsEntry?.hasData, false);
  assertEquals(dnsEntry?.counts, { safe: 0, warning: 0, critical: 0, not_evaluated: 0 });
});

Deno.test("computePostureSummary - always returns all fourteen sources, even on a per-source read failure", async () => {
  const db = createMockD1(
    { ssl_tls_findings: { run_id: "r1" } },
    { r1: [{ status: "safe", count: 1 }] },
    new Set(["exposure_findings"]),
  );

  const summary = await computePostureSummary(db);

  assertEquals(summary.length, 14);
  const exposureEntry = summary.find((e) => e.module === "exposure" && e.kind === "hostname");
  assertEquals(exposureEntry?.hasData, false);
  assertEquals(exposureEntry?.counts, { safe: 0, warning: 0, critical: 0, not_evaluated: 0 });
});
