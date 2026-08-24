import { Hono } from "hono";
import { requireRole } from "../../auth/access-jwt.ts";
import {
  buildSecurityInventory,
  getZoneCertificatePacks,
  getZoneCustomWafRules,
  listTurnstileWidgets,
  listZones,
} from "./inventory.ts";
import { type PageQuery, paginateArray, PaginationParamError } from "../../pagination.ts";
import { mapWithConcurrency } from "../../concurrency.ts";
import {
  classifyCertificateExpiry,
  classifyCustomWafRule,
  evaluateAlwaysUseHttpses,
  evaluateBotFightModes,
  evaluateDnssecs,
  evaluateMinTlsVersions,
  evaluateRateLimitings,
  evaluateSslTlsModes,
  evaluateWafs,
  rollUpZoneStatus,
  selectActiveCertificate,
} from "./evaluate.ts";
import {
  diffForAlwaysHttpsAlerts,
  diffForBotFightModeAlerts,
  diffForDnssecAlerts,
  diffForMinTlsAlerts,
  diffForRateLimitingAlerts,
  diffForSslTlsAlerts,
  diffForWafAlerts,
  type OpenAlert,
  resolveForAlwaysHttpsAlerts,
  resolveForBotFightModeAlerts,
  resolveForDnssecAlerts,
  resolveForMinTlsAlerts,
  resolveForRateLimitingAlerts,
  resolveForSslTlsAlerts,
  resolveForWafAlerts,
} from "./alerts.ts";
import type {
  AlwaysHttpsEvaluation,
  BotFightModeEvaluation,
  CustomWafRule,
  DnssecEvaluation,
  ExposureStatus,
  MinTlsVersionEvaluation,
  ProtectionStatus,
  RateLimitingEvaluation,
  SettingStatus,
  SslTlsEvaluation,
  SslTlsStatus,
  TurnstileWidget,
  WafEvaluation,
  ZoneCertificate,
} from "./types.ts";

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export const securityRoutes = new Hono<{ Bindings: Env }>();

// The most recent run's per-entity status, read BEFORE the current run
// is inserted — same pattern as every prior module.
async function getPreviousSslTlsStatuses(env: Env): Promise<Map<string, SslTlsStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT zone_id, status FROM ssl_tls_findings
     WHERE run_id = (SELECT run_id FROM ssl_tls_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ zone_id: string; status: SslTlsStatus }>();
  return new Map(rows.map((r) => [r.zone_id, r.status]));
}

async function getPreviousDnssecStatuses(env: Env): Promise<Map<string, ProtectionStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT zone_id, status FROM dnssec_findings
     WHERE run_id = (SELECT run_id FROM dnssec_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ zone_id: string; status: ProtectionStatus }>();
  return new Map(rows.map((r) => [r.zone_id, r.status]));
}

async function getPreviousWafStatuses(env: Env): Promise<Map<string, ProtectionStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT zone_id, status FROM waf_findings
     WHERE run_id = (SELECT run_id FROM waf_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ zone_id: string; status: ProtectionStatus }>();
  return new Map(rows.map((r) => [r.zone_id, r.status]));
}

async function getPreviousRateLimitingStatuses(env: Env): Promise<Map<string, ProtectionStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT zone_id, status FROM rate_limiting_findings
     WHERE run_id = (SELECT run_id FROM rate_limiting_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ zone_id: string; status: ProtectionStatus }>();
  return new Map(rows.map((r) => [r.zone_id, r.status]));
}

async function getPreviousBotFightModeStatuses(env: Env): Promise<Map<string, SettingStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT zone_id, status FROM bot_fight_mode_findings
     WHERE run_id = (SELECT run_id FROM bot_fight_mode_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ zone_id: string; status: SettingStatus }>();
  return new Map(rows.map((r) => [r.zone_id, r.status]));
}

async function getPreviousAlwaysHttpsStatuses(env: Env): Promise<Map<string, SettingStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT zone_id, status FROM always_https_findings
     WHERE run_id = (SELECT run_id FROM always_https_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ zone_id: string; status: SettingStatus }>();
  return new Map(rows.map((r) => [r.zone_id, r.status]));
}

async function getPreviousMinTlsStatuses(env: Env): Promise<Map<string, SettingStatus>> {
  const { results: rows } = await env.DB.prepare(
    `SELECT zone_id, status FROM min_tls_findings
     WHERE run_id = (SELECT run_id FROM min_tls_findings ORDER BY evaluated_at DESC LIMIT 1)`,
  ).all<{ zone_id: string; status: SettingStatus }>();
  return new Map(rows.map((r) => [r.zone_id, r.status]));
}

// issue #481 — every alert still open (unacknowledged, unresolved), read
// BEFORE the current run so resolveFor*Alerts (alerts.ts) can decide which
// of them the run that's about to be inserted just resolved.
async function getOpenSslTlsAlerts(env: Env): Promise<OpenAlert[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, zone_id AS zoneId FROM ssl_tls_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL`,
  ).all<OpenAlert>();
  return results;
}

async function getOpenDnssecAlerts(env: Env): Promise<OpenAlert[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, zone_id AS zoneId FROM dnssec_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL`,
  ).all<OpenAlert>();
  return results;
}

async function getOpenWafAlerts(env: Env): Promise<OpenAlert[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, zone_id AS zoneId FROM waf_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL`,
  ).all<OpenAlert>();
  return results;
}

async function getOpenRateLimitingAlerts(env: Env): Promise<OpenAlert[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, zone_id AS zoneId FROM rate_limiting_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL`,
  ).all<OpenAlert>();
  return results;
}

async function getOpenBotFightModeAlerts(env: Env): Promise<OpenAlert[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, zone_id AS zoneId FROM bot_fight_mode_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL`,
  ).all<OpenAlert>();
  return results;
}

async function getOpenAlwaysHttpsAlerts(env: Env): Promise<OpenAlert[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, zone_id AS zoneId FROM always_https_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL`,
  ).all<OpenAlert>();
  return results;
}

async function getOpenMinTlsAlerts(env: Env): Promise<OpenAlert[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, zone_id AS zoneId FROM min_tls_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL`,
  ).all<OpenAlert>();
  return results;
}

// Shared by POST /evaluate (interactive) and the scheduled handler —
// constitution Principle III.
export async function runSecurityEvaluation(
  env: Env,
  trigger: "interactive" | "scheduled",
): Promise<
  {
    runId: string;
    evaluatedAt: string;
    sslTlsResults: SslTlsEvaluation[];
    dnssecResults: DnssecEvaluation[];
    wafResults: WafEvaluation[];
    rateLimitingResults: RateLimitingEvaluation[];
    botFightModeResults: BotFightModeEvaluation[];
    alwaysUseHttpsResults: AlwaysHttpsEvaluation[];
    minTlsVersionResults: MinTlsVersionEvaluation[];
    newAlertCount: number;
    resolvedAlertCount: number;
  }
> {
  const creds = { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN };
  const [
    { zones },
    previousSslTlsStatuses,
    previousDnssecStatuses,
    previousWafStatuses,
    previousRateLimitingStatuses,
    previousBotFightModeStatuses,
    previousAlwaysHttpsStatuses,
    previousMinTlsStatuses,
    openSslTlsAlerts,
    openDnssecAlerts,
    openWafAlerts,
    openRateLimitingAlerts,
    openBotFightModeAlerts,
    openAlwaysHttpsAlerts,
    openMinTlsAlerts,
  ] = await Promise.all([
    buildSecurityInventory(creds),
    getPreviousSslTlsStatuses(env),
    getPreviousDnssecStatuses(env),
    getPreviousWafStatuses(env),
    getPreviousRateLimitingStatuses(env),
    getPreviousBotFightModeStatuses(env),
    getPreviousAlwaysHttpsStatuses(env),
    getPreviousMinTlsStatuses(env),
    getOpenSslTlsAlerts(env),
    getOpenDnssecAlerts(env),
    getOpenWafAlerts(env),
    getOpenRateLimitingAlerts(env),
    getOpenBotFightModeAlerts(env),
    getOpenAlwaysHttpsAlerts(env),
    getOpenMinTlsAlerts(env),
  ]);

  const sslTlsResults = evaluateSslTlsModes(zones);
  const dnssecResults = evaluateDnssecs(zones);
  const wafResults = evaluateWafs(zones);
  const rateLimitingResults = evaluateRateLimitings(zones);
  const botFightModeResults = evaluateBotFightModes(zones);
  const alwaysUseHttpsResults = evaluateAlwaysUseHttpses(zones);
  const minTlsVersionResults = evaluateMinTlsVersions(zones);

  const runId = crypto.randomUUID();
  const evaluatedAt = new Date().toISOString();

  const sslTlsStatements = sslTlsResults.map((s) =>
    env.DB.prepare(
      `INSERT INTO ssl_tls_findings (id, zone_id, zone_name, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      s.zoneId,
      s.zoneName,
      s.status,
      s.reason,
      evaluatedAt,
      runId,
      trigger,
    )
  );

  const dnssecStatements = dnssecResults.map((d) =>
    env.DB.prepare(
      `INSERT INTO dnssec_findings (id, zone_id, zone_name, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      d.zoneId,
      d.zoneName,
      d.status,
      d.reason,
      evaluatedAt,
      runId,
      trigger,
    )
  );

  const wafStatements = wafResults.map((w) =>
    env.DB.prepare(
      `INSERT INTO waf_findings (id, zone_id, zone_name, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      w.zoneId,
      w.zoneName,
      w.status,
      w.reason,
      evaluatedAt,
      runId,
      trigger,
    )
  );

  const rateLimitingStatements = rateLimitingResults.map((r) =>
    env.DB.prepare(
      `INSERT INTO rate_limiting_findings (id, zone_id, zone_name, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      r.zoneId,
      r.zoneName,
      r.status,
      r.reason,
      evaluatedAt,
      runId,
      trigger,
    )
  );

  const botFightModeStatements = botFightModeResults.map((b) =>
    env.DB.prepare(
      `INSERT INTO bot_fight_mode_findings (id, zone_id, zone_name, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      b.zoneId,
      b.zoneName,
      b.status,
      b.reason,
      evaluatedAt,
      runId,
      trigger,
    )
  );

  const alwaysUseHttpsStatements = alwaysUseHttpsResults.map((a) =>
    env.DB.prepare(
      `INSERT INTO always_https_findings (id, zone_id, zone_name, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.zoneId,
      a.zoneName,
      a.status,
      a.reason,
      evaluatedAt,
      runId,
      trigger,
    )
  );

  const minTlsVersionStatements = minTlsVersionResults.map((m) =>
    env.DB.prepare(
      `INSERT INTO min_tls_findings (id, zone_id, zone_name, status, reason, evaluated_at, run_id, run_trigger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      m.zoneId,
      m.zoneName,
      m.status,
      m.reason,
      evaluatedAt,
      runId,
      trigger,
    )
  );

  const statements = [
    ...sslTlsStatements,
    ...dnssecStatements,
    ...wafStatements,
    ...rateLimitingStatements,
    ...botFightModeStatements,
    ...alwaysUseHttpsStatements,
    ...minTlsVersionStatements,
  ];
  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  const newSslTlsAlerts = diffForSslTlsAlerts(sslTlsResults, previousSslTlsStatuses);
  const newDnssecAlerts = diffForDnssecAlerts(dnssecResults, previousDnssecStatuses);
  const newWafAlerts = diffForWafAlerts(wafResults, previousWafStatuses);
  const newRateLimitingAlerts = diffForRateLimitingAlerts(
    rateLimitingResults,
    previousRateLimitingStatuses,
  );
  const newBotFightModeAlerts = diffForBotFightModeAlerts(
    botFightModeResults,
    previousBotFightModeStatuses,
  );
  const newAlwaysHttpsAlerts = diffForAlwaysHttpsAlerts(
    alwaysUseHttpsResults,
    previousAlwaysHttpsStatuses,
  );
  const newMinTlsAlerts = diffForMinTlsAlerts(minTlsVersionResults, previousMinTlsStatuses);

  // issue #481 — the ids resolveFor*Alerts (alerts.ts) says just recovered
  // to safe, turned into one UPDATE statement per id against its own
  // alerts table.
  function resolveStatements(table: string, ids: string[]): D1PreparedStatement[] {
    return ids.map((id) =>
      env.DB.prepare(`UPDATE ${table} SET resolved_at = ? WHERE id = ?`).bind(evaluatedAt, id)
    );
  }

  const resolvedSslTlsAlertStatements = resolveStatements(
    "ssl_tls_alerts",
    resolveForSslTlsAlerts(sslTlsResults, openSslTlsAlerts),
  );
  const resolvedDnssecAlertStatements = resolveStatements(
    "dnssec_alerts",
    resolveForDnssecAlerts(dnssecResults, openDnssecAlerts),
  );
  const resolvedWafAlertStatements = resolveStatements(
    "waf_alerts",
    resolveForWafAlerts(wafResults, openWafAlerts),
  );
  const resolvedRateLimitingAlertStatements = resolveStatements(
    "rate_limiting_alerts",
    resolveForRateLimitingAlerts(rateLimitingResults, openRateLimitingAlerts),
  );
  const resolvedBotFightModeAlertStatements = resolveStatements(
    "bot_fight_mode_alerts",
    resolveForBotFightModeAlerts(botFightModeResults, openBotFightModeAlerts),
  );
  const resolvedAlwaysHttpsAlertStatements = resolveStatements(
    "always_https_alerts",
    resolveForAlwaysHttpsAlerts(alwaysUseHttpsResults, openAlwaysHttpsAlerts),
  );
  const resolvedMinTlsAlertStatements = resolveStatements(
    "min_tls_alerts",
    resolveForMinTlsAlerts(minTlsVersionResults, openMinTlsAlerts),
  );

  const sslTlsAlertStatements = newSslTlsAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO ssl_tls_alerts (id, zone_id, zone_name, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.zoneId,
      a.zoneName,
      a.previousStatus,
      a.newStatus,
      runId,
      evaluatedAt,
    )
  );

  const dnssecAlertStatements = newDnssecAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO dnssec_alerts (id, zone_id, zone_name, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.zoneId,
      a.zoneName,
      a.previousStatus,
      a.newStatus,
      runId,
      evaluatedAt,
    )
  );

  const wafAlertStatements = newWafAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO waf_alerts (id, zone_id, zone_name, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.zoneId,
      a.zoneName,
      a.previousStatus,
      a.newStatus,
      runId,
      evaluatedAt,
    )
  );

  const rateLimitingAlertStatements = newRateLimitingAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO rate_limiting_alerts (id, zone_id, zone_name, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.zoneId,
      a.zoneName,
      a.previousStatus,
      a.newStatus,
      runId,
      evaluatedAt,
    )
  );

  const botFightModeAlertStatements = newBotFightModeAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO bot_fight_mode_alerts (id, zone_id, zone_name, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.zoneId,
      a.zoneName,
      a.previousStatus,
      a.newStatus,
      runId,
      evaluatedAt,
    )
  );

  const alwaysHttpsAlertStatements = newAlwaysHttpsAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO always_https_alerts (id, zone_id, zone_name, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.zoneId,
      a.zoneName,
      a.previousStatus,
      a.newStatus,
      runId,
      evaluatedAt,
    )
  );

  const minTlsAlertStatements = newMinTlsAlerts.map((a) =>
    env.DB.prepare(
      `INSERT INTO min_tls_alerts (id, zone_id, zone_name, previous_status, new_status, run_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      a.zoneId,
      a.zoneName,
      a.previousStatus,
      a.newStatus,
      runId,
      evaluatedAt,
    )
  );

  const alertStatements = [
    ...sslTlsAlertStatements,
    ...dnssecAlertStatements,
    ...wafAlertStatements,
    ...rateLimitingAlertStatements,
    ...botFightModeAlertStatements,
    ...alwaysHttpsAlertStatements,
    ...minTlsAlertStatements,
    ...resolvedSslTlsAlertStatements,
    ...resolvedDnssecAlertStatements,
    ...resolvedWafAlertStatements,
    ...resolvedRateLimitingAlertStatements,
    ...resolvedBotFightModeAlertStatements,
    ...resolvedAlwaysHttpsAlertStatements,
    ...resolvedMinTlsAlertStatements,
  ];
  if (alertStatements.length > 0) {
    await env.DB.batch(alertStatements);
  }

  return {
    runId,
    evaluatedAt,
    sslTlsResults,
    dnssecResults,
    wafResults,
    rateLimitingResults,
    botFightModeResults,
    alwaysUseHttpsResults,
    minTlsVersionResults,
    newAlertCount: newSslTlsAlerts.length + newDnssecAlerts.length + newWafAlerts.length +
      newRateLimitingAlerts.length + newBotFightModeAlerts.length + newAlwaysHttpsAlerts.length +
      newMinTlsAlerts.length,
    resolvedAlertCount: resolvedSslTlsAlertStatements.length +
      resolvedDnssecAlertStatements.length +
      resolvedWafAlertStatements.length + resolvedRateLimitingAlertStatements.length +
      resolvedBotFightModeAlertStatements.length + resolvedAlwaysHttpsAlertStatements.length +
      resolvedMinTlsAlertStatements.length,
  };
}

securityRoutes.post("/evaluate", async (c) => {
  const { runId } = await runSecurityEvaluation(c.env, "interactive");
  return c.json({ run_id: runId }, 202);
});

interface SslTlsFindingRow {
  zone_id: string;
  zone_name: string;
  status: string;
  reason: string;
}

interface DnssecFindingRow {
  zone_id: string;
  status: string;
  reason: string;
}

interface WafFindingRow {
  zone_id: string;
  status: string;
  reason: string;
}

interface RateLimitingFindingRow {
  zone_id: string;
  status: string;
  reason: string;
}

interface BotFightModeFindingRow {
  zone_id: string;
  status: string;
  reason: string;
}

interface AlwaysHttpsFindingRow {
  zone_id: string;
  status: string;
  reason: string;
}

interface MinTlsFindingRow {
  zone_id: string;
  status: string;
  reason: string;
}

// Serializes a Turnstile widget list for the API response, preserving
// the null-vs-empty-array distinction all the way through: null means
// the list itself could not be fetched (not-evaluated), a `.map` over
// an actual (possibly empty) array means it was fetched successfully
// (confirmed — possibly zero — widgets). See inventory.ts's
// SecurityInventory.turnstileWidgets doc comment for why this
// distinction exists (FR-012).
// Exported for direct unit-testing (T025) — GET /inventory has no
// harness in this codebase for exercising the full Hono route against a
// mocked D1, so this is the pure sliver of that route's logic that
// carries the null signal.
export function serializeTurnstileWidgets(
  widgets: TurnstileWidget[] | null,
): Array<{ sitekey: string; name: string; domains: string[] }> | null {
  return widgets === null
    ? null
    : widgets.map((w) => ({ sitekey: w.sitekey, name: w.name, domains: w.domains }));
}

// specs/017-security-dashboard research.md §5 — live-fetched on every
// GET /inventory call, never persisted (mirrors
// worker/modules/zero-trust/routes.ts's fetchAccessGroupsPanel()
// precedent exactly). null only if the zone list itself couldn't be
// fetched at all — a per-zone certificate-pack fetch failure just
// leaves that zone contributing no row, not a total failure.
//
// `zones` is fetched once by the GET /inventory handler below and shared
// with fetchWafCustomRulesPanel() rather than each panel calling
// listZones() independently — they'd otherwise issue the same GET /zones
// request twice per inventory load.
async function fetchCertificatesPanel(
  creds: { accountId: string; apiToken: string },
  zones: Awaited<ReturnType<typeof listZones>> | null,
): Promise<ZoneCertificate[] | null> {
  if (zones === null) return null;

  // Capped at 2 concurrent zones — same modest cap this module already
  // uses elsewhere (worker/concurrency.ts).
  return await mapWithConcurrency(zones, 2, async (zone) => {
    const certificates = await getZoneCertificatePacks(creds, zone.id).catch(() => []);
    const active = selectActiveCertificate(certificates);
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      hosts: active?.hosts ?? [],
      issuer: active?.issuer ?? "",
      expiresOn: active?.expiresOn ?? null,
      status: classifyCertificateExpiry(active?.expiresOn ?? null),
    };
  });
}

// research.md §6 — same live-fetched, unpersisted precedent as
// fetchCertificatesPanel() above. One row per (zone, rule) pair. Shares
// the same fetched `zones` list — see fetchCertificatesPanel()'s comment.
async function fetchWafCustomRulesPanel(
  creds: { accountId: string; apiToken: string },
  zones: Awaited<ReturnType<typeof listZones>> | null,
): Promise<CustomWafRule[] | null> {
  if (zones === null) return null;

  const perZoneRules = await mapWithConcurrency(zones, 2, async (zone) => {
    const rules = await getZoneCustomWafRules(creds, zone.id).catch(() => []);
    return rules.map((rule) => ({
      zoneId: zone.id,
      zoneName: zone.name,
      description: rule.description ?? "",
      expression: rule.expression ?? "",
      action: rule.action ?? "",
      enabled: rule.enabled,
      status: classifyCustomWafRule(rule),
    }));
  });
  return perZoneRules.flat();
}

interface ZoneFindingOut {
  zone_id: string;
  zone_name: string;
  overall_status: string;
  ssl_tls: { status: string; reason: string };
  dnssec?: { status: string; reason: string };
  waf?: { status: string; reason: string };
  rate_limiting?: { status: string; reason: string };
  bot_fight_mode?: { status: string; reason: string };
  always_use_https?: { status: string; reason: string };
  min_tls_version?: { status: string; reason: string };
}

const ZONE_SORT: Record<string, (r: ZoneFindingOut) => string | number> = {
  zone: (r) => r.zone_name,
};
const CERT_SORT: Record<string, (r: ZoneCertificate) => string | number> = {
  zone: (r) => r.zoneName,
};
const WAF_RULE_SORT: Record<string, (r: CustomWafRule) => string | number> = {
  zone: (r) => r.zoneName,
};

// Same priority order as the frontend's zoneChecks()/criticalCheckDescription()
// (SecurityPostureInventory.tsx) — mirrored here so critical_finding can be
// computed across the WHOLE zones list, not just whichever page is loaded
// (same pagination-must-not-hide-a-critical-row fix as DNS/Storage).
function describeZoneCriticalCheck(zone: ZoneFindingOut): string {
  const checks: Array<[string, { status: string; reason: string } | undefined]> = [
    ["SSL/TLS", zone.ssl_tls],
    ["DNSSEC", zone.dnssec],
    ["WAF", zone.waf],
    ["Rate limiting", zone.rate_limiting],
    ["Bot fight mode", zone.bot_fight_mode],
    ["Always HTTPS", zone.always_use_https],
    ["Min TLS version", zone.min_tls_version],
  ];
  const [label, check] = checks.find(([, c]) => c?.status === "critical") ??
    ["SSL/TLS", zone.ssl_tls];
  return `${label}: ${check!.reason}`;
}

export interface SecurityInventoryQuery {
  zone?: PageQuery;
  certificate?: PageQuery;
  wafRule?: PageQuery;
}

// Pure — same extraction rationale as DNS/Storage/Workers: independently
// testable pagination/sort/critical-finding logic across 3 collections
// (zones is D1-backed; certificates/waf_custom_rules are live-fetched and
// nullable on total fetch failure — pagination is skipped, not faked, when
// null).
export function buildSecurityInventoryResponse(
  zones: ZoneFindingOut[],
  certificates: ZoneCertificate[] | null,
  wafCustomRules: CustomWafRule[] | null,
  turnstileWidgets: TurnstileWidget[] | null,
  runId: string | null,
  evaluatedAt: string | null,
  query: SecurityInventoryQuery,
) {
  const zonePage = paginateArray(zones, query.zone ?? {}, ZONE_SORT, "zone");
  const criticalZone = zones.find((z) => z.overall_status === "critical") ?? null;

  const certPage = certificates !== null
    ? paginateArray(certificates, query.certificate ?? {}, CERT_SORT, "zone")
    : null;
  const wafRulePage = wafCustomRules !== null
    ? paginateArray(wafCustomRules, query.wafRule ?? {}, WAF_RULE_SORT, "zone")
    : null;

  return {
    run_id: runId,
    evaluated_at: evaluatedAt,
    critical_finding: criticalZone
      ? {
        zone_name: criticalZone.zone_name,
        description: describeZoneCriticalCheck(criticalZone),
      }
      : null,
    zones: zonePage.items,
    zones_pagination: zonePage.pagination,
    // Bug fix incidental to this restructuring, not scoped to pagination:
    // these two panels' rows were previously returned as-fetched (camelCase
    // — zoneName/expiresOn), while the frontend's ZoneCertificate/
    // CustomWafRule interfaces and every existing e2e mock have always
    // expected snake_case, matching every other field in this same
    // response. That mismatch meant these two panels silently rendered
    // blank/"not available" in production — the mocked e2e suite never
    // exercises this route's actual serialization, so it never caught it.
    certificates: certPage?.items.map((c) => ({
      zone_id: c.zoneId,
      zone_name: c.zoneName,
      hosts: c.hosts,
      issuer: c.issuer,
      expires_on: c.expiresOn,
      status: c.status,
    })) ?? null,
    certificates_pagination: certPage?.pagination ?? null,
    waf_custom_rules: wafRulePage?.items.map((r) => ({
      zone_id: r.zoneId,
      zone_name: r.zoneName,
      description: r.description,
      expression: r.expression,
      action: r.action,
      enabled: r.enabled,
      status: r.status,
    })) ?? null,
    waf_custom_rules_pagination: wafRulePage?.pagination ?? null,
    turnstile_widgets: serializeTurnstileWidgets(turnstileWidgets),
  };
}

// Every zone always produces exactly one ssl_tls_findings row per run
// (data-model.md) — the most reliable table to source "did a run
// happen" from, same pattern as Module 4's pages_subdomain_findings.
securityRoutes.get("/inventory", async (c) => {
  const creds = { accountId: c.env.CF_ACCOUNT_ID, apiToken: c.env.CF_API_TOKEN };
  const query: SecurityInventoryQuery = {
    zone: {
      page: c.req.query("zone_page"),
      page_size: c.req.query("zone_page_size"),
      sort_key: c.req.query("zone_sort_key"),
      sort_dir: c.req.query("zone_sort_dir"),
    },
    certificate: {
      page: c.req.query("certificate_page"),
      page_size: c.req.query("certificate_page_size"),
      sort_key: c.req.query("certificate_sort_key"),
      sort_dir: c.req.query("certificate_sort_dir"),
    },
    wafRule: {
      page: c.req.query("waf_rule_page"),
      page_size: c.req.query("waf_rule_page_size"),
      sort_key: c.req.query("waf_rule_sort_key"),
      sort_dir: c.req.query("waf_rule_sort_dir"),
    },
  };

  // Same null-on-total-failure idiom `buildSecurityInventory()` uses for
  // this exact fetch (inventory.ts) — a scoped-down token (missing
  // `Turnstile Read`) or a transient API error must surface as
  // not-evaluated, not as a confirmed-empty `[]` (T025, FR-012). `zones`
  // is fetched once here, alongside the D1 read and turnstile fetch, and
  // shared by both panels below instead of each issuing its own GET
  // /zones (fetchCertificatesPanel's own comment).
  const [latest, turnstileWidgets, zonesForPanels] = await Promise.all([
    c.env.DB.prepare(
      `SELECT run_id, evaluated_at FROM ssl_tls_findings ORDER BY evaluated_at DESC LIMIT 1`,
    ).first<{ run_id: string; evaluated_at: string }>(),
    listTurnstileWidgets(creds).catch(() => null),
    listZones(creds).catch(() => null),
  ]);
  const [certificates, wafCustomRules] = await Promise.all([
    fetchCertificatesPanel(creds, zonesForPanels),
    fetchWafCustomRulesPanel(creds, zonesForPanels),
  ]);

  try {
    if (!latest) {
      return c.json(
        buildSecurityInventoryResponse(
          [],
          certificates,
          wafCustomRules,
          turnstileWidgets,
          null,
          null,
          query,
        ),
      );
    }

    const [
      { results: sslTlsRows },
      { results: dnssecRows },
      { results: wafRows },
      { results: rateLimitingRows },
      { results: botFightModeRows },
      { results: alwaysHttpsRows },
      { results: minTlsRows },
    ] = await Promise.all([
      c.env.DB.prepare(
        `SELECT zone_id, zone_name, status, reason FROM ssl_tls_findings WHERE run_id = ? ORDER BY zone_name`,
      ).bind(latest.run_id).all<SslTlsFindingRow>(),
      c.env.DB.prepare(
        `SELECT zone_id, status, reason FROM dnssec_findings WHERE run_id = ?`,
      ).bind(latest.run_id).all<DnssecFindingRow>(),
      c.env.DB.prepare(
        `SELECT zone_id, status, reason FROM waf_findings WHERE run_id = ?`,
      ).bind(latest.run_id).all<WafFindingRow>(),
      c.env.DB.prepare(
        `SELECT zone_id, status, reason FROM rate_limiting_findings WHERE run_id = ?`,
      ).bind(latest.run_id).all<RateLimitingFindingRow>(),
      c.env.DB.prepare(
        `SELECT zone_id, status, reason FROM bot_fight_mode_findings WHERE run_id = ?`,
      ).bind(latest.run_id).all<BotFightModeFindingRow>(),
      c.env.DB.prepare(
        `SELECT zone_id, status, reason FROM always_https_findings WHERE run_id = ?`,
      ).bind(latest.run_id).all<AlwaysHttpsFindingRow>(),
      c.env.DB.prepare(
        `SELECT zone_id, status, reason FROM min_tls_findings WHERE run_id = ?`,
      ).bind(latest.run_id).all<MinTlsFindingRow>(),
    ]);

    const dnssecByZone = new Map(dnssecRows.map((r) => [r.zone_id, r]));
    const wafByZone = new Map(wafRows.map((r) => [r.zone_id, r]));
    const rateLimitingByZone = new Map(rateLimitingRows.map((r) => [r.zone_id, r]));
    const botFightModeByZone = new Map(botFightModeRows.map((r) => [r.zone_id, r]));
    const alwaysHttpsByZone = new Map(alwaysHttpsRows.map((r) => [r.zone_id, r]));
    const minTlsByZone = new Map(minTlsRows.map((r) => [r.zone_id, r]));

    const zonesOut: ZoneFindingOut[] = sslTlsRows.map((s) => {
      const dnssec = dnssecByZone.get(s.zone_id);
      const waf = wafByZone.get(s.zone_id);
      const rateLimiting = rateLimitingByZone.get(s.zone_id);
      const botFightMode = botFightModeByZone.get(s.zone_id);
      const alwaysUseHttps = alwaysHttpsByZone.get(s.zone_id);
      const minTlsVersion = minTlsByZone.get(s.zone_id);
      // specs/017-security-dashboard FR-002 — the worst of every check
      // this zone actually has a row for; a check missing its own row
      // (shouldn't normally happen, every check inserts one row per
      // zone per run) simply doesn't contribute, never treated as safe.
      const overallStatus = rollUpZoneStatus(
        [
          s.status,
          dnssec?.status,
          waf?.status,
          rateLimiting?.status,
          botFightMode?.status,
          alwaysUseHttps?.status,
          minTlsVersion?.status,
        ]
          .filter((v): v is string => v !== undefined)
          .map((v) => v as ExposureStatus),
      );
      return {
        zone_id: s.zone_id,
        zone_name: s.zone_name,
        overall_status: overallStatus,
        ssl_tls: { status: s.status, reason: s.reason },
        dnssec: dnssec && { status: dnssec.status, reason: dnssec.reason },
        waf: waf && { status: waf.status, reason: waf.reason },
        rate_limiting: rateLimiting && { status: rateLimiting.status, reason: rateLimiting.reason },
        bot_fight_mode: botFightMode &&
          { status: botFightMode.status, reason: botFightMode.reason },
        always_use_https: alwaysUseHttps &&
          { status: alwaysUseHttps.status, reason: alwaysUseHttps.reason },
        min_tls_version: minTlsVersion &&
          { status: minTlsVersion.status, reason: minTlsVersion.reason },
      };
    });

    return c.json(
      buildSecurityInventoryResponse(
        zonesOut,
        certificates,
        wafCustomRules,
        turnstileWidgets,
        latest.run_id,
        latest.evaluated_at,
        query,
      ),
    );
  } catch (err) {
    if (err instanceof PaginationParamError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
});

interface SslTlsAlertRow {
  id: string;
  zone_id: string;
  zone_name: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

interface DnssecAlertRow {
  id: string;
  zone_id: string;
  zone_name: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

interface WafAlertRow {
  id: string;
  zone_id: string;
  zone_name: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

interface RateLimitingAlertRow {
  id: string;
  zone_id: string;
  zone_name: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

interface BotFightModeAlertRow {
  id: string;
  zone_id: string;
  zone_name: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

interface AlwaysHttpsAlertRow {
  id: string;
  zone_id: string;
  zone_name: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

interface MinTlsAlertRow {
  id: string;
  zone_id: string;
  zone_name: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  acknowledged_at: string | null;
}

// Merges all seven alert tables at the API layer with a `kind`
// discriminator (contracts/api.md) — the tables stay separate in D1
// (data-model.md §7's rationale), combined only for this response.
securityRoutes.get("/alerts", async (c) => {
  const [
    { results: sslTlsRows },
    { results: dnssecRows },
    { results: wafRows },
    { results: rateLimitingRows },
    { results: botFightModeRows },
    { results: alwaysHttpsRows },
    { results: minTlsRows },
  ] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, zone_id, zone_name, previous_status, new_status, detected_at, acknowledged_at
       FROM ssl_tls_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL ORDER BY detected_at DESC`,
    ).all<SslTlsAlertRow>(),
    c.env.DB.prepare(
      `SELECT id, zone_id, zone_name, previous_status, new_status, detected_at, acknowledged_at
       FROM dnssec_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL ORDER BY detected_at DESC`,
    ).all<DnssecAlertRow>(),
    c.env.DB.prepare(
      `SELECT id, zone_id, zone_name, previous_status, new_status, detected_at, acknowledged_at
       FROM waf_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL ORDER BY detected_at DESC`,
    ).all<WafAlertRow>(),
    c.env.DB.prepare(
      `SELECT id, zone_id, zone_name, previous_status, new_status, detected_at, acknowledged_at
       FROM rate_limiting_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL ORDER BY detected_at DESC`,
    ).all<RateLimitingAlertRow>(),
    c.env.DB.prepare(
      `SELECT id, zone_id, zone_name, previous_status, new_status, detected_at, acknowledged_at
       FROM bot_fight_mode_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL ORDER BY detected_at DESC`,
    ).all<BotFightModeAlertRow>(),
    c.env.DB.prepare(
      `SELECT id, zone_id, zone_name, previous_status, new_status, detected_at, acknowledged_at
       FROM always_https_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL ORDER BY detected_at DESC`,
    ).all<AlwaysHttpsAlertRow>(),
    c.env.DB.prepare(
      `SELECT id, zone_id, zone_name, previous_status, new_status, detected_at, acknowledged_at
       FROM min_tls_alerts WHERE acknowledged_at IS NULL AND resolved_at IS NULL ORDER BY detected_at DESC`,
    ).all<MinTlsAlertRow>(),
  ]);

  return c.json({
    alerts: [
      ...sslTlsRows.map((r) => ({
        id: r.id,
        kind: "ssl_tls" as const,
        zone_id: r.zone_id,
        zone_name: r.zone_name,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
      ...dnssecRows.map((r) => ({
        id: r.id,
        kind: "dnssec" as const,
        zone_id: r.zone_id,
        zone_name: r.zone_name,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
      ...wafRows.map((r) => ({
        id: r.id,
        kind: "waf" as const,
        zone_id: r.zone_id,
        zone_name: r.zone_name,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
      ...rateLimitingRows.map((r) => ({
        id: r.id,
        kind: "rate_limiting" as const,
        zone_id: r.zone_id,
        zone_name: r.zone_name,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
      ...botFightModeRows.map((r) => ({
        id: r.id,
        kind: "bot_fight_mode" as const,
        zone_id: r.zone_id,
        zone_name: r.zone_name,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
      ...alwaysHttpsRows.map((r) => ({
        id: r.id,
        kind: "always_use_https" as const,
        zone_id: r.zone_id,
        zone_name: r.zone_name,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
      ...minTlsRows.map((r) => ({
        id: r.id,
        kind: "min_tls_version" as const,
        zone_id: r.zone_id,
        zone_name: r.zone_name,
        previous_status: r.previous_status,
        new_status: r.new_status,
        detected_at: r.detected_at,
        acknowledged_at: r.acknowledged_at,
      })),
    ],
  });
});

const ALERT_TABLE_BY_KIND: Record<string, string> = {
  ssl_tls: "ssl_tls_alerts",
  dnssec: "dnssec_alerts",
  waf: "waf_alerts",
  rate_limiting: "rate_limiting_alerts",
  bot_fight_mode: "bot_fight_mode_alerts",
  always_use_https: "always_https_alerts",
  min_tls_version: "min_tls_alerts",
};

// Not a Cloudflare account mutation (FR-013 scope boundary) — not
// written to audit_log, same as every prior module's equivalent
// endpoint.
securityRoutes.post("/alerts/:kind/:id/acknowledge", requireRole("admin"), async (c) => {
  const kind = c.req.param("kind");
  const id = c.req.param("id");
  const table = ALERT_TABLE_BY_KIND[kind];

  if (!table) {
    return c.json({ error: `unknown alert kind: ${kind}` }, 404);
  }

  const existing = await c.env.DB.prepare(
    `SELECT acknowledged_at FROM ${table} WHERE id = ?`,
  ).bind(id).first<{ acknowledged_at: string | null }>();

  if (!existing) {
    return c.json({ error: "alert not found" }, 404);
  }

  if (existing.acknowledged_at) {
    return c.json({ id, acknowledged_at: existing.acknowledged_at });
  }

  const acknowledgedAt = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE ${table} SET acknowledged_at = ? WHERE id = ?`,
  ).bind(acknowledgedAt, id).run();

  return c.json({ id, acknowledged_at: acknowledgedAt });
});
