import { defineConfig, devices } from "@playwright/test";

const testScanRoot = process.cwd();

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3002",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "direnv exec . npm run dev",
    url: "http://127.0.0.1:3002",
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
