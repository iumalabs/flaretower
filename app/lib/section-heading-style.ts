// A panel/section heading ("Findings", "Scan log" on OverviewPage.tsx) is
// plain body text at weight 600 — distinct from --text-label, which is a
// small mono/uppercase token meant for table column headers and badges
// (specs/009-design-system-alignment/research.md). Shared here after the
// same mono/uppercase style got copy-pasted onto several section headings
// by mistake (issue #432) — a single constant makes that mix-up harder to
// repeat than six independent inline style objects.
export const SECTION_HEADING_STYLE = {
  fontSize: "var(--text-body-size)",
  fontWeight: 600,
};
