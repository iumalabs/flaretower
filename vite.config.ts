import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  root: "app",
  plugins: [react(), cloudflare()],
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
