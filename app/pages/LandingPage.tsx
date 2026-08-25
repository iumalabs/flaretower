import type { JSX } from "react";
import { Logo } from "../components/Logo.tsx";
import { ExposureStatusBadge } from "../components/ExposureStatusBadge.tsx";

// spec 028 (tasks.md T008-T011) — the public landing page shown at "/" to
// any visitor with no Cloudflare Access session (App.tsx picks this over
// the authenticated Overview dashboard based on the session probe result —
// see App.tsx's own comment on why "/" itself can't double as the "Sign
// in" target once it's public). Renders fixed content only: no API call
// backs anything on this page (FR-007/FR-008/SC-005) — the sample panel
// below is hardcoded, not fetched.

interface SampleRow {
  worker: string;
  hostname: string;
  policy: string;
  status: "safe" | "warning" | "critical" | "not_evaluated";
}

// FlareTower App.dc.html (the design source) left these 4 rows as an
// unbound template loop with no literal sample data — authored fresh here,
// shaped like the real Exposure screen's own worker/hostname/policy/status
// columns (research.md's own "must match this project's actual current
// behavior" spirit extends to sample data looking like real data, not an
// arbitrary mockup).
const SAMPLE_ROWS: SampleRow[] = [
  {
    worker: "api-gateway",
    hostname: "api-gateway.acct.workers.dev",
    policy: "—",
    status: "critical",
  },
  {
    worker: "internal-admin",
    hostname: "admin.acme.dev",
    policy: "Everyone (Bypass)",
    status: "warning",
  },
  {
    worker: "billing-webhooks",
    hostname: "billing.acme.dev",
    policy: "Engineering Group",
    status: "safe",
  },
  {
    worker: "docs-preview",
    hostname: "docs-preview.pages.dev",
    policy: "—",
    status: "not_evaluated",
  },
];

interface FeatureCard {
  tag: string;
  title: string;
  body: string;
}

const FEATURES: FeatureCard[] = [
  {
    tag: "EXPOSURE",
    title: "Every hostname, cross-checked",
    body:
      "Workers, Pages, R2, and DNS records — everything Cloudflare will resolve — checked against the Access policy that's supposed to cover it.",
  },
  {
    tag: "DRIFT",
    title: "Catches configuration drift",
    body:
      "Runs on a schedule and flags anything that changed since the last scan — a policy removed, a record repointed, a bucket made public.",
  },
  {
    tag: "AUDIT",
    title: "One unified alert inbox",
    body:
      "Every module's findings land in one place, acknowledged once, with a full history of what changed and when.",
  },
];

const SECTION_MAX_WIDTH = 1040;

function Section(
  { id, children, style }: { id?: string; children: React.ReactNode; style?: React.CSSProperties },
): JSX.Element {
  return (
    <section
      id={id}
      style={{ maxWidth: SECTION_MAX_WIDTH, margin: "0 auto", padding: "0 24px", ...style }}
    >
      {children}
    </section>
  );
}

export function LandingPage(
  { onSignIn, onNavigateToDocs }: { onSignIn: () => void; onNavigateToDocs: () => void },
): JSX.Element {
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
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-canvas)",
        }}
      >
        <div
          style={{
            maxWidth: SECTION_MAX_WIDTH,
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <Logo variant="lockup" size={22} />
          <nav
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-label-size)",
              letterSpacing: "var(--text-label-ls)",
            }}
          >
            <a href="#what" style={{ color: "var(--fg-secondary)", textDecoration: "none" }}>
              WHAT IT SEES
            </a>
            <a href="#deploy" style={{ color: "var(--fg-secondary)", textDecoration: "none" }}>
              SELF-HOSTING
            </a>
            <button
              type="button"
              onClick={onNavigateToDocs}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "var(--fg-secondary)",
                fontFamily: "inherit",
                fontSize: "inherit",
                letterSpacing: "inherit",
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
                fontFamily: "inherit",
                fontSize: "inherit",
                letterSpacing: "inherit",
              }}
            >
              SIGN IN
            </button>
          </nav>
        </div>
      </header>

      <Section style={{ padding: "64px 24px 56px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 10px",
            border: "1px solid var(--border)",
            background: "var(--surface-1)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-label-size)",
            letterSpacing: "var(--text-label-ls)",
            color: "var(--fg-faint)",
            marginBottom: 24,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--status-safe)",
              display: "inline-block",
            }}
          />
          SELF-HOSTED · YOUR ACCOUNT, YOUR TOKENS
        </div>
        <h1
          style={{
            fontSize: 44,
            lineHeight: 1.15,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            margin: "0 0 18px",
            maxWidth: 760,
          }}
        >
          Every door into your Cloudflare account, on one screen.
        </h1>
        <p
          style={{
            fontSize: "var(--text-body-size)",
            lineHeight: 1.6,
            color: "var(--fg-muted)",
            maxWidth: 620,
            margin: "0 0 28px",
          }}
        >
          FlareTower crosses every Worker, route, Pages preview, bucket and DNS record against the
          Access policy that is supposed to guard it — then sorts the unprotected ones to the top.
          It runs inside your own infrastructure and reads your account through a token you issue.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onSignIn}
            style={{
              background: "var(--brand-primary)",
              color: "var(--bg-base)",
              border: "none",
              padding: "11px 20px",
              fontWeight: 600,
              fontSize: "var(--text-body-size)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Sign in with Cloudflare Access
          </button>
          <p style={{ margin: 0, fontSize: "var(--text-meta-size)", color: "var(--fg-faint)" }}>
            operators are added to your Access policy,<br />never to FlareTower
          </p>
        </div>
      </Section>

      <Section id="what" style={{ padding: "0 24px 56px" }}>
        <div style={{ border: "1px solid var(--border)", background: "var(--bg-canvas)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface-1)",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-label-size)",
                letterSpacing: "var(--text-label-ls)",
                color: "var(--fg-primary)",
                textTransform: "uppercase",
              }}
            >
              Exposure matrix · Sample
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-label-size)",
                letterSpacing: "var(--text-label-ls)",
                color: "var(--fg-faint)",
              }}
            >
              READ-ONLY PREVIEW · NOT YOUR ACCOUNT
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid var(--border)",
                padding: "9px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-label-size)",
                letterSpacing: "var(--text-label-ls)",
                color: "var(--fg-faint)",
                textTransform: "uppercase",
              }}
            >
              <span style={{ width: "22%", flex: "none" }}>Worker</span>
              <span style={{ width: "33%", flex: "none" }}>Hostname</span>
              <span style={{ flex: 1 }}>Access policy</span>
              <span style={{ width: 120, flex: "none" }}>Status</span>
            </div>
            {SAMPLE_ROWS.map((row) => (
              <div
                key={row.hostname}
                data-testid={`sample-row-${row.worker}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--rule-hairline)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-code-size)",
                }}
              >
                <span style={{ width: "22%", flex: "none", color: "var(--fg-secondary)" }}>
                  {row.worker}
                </span>
                <span style={{ width: "33%", flex: "none", color: "var(--fg-faint)" }}>
                  {row.hostname}
                </span>
                <span style={{ flex: 1, color: "var(--fg-faint)" }}>{row.policy}</span>
                <span style={{ width: 120, flex: "none" }}>
                  <ExposureStatusBadge status={row.status} />
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 16px",
              borderTop: "1px solid var(--border)",
              background: "var(--surface-1)",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-label-size)",
                color: "var(--fg-faint)",
              }}
            >
              sorted by exposure, worst first
            </span>
            <button
              type="button"
              onClick={onSignIn}
              style={{
                background: "none",
                border: "1px solid var(--border)",
                color: "var(--fg-secondary)",
                padding: "6px 12px",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-label-size)",
                letterSpacing: "var(--text-label-ls)",
              }}
            >
              SIGN IN TO SEE YOURS
            </button>
          </div>
        </div>
      </Section>

      <Section style={{ padding: "0 24px 56px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.tag}
              style={{
                border: "1px solid var(--border)",
                background: "var(--bg-canvas)",
                padding: 20,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-label-size)",
                  letterSpacing: "var(--text-label-ls)",
                  color: "var(--brand-primary)",
                  marginBottom: 10,
                }}
              >
                {f.tag}
              </div>
              <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600 }}>{f.title}</h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--text-body-size)",
                  color: "var(--fg-muted)",
                  lineHeight: 1.55,
                }}
              >
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="deploy" style={{ padding: "0 24px 64px" }}>
        <div
          style={{
            border: "1px solid var(--border)",
            background: "var(--bg-canvas)",
            padding: 28,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 28,
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 600 }}>
              One Worker, one D1 database, your own hostname.
            </h2>
            <p style={{ margin: 0, color: "var(--fg-muted)", lineHeight: 1.6 }}>
              Nothing leaves your account. FlareTower has no backend of ours to phone home to, no
              local password store, and no session that outlives your Access token.
            </p>
          </div>
          <div
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              padding: 16,
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-code-size)",
              color: "var(--fg-secondary)",
              lineHeight: 1.7,
            }}
          >
            {
              /* issue: FlareTower App.dc.html's own self-hosting terminal
                block showed a fictional `npx flaretower deploy` CLI and a
                nonexistent FT_STATE KV namespace — spec.md FR-004 requires
                the real setup steps from this repo's actual README.md
                instead. */
            }
            <div>$ git clone https://github.com/iumalabs/flaretower &amp;&amp; cd flaretower</div>
            <div>$ deno run -A npm:wrangler d1 create flaretower-production</div>
            <div>$ deno run -A npm:wrangler secret put CF_API_TOKEN</div>
            <div>$ deno task deploy</div>
            <div style={{ color: "var(--fg-faint)", marginTop: 8 }}>
              full setup (D1 migrations, Access config): see Documentation
            </div>
          </div>
        </div>
      </Section>

      <footer style={{ borderTop: "1px solid var(--border)", background: "var(--bg-canvas)" }}>
        <div
          style={{
            maxWidth: SECTION_MAX_WIDTH,
            margin: "0 auto",
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-meta-size)",
            color: "var(--fg-faint)",
          }}
        >
          <span>
            flaretower{__APP_VERSION__ ? ` v${__APP_VERSION__}` : ""} · self-hosted
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              type="button"
              onClick={onNavigateToDocs}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "var(--fg-faint)",
                fontFamily: "inherit",
                fontSize: "inherit",
                cursor: "pointer",
              }}
            >
              DOCUMENTATION
            </button>
            <span>not affiliated with Cloudflare</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
