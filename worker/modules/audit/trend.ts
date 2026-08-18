// 14-day exposure trend, computed on the fly from already-persisted
// historical findings — no new snapshot table, no scheduled job
// (specs/027-overview-dashboard-redesign, research.md §5, user-confirmed
// approach). Bounded to 2 queries per source (a seed + a window query),
// not one query per (day × source) pair: the day-by-day bucketing itself
// happens in memory here, replaying the window's rows over the seed map.
import {
  AUDIT_SOURCES,
  type AuditSource,
  errorMessage,
  type UnavailableSource,
} from "./sources.ts";
import { buildLatestPerEntityQuery, entityKey, type FindingRow, selectColumns } from "./changes.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PostureCounts {
  safe: number;
  warning: number;
  critical: number;
  not_evaluated: number;
}

export interface TrendDayPoint {
  date: string; // "YYYY-MM-DD", UTC
  hasData: boolean;
  counts: PostureCounts;
}

export interface TrendResult {
  days: TrendDayPoint[]; // oldest first
  unavailableSources: UnavailableSource[];
}

function zeroCounts(): PostureCounts {
  return { safe: 0, warning: 0, critical: 0, not_evaluated: 0 };
}

// UTC-midnight boundaries for the last `days` calendar days, oldest first
// — e.g. for days=14 and "now" on Aug 18, returns Aug 5 .. Aug 18.
function dayBoundaries(now: Date, days: number): Date[] {
  const todayMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return Array.from(
    { length: days },
    (_, i) => new Date(todayMidnight.getTime() - (days - 1 - i) * DAY_MS),
  );
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Per-source: one seed query (state at the window's start) + one window
// query (every row from the window, ascending) — 2 D1 round trips, not
// 14. The window's rows are replayed in memory over the seed map,
// snapshotting a status tally each time a day boundary is crossed.
async function computeTrendForSource(
  db: D1Database,
  source: AuditSource,
  boundaries: Date[],
): Promise<Map<string, PostureCounts>> {
  const windowStart = boundaries[0];
  const colList = selectColumns(source).join(", ");

  const [seedResult, windowResult] = await Promise.all([
    db.prepare(buildLatestPerEntityQuery(source, true)).bind(windowStart.toISOString())
      .all<FindingRow>(),
    db.prepare(
      `SELECT ${colList}, status, evaluated_at FROM ${source.findingsTable}
       WHERE evaluated_at >= ? ORDER BY evaluated_at ASC`,
    ).bind(windowStart.toISOString()).all<FindingRow & { evaluated_at: string }>(),
  ]);

  const statusByEntity = new Map<string, string>();
  for (const row of seedResult.results) {
    statusByEntity.set(entityKey(row, source), row.status);
  }

  const tallyByDate = new Map<string, PostureCounts>();
  function snapshot(date: Date) {
    const counts = zeroCounts();
    for (const status of statusByEntity.values()) {
      if (status in counts) counts[status as keyof PostureCounts]++;
    }
    tallyByDate.set(dateKey(date), counts);
  }

  // Boundary-driven, not row-driven: for each day boundary in order,
  // apply every row at-or-before it (a scan landing exactly at midnight
  // counts as that day's state, not the next day's), then snapshot.
  let rowIndex = 0;
  for (const boundary of boundaries) {
    while (
      rowIndex < windowResult.results.length &&
      new Date(windowResult.results[rowIndex].evaluated_at).getTime() <= boundary.getTime()
    ) {
      const row = windowResult.results[rowIndex];
      statusByEntity.set(entityKey(row, source), row.status);
      rowIndex++;
    }
    snapshot(boundary);
  }

  return tallyByDate;
}

// `now` is injectable (defaults to the real current time) so tests can
// pin the window's day boundaries deterministically without depending on
// wall-clock time at test-run time.
export async function computeTrend(
  db: D1Database,
  days: number = 14,
  now: Date = new Date(),
): Promise<TrendResult> {
  const boundaries = dayBoundaries(now, days);
  const results = await Promise.allSettled(
    AUDIT_SOURCES.map((source) => computeTrendForSource(db, source, boundaries)),
  );

  const unavailableSources: UnavailableSource[] = [];
  const perSourceTallies: Map<string, PostureCounts>[] = [];

  results.forEach((result, i) => {
    const source = AUDIT_SOURCES[i];
    if (result.status === "fulfilled") {
      perSourceTallies.push(result.value);
    } else {
      unavailableSources.push({
        module: source.module,
        kind: source.kind,
        error: `could not read ${source.findingsTable}: ${errorMessage(result.reason)}`,
      });
    }
  });

  // A day is "no data" only when every source has nothing for it — a
  // source with a shorter history than another shouldn't blank a day
  // other sources do have data for (FR-010).
  const days_: TrendDayPoint[] = boundaries.map((boundary) => {
    const key = dateKey(boundary);
    const merged = zeroCounts();
    let hasData = false;
    for (const tally of perSourceTallies) {
      const dayTally = tally.get(key);
      if (!dayTally) continue;
      const total = dayTally.safe + dayTally.warning + dayTally.critical + dayTally.not_evaluated;
      if (total === 0) continue;
      hasData = true;
      merged.safe += dayTally.safe;
      merged.warning += dayTally.warning;
      merged.critical += dayTally.critical;
      merged.not_evaluated += dayTally.not_evaluated;
    }
    return { date: key, hasData, counts: merged };
  });

  return { days: days_, unavailableSources };
}
