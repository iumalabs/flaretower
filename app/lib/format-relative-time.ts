// Deliberately coarse (originally app/pages/PagesInventory.tsx's build-time
// display — build duration/stage timing is out of scope there); this only
// answers "how long ago," not "how long did it take." Extracted for reuse
// by app/pages/OverviewPage.tsx's "last scanned" indicator
// (specs/027-overview-dashboard-redesign).
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "not available";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "not available";
  // Clamped at 0 — a timestamp slightly ahead of the client clock (clock
  // skew, or a fast render right after a build/scan completes) must read
  // as "just now," never as a negative duration.
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}
