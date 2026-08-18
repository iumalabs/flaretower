// "What changed since a point in time" digest: for each of the seventeen
// sources, compares each entity's latest finding against its most
// recent finding at or before a requested cutoff (research.md §5).
import {
  AUDIT_SOURCES,
  type AuditSource,
  errorMessage,
  type UnavailableSource,
} from "./sources.ts";

export interface ChangeEntry {
  module: string;
  kind: string;
  entityLabel: string;
  previousStatus: string | null;
  currentStatus: string;
}

// Exported for reuse by trend.ts (specs/027-overview-dashboard-redesign,
// research.md §5) — same finding-row shape and entity-identity concept.
export interface FindingRow {
  status: string;
  [column: string]: unknown;
}

export function selectColumns(source: AuditSource): string[] {
  return Array.from(new Set([...source.findingIdentityColumns, ...source.alertLabelColumns]));
}

export function entityKey(row: FindingRow, source: AuditSource): string {
  return source.findingIdentityColumns.map((c) => String(row[c])).join("::");
}

function entityLabel(row: FindingRow, source: AuditSource): string {
  return source.alertLabelColumns.map((c) => String(row[c])).join(" · ");
}

// Latest finding per entity — a window-function query so we get every
// selected column from the actual latest row per entity, not just the
// MAX(evaluated_at) value. Exported for reuse by trend.ts's seed query
// (specs/027-overview-dashboard-redesign, research.md §5) — same "state
// as of a cutoff" need, just for status counts instead of a diff.
export function buildLatestPerEntityQuery(source: AuditSource, beforeCutoff: boolean): string {
  const cols = selectColumns(source);
  const colList = cols.map((c) => `t.${c}`).join(", ");
  const partitionBy = source.findingIdentityColumns.join(", ");
  const cutoffFilter = beforeCutoff ? "WHERE evaluated_at <= ?" : "";
  return `
    SELECT ${colList}, t.status
    FROM (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY ${partitionBy} ORDER BY evaluated_at DESC
      ) AS rn
      FROM ${source.findingsTable}
      ${cutoffFilter}
    ) t
    WHERE t.rn = 1
  `;
}

async function computeChangesForSource(
  db: D1Database,
  source: AuditSource,
  since: string,
): Promise<ChangeEntry[]> {
  const [latestResult, atCutoffResult] = await Promise.all([
    db.prepare(buildLatestPerEntityQuery(source, false)).all<FindingRow>(),
    db.prepare(buildLatestPerEntityQuery(source, true)).bind(since).all<FindingRow>(),
  ]);

  const atCutoffByEntity = new Map<string, FindingRow>();
  for (const row of atCutoffResult.results) {
    atCutoffByEntity.set(entityKey(row, source), row);
  }

  const changes: ChangeEntry[] = [];
  for (const row of latestResult.results) {
    const key = entityKey(row, source);
    const previous = atCutoffByEntity.get(key);
    const previousStatus = previous ? previous.status : null;
    if (previousStatus === row.status) continue;
    changes.push({
      module: source.module,
      kind: source.kind,
      entityLabel: entityLabel(row, source),
      previousStatus,
      currentStatus: row.status,
    });
  }
  return changes;
}

export interface ChangesResult {
  changes: ChangeEntry[];
  // Sources whose findings-table read rejected outright — kept separate
  // from `changes` so a genuine read failure never gets folded into
  // "nothing changed for this source" (FR-010).
  unavailableSources: UnavailableSource[];
}

// A per-source read failure doesn't blank out the other sixteen
// (spec FR-010) — Promise.allSettled, not Promise.all.
export async function computeChanges(db: D1Database, since: string): Promise<ChangesResult> {
  const results = await Promise.allSettled(
    AUDIT_SOURCES.map((source) => computeChangesForSource(db, source, since)),
  );

  const changes: ChangeEntry[] = [];
  const unavailableSources: UnavailableSource[] = [];

  results.forEach((result, i) => {
    const source = AUDIT_SOURCES[i];
    if (result.status === "fulfilled") {
      changes.push(...result.value);
    } else {
      unavailableSources.push({
        module: source.module,
        kind: source.kind,
        error: `could not read ${source.findingsTable}: ${errorMessage(result.reason)}`,
      });
    }
  });

  return { changes, unavailableSources };
}
