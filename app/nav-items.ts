// The 9 sidebar destinations (Overview + Workers + the 7 existing
// modules), icon path data sourced from FlareTower's design source's own
// NAV array (12x12 viewBox shapes).
//
// Label text intentionally does NOT copy the design source's own labels
// verbatim for one remaining module — "Access" -> "Zero Trust" (specs/003's
// own established, more specific label kept per tasks.md T013).
//
// UPDATE (specs/012-workers-dashboard): the design source was updated with
// a full new "Workers" inventory-page mockup (§08), distinct from the
// existing "Exposure" mockup (§05/§06's flagship table) — a prior version
// of this file merged both into one "exposure" nav entry with the
// "Workers & Access" label, on the reasoning that the design only showed
// one combined row at the time. That reasoning no longer holds now that
// the design shows them as two separate rows with two separate icons and
// two separately-meaningful badge counts (Workers: deployed-Worker count,
// neutral tone; Exposure: critical-finding count, critical-red tone) — see
// specs/012-workers-dashboard/spec.md's own nav-split requirement. This nav
// item split reverses that prior merge decision.
//
// "overview" is new (spec.md User Story 1, FR-002 of specs/009) — the
// Overview page itself doesn't exist yet (User Story 3, a later phase of
// that same feature), so its `key` renders a placeholder page for now; see
// app/App.tsx.
export interface NavItem {
  key: string;
  label: string;
  icon: string; // SVG path `d` attribute, 12x12 viewBox
  // "critical" (default, every existing module's problem-count badge,
  // rendered in --status-critical red) vs "neutral" (a plain count that
  // isn't itself a problem — specs/012-workers-dashboard's Workers
  // deployed-count badge is the first of this kind).
  badgeTone?: "critical" | "neutral";
  // Hover tooltip shown to the right of the nav item — `tag` is the short
  // uppercase category label, `description` the one-sentence explanation.
  // Copy sourced from the design source's own NAVTIP map (keyed there by
  // the design's generic module names, not this file's more specific
  // rendered labels — see the label-mismatch note above each item).
  tooltip: { tag: string; description: string };
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    key: "overview",
    label: "Overview",
    icon: "M1 1h4v4H1Zm6 0h4v4H7ZM1 7h4v4H1Zm6 0h4v4H7Z",
    tooltip: {
      tag: "HOME",
      description:
        "The morning read: what is exposed now, what changed overnight, what needs a decision.",
    },
  },
  {
    key: "workers",
    label: "Workers",
    icon: "M6 0 11.5 3v6L6 12 0.5 9V3Z",
    badgeTone: "neutral",
    tooltip: {
      tag: "INVENTORY",
      description: "Every deployed Worker with its routes, environments, bindings and traffic.",
    },
  },
  {
    key: "exposure",
    label: "Exposure",
    icon: "M6 0.4 11.7 11.2 0.3 11.2Z",
    tooltip: {
      tag: "FLAGSHIP",
      description: "Workers x hostnames. Finds services answering on a hostname no policy covers.",
    },
  },
  {
    key: "dns",
    label: "DNS",
    icon:
      "M6 0a6 6 0 100 12A6 6 0 006 0Zm0 1.4c1 0 2.2 1.9 2.2 4.6S7 10.6 6 10.6 3.8 8.7 3.8 6 5 1.4 6 1.4Z",
    tooltip: {
      tag: "RECORDS",
      description: "All records per zone, with proxy state and dangling-target detection.",
    },
  },
  {
    key: "zero-trust",
    label: "Zero Trust",
    icon: "M3 5V3.5a3 3 0 016 0V5h1v7H2V5Zm1.6 0h2.8V3.5a1.4 1.4 0 00-2.8 0Z",
    tooltip: {
      tag: "POLICY",
      description: "Access applications and policies, and what each one actually denies.",
    },
  },
  {
    key: "pages",
    label: "Pages",
    icon: "M2 0h5l3 3v9H2Z",
    tooltip: {
      tag: "DEPLOYS",
      description:
        "Pages projects with production and preview deployments, and who can reach them.",
    },
  },
  {
    key: "storage",
    label: "R2 / KV / D1",
    icon:
      "M6 0c3 0 5 .9 5 2v8c0 1.1-2 2-5 2s-5-.9-5-2V2c0-1.1 2-2 5-2Zm0 1.2c-2.3 0-3.8.5-3.8.8S3.7 2.8 6 2.8 9.8 2.3 9.8 2 8.3 1.2 6 1.2Z",
    tooltip: {
      tag: "RESOURCES",
      description: "R2, KV and D1 with their bindings and public-read status.",
    },
  },
  {
    key: "security",
    label: "Security Posture",
    icon: "M6 0.5 11 2.4v4.2c0 2.8-2.3 4.4-5 5.4-2.7-1-5-2.6-5-5.4V2.4Z",
    tooltip: {
      tag: "BASELINE",
      description: "Zone settings and WAF rules measured against your baseline.",
    },
  },
  {
    key: "audit",
    label: "Audit & Drift",
    icon: "M2 0h8v12H2Zm1.8 2.6h4.4v1.2H3.8Zm0 3h4.4v1.2H3.8Zm0 3h2.6v1.2H3.8Z",
    tooltip: {
      tag: "HISTORY",
      description: "Who changed what, from where, and its effect on exposure.",
    },
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
    // No design-source equivalent either (same reason as the icon above) —
    // tag/description written in the same voice as the rest of NAVTIP.
    tooltip: {
      tag: "SCOPES",
      description: "Compare API token permission sets side by side before you grant or rotate one.",
    },
  },
];
