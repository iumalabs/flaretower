import type { JSX } from "react";
import { Logo } from "../components/Logo.tsx";
import { ExposureStatusBadge } from "../components/ExposureStatusBadge.tsx";
import { NAV_ITEMS } from "../nav-items.ts";

// spec 028 Phase 5 (tasks.md T014-T023, issue #508) — the full documentation
// page, replacing the MVP placeholder shipped in PR #503. Public, reachable
// regardless of session state (spec.md Edge Cases). Every claim below is
// sourced from this repo's own README.md/constitution.md/nav-items.ts at
// the time this was written, not the source design mock — see spec.md
// FR-004 and research.md §4, and quickstart.md Scenario 4's spot-checks.

interface Section {
  id: string;
  number: string;
  title: string;
  body: JSX.Element;
}

const TOKEN_SCOPES: { scope: string; module: string; why: string }[] = [
  {
    scope: "Workers Scripts Read",
    module: "Workers, Exposure",
    why: "List Workers, Custom Domains, workers.dev/Preview URL status, and bindings",
  },
  {
    scope: "Access: Apps and Policies Read",
    module: "Exposure, Zero Trust, Pages, R2/KV/D1",
    why:
      "List Access applications and policies, cross-checked against every module's own hostnames",
  },
  { scope: "Zone Read", module: "DNS, Security Posture", why: "List zones" },
  {
    scope: "DNS Read",
    module: "DNS, Security Posture",
    why: "List DNS records per zone, plus DNSSEC status",
  },
  {
    scope: "Account Security Insights",
    module: "DNS",
    why: "Dangling A/AAAA/CNAME record detection (Cloudflare's own Security Insights scan)",
  },
  {
    scope: "Access: Service Tokens Read",
    module: "Zero Trust",
    why: "List service tokens and their expiration dates",
  },
  {
    scope: "Access: Groups Read",
    module: "Zero Trust",
    why: "List Access rule groups and their reference counts",
  },
  {
    scope: "Access: Identity Providers Read",
    module: "Zero Trust",
    why: "Resolve an identity provider id to its human-readable name",
  },
  {
    scope: "Cloudflare Pages Read",
    module: "Pages",
    why: "List Pages projects, their custom domains, and their deployments",
  },
  {
    scope: "Workers R2 Storage Read",
    module: "R2/KV/D1",
    why: "List R2 buckets and their public-access domain configuration",
  },
  { scope: "Workers KV Storage Read", module: "R2/KV/D1", why: "List KV namespaces" },
  { scope: "D1 Read", module: "R2/KV/D1", why: "List D1 databases" },
  {
    scope: "Zone SSL and Certificates",
    module: "Security Posture",
    why: "Read a zone's SSL/TLS mode and certificate packs",
  },
  {
    scope: "Zone WAF Read",
    module: "Security Posture",
    why: "Read a zone's managed ruleset, rate-limiting ruleset, and custom rules",
  },
  {
    scope: "Zone Settings Read",
    module: "Security Posture",
    why: "Read Bot Fight Mode, Always Use HTTPS, and Minimum TLS Version",
  },
  { scope: "Turnstile Read", module: "Security Posture", why: "List account Turnstile widgets" },
  {
    scope: "Account Analytics Read",
    module: "Workers",
    why: "Per-Worker and account-wide request/error/CPU figures",
  },
  {
    scope: "Account Settings Read",
    module: "Workers, Audit & Drift",
    why: "Real Cloudflare account change history for the recent-changes/audit-log panels",
  },
];

function Callout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderLeft: "2px solid var(--brand-primary)",
        background: "var(--surface-1)",
        padding: "10px 14px",
        fontSize: "var(--text-body-size)",
        color: "var(--fg-muted)",
        margin: "12px 0",
      }}
    >
      {children}
    </div>
  );
}

function CodeBlock({ lines }: { lines: string[] }): JSX.Element {
  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        padding: 16,
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-code-size)",
        color: "var(--fg-secondary)",
        lineHeight: 1.7,
        margin: "12px 0",
        overflowX: "auto",
      }}
    >
      {lines.map((line, i) => <div key={i}>{line}</div>)}
    </div>
  );
}

const P_STYLE = { margin: "0 0 12px", lineHeight: 1.65, color: "var(--fg-muted)" };
const UL_STYLE = {
  margin: "0 0 12px",
  paddingLeft: 20,
  lineHeight: 1.65,
  color: "var(--fg-muted)",
};

const SECTIONS: Section[] = [
  {
    id: "what-it-is",
    number: "01",
    title: "What FlareTower is",
    body: (
      <>
        <p style={P_STYLE}>
          FlareTower is a self-hosted control panel for a single Cloudflare account. It runs as one
          Cloudflare Worker — no external backend, no third-party service it reports to — and reads
          your account through a Cloudflare API token you issue and store yourself, as a Worker
          secret.
        </p>
        <p style={P_STYLE}>
          It exists to answer one question an account with more than a handful of Workers stops
          being able to answer by hand: which of them are actually publicly reachable, and is that
          reachability covered by an Access policy? It crosses Workers, DNS records, Pages projects,
          R2/KV/D1 resources, and Zero Trust/Access configuration against each other, and surfaces
          anything that looks unprotected, misconfigured, or drifted from how it was last seen.
        </p>
        <p style={P_STYLE}>
          Today FlareTower is read-only against your Cloudflare account: every token scope it
          requests (see{" "}
          <a href="#token-scopes" style={{ color: "var(--brand-primary)" }}>§04</a>) is a{" "}
          <em>Read</em>{" "}
          scope, and its own in-app actions (acknowledging a finding, triggering a re-scan) only
          ever change FlareTower's own stored findings/alerts, never your Cloudflare configuration
          itself.
        </p>
      </>
    ),
  },
  {
    id: "deploy-it",
    number: "02",
    title: "Deploy it",
    body: (
      <>
        <p style={P_STYLE}>
          FlareTower is Deno + Wrangler only — there is no separate installer or hosted signup.
          Deploying it means deploying it to <em>your own</em>{" "}
          Cloudflare account, as a Worker you control end to end.
        </p>
        <CodeBlock
          lines={[
            "$ git clone https://github.com/iumalabs/flaretower && cd flaretower",
            "$ deno install",
            "$ deno run -A npm:wrangler d1 create flaretower-production",
            "$ deno task db:migrations:apply:remote",
            "$ deno run -A npm:wrangler secret put CF_API_TOKEN",
            "$ deno task deploy",
          ]}
        />
        <p style={P_STYLE}>
          That's the shortest real path — full details (both Wrangler environments, local dev,
          required <code style={{ fontFamily: "var(--font-mono)" }}>wrangler.jsonc</code>{" "}
          vars, GitHub-connected Workers Builds for CI deploys) are in the repository's own{" "}
          <a
            href="https://github.com/iumalabs/flaretower#setup"
            style={{ color: "var(--brand-primary)" }}
          >
            README
          </a>. There is no fictional CLI here — every command above is a real{" "}
          <code style={{ fontFamily: "var(--font-mono)" }}>deno task</code> or{" "}
          <code style={{ fontFamily: "var(--font-mono)" }}>wrangler</code>{" "}
          invocation this repository actually defines.
        </p>
        <Callout>
          After the first deploy, two manual, one-time steps are required and cannot be automated
          via Wrangler config: restricting Workers Preview URLs, and scoping your Access
          Application's path rules to exactly{" "}
          <code style={{ fontFamily: "var(--font-mono)" }}>/app/*</code> and{" "}
          <code style={{ fontFamily: "var(--font-mono)" }}>/api/*</code>{" "}
          — an allow-list, not an exclusion — so this page and the landing page need no rule of
          their own. Both steps are documented prominently in the README, not buried here.
        </Callout>
      </>
    ),
  },
  {
    id: "sign-in",
    number: "03",
    title: "Sign-in: Cloudflare Access only",
    body: (
      <>
        <p style={P_STYLE}>
          FlareTower has no sign-in screen, no password, and no identity provider integration of its
          own. Clicking "Sign in" anywhere in this app is plain navigation to a URL that sits behind
          {" "}
          <strong>your</strong>{" "}
          Cloudflare Access application — Access itself challenges the visitor with whichever
          identity provider your organization already has configured there (Google Workspace,
          GitHub, Okta, Azure AD/Entra, one-time PIN, whatever you've set up). FlareTower's code is
          identical no matter which provider that is.
        </p>
        <p style={P_STYLE}>
          Once Access has authenticated the visitor, it attaches a signed{" "}
          <code style={{ fontFamily: "var(--font-mono)" }}>Cf-Access-Jwt-Assertion</code>{" "}
          header to every request that reaches the Worker. FlareTower independently validates that
          JWT's signature, issuer, and audience on every{" "}
          <code style={{ fontFamily: "var(--font-mono)" }}>/api/*</code>{" "}
          request — even though Access should already have blocked anything unauthenticated — and
          trusts only the JWT's own <code style={{ fontFamily: "var(--font-mono)" }}>sub</code>/
          <code style={{ fontFamily: "var(--font-mono)" }}>email</code>{" "}
          claims as identity. A missing header, bad signature, or expired token is always a hard
          {" "}
          <code>403</code>; there is no degraded-but-permitted mode.
        </p>
        <p style={P_STYLE}>
          There is no issuer, scope, or callback path to describe here, because FlareTower never
          performs that handshake itself — it happens entirely inside Cloudflare Access, outside
          this application's code.
        </p>
      </>
    ),
  },
  {
    id: "token-scopes",
    number: "04",
    title: "Token scopes the scanner needs",
    body: (
      <>
        <p style={P_STYLE}>
          The Cloudflare API token FlareTower uses is stored only as a Worker secret (
          <code style={{ fontFamily: "var(--font-mono)" }}>wrangler secret put CF_API_TOKEN</code>)
          — never in{" "}
          <code style={{ fontFamily: "var(--font-mono)" }}>wrangler.jsonc</code>, never accepted
          through the UI. It starts read-only, and every scope below exists to support one specific
          module's inventory — nothing is requested ahead of need.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "var(--text-body-size)",
              margin: "12px 0",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Scope", "Used by", "Why"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-label-size)",
                      color: "var(--fg-faint)",
                      textTransform: "uppercase",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TOKEN_SCOPES.map((row) => (
                <tr key={row.scope} style={{ borderBottom: "1px solid var(--rule-hairline)" }}>
                  <td
                    style={{
                      padding: "8px 10px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-code-size)",
                      color: "var(--fg-secondary)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.scope}
                  </td>
                  <td
                    style={{ padding: "8px 10px", color: "var(--fg-faint)", whiteSpace: "nowrap" }}
                  >
                    {row.module}
                  </td>
                  <td style={{ padding: "8px 10px", color: "var(--fg-muted)" }}>{row.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={P_STYLE}>
          The dashboard's own permission-picker naming has moved around since parts of this list
          were first written — the repository's README keeps the authoritative, longer version of
          this table (with the exact API endpoints each scope covers), updated as gaps are found in
          production.
        </p>
      </>
    ),
  },
  {
    id: "how-a-scan-works",
    number: "05",
    title: "How a scan works",
    body: (
      <>
        <p style={P_STYLE}>
          Every module runs the same detection logic in two modes: <strong>interactive</strong>{" "}
          (the "Re-scan" button on a module's dashboard, or the first-ever run from an empty state)
          and <strong>scheduled</strong>{" "}
          (an hourly Cron Trigger in production; disabled in preview deployments so they never
          duplicate-scan the same real account). Both modes call one shared audit module — there is
          no separate, lighter-weight "quick check" path that could silently disagree with what the
          scheduled scan finds.
        </p>
        <p style={P_STYLE}>
          Each run's findings are written to that module's own D1 tables (a "current state" row per
          resource plus an append-only alert history), so the dashboard always shows the{" "}
          <em>last completed run's</em>{" "}
          result, not a live query against your Cloudflare account on every page load. A finding
          whose status changed since the previous run opens a new alert; one that returns to a clean
          state auto-resolves the alert that was open for it.
        </p>
        <p style={P_STYLE}>
          Triggering a re-scan re-runs that exact detection logic on demand — useful right after
          you've fixed something and want to confirm the finding actually cleared, without waiting
          up to an hour for the next scheduled pass.
        </p>
      </>
    ),
  },
  {
    id: "screens",
    number: "06",
    title: "What each screen shows",
    body: (
      <>
        <p style={P_STYLE}>
          Every destination in the sidebar, in order, with the same one-line description shown in
          its own hover tooltip in the app:
        </p>
        <dl style={{ margin: "12px 0" }}>
          {NAV_ITEMS.map((item) => (
            <div
              key={item.key}
              style={{
                display: "flex",
                gap: 16,
                padding: "8px 0",
                borderBottom: "1px solid var(--rule-hairline)",
              }}
            >
              <dt
                style={{
                  width: 160,
                  flex: "none",
                  fontFamily: "var(--font-sans)",
                  fontWeight: 600,
                  fontSize: "var(--text-body-size)",
                }}
              >
                {item.label}
              </dt>
              <dd
                style={{ margin: 0, color: "var(--fg-muted)", fontSize: "var(--text-body-size)" }}
              >
                {item.tooltip.description}
              </dd>
            </div>
          ))}
        </dl>
      </>
    ),
  },
  {
    id: "status-vocabulary",
    number: "07",
    title: "Status vocabulary",
    body: (
      <>
        <p style={P_STYLE}>
          Every finding across every module uses the same four statuses, worst-first. Each one is
          carried by both color <em>and</em>{" "}
          shape, so the meaning survives in monochrome or for a color-blind operator — never color
          alone:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "12px 0" }}>
          {(
            [
              ["critical", "Something is actually exposed or broken — needs attention now."],
              [
                "warning",
                "Technically working, but weaker than it should be (an open policy, an ineffective setting).",
              ],
              ["safe", 'Rendered as "PROTECTED" — checked, and covered/correct.'],
              [
                "not_evaluated",
                'Rendered as "N/A" — either not applicable to this resource, or the check itself couldn\'t run (e.g. an API call failed) — never silently treated as safe.',
              ],
            ] as const
          ).map(([status, description]) => (
            <div key={status} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 110, flex: "none" }}>
                <ExposureStatusBadge status={status} />
              </div>
              <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-body-size)" }}>
                {description}
              </span>
            </div>
          ))}
        </div>
        <p style={P_STYLE}>
          A handful of screens use a module-specific word in the same badge shape/color (Zero
          Trust's applications render <em>ENFORCING</em>/<em>PARTIAL COVER</em>/<em>BROAD TOKEN</em>
          {" "}
          in place of the generic labels) — the underlying severity language is always these same
          four levels.
        </p>
      </>
    ),
  },
  {
    id: "security-posture-checks",
    number: "08",
    title: "How Security Posture checks work",
    body: (
      <>
        <p style={P_STYLE}>
          Security Posture has no user-editable baseline file to configure — every check is a fixed,
          built-in rule evaluated against each zone's actual current Cloudflare setting, the same
          way for every account FlareTower runs against. Today that's: SSL/TLS encryption mode,
          certificate packs, DNSSEC, the WAF managed ruleset, zone-level custom WAF rules, rate
          limiting, Bot Fight Mode, Always Use HTTPS, Minimum TLS Version, and account-wide
          Turnstile widgets.
        </p>
        <p style={P_STYLE}>
          Each check maps a setting's actual value to one of the four statuses above with a fixed
          rule (for example: SSL/TLS mode{" "}
          <code style={{ fontFamily: "var(--font-mono)" }}>off</code> is critical,{" "}
          <code style={{ fontFamily: "var(--font-mono)" }}>flexible</code> is a warning,{" "}
          <code style={{ fontFamily: "var(--font-mono)" }}>full strict</code>{" "}
          is safe) — there are no per-account configurable thresholds to tune. A zone's overall
          status is always the worst status among its individual checks.
        </p>
      </>
    ),
  },
  {
    id: "limits-and-retention",
    number: "09",
    title: "Limits and retention",
    body: (
      <>
        <ul style={UL_STYLE}>
          <li>
            The scheduled scan runs hourly in production (disabled in preview deployments). A manual
            re-scan is available on demand from every module dashboard that has server-side
            evaluation state (Workers, Exposure, DNS, Storage, Security, Zero Trust, Pages).
          </li>
          <li>
            Finding and alert history is kept indefinitely today — no module automatically deletes
            old rows. At single-account scale this is a non-issue; if history volume ever became a
            real concern, retention/archival would be a future enhancement, not something already
            built in.
          </li>
          <li>
            Drift alerting always compares one run to the immediately previous run. If an account
            hasn't been scanned in a while, the gap in between isn't retroactively summarized —
            "what changed" reflects the two most recent runs, not everything that happened across
            the gap.
          </li>
          <li>
            FlareTower's own audit trail (who acknowledged what, who changed another operator's
            role) is separate from the real Cloudflare account activity it surfaces in the Audit
            module — the latter is Cloudflare's own audit log, read through your API token, not
            reconstructed from FlareTower's local state.
          </li>
        </ul>
      </>
    ),
  },
];

export function DocumentationPage(
  { onSignIn, onBack, onNavigateToChangelog }: {
    onSignIn: () => void;
    onBack: () => void;
    onNavigateToChangelog: () => void;
  },
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
          position: "sticky",
          top: 0,
          zIndex: 10,
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-canvas)",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
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
              onClick={onNavigateToChangelog}
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
              CHANGELOG
            </button>
            <a
              href="https://github.com/iumalabs/flaretower"
              style={{
                color: "var(--fg-faint)",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-label-size)",
                letterSpacing: "var(--text-label-ls)",
                textDecoration: "none",
              }}
            >
              GITHUB
            </a>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-meta-size)",
                color: "var(--fg-faint)",
              }}
            >
              {__APP_VERSION__ ? `v${__APP_VERSION__}` : "self-hosted"}
            </span>
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

      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "32px 24px 80px",
          display: "flex",
          gap: 48,
          alignItems: "flex-start",
        }}
      >
        <nav
          style={{
            width: 200,
            flex: "none",
            position: "sticky",
            top: 76,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              style={{
                display: "flex",
                gap: 8,
                padding: "6px 8px",
                textDecoration: "none",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-label-size)",
                color: "var(--fg-faint)",
              }}
            >
              <span style={{ color: "var(--brand-primary)" }}>{s.number}</span>
              {s.title}
            </a>
          ))}
        </nav>

        <main style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              fontSize: "var(--text-display-size)",
              fontWeight: "var(--text-display-weight)" as unknown as number,
              letterSpacing: "var(--text-display-ls)",
              margin: "0 0 8px",
            }}
          >
            Documentation
          </h1>
          <p style={{ ...P_STYLE, marginBottom: 32 }}>
            What FlareTower is, how to run it against your own Cloudflare account, and how to read
            what it shows you.
          </p>

          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} style={{ marginBottom: 40, scrollMarginTop: 76 }}>
              <h2
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  fontSize: 20,
                  fontWeight: 600,
                  margin: "0 0 14px",
                  paddingBottom: 10,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-label-size)",
                    color: "var(--brand-primary)",
                  }}
                >
                  {s.number}
                </span>
                {s.title}
              </h2>
              {s.body}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
