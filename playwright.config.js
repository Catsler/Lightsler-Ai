// Minimal Playwright config for E2E layout checks
// Usage (set env before run):
// E2E_BASE_URL=https://translate.ease-joy.fun:3000 \
// E2E_RESOURCE_PATH=/app/resource/product/<id>?lang=zh-CN \
// E2E_STORAGE_STATE=playwright/.auth/admin.json \
// npm run test:e2e

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    storageState: process.env.E2E_STORAGE_STATE || undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [['list']],
});

