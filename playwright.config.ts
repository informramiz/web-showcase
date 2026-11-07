import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
// Point at a running deployment (e.g. the workers.dev URL) to smoke-test it instead of a local server.
const BASE_URL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // Use the installed Chrome locally if asked (PW_CHANNEL=chrome); CI installs Playwright's Chromium.
    channel: process.env.PW_CHANNEL,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL } }],
  webServer: BASE_URL
    ? undefined
    : {
        // Fresh seeded database on every run; expects `npm run build` to have run first.
        command: `npm run db:seed && npx next start -p ${PORT}`,
        env: { DATABASE_PATH: "./data/e2e.db" },
        url: `http://localhost:${PORT}/login`,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
