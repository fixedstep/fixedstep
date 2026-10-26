import { defineConfig, devices } from "@playwright/test";
import { API_URL, REPO_ROOT, WEB_PORT, WEB_URL } from "./support/env";

export default defineConfig({
  testDir: "./specs",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["github"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: { baseURL: WEB_URL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  // 1280px is "wide": the course outline starts open on reading and quiz lessons.
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  // Never reuse a running server: each run needs a fresh database and API log, and a fresh API
  // also resets the in-memory rate limiters.
  webServer: [
    {
      command: "node_modules/.bin/tsx e2e/support/start-api.ts",
      cwd: REPO_ROOT,
      url: `${API_URL}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: `node_modules/.bin/vite --port ${WEB_PORT} --strictPort`,
      cwd: `${REPO_ROOT}/apps/web`,
      env: { API_PROXY_TARGET: API_URL },
      url: WEB_URL,
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
});
