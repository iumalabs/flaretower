import type { JSX } from "react";

// The FlareTower mark (docs/design.zip's FlareTower.dc.html, "IDENTITY"
// section) — a beacon on a tower, deliberately not derived from
// Cloudflare's own branding. Three treatments, per the design source:
//  - "lockup": full-color mark + wordmark, for the Sidebar header.
//  - "mono": icon-only, single foreground color, for loading/empty states
//    where the brand-orange treatment would compete with status colors.
//  - "tile": icon on the gradient app-tile background — the same
//    treatment already used in app/public/favicon.svg (kept in sync with
//    that file's path data intentionally).
export type LogoVariant = "lockup" | "mono" | "tile";
export type LogoTheme = "dark" | "light";

interface LogoProps {
  variant: LogoVariant;
  theme?: LogoTheme;
  size?: number;
}

// Colors are hardcoded here, not tokens.css custom properties, because an
// SVG's own `stroke`/`fill` attributes cannot reference CSS custom
// properties reliably across every rendering context this component is
// used in (see app/public/favicon.svg's identical exception, documented
// there). This is the one other place — besides that favicon file — the
// Design System section's "no hardcoded hex outside tokens.css" rule
// grants a deliberate exception, kept to exactly the values the mark's
// own identity spec requires.
const DARK_ARC = "#FBAD41";
const DARK_TOWER = "#F6821F";
const LIGHT_ARC = "#E07A16";
const LIGHT_TOWER = "#1C140D";
const MONO_DARK = "#F2EBE3";
const MONO_LIGHT = "#1C140D";
const TILE_MARK = "#1A0F05";

function Mark(
  { theme = "dark", size = 24 }: { theme?: LogoTheme; size?: number },
): JSX.Element {
  const arc = theme === "dark" ? DARK_ARC : LIGHT_ARC;
  const tower = theme === "dark" ? DARK_TOWER : LIGHT_TOWER;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M18.2 10.5 A6 6 0 0 1 29.8 10.5"
        stroke={arc}
        strokeWidth="2.4"
        strokeLinecap="square"
      />
      <circle cx="24" cy="12" r="3.1" fill={arc} />
      <path d="M15 17 H33 L30 25 H18 Z" fill={tower} />
      <path d="M20 25 H28 L30 43 H18 Z" fill={tower} />
      <path d="M13 43 H35 V47 H13 Z" fill={tower} />
    </svg>
  );
}

function MonoMark(
  { theme = "dark", size = 24 }: { theme?: LogoTheme; size?: number },
): JSX.Element {
  const color = theme === "dark" ? MONO_DARK : MONO_LIGHT;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M18.2 10.5 A6 6 0 0 1 29.8 10.5"
        stroke={color}
        strokeWidth="2"
        strokeOpacity=".4"
        strokeLinecap="square"
      />
      <path
        d="M18.2 10.5 A6 6 0 0 1 29.8 10.5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="square"
      />
      <circle cx="24" cy="12" r="3.1" fill={color} />
      <path d="M15 17 H33 L30 25 H18 Z" fill={color} />
      <path d="M20 25 H28 L30 43 H18 Z" fill={color} />
      <path d="M13 43 H35 V47 H13 Z" fill={color} />
    </svg>
  );
}

function TileMark({ size = 24 }: { size?: number }): JSX.Element {
  // Same gradient + path data as app/public/favicon.svg, kept in sync
  // deliberately (research.md §2: the favicon is this tile treatment,
  // simplified to a single arc for legibility at small sizes — this
  // component's `tile` variant is the full, non-simplified version for
  // larger contexts).
  return (
    <div
      style={{
        width: size,
        height: size,
        background: `linear-gradient(150deg, ${DARK_TOWER}, ${DARK_ARC})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
      }}
    >
      <svg
        width={Math.round(size * 0.63)}
        height={Math.round(size * 0.63)}
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M18.2 10.5 A6 6 0 0 1 29.8 10.5"
          stroke={TILE_MARK}
          strokeWidth="2.6"
          strokeLinecap="square"
        />
        <circle cx="24" cy="12" r="3.4" fill={TILE_MARK} />
        <path d="M15 17 H33 L30 25 H18 Z" fill={TILE_MARK} />
        <path d="M20 25 H28 L30 43 H18 Z" fill={TILE_MARK} />
        <path d="M13 43 H35 V47 H13 Z" fill={TILE_MARK} />
      </svg>
    </div>
  );
}

export function Logo({ variant, theme = "dark", size = 24 }: LogoProps): JSX.Element {
  if (variant === "mono") {
    return <MonoMark theme={theme} size={size} />;
  }
  if (variant === "tile") {
    return <TileMark size={size} />;
  }

  const towerColor = theme === "dark" ? "var(--brand-primary)" : "#C4620F";
  const textColor = theme === "dark" ? "var(--fg-primary)" : "#1C140D";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <Mark theme={theme} size={size} />
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 14.5,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          color: textColor,
        }}
      >
        Flare<span style={{ color: towerColor }}>Tower</span>
      </span>
    </span>
  );
}
