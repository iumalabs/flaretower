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
  // `version` renders under the logo in the header, not the footer — moved
  // there so it's visible without scrolling on a tall nav list. `account`
  // still renders in the footer block at the bottom.
  footer?: { account?: string; version?: string };
}

// The 214px left sidebar (docs/design.zip's reference screens 05/06/07 all
// share this exact pattern) — logo header (+ version), nav items with
// active-state edge bar + background tint, optional numeric badges, and an
// optional account footer block.
export function Sidebar(
  { items, activeKey, onSelect, badges = [], footer }: SidebarProps,
): JSX.Element {
  const badgeByKey = new Map(badges.map((b) => [b.key, b.count]));
  // The live Claude Design project's own nav() hover tooltip (state.tip +
  // onMouseEnter/onMouseLeave, not in docs/design.zip which lags it) — one
  // item's tip shown at a time, tracked by key. Also wired to focus/blur
  // (the design source only covers mouse) so keyboard users tabbing
  // through the nav get the same detail.
  //
  // issue #408: the design source floats this ~250px to the right of the
  // nav item, which on a 214px sidebar lands it deep inside the main
  // content pane — reproducibly hiding a CRITICAL-severity row on Exposure/
  // DNS while a user is just scanning the sidebar. Rendered below (or
  // above, for the last couple of items) the item instead, sized to the
  // sidebar's own width, so it never overlaps content — a deliberate
  // deviation from the design source for a real usability bug, not a
  // faithfulness gap.
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
          flexDirection: "column",
          gap: 6,
          padding: "18px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Logo variant="lockup" theme="dark" size={24} />
        {footer?.version && (
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

      <nav style={{ padding: "14px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((item, index) => {
          const active = item.key === activeKey;
          const badgeCount = badgeByKey.get(item.key);
          // Flip the last couple of items' tooltips upward so they don't
          // render below the nav list and get clipped by the footer block.
          const tipAbove = index >= items.length - 2;
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
                    // Stretches to the sidebar's own width (cancels nav's
                    // 10px horizontal padding on both sides) instead of
                    // floating right into the content pane — see issue
                    // #408 in the comment above this component.
                    left: -10,
                    right: -10,
                    ...(tipAbove
                      ? { bottom: "100%", marginBottom: 6 }
                      : { top: "100%", marginTop: 6 }),
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-elevated)",
                    borderTop: tipAbove
                      ? "1px solid var(--border-elevated)"
                      : "2px solid var(--brand-primary)",
                    borderBottom: tipAbove
                      ? "2px solid var(--brand-primary)"
                      : "1px solid var(--border-elevated)",
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

      {footer?.account && (
        <div
          style={{
            marginTop: "auto",
            padding: 14,
            borderTop: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-meta-size)",
              color: "var(--fg-faint)",
            }}
          >
            {footer.account}
          </div>
        </div>
      )}
    </div>
  );
}
