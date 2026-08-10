import { assertEquals } from "@std/assert";
import { runAuditDigest } from "../../worker/modules/audit/routes.ts";

// runAuditDigest just reuses computeChanges() under the hood — same mock
// shape as audit-changes.test.ts (queries keyed by whether they carry the
// `evaluated_at <= ?` cutoff filter, not by table alone).
function createMockD1(
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

Deno.test("runAuditDigest - returns the correct change count for a known set of mocked status changes", async () => {
  const db = createMockD1(
    {
      ssl_tls_findings: [{ zone_id: "z1", zone_name: "example.com", status: "critical" }],
      r2_bucket_findings: [{ bucket_name: "uploads", status: "warning" }],
    },
    {
      ssl_tls_findings: [{ zone_id: "z1", zone_name: "example.com", status: "safe" }],
      r2_bucket_findings: [],
    },
  );

  const { changeCount } = await runAuditDigest({ DB: db }, "scheduled");

  assertEquals(changeCount, 2);
});

Deno.test("runAuditDigest - returns zero when nothing changed", async () => {
  const db = createMockD1(
    { ssl_tls_findings: [{ zone_id: "z1", zone_name: "example.com", status: "safe" }] },
    { ssl_tls_findings: [{ zone_id: "z1", zone_name: "example.com", status: "safe" }] },
  );

  const { changeCount } = await runAuditDigest({ DB: db }, "scheduled");

  assertEquals(changeCount, 0);
});
