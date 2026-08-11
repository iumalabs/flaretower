import { assertEquals } from "@std/assert";
import { computeChanges } from "../../worker/modules/audit/changes.ts";

// computeChanges issues two queries per source: one for each entity's
// latest finding, one for each entity's latest finding at-or-before the
// cutoff. Both queries hit the same findings table, distinguished only by
// an `evaluated_at <= ?` filter — so the mock keys results by that,
// not by table alone. The window-function SQL itself (ROW_NUMBER/PARTITION
// BY) is trusted and verified live via wrangler d1 execute, same as every
// prior module's approach to SQL correctness; this mock only exercises
// computeChanges' own diffing logic given the two result sets.
function createMockD1(
  latestRows: Record<string, Record<string, unknown>[]>,
  atCutoffRows: Record<string, Record<string, unknown>[]>,
  failingTables: Set<string> = new Set(),
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
          if (failingTables.has(table)) {
            return Promise.reject(new Error(`mock failure for ${table}`));
          }
          const rows = isCutoffQuery ? (atCutoffRows[table] ?? []) : (latestRows[table] ?? []);
          return Promise.resolve({ results: rows as T[] });
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

Deno.test("computeChanges - reports an entity whose status changed since the cutoff", async () => {
  const db = createMockD1(
    { ssl_tls_findings: [{ zone_id: "z1", zone_name: "example.com", status: "critical" }] },
    { ssl_tls_findings: [{ zone_id: "z1", zone_name: "example.com", status: "safe" }] },
  );

  const { changes } = await computeChanges(db, "2026-08-09T00:00:00Z");

  assertEquals(changes.length, 1);
  assertEquals(changes[0].module, "security");
  assertEquals(changes[0].kind, "ssl_tls");
  assertEquals(changes[0].entityLabel, "example.com");
  assertEquals(changes[0].previousStatus, "safe");
  assertEquals(changes[0].currentStatus, "critical");
});

Deno.test("computeChanges - omits an entity whose status is unchanged", async () => {
  const db = createMockD1(
    { ssl_tls_findings: [{ zone_id: "z1", zone_name: "example.com", status: "safe" }] },
    { ssl_tls_findings: [{ zone_id: "z1", zone_name: "example.com", status: "safe" }] },
  );

  const { changes } = await computeChanges(db, "2026-08-09T00:00:00Z");

  assertEquals(changes, []);
});

Deno.test("computeChanges - a brand-new entity (no row at-or-before cutoff) has previous_status null", async () => {
  const db = createMockD1(
    { r2_bucket_findings: [{ bucket_name: "uploads", status: "warning" }] },
    { r2_bucket_findings: [] },
  );

  const { changes } = await computeChanges(db, "2026-08-09T00:00:00Z");

  assertEquals(changes.length, 1);
  assertEquals(changes[0].module, "storage");
  assertEquals(changes[0].kind, "r2_bucket");
  assertEquals(changes[0].previousStatus, null);
  assertEquals(changes[0].currentStatus, "warning");
});

Deno.test("computeChanges - a per-source read failure doesn't blank out the other thirteen", async () => {
  const db = createMockD1(
    {
      ssl_tls_findings: [{ zone_id: "z1", zone_name: "example.com", status: "critical" }],
      r2_bucket_findings: [{ bucket_name: "uploads", status: "warning" }],
    },
    {
      ssl_tls_findings: [{ zone_id: "z1", zone_name: "example.com", status: "safe" }],
      r2_bucket_findings: [],
    },
    new Set(["ssl_tls_findings"]),
  );

  const { changes, unavailableSources } = await computeChanges(db, "2026-08-09T00:00:00Z");

  assertEquals(changes.length, 1);
  assertEquals(changes[0].kind, "r2_bucket");
  assertEquals(unavailableSources.length, 1);
  assertEquals(unavailableSources[0].module, "security");
  assertEquals(unavailableSources[0].kind, "ssl_tls");
});

Deno.test("computeChanges - empty result when nothing changed anywhere", async () => {
  const db = createMockD1({}, {});
  const { changes, unavailableSources } = await computeChanges(db, "2026-08-09T00:00:00Z");
  assertEquals(changes, []);
  assertEquals(unavailableSources, []);
});

Deno.test("computeChanges - a rejected source is reported as unavailable, distinct from a source with no changes", async () => {
  const db = createMockD1(
    { ssl_tls_findings: [{ zone_id: "z1", zone_name: "example.com", status: "safe" }] },
    { ssl_tls_findings: [{ zone_id: "z1", zone_name: "example.com", status: "safe" }] },
    new Set(["r2_bucket_findings"]),
  );

  const { changes, unavailableSources } = await computeChanges(db, "2026-08-09T00:00:00Z");

  // ssl_tls genuinely has no change — must not appear as unavailable.
  assertEquals(changes, []);
  assertEquals(unavailableSources.length, 1);
  assertEquals(unavailableSources[0].module, "storage");
  assertEquals(unavailableSources[0].kind, "r2_bucket");
  assertEquals(unavailableSources[0].error.includes("r2_bucket_findings"), true);
});
