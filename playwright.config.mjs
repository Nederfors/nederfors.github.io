import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://127.0.0.1:4178',
    browserName: 'chromium',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'python3 -m http.server 4178 --bind 0.0.0.0',
    url: 'http://127.0.0.1:4178/recovery/',
    reuseExistingServer: false
  }
});
