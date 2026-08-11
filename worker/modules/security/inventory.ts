// Cloudflare API client helpers. Plain fetch(), read-only — mirrors every
// prior module's inventory.ts shape. Exact response field names verified
// against Cloudflare's documented API shapes (research.md §1-§6); final
// verification against a live account happens in T022 (quickstart.md).
import { mapWithConcurrency } from "../../concurrency.ts";
import type { TurnstileWidget, ZoneInventoryItem } from "./types.ts";

export interface CloudflareSecurityCredentials {
  accountId: string;
  apiToken: string;
}

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

export class CloudflareAPIError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "CloudflareAPIError";
  }
}

interface CloudflareAPIResponse<T> {
  success: boolean;
  result: T;
  errors: Array<{ code: number; message: string }>;
}

async function cfFetch<T>(
  path: string,
  creds: CloudflareSecurityCredentials,
  fetchImpl: typeof fetch,
): Promise<T> {
  const res = await fetchImpl(`${CF_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${creds.apiToken}` },
  });

  // Read the {success, errors} envelope before deciding whether to throw —
  // Cloudflare includes it even on 4xx/5xx, and discarding it down to a
  // bare status code hides the real reason (found live in another module,
  // 2026-08-11: a 400 with no detail turned out to be a malformed request,
  // not a permission problem).
  let body: CloudflareAPIResponse<T> | undefined;
  try {
    body = await res.json() as CloudflareAPIResponse<T>;
  } catch {
    // Non-JSON error body (rare) — fall through to the generic HTTP-status
    // error below, which still carries the real status code.
  }

  if (!res.ok || !body || !body.success) {
    const detail = body?.errors?.map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new CloudflareAPIError(
      `Cloudflare API ${path} returned HTTP ${res.status}${detail ? ` (${detail})` : ""}`,
      res.status,
    );
  }
  return body.result;
}

// A 404 on a ruleset entrypoint means "no ruleset deployed for this
// phase," a legitimate state, not an error (research.md §4).
async function cfFetchRulesetOrNull(
  path: string,
  creds: CloudflareSecurityCredentials,
  fetchImpl: typeof fetch,
): Promise<RawRuleset | null> {
  const res = await fetchImpl(`${CF_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${creds.apiToken}` },
  });

  if (res.status === 404) return null;

  let body: CloudflareAPIResponse<RawRuleset> | undefined;
  try {
    body = await res.json() as CloudflareAPIResponse<RawRuleset>;
  } catch {
    // Non-JSON error body (rare) — fall through to the generic HTTP-status
    // error below, which still carries the real status code.
  }

  if (!res.ok || !body || !body.success) {
    const detail = body?.errors?.map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new CloudflareAPIError(
      `Cloudflare API ${path} returned HTTP ${res.status}${detail ? ` (${detail})` : ""}`,
      res.status,
    );
  }
  return body.result;
}

interface RawZone {
  id: string;
  name: string;
}

interface RawSslSetting {
  value: string;
}

interface RawDnssec {
  status: string;
}

interface RawRulesetRule {
  enabled: boolean;
}

interface RawRuleset {
  rules: RawRulesetRule[];
}

interface RawTurnstileWidget {
  sitekey: string;
  name: string;
  domains: string[];
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "unknown error";
}

function hasEnabledManagedRule(ruleset: RawRuleset | null): boolean {
  return ruleset !== null && ruleset.rules.some((r) => r.enabled);
}

export async function listZones(
  creds: CloudflareSecurityCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<RawZone[]> {
  return await cfFetch<RawZone[]>(`/zones?account.id=${creds.accountId}`, creds, fetchImpl);
}

export async function getZoneSslSetting(
  creds: CloudflareSecurityCredentials,
  zoneId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const setting = await cfFetch<RawSslSetting>(`/zones/${zoneId}/settings/ssl`, creds, fetchImpl);
  return setting.value;
}

export async function getZoneDnssecStatus(
  creds: CloudflareSecurityCredentials,
  zoneId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const dnssec = await cfFetch<RawDnssec>(`/zones/${zoneId}/dnssec`, creds, fetchImpl);
  return dnssec.status;
}

export async function getZoneHasEnabledWafRule(
  creds: CloudflareSecurityCredentials,
  zoneId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const ruleset = await cfFetchRulesetOrNull(
    `/zones/${zoneId}/rulesets/phases/http_request_firewall_managed/entrypoint`,
    creds,
    fetchImpl,
  );
  return hasEnabledManagedRule(ruleset);
}

export async function getZoneHasEnabledRateLimitingRule(
  creds: CloudflareSecurityCredentials,
  zoneId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const ruleset = await cfFetchRulesetOrNull(
    `/zones/${zoneId}/rulesets/phases/http_ratelimit/entrypoint`,
    creds,
    fetchImpl,
  );
  return hasEnabledManagedRule(ruleset);
}

export async function listTurnstileWidgets(
  creds: CloudflareSecurityCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileWidget[]> {
  const widgets = await cfFetch<RawTurnstileWidget[]>(
    `/accounts/${creds.accountId}/challenges/widgets`,
    creds,
    fetchImpl,
  );
  return widgets.map((w) => ({ sitekey: w.sitekey, name: w.name, domains: w.domains }));
}

// Each of the four checks for one zone is fetched independently — a
// per-check evaluationError is scoped to that check only, since the
// other three may have succeeded.
async function fetchZoneSecuritySettings(
  creds: CloudflareSecurityCredentials,
  zone: RawZone,
  fetchImpl: typeof fetch,
): Promise<ZoneInventoryItem> {
  const [sslResult, dnssecResult, wafResult, rateLimitingResult] = await Promise.allSettled([
    getZoneSslSetting(creds, zone.id, fetchImpl),
    getZoneDnssecStatus(creds, zone.id, fetchImpl),
    getZoneHasEnabledWafRule(creds, zone.id, fetchImpl),
    getZoneHasEnabledRateLimitingRule(creds, zone.id, fetchImpl),
  ]);

  return {
    zoneId: zone.id,
    zoneName: zone.name,
    sslTls: sslResult.status === "fulfilled" ? { mode: sslResult.value } : {
      mode: null,
      evaluationError: `could not read SSL/TLS setting: ${errorMessage(sslResult.reason)}`,
    },
    dnssec: dnssecResult.status === "fulfilled" ? { status: dnssecResult.value } : {
      status: null,
      evaluationError: `could not read DNSSEC status: ${errorMessage(dnssecResult.reason)}`,
    },
    waf: wafResult.status === "fulfilled" ? { hasEnabledRule: wafResult.value } : {
      hasEnabledRule: false,
      evaluationError: `could not read WAF ruleset: ${errorMessage(wafResult.reason)}`,
    },
    rateLimiting: rateLimitingResult.status === "fulfilled"
      ? { hasEnabledRule: rateLimitingResult.value }
      : {
        hasEnabledRule: false,
        evaluationError: `could not read rate-limiting ruleset: ${
          errorMessage(rateLimitingResult.reason)
        }`,
      },
  };
}

export interface SecurityInventory {
  zones: ZoneInventoryItem[];
  // null = the Turnstile widgets list itself could not be fetched at
  // all. Turnstile is never evaluated (research.md §6), so there is no
  // not_evaluated status to fall back to — the UI must distinguish this
  // from "confirmed zero widgets" some other way (an empty array).
  turnstileWidgets: TurnstileWidget[] | null;
}

// A total failure to list zones at all surfaces as one sentinel entry
// with evaluationError set (the same resilient design Module 3's
// buildZeroTrustInventory established), so the UI shows "could not
// evaluate" rather than an empty list that would read as "confirmed
// zero" (FR-012).
export async function buildSecurityInventory(
  creds: CloudflareSecurityCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<SecurityInventory> {
  const [zonesResult, turnstileWidgets] = await Promise.all([
    listZones(creds, fetchImpl).catch((err: unknown) => err as Error),
    listTurnstileWidgets(creds, fetchImpl).catch(() => null),
  ]);

  if (zonesResult instanceof Error) {
    return {
      zones: [{
        zoneId: "(unavailable)",
        zoneName: "(unavailable)",
        sslTls: { mode: null },
        dnssec: { status: null },
        waf: { hasEnabledRule: false },
        rateLimiting: { hasEnabledRule: false },
        evaluationError: `could not list zones: ${errorMessage(zonesResult)}`,
      }],
      turnstileWidgets,
    };
  }

  // Each zone already fires 4 concurrent fetches internally
  // (fetchZoneSecuritySettings) — capping this outer loop at 1 keeps this
  // module's own peak at 4 in-flight requests, under the 6-connection
  // Workers limit (worker/concurrency.ts).
  const zones = await mapWithConcurrency(
    zonesResult,
    1,
    (zone) => fetchZoneSecuritySettings(creds, zone, fetchImpl),
  );

  return { zones, turnstileWidgets };
}
