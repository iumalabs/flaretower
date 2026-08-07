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
});
