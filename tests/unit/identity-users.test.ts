import { assertEquals, assertRejects } from "@std/assert";
import { setOperatorRole, upsertOperator } from "../../worker/modules/identity/users.ts";

interface UserRow {
  sub: string;
  email: string;
  idp: string;
  role: string;
  created_at: string;
  last_seen_at: string;
}

interface AuditLogRow {
  id: string;
  actor_sub: string;
  action: string;
  before_json: string;
  after_json: string;
  created_at: string;
}

// A minimal fake D1Database backing the `users` and `audit_log` tables —
// routes by statement shape (SELECT/COUNT/INSERT/UPDATE), same style as
// every prior module's own hand-rolled mock. `batch()` runs each statement
// via its own `run()` (same effect as calling them individually) unless
// `failBatch` is set, in which case it rejects before any statement's
// `run()` executes — proving setOperatorRole()'s atomicity claim (T005)
// requires a mock that can actually fail the batch, not just each write.
function createMockD1(
  initialRows: UserRow[] = [],
  opts: { failBatch?: boolean } = {},
): { db: D1Database; rows: UserRow[]; auditLog: AuditLogRow[] } {
  const rows = initialRows.map((r) => ({ ...r }));
  const auditLog: AuditLogRow[] = [];

  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) {
          bound = args;
          return statement;
        },
        first<T>() {
          if (/SELECT COUNT\(\*\)/i.test(sql)) {
            return Promise.resolve({ count: rows.length } as T);
          }
          if (/SELECT sub, email, idp, role, created_at, last_seen_at FROM users/i.test(sql)) {
            const sub = bound[0] as string;
            const row = rows.find((r) => r.sub === sub);
            return Promise.resolve((row ?? null) as T | null);
          }
          if (/^SELECT sub, role FROM users WHERE sub = \?/i.test(sql)) {
            const sub = bound[0] as string;
            const row = rows.find((r) => r.sub === sub);
            return Promise.resolve(
              (row ? { sub: row.sub, role: row.role } : null) as T | null,
            );
          }
          return Promise.resolve(null as T | null);
        },
        run() {
          if (/^INSERT INTO users/i.test(sql)) {
            const [sub, email, idp, role, created_at, last_seen_at] = bound as string[];
            rows.push({ sub, email, idp, role, created_at, last_seen_at });
          } else if (/^UPDATE users SET email/i.test(sql)) {
            const [email, last_seen_at, sub] = bound as string[];
            const row = rows.find((r) => r.sub === sub);
            if (row) {
              row.email = email;
              row.last_seen_at = last_seen_at;
            }
          } else if (/^UPDATE users SET role/i.test(sql)) {
            const [role, sub] = bound as string[];
            const row = rows.find((r) => r.sub === sub);
            if (row) row.role = role;
          } else if (/^INSERT INTO audit_log/i.test(sql)) {
            const [id, actor_sub, action, before_json, after_json, created_at] = bound as string[];
            auditLog.push({ id, actor_sub, action, before_json, after_json, created_at });
          }
          return Promise.resolve({} as D1Result);
        },
      };
      return statement;
    },
    batch(statements: { run(): Promise<D1Result> }[]) {
      if (opts.failBatch) {
        return Promise.reject(new Error("simulated D1 batch failure"));
      }
      return Promise.all(statements.map((s) => s.run()));
    },
  } as unknown as D1Database;

  return { db, rows, auditLog };
}

Deno.test("upsertOperator - a never-seen sub creates a new row with created_at === last_seen_at", async () => {
  const { db, rows } = createMockD1();

  const operator = await upsertOperator(
    db,
    { sub: "s1", email: "a@example.com" },
    () => Promise.resolve("google-apps"),
  );

  assertEquals(rows.length, 1);
  assertEquals(operator.sub, "s1");
  assertEquals(operator.idp, "google-apps");
  assertEquals(operator.createdAt, operator.lastSeenAt);
});

Deno.test("upsertOperator - the very first operator ever gets role admin, the next gets member", async () => {
  const { db } = createMockD1();

  const first = await upsertOperator(
    db,
    { sub: "s1", email: "a@example.com" },
    () => Promise.resolve("unknown"),
  );
  const second = await upsertOperator(
    db,
    { sub: "s2", email: "b@example.com" },
    () => Promise.resolve("unknown"),
  );

  assertEquals(first.role, "admin");
  assertEquals(second.role, "member");
});

Deno.test("upsertOperator - a known sub updates last_seen_at/email without creating a duplicate row", async () => {
  const { db, rows } = createMockD1([
    {
      sub: "s1",
      email: "old@example.com",
      idp: "github",
      role: "member",
      created_at: "2026-01-01T00:00:00.000Z",
      last_seen_at: "2026-01-01T00:00:00.000Z",
    },
  ]);

  const operator = await upsertOperator(db, { sub: "s1", email: "new@example.com" }, () => {
    throw new Error("must not be called for a returning operator");
  });

  assertEquals(rows.length, 1);
  assertEquals(operator.email, "new@example.com");
  assertEquals(operator.role, "member");
  assertEquals(operator.createdAt, "2026-01-01T00:00:00.000Z");
  assertEquals(operator.createdAt === operator.lastSeenAt, false);
});

Deno.test("upsertOperator - idp resolving to 'unknown' still creates the operator normally", async () => {
  const { db } = createMockD1();

  const operator = await upsertOperator(
    db,
    { sub: "s1", email: "a@example.com" },
    () => Promise.resolve("unknown"),
  );

  assertEquals(operator.idp, "unknown");
  assertEquals(operator.role, "admin");
});

const SEED_OPERATORS: UserRow[] = [
  {
    sub: "admin-1",
    email: "admin@example.com",
    idp: "google-apps",
    role: "admin",
    created_at: "2026-08-01T00:00:00.000Z",
    last_seen_at: "2026-08-01T00:00:00.000Z",
  },
  {
    sub: "member-1",
    email: "member@example.com",
    idp: "github",
    role: "member",
    created_at: "2026-08-02T00:00:00.000Z",
    last_seen_at: "2026-08-02T00:00:00.000Z",
  },
];

Deno.test("setOperatorRole - batches the role UPDATE with a matching identity.role_change audit entry", async () => {
  const { db, rows, auditLog } = createMockD1(SEED_OPERATORS);

  const result = await setOperatorRole(db, "admin-1", "member-1", "admin");

  assertEquals(result, { outcome: "ok", sub: "member-1", role: "admin" });
  assertEquals(rows.find((r) => r.sub === "member-1")?.role, "admin");
  assertEquals(auditLog.length, 1);
  assertEquals(auditLog[0].actor_sub, "admin-1");
  assertEquals(auditLog[0].action, "identity.role_change");
  assertEquals(JSON.parse(auditLog[0].before_json), { sub: "member-1", role: "member" });
  assertEquals(JSON.parse(auditLog[0].after_json), { sub: "member-1", role: "admin" });
});

Deno.test("setOperatorRole - a no-op role submission (same role) still writes an audit entry", async () => {
  const { db, auditLog } = createMockD1(SEED_OPERATORS);

  await setOperatorRole(db, "admin-1", "member-1", "member");

  assertEquals(auditLog.length, 1);
  assertEquals(JSON.parse(auditLog[0].before_json), { sub: "member-1", role: "member" });
  assertEquals(JSON.parse(auditLog[0].after_json), { sub: "member-1", role: "member" });
});

Deno.test("setOperatorRole - an unknown sub returns not_found and writes no audit entry", async () => {
  const { db, auditLog } = createMockD1(SEED_OPERATORS);

  const result = await setOperatorRole(db, "admin-1", "nobody", "admin");

  assertEquals(result, { outcome: "not_found" });
  assertEquals(auditLog.length, 0);
});

Deno.test("setOperatorRole - a self-role-change records the same sub as actor and target", async () => {
  const { db, auditLog } = createMockD1(SEED_OPERATORS);

  await setOperatorRole(db, "admin-1", "admin-1", "member");

  assertEquals(auditLog.length, 1);
  assertEquals(auditLog[0].actor_sub, "admin-1");
  assertEquals(JSON.parse(auditLog[0].before_json), { sub: "admin-1", role: "admin" });
  assertEquals(JSON.parse(auditLog[0].after_json), { sub: "admin-1", role: "member" });
});

Deno.test("setOperatorRole - a batch failure propagates and leaves the role unchanged", async () => {
  const { db, rows } = createMockD1(SEED_OPERATORS, { failBatch: true });

  await assertRejects(() => setOperatorRole(db, "admin-1", "member-1", "admin"));

  assertEquals(rows.find((r) => r.sub === "member-1")?.role, "member");
});
