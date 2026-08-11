import { assertEquals, assertExists } from "@std/assert";
import { writeAuditEntry } from "../../worker/audit-log.ts";

// Captures the SQL and bound values a D1Database receives, without
// executing anything — this test only asserts the statement's shape, per
// research.md §6 (nothing calls writeAuditEntry() yet, so there's nothing
// to exercise end-to-end).
function createSpyD1(): { db: D1Database; calls: { sql: string; bound: unknown[] }[] } {
  const calls: { sql: string; bound: unknown[] }[] = [];

  const db = {
    prepare(sql: string) {
      const statement = {
        bind(...args: unknown[]) {
          calls.push({ sql, bound: args });
          return statement;
        },
      };
      return statement;
    },
  } as unknown as D1Database;

  return { db, calls };
}

Deno.test("writeAuditEntry - builds an INSERT INTO audit_log statement with the given values", () => {
  const { db, calls } = createSpyD1();

  const statement = writeAuditEntry(db, {
    actorSub: "s1",
    action: "future.module.write_action",
    beforeJson: { status: "off" },
    afterJson: { status: "on" },
  });

  assertExists(statement);
  assertEquals(calls.length, 1);
  assertEquals(/INSERT INTO audit_log/i.test(calls[0].sql), true);

  const [id, actorSub, action, beforeJson, afterJson, createdAt] = calls[0].bound as string[];
  assertEquals(typeof id, "string");
  assertEquals(actorSub, "s1");
  assertEquals(action, "future.module.write_action");
  assertEquals(beforeJson, JSON.stringify({ status: "off" }));
  assertEquals(afterJson, JSON.stringify({ status: "on" }));
  assertEquals(typeof createdAt, "string");
});

Deno.test("writeAuditEntry - does not execute the statement itself (no run()/all() called)", () => {
  const { db, calls } = createSpyD1();

  writeAuditEntry(db, {
    actorSub: "s1",
    action: "future.module.write_action",
    beforeJson: null,
    afterJson: { created: true },
  });

  // bind() was called (building the statement) but nothing beyond that —
  // the caller is responsible for db.batch()-ing it themselves.
  assertEquals(calls.length, 1);
});
