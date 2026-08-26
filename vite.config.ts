import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// Read at config-evaluation time, not runtime. The repo-root VERSION file
// (release-please's target — see specs/010-semver-releases/) exists on
// every branch, including main/feature branches and PR previews, so
// reading it unconditionally would show a version on preview/dev builds
// too — misleading, since those can be arbitrarily far ahead of the last
// real release (spec.md FR-010, US3 Acceptance Scenario 2).
//
// Gate on Cloudflare Workers Builds' own WORKERS_CI_BRANCH env var (the
// branch name from the triggering push event — confirmed via Cloudflare's
// build-configuration docs), not `git rev-parse --abbrev-ref HEAD`: found
// live in production that Workers Builds' checkout leaves HEAD detached
// (or otherwise unresolvable to a branch name), so the git-based check
// always fell through to "" even on real `release`-branch builds — the
// production footer shipped with no version at all until this fix.
// WORKERS_CI_BRANCH is unset in local dev and set to the actual branch
// name for every Workers Builds run (production or preview), so this is a
// reliable per-build signal with no extra Cloudflare-side configuration:
// only a production build (from `release`) resolves to a non-empty
// version; every other build — local dev, feature branches, preview
// deploys — falls back to "".
function readAppVersion(): string {
  try {
    if (Deno.env.get("WORKERS_CI_BRANCH") !== "release") {
      return "";
    }
    return Deno.readTextFileSync(new URL("./VERSION", import.meta.url)).trim();
  } catch {
    return "";
  }
}

// issue #528 — the public /changelog page renders the repo's real, release-
// please-generated CHANGELOG.md (app/lib/changelog-parser.ts does the actual
// parsing) rather than a hand-authored duplicate that inevitably drifts —
// exactly the kind of content drift issue #525 already found between /docs
// and the README. CHANGELOG.md lives at the repo root, outside Vite's own
// `root: "app"` (and therefore outside its default `publicDir`, which is
// resolved relative to that root) — so it needs an explicit plugin rather
// than just dropping the file in app/public/, the same way readAppVersion()
// above needs its own file read rather than relying on Vite's defaults.
function changelogPlugin(): Plugin {
  const changelogUrl = new URL("./CHANGELOG.md", import.meta.url);
  return {
    name: "flaretower-serve-changelog",
    configureServer(server) {
      // Dev only: always reads the file fresh, so editing CHANGELOG.md
      // (e.g. via `deno task release` locally) doesn't need a server
      // restart to show up at GET /CHANGELOG.md.
      server.middlewares.use((req: import("node:http").IncomingMessage, res, next) => {
        if (req.url !== "/CHANGELOG.md") {
          next();
          return;
        }
        res.setHeader("Content-Type", "text/markdown; charset=utf-8");
        res.end(Deno.readTextFileSync(changelogUrl));
      });
    },
    // Copies the file straight into the built client output rather than
    // using Rollup's own per-environment emitFile() — the @cloudflare/
    // vite-plugin builds more than one environment (client + worker) and
    // there's no simple way from here to target only the "client" one's
    // bundle, so this writes directly to the hardcoded "dist/client/" path
    // instead (the same path wrangler.jsonc's own assets.directory and the
    // #520 incident fix above both already hardcode). Runs once per
    // environment build; re-copying identical bytes on a second run is
    // harmless.
    closeBundle() {
      const destDir = new URL("./dist/client/", import.meta.url);
      Deno.mkdirSync(destDir, { recursive: true });
      Deno.copyFileSync(changelogUrl, new URL("./CHANGELOG.md", destDir));
    },
  };
}

export default defineConfig({
  root: "app",
  // issue #488 — @cloudflare/vite-plugin resolves an unspecified `configPath`
  // relative to Vite's own `root` (`app/`, above), not the repo root, so it
  // was silently looking for `app/wrangler.jsonc` (which doesn't exist),
  // never finding the real one, and falling back to a default "assets-only"
  // config with no Worker at all — confirmed via the plugin's own Local
  // Explorer API (`/cdn-cgi/local/explorer/api/local/workers`), which never
  // listed a "flaretower" service, only the plugin's internal
  // router/asset/proxy workers. That's why `/` (served as a static asset,
  // with SPA-fallback masking the missing Worker) worked while every
  // `/api/*` request 404'd with no `worker/index.ts` code ever running.
  plugins: [react(), cloudflare({ configPath: "../wrangler.jsonc" }), changelogPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(readAppVersion()),
  },
  // INCIDENT (2026-08-26, v1.15.9) — this used to be outDir: "../dist/client",
  // which worked only because the #488 fix above hadn't landed yet: while
  // @cloudflare/vite-plugin still silently ran in "assets-only" mode (no
  // configPath, so no real Worker recognized), `outDir` was the SOLE build
  // target and was used as-is. The moment #488's configPath fix made the
  // plugin correctly recognize this as a real "workers" project (a real
  // entry Worker + a client environment), Vite's own multi-environment
  // build convention started nesting each environment's output under
  // `<outDir>/<environmentName>/` — so the already-"client"-suffixed outDir
  // produced `dist/client/client/...` instead of `dist/client/...`,
  // silently leaving `wrangler.jsonc`'s `assets.directory` ("./dist/client")
  // pointing at an empty directory. Production served a bare 404 for every
  // path except `/api/*` (which bypasses ASSETS entirely) until this was
  // caught and fixed. `outDir` must be the shared *parent* directory now —
  // the plugin's own "client" environment naming is what produces the
  // `dist/client/` layout `wrangler.jsonc` actually expects.
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    fs: {
      // Vite's default fs.allow is derived from `root` ("app/"), which
      // excludes the repo-root node_modules/ — and Deno's npm-compat layer
      // nests packages under node_modules/.deno/<pkg>@<version>/..., one
      // level above `app/`. Without this, the browser's own font requests
      // for the self-hosted @fontsource files (app/styles/fonts.css) are
      // silently blocked by Vite's dev server (discovered live: a 403,
      // masked because @font-face still registers the family name in
      // document.fonts even when the underlying file 404s/403s, so a naive
      // "is the font family registered" check doesn't catch this — only
      // checking each FontFace's own `.status` does).
      allow: [".."],
    },
  },
});
