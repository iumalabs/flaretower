import { assertEquals } from "@std/assert";
import { upsertOperator } from "../../worker/modules/identity/users.ts";

interface UserRow {
  sub: string;
  email: string;
  idp: string;
  role: string;
  created_at: string;
  last_seen_at: string;
}

// A minimal fake D1Database backing the `users` table only — routes by
// statement shape (SELECT/COUNT/INSERT/UPDATE), same style as every prior
// module's own hand-rolled mock.
function createMockD1(initialRows: UserRow[] = []): { db: D1Database; rows: UserRow[] } {
  const rows = [...initialRows];

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
          return Promise.resolve(null as T | null);
        },
        run() {
          if (/^INSERT INTO users/i.test(sql)) {
            const [sub, email, idp, role, created_at, last_seen_at] = bound as string[];
            rows.push({ sub, email, idp, role, created_at, last_seen_at });
          } else if (/^UPDATE users/i.test(sql)) {
            const [email, last_seen_at, sub] = bound as string[];
            const row = rows.find((r) => r.sub === sub);
            if (row) {
              row.email = email;
              row.last_seen_at = last_seen_at;
            }
          }
          return Promise.resolve({} as D1Result);
        },
      };
      return statement;
    },
  } as unknown as D1Database;

  return { db, rows };
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
