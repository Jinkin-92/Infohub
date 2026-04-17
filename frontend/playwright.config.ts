import { defineConfig, devices } from '@playwright/test'

const frontendUrl = process.env.INFOHUB_FRONTEND_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: {
    timeout: 20_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: frontendUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    channel: 'chrome',
    ...devices['Desktop Chrome'],
  },
})
