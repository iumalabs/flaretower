import { assertEquals } from "@std/assert";
import { computePostureSummary } from "../../worker/modules/audit/summary.ts";

// computePostureSummary issues two queries per source: a "latest run_id
// (+ evaluated_at)" lookup, then a status-count GROUP BY filtered to that
// run_id — plus two account-scope COUNT(DISTINCT ...) queries against
// dns_findings/exposure_findings specifically. Keyed on which shape the
// SQL is, since some share the same table.
function createMockD1(
  latestRunByTable: Record<string, { run_id: string; evaluated_at?: string } | null>,
  countsByRunId: Record<string, { status: string; count: number }[]>,
  failingTables: Set<string> = new Set(),
  distinctCountsByTable: Record<string, number> = {},
): D1Database {
  return {
    prepare(sql: string) {
      const isCountQuery = /GROUP BY status/i.test(sql);
      const isDistinctQuery = /COUNT\(DISTINCT/i.test(sql);
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
          if (isDistinctQuery) {
            return Promise.resolve({ count: distinctCountsByTable[table] ?? 0 } as T);
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

Deno.test("computePostureSummary - a source with a completed run reports correct per-status counts and evaluatedAt", async () => {
  const db = createMockD1(
    { ssl_tls_findings: { run_id: "r1", evaluated_at: "2026-08-18T12:00:00Z" } },
    { r1: [{ status: "safe", count: 3 }, { status: "critical", count: 1 }] },
  );

  const { modules, unavailableSources } = await computePostureSummary(db);
  const sslEntry = modules.find((e) => e.module === "security" && e.kind === "ssl_tls");

  assertEquals(sslEntry?.hasData, true);
  assertEquals(sslEntry?.counts, { safe: 3, warning: 0, critical: 1, not_evaluated: 0 });
  assertEquals(sslEntry?.evaluatedAt, "2026-08-18T12:00:00Z");
  assertEquals(unavailableSources, []);
});

Deno.test("computePostureSummary - accountScope reflects real distinct zone/worker counts", async () => {
  const db = createMockD1(
    {
      dns_findings: { run_id: "dns-r1" },
      exposure_findings: { run_id: "exp-r1" },
    },
    {},
    new Set(),
    { dns_findings: 3, exposure_findings: 15 },
  );

  const { accountScope } = await computePostureSummary(db);
  assertEquals(accountScope, { zoneCount: 3, workerCount: 15 });
});

Deno.test("computePostureSummary - accountScope is zero when DNS/exposure have never run, not fabricated", async () => {
  const db = createMockD1({}, {});

  const { accountScope } = await computePostureSummary(db);
  assertEquals(accountScope, { zoneCount: 0, workerCount: 0 });
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
