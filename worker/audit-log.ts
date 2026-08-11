// Constitution Principle IX's write-capable mechanism, built ahead of the
// first Cloudflare-account-mutating module that will need it (FR-010).
// Returns a D1PreparedStatement rather than executing it — the caller
// includes it in their own db.batch() alongside the actual Cloudflare
// mutation, so both succeed or fail together (research.md §6), matching
// "as part of that action's own transaction, before the action is
// considered complete."
export interface AuditEntryInput {
  actorSub: string;
  action: string;
  beforeJson: unknown;
  afterJson: unknown;
}

export function writeAuditEntry(db: D1Database, entry: AuditEntryInput): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_log (id, actor_sub, action, before_json, after_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      entry.actorSub,
      entry.action,
      JSON.stringify(entry.beforeJson),
      JSON.stringify(entry.afterJson),
      new Date().toISOString(),
    );
}
