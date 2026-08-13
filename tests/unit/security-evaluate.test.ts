import { assertEquals } from "@std/assert";
import {
  classifyCertificateExpiry,
  classifyCustomWafRule,
  evaluateAlwaysUseHttps,
  evaluateBotFightMode,
  evaluateDnssec,
  evaluateMinTlsVersion,
  evaluateRateLimiting,
  evaluateSslTlsMode,
  evaluateWaf,
  rollUpZoneStatus,
  selectActiveCertificate,
} from "../../worker/modules/security/evaluate.ts";
import type {
  CertificateCandidate,
  ZoneInventoryItem,
} from "../../worker/modules/security/types.ts";

function zone(overrides: Partial<ZoneInventoryItem> = {}): ZoneInventoryItem {
  return {
    zoneId: "zone-1",
    zoneName: "example.com",
    sslTls: { mode: "strict" },
    dnssec: { status: "active" },
    waf: { hasEnabledRule: true },
    rateLimiting: { hasEnabledRule: true },
    botFightMode: { value: "on" },
    alwaysUseHttps: { value: "on" },
    minTlsVersion: { value: "1.2" },
    ...overrides,
  };
}

Deno.test("evaluateSslTlsMode - critical when mode is off", () => {
  const result = evaluateSslTlsMode(zone({ sslTls: { mode: "off" } }));
  assertEquals(result.status, "critical");
});

Deno.test("evaluateSslTlsMode - critical when mode is flexible", () => {
  const result = evaluateSslTlsMode(zone({ sslTls: { mode: "flexible" } }));
  assertEquals(result.status, "critical");
});

Deno.test("evaluateSslTlsMode - warning when mode is full", () => {
  const result = evaluateSslTlsMode(zone({ sslTls: { mode: "full" } }));
  assertEquals(result.status, "warning");
});

Deno.test("evaluateSslTlsMode - safe when mode is strict", () => {
  const result = evaluateSslTlsMode(zone({ sslTls: { mode: "strict" } }));
  assertEquals(result.status, "safe");
});

Deno.test("evaluateSslTlsMode - safe when mode is origin_pull (Enterprise strict variant)", () => {
  const result = evaluateSslTlsMode(zone({ sslTls: { mode: "origin_pull" } }));
  assertEquals(result.status, "safe");
});

Deno.test("evaluateSslTlsMode - not_evaluated when the SSL/TLS setting itself has an evaluationError", () => {
  const result = evaluateSslTlsMode(
    zone({ sslTls: { mode: null, evaluationError: "could not read SSL/TLS setting" } }),
  );
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateSslTlsMode - not_evaluated when the zone itself is a sentinel entry, takes priority over everything else", () => {
  const result = evaluateSslTlsMode(
    zone({ sslTls: { mode: "off" }, evaluationError: "could not list zones: network error" }),
  );
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateDnssec - safe when active", () => {
  const result = evaluateDnssec(zone({ dnssec: { status: "active" } }));
  assertEquals(result.status, "safe");
});

Deno.test("evaluateDnssec - warning when disabled", () => {
  const result = evaluateDnssec(zone({ dnssec: { status: "disabled" } }));
  assertEquals(result.status, "warning");
});

Deno.test("evaluateDnssec - warning when pending", () => {
  const result = evaluateDnssec(zone({ dnssec: { status: "pending" } }));
  assertEquals(result.status, "warning");
});

Deno.test("evaluateDnssec - warning when pending-disabled", () => {
  const result = evaluateDnssec(zone({ dnssec: { status: "pending-disabled" } }));
  assertEquals(result.status, "warning");
});

Deno.test("evaluateDnssec - not_evaluated when status is error (not guessed safe or warning)", () => {
  const result = evaluateDnssec(zone({ dnssec: { status: "error" } }));
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateDnssec - not_evaluated when the DNSSEC check itself has an evaluationError", () => {
  const result = evaluateDnssec(
    zone({ dnssec: { status: null, evaluationError: "could not read DNSSEC status" } }),
  );
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateWaf - safe when a managed ruleset has at least one enabled rule", () => {
  const result = evaluateWaf(zone({ waf: { hasEnabledRule: true } }));
  assertEquals(result.status, "safe");
});

Deno.test("evaluateWaf - warning when no managed ruleset is deployed (or every rule disabled)", () => {
  const result = evaluateWaf(zone({ waf: { hasEnabledRule: false } }));
  assertEquals(result.status, "warning");
});

Deno.test("evaluateWaf - not_evaluated when the WAF check itself has an evaluationError", () => {
  const result = evaluateWaf(
    zone({ waf: { hasEnabledRule: false, evaluationError: "could not read WAF ruleset" } }),
  );
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateRateLimiting - safe when a ruleset has at least one enabled rule", () => {
  const result = evaluateRateLimiting(zone({ rateLimiting: { hasEnabledRule: true } }));
  assertEquals(result.status, "safe");
});

Deno.test("evaluateRateLimiting - warning when no ruleset is deployed (or every rule disabled)", () => {
  const result = evaluateRateLimiting(zone({ rateLimiting: { hasEnabledRule: false } }));
  assertEquals(result.status, "warning");
});

Deno.test("evaluateRateLimiting - not_evaluated when the rate-limiting check itself has an evaluationError", () => {
  const result = evaluateRateLimiting(
    zone({
      rateLimiting: {
        hasEnabledRule: false,
        evaluationError: "could not read rate-limiting ruleset",
      },
    }),
  );
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateDnssec/evaluateWaf/evaluateRateLimiting - not_evaluated when the zone itself is a sentinel entry", () => {
  const sentinel = zone({ evaluationError: "could not list zones: network error" });
  assertEquals(evaluateDnssec(sentinel).status, "not_evaluated");
  assertEquals(evaluateWaf(sentinel).status, "not_evaluated");
  assertEquals(evaluateRateLimiting(sentinel).status, "not_evaluated");
});

// specs/017-security-dashboard research.md §3
Deno.test("evaluateBotFightMode - safe when on, warning when off", () => {
  assertEquals(evaluateBotFightMode(zone({ botFightMode: { value: "on" } })).status, "safe");
  assertEquals(evaluateBotFightMode(zone({ botFightMode: { value: "off" } })).status, "warning");
});

Deno.test("evaluateBotFightMode - not_evaluated when the setting itself has an evaluationError", () => {
  const result = evaluateBotFightMode(
    zone({
      botFightMode: { value: null, evaluationError: "could not read Bot Fight Mode setting" },
    }),
  );
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateAlwaysUseHttps - safe when on, warning when off", () => {
  assertEquals(evaluateAlwaysUseHttps(zone({ alwaysUseHttps: { value: "on" } })).status, "safe");
  assertEquals(
    evaluateAlwaysUseHttps(zone({ alwaysUseHttps: { value: "off" } })).status,
    "warning",
  );
});

Deno.test("evaluateMinTlsVersion - safe when 1.2 or 1.3, warning when 1.0 or 1.1", () => {
  assertEquals(evaluateMinTlsVersion(zone({ minTlsVersion: { value: "1.2" } })).status, "safe");
  assertEquals(evaluateMinTlsVersion(zone({ minTlsVersion: { value: "1.3" } })).status, "safe");
  assertEquals(
    evaluateMinTlsVersion(zone({ minTlsVersion: { value: "1.0" } })).status,
    "warning",
  );
  assertEquals(
    evaluateMinTlsVersion(zone({ minTlsVersion: { value: "1.1" } })).status,
    "warning",
  );
});

Deno.test("evaluateBotFightMode/evaluateAlwaysUseHttps/evaluateMinTlsVersion - not_evaluated when the zone itself is a sentinel entry", () => {
  const sentinel = zone({ evaluationError: "could not list zones: network error" });
  assertEquals(evaluateBotFightMode(sentinel).status, "not_evaluated");
  assertEquals(evaluateAlwaysUseHttps(sentinel).status, "not_evaluated");
  assertEquals(evaluateMinTlsVersion(sentinel).status, "not_evaluated");
});

// specs/017-security-dashboard research.md §2
Deno.test("rollUpZoneStatus - critical outranks everything", () => {
  assertEquals(rollUpZoneStatus(["safe", "warning", "critical", "not_evaluated"]), "critical");
});

Deno.test("rollUpZoneStatus - warning outranks safe and not_evaluated", () => {
  assertEquals(rollUpZoneStatus(["safe", "not_evaluated", "warning"]), "warning");
});

Deno.test("rollUpZoneStatus - not_evaluated outranks safe (never silently present as safe)", () => {
  assertEquals(rollUpZoneStatus(["safe", "not_evaluated"]), "not_evaluated");
});

Deno.test("rollUpZoneStatus - all safe -> safe", () => {
  assertEquals(rollUpZoneStatus(["safe", "safe", "safe"]), "safe");
});

Deno.test("rollUpZoneStatus - empty array -> safe (no checks to roll up)", () => {
  assertEquals(rollUpZoneStatus([]), "safe");
});

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function cert(overrides: Partial<CertificateCandidate> = {}): CertificateCandidate {
  return {
    packStatus: "active",
    hosts: ["example.com"],
    issuer: "Let's Encrypt",
    expiresOn: daysFromNow(60),
    ...overrides,
  };
}

// specs/017-security-dashboard research.md §5
Deno.test("selectActiveCertificate - picks the soonest-expiring certificate among active packs", () => {
  const soonest = cert({ expiresOn: daysFromNow(10) });
  const later = cert({ expiresOn: daysFromNow(90) });
  assertEquals(selectActiveCertificate([later, soonest]), soonest);
});

Deno.test("selectActiveCertificate - ignores non-active packs", () => {
  const active = cert({ packStatus: "active", expiresOn: daysFromNow(90) });
  const pending = cert({ packStatus: "pending_validation", expiresOn: daysFromNow(1) });
  assertEquals(selectActiveCertificate([pending, active]), active);
});

Deno.test("selectActiveCertificate - null when no pack is active", () => {
  assertEquals(selectActiveCertificate([cert({ packStatus: "pending_validation" })]), null);
});

Deno.test("classifyCertificateExpiry - warning within 30 days, safe beyond, not_evaluated when null", () => {
  assertEquals(classifyCertificateExpiry(daysFromNow(10)), "warning");
  assertEquals(classifyCertificateExpiry(daysFromNow(60)), "safe");
  assertEquals(classifyCertificateExpiry(null), "not_evaluated");
});

// specs/017-security-dashboard research.md §6
Deno.test("classifyCustomWafRule - disabled is not_evaluated, enabled+skip is warning, other enabled actions are safe", () => {
  assertEquals(classifyCustomWafRule({ enabled: false, action: "block" }), "not_evaluated");
  assertEquals(classifyCustomWafRule({ enabled: true, action: "skip" }), "warning");
  assertEquals(classifyCustomWafRule({ enabled: true, action: "block" }), "safe");
  assertEquals(classifyCustomWafRule({ enabled: true, action: "challenge" }), "safe");
});
