import type { JSX } from "react";
import { Logo } from "./Logo.tsx";
import type { NavItem } from "../nav-items.ts";

export interface SidebarBadge {
  key: string;
  count: number;
}

interface SidebarProps {
  items: readonly NavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  badges?: readonly SidebarBadge[];
  footer?: { account?: string; version?: string };
}

// The 214px left sidebar (docs/design.zip's reference screens 05/06/07 all
// share this exact pattern) — logo header, nav items with active-state
// edge bar + background tint, optional numeric badges, and a footer block.
export function Sidebar(
  { items, activeKey, onSelect, badges = [], footer }: SidebarProps,
): JSX.Element {
  const badgeByKey = new Map(badges.map((b) => [b.key, b.count]));

  return (
    <div
      style={{
        width: 214,
        flex: "none",
        background: "var(--bg-base)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "18px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Logo variant="lockup" theme="dark" size={24} />
      </div>

      <nav style={{ padding: "14px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((item) => {
          const active = item.key === activeKey;
          const badgeCount = badgeByKey.get(item.key);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              aria-current={active ? "page" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "7px 10px",
                background: active ? "var(--surface-nav-active)" : "transparent",
                border: "none",
                borderLeft: `2px solid ${active ? "var(--brand-primary)" : "transparent"}`,
                borderRadius: 0,
                cursor: "pointer",
                font: "inherit",
                textAlign: "left",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path
                    d={item.icon}
                    fill={active ? "var(--fg-primary)" : "var(--fg-nav-inactive)"}
                  />
                </svg>
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    color: active ? "var(--fg-primary)" : "var(--fg-nav-inactive)",
                  }}
                >
                  {item.label}
                </span>
              </span>
              {badgeCount !== undefined && badgeCount > 0 && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--status-critical)",
                  }}
                >
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {(footer?.account || footer?.version) && (
        <div
          style={{
            marginTop: "auto",
            padding: 14,
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {footer.account && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-meta-size)",
                color: "var(--fg-faint)",
              }}
            >
              {footer.account}
            </div>
          )}
          {footer.version && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-meta-size)",
                color: "var(--fg-faint)",
              }}
            >
              {footer.version}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
