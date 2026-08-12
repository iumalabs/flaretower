// The 8 sidebar destinations (Overview + the 7 existing modules), icon
// path data sourced directly from docs/design.zip's FlareTower.dc.html
// `NAV` array (12x12 viewBox shapes, script block ~line 802).
//
// Label text intentionally does NOT copy the design source's own labels
// verbatim — this app's existing app/App.tsx PAGES array already has
// established, slightly more specific labels for two of the modules
// ("Workers" -> "Workers & Access", "Access" -> "Zero Trust"), and this
// task keeps that existing text (per tasks.md T013) rather than
// rewriting it to match the design mockup's shorter placeholder labels.
// The design source's own NAV array actually lists 9 entries (it has a
// separate "Workers" and "Exposure" row) because its mockup imagines a
// finer module split than this app currently implements — this app's
// "exposure" module covers both, so only the "Workers" icon/row is used
// here and the design's separate "Exposure" row is intentionally dropped.
//
// "overview" is new (spec.md User Story 1, FR-002) — the Overview page
// itself doesn't exist yet (User Story 3, a later phase of this same
// feature), so its `key` renders a placeholder page for now; see
// app/App.tsx.
export interface NavItem {
  key: string;
  label: string;
  icon: string; // SVG path `d` attribute, 12x12 viewBox
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    key: "overview",
    label: "Overview",
    icon: "M1 1h4v4H1Zm6 0h4v4H7ZM1 7h4v4H1Zm6 0h4v4H7Z",
  },
  {
    key: "exposure",
    label: "Workers & Access",
    icon: "M6 0 11.5 3v6L6 12 0.5 9V3Z",
  },
  {
    key: "dns",
    label: "DNS",
    icon:
      "M6 0a6 6 0 100 12A6 6 0 006 0Zm0 1.4c1 0 2.2 1.9 2.2 4.6S7 10.6 6 10.6 3.8 8.7 3.8 6 5 1.4 6 1.4Z",
  },
  {
    key: "zero-trust",
    label: "Zero Trust",
    icon: "M3 5V3.5a3 3 0 016 0V5h1v7H2V5Zm1.6 0h2.8V3.5a1.4 1.4 0 00-2.8 0Z",
  },
  {
    key: "pages",
    label: "Pages",
    icon: "M2 0h5l3 3v9H2Z",
  },
  {
    key: "storage",
    label: "R2 / KV / D1",
    icon:
      "M6 0c3 0 5 .9 5 2v8c0 1.1-2 2-5 2s-5-.9-5-2V2c0-1.1 2-2 5-2Zm0 1.2c-2.3 0-3.8.5-3.8.8S3.7 2.8 6 2.8 9.8 2.3 9.8 2 8.3 1.2 6 1.2Z",
  },
  {
    key: "security",
    label: "Security Posture",
    icon: "M6 0.5 11 2.4v4.2c0 2.8-2.3 4.4-5 5.4-2.7-1-5-2.6-5-5.4V2.4Z",
  },
  {
    key: "audit",
    label: "Audit & Drift",
    icon: "M2 0h8v12H2Zm1.8 2.6h4.4v1.2H3.8Zm0 3h4.4v1.2H3.8Zm0 3h2.6v1.2H3.8Z",
  },
  {
    // Not in docs/design.zip's own NAV array (specs/011-clone-token-permissions/
    // has no equivalent design-source screen) — hand-drawn key silhouette
    // (solid bow + shaft + two teeth) in the same solid-fill 12x12 style as
    // every icon above, noted explicitly per the constitution's Design
    // System section.
    key: "token-tools",
    label: "Token Tools",
    icon:
      "M3 3.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5Zm2.1 1.8h6.9v1.4H5.1ZM9.4 6.7h1v1.8h-1Zm2 0h.9v1.4h-.9Z",
  },
];
