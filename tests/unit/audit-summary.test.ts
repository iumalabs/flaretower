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

  const { modules, unavailableSources } = await computePostureSummary(db);
  const sslEntry = modules.find((e) => e.module === "security" && e.kind === "ssl_tls");

  assertEquals(sslEntry?.hasData, true);
  assertEquals(sslEntry?.counts, { safe: 3, warning: 0, critical: 1, not_evaluated: 0 });
  assertEquals(unavailableSources, []);
});

Deno.test("computePostureSummary - a source that has never run reports has_data false with zero counts, not confirmed-clean", async () => {
  const db = createMockD1({}, {});

  const { modules, unavailableSources } = await computePostureSummary(db);
  const dnsEntry = modules.find((e) => e.module === "dns" && e.kind === "record");

  assertEquals(dnsEntry?.hasData, false);
  assertEquals(dnsEntry?.counts, { safe: 0, warning: 0, critical: 0, not_evaluated: 0 });
  // Never having run is not the same as a read failure — dns/record must
  // not show up in unavailableSources.
  assertEquals(unavailableSources.some((s) => s.module === "dns"), false);
});

Deno.test("computePostureSummary - always returns all seventeen sources, even on a per-source read failure", async () => {
  const db = createMockD1(
    { ssl_tls_findings: { run_id: "r1" } },
    { r1: [{ status: "safe", count: 1 }] },
    new Set(["exposure_findings"]),
  );

  const { modules } = await computePostureSummary(db);

  assertEquals(modules.length, 17);
  const exposureEntry = modules.find((e) => e.module === "exposure" && e.kind === "hostname");
  assertEquals(exposureEntry?.hasData, false);
  assertEquals(exposureEntry?.counts, { safe: 0, warning: 0, critical: 0, not_evaluated: 0 });
});

Deno.test("computePostureSummary - a rejected source is reported as unavailable, distinct from a source that never ran", async () => {
  const db = createMockD1(
    {},
    {},
    new Set(["exposure_findings"]),
  );

  const { modules, unavailableSources } = await computePostureSummary(db);

  // Both exposure (rejected) and dns (never run) report hasData: false...
  const exposureEntry = modules.find((e) => e.module === "exposure" && e.kind === "hostname");
  const dnsEntry = modules.find((e) => e.module === "dns" && e.kind === "record");
  assertEquals(exposureEntry?.hasData, false);
  assertEquals(dnsEntry?.hasData, false);

  // ...but only the rejected one shows up in unavailableSources.
  assertEquals(unavailableSources.length, 1);
  assertEquals(unavailableSources[0].module, "exposure");
  assertEquals(unavailableSources[0].kind, "hostname");
  assertEquals(unavailableSources[0].error.includes("exposure_findings"), true);
});
