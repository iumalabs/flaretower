import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// Read at config-evaluation time, not runtime. The repo-root VERSION file
// (release-please's target — see specs/010-semver-releases/) exists on
// every branch, including main/feature branches and PR previews, so
// reading it unconditionally would show a version on preview/dev builds
// too — misleading, since those can be arbitrarily far ahead of the last
// real release (spec.md FR-010, US3 Acceptance Scenario 2). Cloudflare
// Workers Builds checks out the exact branch it's configured to deploy
// from, so gating on the checked-out branch actually being `release` is a
// reliable per-build signal with no extra Cloudflare-side configuration:
// only a production build (built from `release`, which only ever advances
// when release-automerge.yml fast-forwards it after a real cut) resolves
// to a non-empty version; every other build — local dev, feature branches,
// preview deploys — falls back to "".
function readAppVersion(): string {
  try {
    const branch = new Deno.Command("git", {
      args: ["rev-parse", "--abbrev-ref", "HEAD"],
      stdout: "piped",
      stderr: "null",
    }).outputSync();
    if (!branch.success || new TextDecoder().decode(branch.stdout).trim() !== "release") {
      return "";
    }
    return Deno.readTextFileSync(new URL("./VERSION", import.meta.url)).trim();
  } catch {
    return "";
  }
}

export default defineConfig({
  root: "app",
  plugins: [react(), cloudflare()],
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
