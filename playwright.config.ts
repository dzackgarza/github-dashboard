import { defineConfig, devices } from "@playwright/test";

const testScanRoot = process.cwd();
const testPort = 3213;
const testBaseURL = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: testBaseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "direnv exec . npm run dev",
    url: testBaseURL,
    reuseExistingServer: false,
    env: {
      ...process.env,
      GITHUB_DASHBOARD_SCAN_ROOTS: testScanRoot,
      PORT: String(testPort),
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
