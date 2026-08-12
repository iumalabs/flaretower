import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // "list" for local/CI console output; the HTML report is only written to
  // disk (never auto-opened, including locally) so CI has something to
  // upload as an artifact for a failed run's trace/screenshots.
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:8787",
  },
  webServer: {
    // Not routed through `deno task dev` — its "--" argument separator
    // reaches vite's own CLI parser and silently breaks --port (discovered
    // empirically: vite fell back to auto-incrementing from 5173 instead
    // of binding 8787). Invoking vite directly avoids the stray "--".
    command: "deno run -A npm:vite --port 8787",
    port: 8787,
    reuseExistingServer: !Deno.env.get("CI"),
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
