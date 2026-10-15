const { defineConfig } = require('@playwright/test');

const runtimeUrl = process.env.DSV_OPERATIONS_POSTGRES_RUNTIME_URL?.trim();
if (!runtimeUrl) throw new Error('Set DSV_OPERATIONS_POSTGRES_RUNTIME_URL to the isolated real PostgreSQL HTTP runtime.');
const parsedRuntimeUrl = new URL(runtimeUrl);
if (parsedRuntimeUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedRuntimeUrl.hostname)) {
  throw new Error('DSV_OPERATIONS_POSTGRES_RUNTIME_URL must be a localhost HTTP URL.');
}
if (!/^[0-9a-f]{40}(?:\+[a-z0-9-]+)?$/u.test(process.env.DSV_OPERATIONS_POSTGRES_SERVER_SHA ?? '')) {
  throw new Error('Set DSV_OPERATIONS_POSTGRES_SERVER_SHA to the exact isolated runtime identity reported by health.');
}

const port = Number(process.env.PLAYWRIGHT_OPERATIONS_POSTGRES_PORT ?? 4988);

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/operations-postgres.integration.spec.js',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  outputDir: '/tmp/dsv-operations-postgres-playwright',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm exec vite -- --host 127.0.0.1 --port ${port} --strictPort`,
    env: {
      VITE_DSV_API_MODE: 'remote',
      VITE_DSV_OPERATIONS_ENABLED: 'true',
      VITE_DSV_API_PROXY_TARGET: runtimeUrl,
      VITE_DSV_SHOP_DOMAIN: 'dsv-isolated.local',
    },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
