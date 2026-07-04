import { defineConfig, devices } from "@playwright/test";

const port = process.env.PORT;
if (typeof port !== "string" || port.trim().length === 0) {
  throw new Error("PORT is required for Playwright configuration.");
}
const baseURL = `http://127.0.0.1:${port}`;

const testScanRoot = process.cwd();

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "direnv exec . npm run dev",
    url: baseURL,
    reuseExistingServer: false,
    env: {
      ...process.env,
      GITHUB_DASHBOARD_SCAN_ROOTS: testScanRoot,
    },
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
