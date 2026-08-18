import { Hono } from "hono";
import { requireRole } from "../../auth/access-jwt.ts";
import { acknowledgeAlert, queryUnifiedAlerts, type UnifiedAlert } from "./inbox.ts";
import { type ChangeEntry, computeChanges } from "./changes.ts";
import { computePostureSummary } from "./summary.ts";
import { computeTrend } from "./trend.ts";
import type { UnavailableSource } from "./sources.ts";
import { fetchAccountAuditLog } from "../workers-dashboard/audit-log.ts";
import {
  type PageQuery,
  paginateArray,
  type PaginationEnvelope,
  PaginationParamError,
} from "../../pagination.ts";

// Same wire shape from all three endpoints (FR-010 / spec.md Edge Cases
// bullet 2) — a source whose D1 read rejected outright, distinct from
// that source legitimately having no data.
function toUnavailableSourcesJson(sources: UnavailableSource[]) {
  return sources.map((s) => ({ module: s.module, kind: s.kind, error: s.error }));
}

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export const auditRoutes = new Hono<{ Bindings: Env }>();

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// specs/022-audit-list-pagination — shared critical-first ranking for the
// `severity` sort key on both /alerts and /changes, moved server-side from
// OverviewPage.tsx's identical client-side SEVERITY_ORDER (data-model.md) so
// Overview's own bounded top-N request can ask for it directly. Falls back
// to sorting last (Infinity) for a status this map doesn't recognize,
// rather than throwing — the alert/change itself is still valid data.
const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  warning: 1,
  safe: 2,
  not_evaluated: 3,
};
function severityRank(status: string): number {
  return SEVERITY_RANK[status] ?? Infinity;
}

const ALERT_SORT: Record<string, (a: UnifiedAlert) => string | number> = {
  entity: (a) => a.entityLabel,
  // Negated so paginateArray's default ascending direction yields
  // newest-first — matching queryUnifiedAlerts()'s own pre-pagination sort
  // (`detectedAt DESC`) as the default view when no sort_dir is requested.
  // No UI column exposes this key for an explicit click-to-sort toggle
  // (ALERT_COLUMNS only makes "entity" clickable), so there's no user-facing
  // direction-icon mismatch to worry about.
  detected: (a) => -Date.parse(a.detectedAt),
  severity: (a) => severityRank(a.newStatus),
};

function alertJson(a: UnifiedAlert) {
  return {
    id: a.id,
    module: a.module,
    kind: a.kind,
    entity_label: a.entityLabel,
    previous_status: a.previousStatus,
    new_status: a.newStatus,
    detected_at: a.detectedAt,
    acknowledged_at: a.acknowledgedAt,
    reason: a.reason,
  };
}

auditRoutes.get("/alerts", async (c) => {
  const { alerts, unavailableSources } = await queryUnifiedAlerts(c.env.DB);

  // specs/022-audit-list-pagination — computed against the full pre-
  // pagination array, not `paged.items`, so a critical alert on page 2
  // still surfaces the banner (mirrors every other module's server-side
  // critical_finding pattern, spec 020). `alerts` is already sorted
  // detectedAt DESC by queryUnifiedAlerts(), so this picks the most
  // recently detected critical alert, matching the pre-pagination
  // frontend's own `alertRows.find(...)` behavior exactly.
  const criticalAlert = alerts.find((a) => a.newStatus === "critical") ?? null;

  let paged: { items: UnifiedAlert[]; pagination: PaginationEnvelope };
  try {
    const query: PageQuery = {
      page: c.req.query("page"),
      page_size: c.req.query("page_size"),
      sort_key: c.req.query("sort_key"),
      sort_dir: c.req.query("sort_dir"),
    };
    paged = paginateArray(alerts, query, ALERT_SORT, "detected");
  } catch (err) {
    if (err instanceof PaginationParamError) return c.json({ error: err.message }, 400);
    throw err;
  }

  return c.json({
    alerts: paged.items.map(alertJson),
    critical_alert: criticalAlert ? alertJson(criticalAlert) : null,
    unavailable_sources: toUnavailableSourcesJson(unavailableSources),
    pagination: paged.pagination,
  });
});

auditRoutes.post("/alerts/:module/:kind/:id/acknowledge", requireRole("admin"), async (c) => {
  const module = c.req.param("module");
  const kind = c.req.param("kind");
  const id = c.req.param("id");

  const result = await acknowledgeAlert(c.env.DB, module, kind, id);

  if (result.outcome === "unknown_source") {
    return c.json({ error: `unknown source: ${module}/${kind}` }, 404);
  }
  if (result.outcome === "not_found") {
    return c.json({ error: "alert not found" }, 404);
  }
  return c.json({ id: result.id, acknowledged_at: result.acknowledgedAt });
});

const CHANGE_SORT: Record<string, (ch: ChangeEntry) => string | number> = {
  entity: (ch) => ch.entityLabel,
  severity: (ch) => severityRank(ch.currentStatus),
};

auditRoutes.get("/changes", async (c) => {
  const now = new Date();
  const sinceParam = c.req.query("since");

  // contracts/api.md documents `since` as ISO8601 — an unvalidated
  // malformed value (e.g. `?since=banana`) wouldn't error, it would just
  // silently bind a non-date string into evaluated_at's `<=` comparison
  // (changes.ts), producing a confusing, undocumented result set instead
  // of the clear 400 a caller passing a bad value should get.
  if (sinceParam !== undefined && Number.isNaN(new Date(sinceParam).getTime())) {
    return c.json({ error: `invalid since: must be an ISO8601 date, got "${sinceParam}"` }, 400);
  }
  const since = sinceParam ?? new Date(now.getTime() - TWENTY_FOUR_HOURS_MS).toISOString();

  const { changes, unavailableSources } = await computeChanges(c.env.DB, since);

  let paged: { items: ChangeEntry[]; pagination: PaginationEnvelope };
  try {
    const query: PageQuery = {
      page: c.req.query("page"),
      page_size: c.req.query("page_size"),
      sort_key: c.req.query("sort_key"),
      sort_dir: c.req.query("sort_dir"),
    };
    paged = paginateArray(changes, query, CHANGE_SORT, "entity");
  } catch (err) {
    if (err instanceof PaginationParamError) return c.json({ error: err.message }, 400);
    throw err;
  }

  return c.json({
    since,
    until: now.toISOString(),
    changes: paged.items.map((ch) => ({
      module: ch.module,
      kind: ch.kind,
      entity_label: ch.entityLabel,
      previous_status: ch.previousStatus,
      current_status: ch.currentStatus,
    })),
    unavailable_sources: toUnavailableSourcesJson(unavailableSources),
    pagination: paged.pagination,
  });
});

auditRoutes.get("/summary", async (c) => {
  const { modules, unavailableSources, accountScope } = await computePostureSummary(c.env.DB);
  return c.json({
    modules: modules.map((entry) => ({
      module: entry.module,
      kind: entry.kind,
      has_data: entry.hasData,
      counts: entry.counts,
      evaluated_at: entry.evaluatedAt,
    })),
    unavailable_sources: toUnavailableSourcesJson(unavailableSources),
    account_scope: { zone_count: accountScope.zoneCount, worker_count: accountScope.workerCount },
  });
});

// specs/027-overview-dashboard-redesign — the "Exposure over time" trend
// chart's data, computed on the fly (research.md §5) rather than served
// from a snapshot table.
auditRoutes.get("/trend", async (c) => {
  const { days, unavailableSources } = await computeTrend(c.env.DB);
  return c.json({
    days: days.map((d) => ({ date: d.date, has_data: d.hasData, counts: d.counts })),
    unavailable_sources: toUnavailableSourcesJson(unavailableSources),
  });
});

// specs/018-audit-dashboard research.md §1 — reuses
// workers-dashboard/audit-log.ts's fetchAccountAuditLog() completely
// unmodified, unfiltered (unlike Workers Dashboard's own call, which
// pipes the result through filterWorkersRelevant() afterward). No new
// Cloudflare API call, no new token scope (Audit Logs Read, already
// granted in spec 012). Fixed 7-day window (research.md §4) — this is
// this route file's first Cloudflare API call, everything else here only
// reads D1.
auditRoutes.get("/log", async (c) => {
  const creds = { accountId: c.env.CF_ACCOUNT_ID, apiToken: c.env.CF_API_TOKEN };
  const now = new Date();
  const since = new Date(now.getTime() - SEVEN_DAYS_MS);

  try {
    const { entries, truncated } = await fetchAccountAuditLog(creds, since);
    return c.json({
      since: since.toISOString(),
      until: now.toISOString(),
      entries: entries.map((e) => ({
        occurred_at: e.occurredAt,
        actor: e.actor,
        actor_source: e.actorSource,
        action: e.action,
        target: e.target,
        result_summary: e.resultSummary,
      })),
      total: entries.length,
      truncated,
      unavailable: false,
    });
  } catch {
    return c.json({
      since: since.toISOString(),
      until: now.toISOString(),
      entries: [],
      total: 0,
      truncated: false,
      unavailable: true,
    });
  }
});

// Joins the shared scheduled handler as a seventh independent evaluation
// (constitution Principle III) — computes the same default 24-hour digest
// GET /api/audit/changes would, and logs the count. No new alert table is
// written (research.md §4); _trigger is kept only for signature symmetry
// with every other module's run*Evaluation(env, trigger) entry point.
export async function runAuditDigest(
  env: Env,
  _trigger: "interactive" | "scheduled",
): Promise<{ changeCount: number }> {
  const since = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString();
  const { changes } = await computeChanges(env.DB, since);
  return { changeCount: changes.length };
}
