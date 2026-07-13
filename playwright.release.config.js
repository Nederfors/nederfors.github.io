import { defineConfig, devices } from '@playwright/test';

const pwaOrPerformance = /(?:pwa|production-performance|performance-budget)\.spec\.js$/;
const mobileOnly = /(?:mobile-layout|mobile-popup-interaction)\.spec\.js$/;
const responsiveCoverage = /(?:mobile-layout|mobile-popup-interaction|popup-shell|route-switch|smoke|accessibility|loading-recovery)\.spec\.js$/;
const evidenceSuite = String(process.env.PLAYWRIGHT_EVIDENCE_SUITE || '')
  .trim()
  .replace(/[^a-z0-9_-]+/gi, '-');
const evidenceRoot = evidenceSuite ? `.artifacts/playwright/${evidenceSuite}` : '';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
    toHaveScreenshot: {
      // Keep one reviewed reference per browser/device project. Popup tests use
      // these Darwin-authored images as the shared release references on CI as
      // well, with a cross-platform perceptual comparison in the spec.
      pathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-darwin{ext}',
      animations: 'disabled',
      caret: 'hide',
      scale: 'css'
    }
  },
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  outputDir: evidenceRoot ? `${evidenceRoot}/test-results` : 'test-results',
  reporter: process.env.CI
    ? [['line'], ['html', {
        open: 'never',
        outputFolder: evidenceRoot ? `${evidenceRoot}/report` : 'playwright-report'
      }]]
    : 'line',
  use: {
    actionTimeout: 0,
    baseURL: 'http://127.0.0.1:4186',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: [pwaOrPerformance, mobileOnly],
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'webkit',
      testIgnore: [pwaOrPerformance, mobileOnly],
      use: { ...devices['Desktop Safari'] }
    },
    {
      name: 'Mobile Chrome',
      testMatch: responsiveCoverage,
      use: { ...devices['Pixel 7'] }
    },
    {
      name: 'Mobile Safari',
      testMatch: responsiveCoverage,
      use: { ...devices['iPhone 15'] }
    },
    {
      name: 'chromium-pwa',
      testMatch: pwaOrPerformance,
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'python3 -m http.server 4186 --bind 127.0.0.1 --directory dist',
    port: 4186,
    reuseExistingServer: false,
    timeout: 120 * 1000
  }
});
