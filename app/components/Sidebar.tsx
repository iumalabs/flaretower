import { type JSX, useState } from "react";
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
  // docs/design.zip's own nav() hover tooltip (state.tip + onMouseEnter/
  // onMouseLeave) — one item's tip shown at a time, tracked by key. Also
  // wired to focus/blur (the design source only covers mouse) so keyboard
  // users tabbing through the nav get the same detail.
  const [tipKey, setTipKey] = useState<string | null>(null);

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
              onMouseEnter={() => setTipKey(item.key)}
              onMouseLeave={() => setTipKey((k) => (k === item.key ? null : k))}
              onFocus={() => setTipKey(item.key)}
              onBlur={() => setTipKey((k) => (k === item.key ? null : k))}
              aria-current={active ? "page" : undefined}
              aria-describedby={tipKey === item.key ? `nav-tip-${item.key}` : undefined}
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
                position: "relative",
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
                    color: item.badgeTone === "neutral"
                      ? "var(--fg-faint)"
                      : "var(--status-critical)",
                  }}
                >
                  {badgeCount}
                </span>
              )}
              {tipKey === item.key && (
                <div
                  id={`nav-tip-${item.key}`}
                  role="tooltip"
                  data-testid={`nav-tooltip-${item.key}`}
                  style={{
                    position: "absolute",
                    left: "100%",
                    top: -7,
                    marginLeft: 13,
                    width: 252,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-elevated)",
                    borderLeft: "2px solid var(--brand-primary)",
                    boxShadow: "var(--shadow-elevated)",
                    padding: "11px 13px",
                    zIndex: 60,
                    pointerEvents: "none",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9.5,
                        letterSpacing: "0.16em",
                        color: "var(--brand-primary)",
                        textTransform: "uppercase",
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9.5,
                        letterSpacing: "0.1em",
                        color: "var(--fg-disabled)",
                      }}
                    >
                      {item.tooltip.tag}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 11.5,
                      lineHeight: 1.5,
                      color: "var(--fg-secondary)",
                    }}
                  >
                    {item.tooltip.description}
                  </div>
                </div>
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
