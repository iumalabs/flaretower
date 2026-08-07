import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8787",
  },
  webServer: {
    command: "deno task dev -- --port 8787",
    port: 8787,
    reuseExistingServer: !Deno.env.get("CI"),
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
