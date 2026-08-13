// Pure evaluation logic. No network or D1 access here (constitution
// Principle III) so the fetch and scheduled entry points share this
// identically.
import type {
  AlwaysHttpsEvaluation,
  BotFightModeEvaluation,
  CertificateCandidate,
  CustomWafRuleCandidate,
  DnssecEvaluation,
  ExposureStatus,
  MinTlsVersionEvaluation,
  RateLimitingEvaluation,
  SettingStatus,
  SslTlsEvaluation,
  WafEvaluation,
  ZoneInventoryItem,
} from "./types.ts";

// specs/017-security-dashboard research.md §2 — identical ranking and
// reduce-to-worst logic to worker/modules/workers-dashboard/classify.ts's
// rollUpExposureStatus() (duplicated locally per this rollout's
// established "duplication beats premature cross-module coupling"
// precedent).
const SEVERITY: Record<ExposureStatus, number> = {
  critical: 3,
  warning: 2,
  not_evaluated: 1,
  safe: 0,
};

export function rollUpZoneStatus(statuses: readonly ExposureStatus[]): ExposureStatus {
  if (statuses.length === 0) return "safe";
  return statuses.reduce((worst, status) => (SEVERITY[status] > SEVERITY[worst] ? status : worst));
}

// research.md §2 — direct enum-to-status mapping, no Access-coverage
// logic needed (SSL/TLS mode is a single zone-wide setting, not a
// per-hostname question).
export function evaluateSslTlsMode(zone: ZoneInventoryItem): SslTlsEvaluation {
  if (zone.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.evaluationError,
    };
  }
  if (zone.sslTls.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.sslTls.evaluationError,
    };
  }

  const mode = zone.sslTls.mode;

  if (mode === "off") {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "critical",
      reason: "SSL/TLS mode is Off — visitor traffic is not encrypted at all",
    };
  }

  if (mode === "flexible") {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "critical",
      reason:
        "SSL/TLS mode is Flexible — the connection between Cloudflare and the origin is unencrypted",
    };
  }

  if (mode === "full") {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "warning",
      reason:
        "SSL/TLS mode is Full — both hops are encrypted, but Cloudflare does not validate the origin's certificate",
    };
  }

  // "strict" and the Enterprise-only "origin_pull" variant are both
  // fully encrypted with origin certificate validation.
  return {
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    status: "safe",
    reason: `SSL/TLS mode is ${
      mode === "origin_pull" ? "Strict (SSL-Only Origin Pull)" : "Full (strict)"
    }`,
  };
}

// research.md §3. "pending"/"pending-disabled" are both "not yet
// providing protection, whichever direction the zone is transitioning"
// per spec User Story 3, Acceptance Scenario 2 — both warning, same as
// "disabled". "error" means the API itself couldn't determine the real
// state, so this can't claim either safe or warning (spec Edge Cases).
export function evaluateDnssec(zone: ZoneInventoryItem): DnssecEvaluation {
  if (zone.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.evaluationError,
    };
  }
  if (zone.dnssec.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.dnssec.evaluationError,
    };
  }

  const status = zone.dnssec.status;

  if (status === "active") {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "safe",
      reason: "DNSSEC is active",
    };
  }

  if (status === "error") {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: "DNSSEC status could not be determined (Cloudflare reported an error state)",
    };
  }

  return {
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    status: "warning",
    reason: `DNSSEC is not yet providing protection (status: ${status})`,
  };
}

// research.md §4. The reduction from "ruleset entrypoint + rules[]" to a
// single hasEnabledRule boolean already happened in inventory.ts's
// hasEnabledManagedRule() (shared by both this check and the
// rate-limiting check below, since they read the same shape from two
// different ruleset phases) — this function only maps that boolean to a
// status.
export function evaluateWaf(zone: ZoneInventoryItem): WafEvaluation {
  if (zone.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.evaluationError,
    };
  }
  if (zone.waf.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.waf.evaluationError,
    };
  }
  if (zone.waf.hasEnabledRule) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "safe",
      reason: "a WAF managed ruleset is deployed with at least one enabled rule",
    };
  }
  return {
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    status: "warning",
    reason: "no WAF managed ruleset deployed, or every rule in it is disabled",
  };
}

// research.md §5 — structurally identical to evaluateWaf(), just reading
// the rate-limiting phase's reduced boolean instead.
export function evaluateRateLimiting(zone: ZoneInventoryItem): RateLimitingEvaluation {
  if (zone.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.evaluationError,
    };
  }
  if (zone.rateLimiting.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.rateLimiting.evaluationError,
    };
  }
  if (zone.rateLimiting.hasEnabledRule) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "safe",
      reason: "a rate-limiting ruleset is deployed with at least one enabled rule",
    };
  }
  return {
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    status: "warning",
    reason: "no rate-limiting ruleset deployed, or every rule in it is disabled",
  };
}

// research.md §3 — on = safe, off = warning (a free, no-tradeoff
// setting; off is a real, actionable gap).
export function evaluateBotFightMode(zone: ZoneInventoryItem): BotFightModeEvaluation {
  if (zone.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.evaluationError,
    };
  }
  if (zone.botFightMode.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.botFightMode.evaluationError,
    };
  }
  if (zone.botFightMode.value === "on") {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "safe",
      reason: "Bot Fight Mode is on",
    };
  }
  return {
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    status: "warning",
    reason: "Bot Fight Mode is off",
  };
}

// research.md §3 — structurally identical to evaluateBotFightMode().
export function evaluateAlwaysUseHttps(zone: ZoneInventoryItem): AlwaysHttpsEvaluation {
  if (zone.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.evaluationError,
    };
  }
  if (zone.alwaysUseHttps.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.alwaysUseHttps.evaluationError,
    };
  }
  if (zone.alwaysUseHttps.value === "on") {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "safe",
      reason: "Always Use HTTPS is on",
    };
  }
  return {
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    status: "warning",
    reason: "Always Use HTTPS is off",
  };
}

// research.md §3 — 1.2/1.3 = safe, 1.0/1.1 = warning (TLS 1.0/1.1 are
// formally deprecated).
export function evaluateMinTlsVersion(zone: ZoneInventoryItem): MinTlsVersionEvaluation {
  if (zone.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.evaluationError,
    };
  }
  if (zone.minTlsVersion.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.minTlsVersion.evaluationError,
    };
  }
  const version = zone.minTlsVersion.value;
  if (version === "1.2" || version === "1.3") {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "safe",
      reason: `minimum TLS version is ${version}`,
    };
  }
  return {
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    status: "warning",
    reason: `minimum TLS version is ${version} — TLS 1.0/1.1 are deprecated`,
  };
}

export function evaluateSslTlsModes(zones: ZoneInventoryItem[]): SslTlsEvaluation[] {
  return zones.map(evaluateSslTlsMode);
}

export function evaluateDnssecs(zones: ZoneInventoryItem[]): DnssecEvaluation[] {
  return zones.map(evaluateDnssec);
}

export function evaluateWafs(zones: ZoneInventoryItem[]): WafEvaluation[] {
  return zones.map(evaluateWaf);
}

export function evaluateRateLimitings(zones: ZoneInventoryItem[]): RateLimitingEvaluation[] {
  return zones.map(evaluateRateLimiting);
}

export function evaluateBotFightModes(zones: ZoneInventoryItem[]): BotFightModeEvaluation[] {
  return zones.map(evaluateBotFightMode);
}

export function evaluateAlwaysUseHttpses(zones: ZoneInventoryItem[]): AlwaysHttpsEvaluation[] {
  return zones.map(evaluateAlwaysUseHttps);
}

export function evaluateMinTlsVersions(zones: ZoneInventoryItem[]): MinTlsVersionEvaluation[] {
  return zones.map(evaluateMinTlsVersion);
}

// research.md §5 — among certificates belonging to an active pack, the
// one expiring soonest is the one that would actually cause a problem
// first. null (no active pack) is a legitimate state, not an error.
export function selectActiveCertificate(
  certificates: readonly CertificateCandidate[],
): CertificateCandidate | null {
  const active = certificates.filter((c) => c.packStatus === "active");
  if (active.length === 0) return null;
  return active.reduce((soonest, c) =>
    new Date(c.expiresOn).getTime() < new Date(soonest.expiresOn).getTime() ? c : soonest
  );
}

// research.md §5 — <30 days = warning, else safe, null (no active
// certificate found) = not_evaluated, never a fabricated expiry.
export function classifyCertificateExpiry(expiresOn: string | null): SettingStatus {
  if (expiresOn === null) return "not_evaluated";
  const daysUntilExpiry = (new Date(expiresOn).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return daysUntilExpiry < 30 ? "warning" : "safe";
}

// research.md §6 — disabled = not_evaluated (parked, no risk judgment to
// make), enabled+skip = warning (bypasses WAF protection for matching
// traffic), any other enabled action = safe.
export function classifyCustomWafRule(rule: CustomWafRuleCandidate): SettingStatus {
  if (!rule.enabled) return "not_evaluated";
  if (rule.action === "skip") return "warning";
  return "safe";
}
