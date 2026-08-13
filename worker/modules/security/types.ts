export type SslTlsStatus = "safe" | "warning" | "critical" | "not_evaluated";
export type ProtectionStatus = "safe" | "warning" | "not_evaluated";
// specs/017-security-dashboard research.md §2 — the full 4-value status
// space, used for the zone-row overall rollup (which must be able to
// reach "critical" via the SSL/TLS check) and for the live-fetched
// Certificates/WAF Custom Rules panels.
export type ExposureStatus = SslTlsStatus;

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

// specs/017-security-dashboard research.md §3 — the same generic
// zone-settings shape SslTlsSetting/DnssecSetting already use. Raw
// Cloudflare value: "on" | "off" for Bot Fight Mode/Always Use HTTPS,
// "1.0" | "1.1" | "1.2" | "1.3" for Minimum TLS Version.
export interface ZoneSettingValue {
  value: string | null;
  evaluationError?: string;
}

export type SettingStatus = "safe" | "warning" | "not_evaluated";

export interface ZoneInventoryItem {
  zoneId: string;
  zoneName: string;
  sslTls: SslTlsSetting;
  dnssec: DnssecSetting;
  waf: RulesetPresence;
  rateLimiting: RulesetPresence;
  botFightMode: ZoneSettingValue;
  alwaysUseHttps: ZoneSettingValue;
  minTlsVersion: ZoneSettingValue;
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

export interface BotFightModeEvaluation {
  zoneId: string;
  zoneName: string;
  status: SettingStatus;
  reason: string;
}

export interface AlwaysHttpsEvaluation {
  zoneId: string;
  zoneName: string;
  status: SettingStatus;
  reason: string;
}

export interface MinTlsVersionEvaluation {
  zoneId: string;
  zoneName: string;
  status: SettingStatus;
  reason: string;
}

// specs/017-security-dashboard research.md §5/§6 — live-fetched panels,
// never persisted (not D1 row shapes).
// research.md §5/§6 — the lightly-mapped shape inventory.ts's live-fetch
// functions return, before evaluate.ts picks/classifies one into the
// zone-identified rows below (kept in types.ts, not inventory.ts, so
// evaluate.ts only ever imports from types.ts — never from inventory.ts
// directly — matching every other module in this project).
export interface CertificateCandidate {
  packStatus: string;
  hosts: string[];
  issuer: string;
  expiresOn: string;
}

export interface CustomWafRuleCandidate {
  description?: string;
  expression?: string;
  action?: string;
  enabled: boolean;
}

export interface ZoneCertificate {
  zoneId: string;
  zoneName: string;
  hosts: string[];
  issuer: string;
  expiresOn: string | null;
  status: SettingStatus;
}

export interface CustomWafRule {
  zoneId: string;
  zoneName: string;
  description: string;
  expression: string;
  action: string;
  enabled: boolean;
  status: SettingStatus;
}
