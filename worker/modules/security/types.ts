export type SslTlsStatus = "safe" | "warning" | "critical" | "not_evaluated";
export type ProtectionStatus = "safe" | "warning" | "not_evaluated";

export interface SslTlsSetting {
  // Raw Cloudflare value: "off" | "flexible" | "full" | "strict" |
  // "origin_pull". null when evaluationError is set.
  mode: string | null;
  evaluationError?: string;
}

export interface DnssecSetting {
  // Raw Cloudflare status: "active" | "pending" | "disabled" |
  // "pending-disabled" | "error". null when evaluationError is set.
  status: string | null;
  evaluationError?: string;
}

export interface RulesetPresence {
  // Whether the phase's entrypoint ruleset exists AND has at least one
  // enabled rule. false (not meaningful) when evaluationError is set.
  hasEnabledRule: boolean;
  evaluationError?: string;
}

export interface ZoneInventoryItem {
  zoneId: string;
  zoneName: string;
  sslTls: SslTlsSetting;
  dnssec: DnssecSetting;
  waf: RulesetPresence;
  rateLimiting: RulesetPresence;
  // Set only as a sentinel entry when the whole zones list itself failed
  // entirely (inventory.ts's buildSecurityInventory) — every per-check
  // evaluate function checks this first, before its own sub-field's
  // evaluationError.
  evaluationError?: string;
}

export interface TurnstileWidget {
  sitekey: string;
  name: string;
  domains: string[];
}

export interface SslTlsEvaluation {
  zoneId: string;
  zoneName: string;
  status: SslTlsStatus;
  reason: string;
}

export interface DnssecEvaluation {
  zoneId: string;
  zoneName: string;
  status: ProtectionStatus;
  reason: string;
}

export interface WafEvaluation {
  zoneId: string;
  zoneName: string;
  status: ProtectionStatus;
  reason: string;
}

export interface RateLimitingEvaluation {
  zoneId: string;
  zoneName: string;
  status: ProtectionStatus;
  reason: string;
}
