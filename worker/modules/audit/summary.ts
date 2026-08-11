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
    .prepare(`SELECT run_id FROM ${source.findingsTable} ORDER BY evaluated_at DESC LIMIT 1`)
    .first<{ run_id: string }>();

  if (!latest) {
    return { module: source.module, kind: source.kind, hasData: false, counts: zeroCounts() };
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

  return { module: source.module, kind: source.kind, hasData: true, counts };
}

export interface PostureSummaryResult {
  // One entry per source, always — a per-source read failure still
  // reports hasData: false (a safe default, never fabricated "confirmed
  // clean" counts) rather than dropping that source from the response
  // entirely; `unavailableSources` below is what lets a caller tell that
  // apart from a source that's simply never been evaluated (FR-010).
  modules: PostureSummaryEntry[];
  unavailableSources: UnavailableSource[];
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
    });
    unavailableSources.push({
      module: source.module,
      kind: source.kind,
      error: `could not read ${source.findingsTable}: ${errorMessage(result.reason)}`,
    });
  });

  return { modules, unavailableSources };
}
