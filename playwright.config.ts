import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // Use the installed Chrome locally if asked (PW_CHANNEL=chrome); CI installs Playwright's Chromium.
    channel: process.env.PW_CHANNEL,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL } }],
  webServer: {
    // Fresh seeded database on every run; expects `npm run build` to have run first.
    command: `npm run db:seed && npx next start -p ${PORT}`,
    env: { DATABASE_PATH: "./data/e2e.db" },
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
