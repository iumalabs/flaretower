// Account-wide posture summary (data-model.md's PostureSummaryEntry): one
// entry per source, derived from that source's findingsTable filtered to
// its latest run_id — same "latest run" pattern every prior module's own
// GET /inventory endpoint already uses (ORDER BY evaluated_at DESC LIMIT 1).
import {
  AUDIT_SOURCES,
  type AuditSource,
  errorMessage,
  type UnavailableSource,
} from "./sources.ts";

export interface PostureCounts {
  safe: number;
  warning: number;
  critical: number;
  not_evaluated: number;
}

export interface PostureSummaryEntry {
  module: string;
  kind: string;
  hasData: boolean;
  counts: PostureCounts;
  // specs/027-overview-dashboard-redesign — null when hasData is false.
  // Used to derive the account-wide "last scan" time (research.md §1).
  evaluatedAt: string | null;
}

function zeroCounts(): PostureCounts {
  return { safe: 0, warning: 0, critical: 0, not_evaluated: 0 };
}

async function computeSummaryForSource(
  db: D1Database,
  source: AuditSource,
): Promise<PostureSummaryEntry> {
  // No row for this table yet (or table is empty) means this source has
  // never run an evaluation — hasData: false, not "confirmed clean"
  // (spec FR-007).
  const latest = await db
    .prepare(
      `SELECT run_id, evaluated_at FROM ${source.findingsTable} ORDER BY evaluated_at DESC LIMIT 1`,
    )
    .first<{ run_id: string; evaluated_at: string }>();

  if (!latest) {
    return {
      module: source.module,
      kind: source.kind,
      hasData: false,
      counts: zeroCounts(),
      evaluatedAt: null,
    };
  }

  const { results } = await db
    .prepare(
      `SELECT status, COUNT(*) AS count FROM ${source.findingsTable} WHERE run_id = ? GROUP BY status`,
    )
    .bind(latest.run_id)
    .all<{ status: string; count: number }>();

  const counts = zeroCounts();
  for (const row of results) {
    if (row.status in counts) {
      counts[row.status as keyof PostureCounts] = row.count;
    }
  }

  return {
    module: source.module,
    kind: source.kind,
    hasData: true,
    counts,
    evaluatedAt: latest.evaluated_at,
  };
}

export interface PostureSummaryResult {
  // One entry per source, always — a per-source read failure still
  // reports hasData: false (a safe default, never fabricated "confirmed
  // clean" counts) rather than dropping that source from the response
  // entirely; `unavailableSources` below is what lets a caller tell that
  // apart from a source that's simply never been evaluated (FR-010).
  modules: PostureSummaryEntry[];
  unavailableSources: UnavailableSource[];
  // specs/027-overview-dashboard-redesign — the header's "N zones · N
  // workers" context, derived from already-persisted data (research.md §1).
  accountScope: { zoneCount: number; workerCount: number };
}

export async function computePostureSummary(db: D1Database): Promise<PostureSummaryResult> {
  const results = await Promise.allSettled(
    AUDIT_SOURCES.map((source) => computeSummaryForSource(db, source)),
  );

  const modules: PostureSummaryEntry[] = [];
  const unavailableSources: UnavailableSource[] = [];

  results.forEach((result, i) => {
    const source = AUDIT_SOURCES[i];
    if (result.status === "fulfilled") {
      modules.push(result.value);
      return;
    }
    modules.push({
      module: source.module,
      kind: source.kind,
      hasData: false,
      counts: zeroCounts(),
      evaluatedAt: null,
    });
    unavailableSources.push({
      module: source.module,
      kind: source.kind,
      error: `could not read ${source.findingsTable}: ${errorMessage(result.reason)}`,
    });
  });

  const accountScope = await computeAccountScope(db);

  return { modules, unavailableSources, accountScope };
}

// specs/027-overview-dashboard-redesign (research.md §1) — "zone" and
// "Worker" aren't generic properties every AUDIT_SOURCES entry has, so
// these two counts are targeted reads against the two specific tables
// that do carry that concept, not a loop over the registry. Table/column
// names here are fixed literals, never request input, matching this
// file's existing allowlist discipline (sources.ts).
async function computeDistinctCount(
  db: D1Database,
  table: "dns_findings" | "exposure_findings",
  column: "zone_name" | "worker_name",
): Promise<number> {
  const latest = await db
    .prepare(`SELECT run_id FROM ${table} ORDER BY evaluated_at DESC LIMIT 1`)
    .first<{ run_id: string }>();
  if (!latest) return 0;

  const row = await db
    .prepare(`SELECT COUNT(DISTINCT ${column}) AS count FROM ${table} WHERE run_id = ?`)
    .bind(latest.run_id)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

async function computeAccountScope(
  db: D1Database,
): Promise<{ zoneCount: number; workerCount: number }> {
  const [zoneResult, workerResult] = await Promise.allSettled([
    computeDistinctCount(db, "dns_findings", "zone_name"),
    computeDistinctCount(db, "exposure_findings", "worker_name"),
  ]);
  return {
    zoneCount: zoneResult.status === "fulfilled" ? zoneResult.value : 0,
    workerCount: workerResult.status === "fulfilled" ? workerResult.value : 0,
  };
}
