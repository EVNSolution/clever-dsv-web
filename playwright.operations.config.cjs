const { defineConfig } = require('@playwright/test');

const port = Number(process.env.PLAYWRIGHT_OPERATIONS_PORT ?? 4187);

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: 'remote-execution-operations.spec.js',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list']],
  outputDir: '/tmp/dsv-operations-playwright',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run build && npm exec vite -- preview --host 127.0.0.1 --port ${port} --strictPort`,
    env: { VITE_DSV_API_MODE: 'remote', VITE_DSV_OPERATIONS_ENABLED: 'true', VITE_DSV_SHOP_DOMAIN: 'dsv-demo.local' },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
