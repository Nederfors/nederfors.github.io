import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  // The app and service-worker suites share one static server. Keeping files
  // sequential within a worker avoids the connection collapse seen when the
  // complete four-browser matrix starts every scenario at once.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : 'html',
  use: {
    actionTimeout: 0,
    baseURL: 'http://127.0.0.1:4186',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 15'] }
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'] }
    }
  ],
  webServer: {
    command: 'python3 -m http.server 4186 --bind 127.0.0.1 --directory dist',
    port: 4186,
    reuseExistingServer: false,
    timeout: 120 * 1000
  }
});
