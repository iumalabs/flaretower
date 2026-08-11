// Wires the constitution-mandated `users` baseline table into behavior for
// the first time (research.md §3): a returning operator is recognized and
// refreshed, a brand-new one is created — the very first ever created gets
// auto-elevated (FR-005) so a fresh deployment always has an admin.
export type Role = "member" | "admin";

export interface Operator {
  sub: string;
  email: string;
  idp: string;
  role: Role;
  createdAt: string;
  lastSeenAt: string;
}

interface UserRow {
  sub: string;
  email: string;
  idp: string;
  role: Role;
  created_at: string;
  last_seen_at: string;
}

// fetchIdp is a thunk, not a value, so the best-effort get-identity call
// (research.md §2) only ever happens on the new-operator path below — an
// already-known operator's IdP doesn't change and isn't worth re-fetching
// on every request.
export async function upsertOperator(
  db: D1Database,
  identity: { sub: string; email: string },
  fetchIdp: () => Promise<string>,
): Promise<Operator> {
  const existing = await db
    .prepare(`SELECT sub, email, idp, role, created_at, last_seen_at FROM users WHERE sub = ?`)
    .bind(identity.sub)
    .first<UserRow>();

  if (existing) {
    const lastSeenAt = new Date().toISOString();
    await db
      .prepare(`UPDATE users SET email = ?, last_seen_at = ? WHERE sub = ?`)
      .bind(identity.email, lastSeenAt, identity.sub)
      .run();
    return {
      sub: existing.sub,
      email: identity.email,
      idp: existing.idp,
      role: existing.role,
      createdAt: existing.created_at,
      lastSeenAt,
    };
  }

  const countRow = await db.prepare(`SELECT COUNT(*) AS count FROM users`).first<
    { count: number }
  >();
  const role: Role = (countRow?.count ?? 0) === 0 ? "admin" : "member";
  const idp = await fetchIdp();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO users (sub, email, idp, role, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(identity.sub, identity.email, idp, role, now, now)
    .run();

  return { sub: identity.sub, email: identity.email, idp, role, createdAt: now, lastSeenAt: now };
}

// FR-011 — an admin needs to see who to promote; there is no other surface
// (no UI, no user-listing elsewhere) that exposes known operators.
export async function listOperators(db: D1Database): Promise<Operator[]> {
  const { results } = await db
    .prepare(
      `SELECT sub, email, idp, role, created_at, last_seen_at FROM users ORDER BY created_at`,
    )
    .all<UserRow>();

  return results.map((r) => ({
    sub: r.sub,
    email: r.email,
    idp: r.idp,
    role: r.role,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
  }));
}

export type SetRoleResult =
  | { outcome: "ok"; sub: string; role: Role }
  | { outcome: "not_found" };

// FR-006 — grants or revokes the elevated permission level for a known
// operator. The caller (routes.ts) is responsible for validating that
// `role` is one of the two accepted values before calling this.
export async function setOperatorRole(
  db: D1Database,
  sub: string,
  role: Role,
): Promise<SetRoleResult> {
  const existing = await db.prepare(`SELECT sub FROM users WHERE sub = ?`).bind(sub).first<
    { sub: string }
  >();
  if (!existing) return { outcome: "not_found" };

  await db.prepare(`UPDATE users SET role = ? WHERE sub = ?`).bind(role, sub).run();
  return { outcome: "ok", sub, role };
}
