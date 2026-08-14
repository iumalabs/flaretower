import { useState } from "react";
import type { JSX } from "react";

export interface TabEntry {
  key: string;
  label: string;
  content: JSX.Element | null;
}

export interface TabStripProps {
  tabs: TabEntry[];
}

// specs/021-dashboard-panel-tabs — replaces a page's stacked SectionHeading
// blocks with tabs so reaching a lower block doesn't require scrolling past
// every earlier one. Active-tab state is plain component state, not a URL
// param (research.md §1: this app has no router and no existing URL-state
// convention to be consistent with). Styled after the chip-button pattern
// already used twice in this codebase (ZeroTrustInventory's application
// picker, AuditInventory's source filter chips) — docs/design.zip has no
// tab-pattern precedent (research.md §2).
export function TabStrip({ tabs }: TabStripProps): JSX.Element {
  const [activeKey, setActiveKey] = useState(() => tabs[0].key);
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  return (
    <div>
      <div
        role="tablist"
        style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "16px 0" }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === active.key}
            onClick={() => setActiveKey(t.key)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-label-size)",
              letterSpacing: "var(--text-label-ls)",
              textTransform: "uppercase",
              color: t.key === active.key ? "var(--fg-primary)" : "var(--fg-faint)",
              border: `1px solid ${
                t.key === active.key ? "var(--brand-primary)" : "var(--border)"
              }`,
              background: t.key === active.key ? "var(--brand-wash)" : "transparent",
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {active.content}
    </div>
  );
}
