import { useEffect, useState } from "react";
import type { JSX } from "react";
import { Logo } from "../components/Logo.tsx";
import {
  type ChangelogRelease,
  type ChangelogSegment,
  parseChangelog,
} from "../lib/changelog-parser.ts";

// issue #528 — public, reachable regardless of session state, same as
// DocumentationPage.tsx. Renders the repo's real CHANGELOG.md (fetched from
// /CHANGELOG.md — vite.config.ts's changelogPlugin is what puts it there)
// rather than a hand-authored duplicate, so this page can never drift from
// what actually shipped the way /docs' Deploy it section once did (#525).
async function fetchChangelog(): Promise<ChangelogRelease[]> {
  const res = await fetch("/CHANGELOG.md");
  if (!res.ok) {
    throw new Error(`GET /CHANGELOG.md failed: ${res.status}`);
  }
  return parseChangelog(await res.text());
}

const CATEGORY_COLOR: Record<string, string> = {
  "Features": "var(--status-safe-fg)",
  "Bug Fixes": "var(--status-warning-fg)",
};
const DEFAULT_CATEGORY_COLOR = "var(--fg-faint)";

function Segments({ segments }: { segments: ChangelogSegment[] }): JSX.Element {
  return (
    <>
      {segments.map((s, i) => {
        if (s.type === "link") {
          return (
            <a key={i} href={s.href} style={{ color: "var(--brand-primary)" }}>
              {s.text}
            </a>
          );
        }
        if (s.type === "bold") {
          return <strong key={i}>{s.value}</strong>;
        }
        return <span key={i}>{s.value}</span>;
      })}
    </>
  );
}

function ReleaseEntry({ release }: { release: ChangelogRelease }): JSX.Element {
  return (
    <section style={{ padding: "22px 0", borderBottom: "1px solid var(--rule-hairline)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
        {release.compareHref
          ? (
            <a
              href={release.compareHref}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 18,
                fontWeight: 600,
                color: "var(--fg-primary)",
                textDecoration: "none",
              }}
            >
              v{release.version}
            </a>
          )
          : (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 600 }}>
              v{release.version}
            </span>
          )}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-meta-size)",
            color: "var(--fg-faint)",
          }}
        >
          {release.date}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {release.items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span
              style={{
                width: 84,
                flex: "none",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-label-size)",
                letterSpacing: "var(--text-label-ls)",
                textTransform: "uppercase",
                color: CATEGORY_COLOR[item.category] ?? DEFAULT_CATEGORY_COLOR,
              }}
            >
              {item.category}
            </span>
            <span style={{ fontSize: "var(--text-body-size)", color: "var(--fg-muted)" }}>
              <Segments segments={item.segments} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ChangelogPage(
  { onSignIn, onBack, onNavigateToDocs }: {
    onSignIn: () => void;
    onBack: () => void;
    onNavigateToDocs: () => void;
  },
): JSX.Element {
  const [releases, setReleases] = useState<ChangelogRelease[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchChangelog()
      .then(setReleases)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load the changelog")
      );
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--fg-primary)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-canvas)",
        }}
      >
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <button
              type="button"
              onClick={onBack}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
              aria-label="Back to home"
            >
              <Logo variant="lockup" size={22} />
            </button>
            <button
              type="button"
              onClick={onBack}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "var(--fg-faint)",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-label-size)",
                letterSpacing: "var(--text-label-ls)",
                cursor: "pointer",
              }}
            >
              ← BACK
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              type="button"
              onClick={onNavigateToDocs}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "var(--fg-faint)",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-label-size)",
                letterSpacing: "var(--text-label-ls)",
                cursor: "pointer",
              }}
            >
              DOCUMENTATION
            </button>
            <button
              type="button"
              onClick={onSignIn}
              style={{
                background: "var(--brand-primary)",
                color: "var(--bg-base)",
                border: "none",
                padding: "7px 14px",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-label-size)",
                letterSpacing: "var(--text-label-ls)",
              }}
            >
              SIGN IN
            </button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 80px" }}>
        <h1
          style={{
            fontSize: "var(--text-display-size)",
            fontWeight: "var(--text-display-weight)" as unknown as number,
            letterSpacing: "var(--text-display-ls)",
            margin: "0 0 8px",
          }}
        >
          Changelog
        </h1>
        <p style={{ margin: "0 0 32px", lineHeight: 1.6, color: "var(--fg-muted)" }}>
          Every release, generated straight from this project's own{" "}
          <a
            href="https://github.com/iumalabs/flaretower/blob/main/CHANGELOG.md"
            style={{ color: "var(--brand-primary)" }}
          >
            CHANGELOG.md
          </a>.
        </p>

        {error && <p style={{ color: "var(--status-critical-fg)" }}>{error}</p>}
        {!error && releases === null && (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
            <Logo variant="mono" size={28} />
          </div>
        )}
        {!error && releases !== null && (
          releases.length === 0
            ? <p style={{ color: "var(--fg-muted)" }}>No releases yet.</p>
            : releases.map((r) => <ReleaseEntry key={r.version} release={r} />)
        )}
      </div>
    </div>
  );
}
