import { defineConfig } from "vite";
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
  plugins: [react(), cloudflare({ configPath: "../wrangler.jsonc" })],
  define: {
    __APP_VERSION__: JSON.stringify(readAppVersion()),
  },
  build: {
    outDir: "../dist/client",
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
