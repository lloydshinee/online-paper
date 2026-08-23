import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3111',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run start -- --port 3111',
    url: 'http://localhost:3111',
    // Locally a leftover server is convenient during iteration; in CI it
    // would silently test the wrong binary, so reuse is CI-only-disabled.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
