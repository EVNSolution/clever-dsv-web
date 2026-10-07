const { defineConfig } = require('@playwright/test');

if (!process.env.DSV_OPERATIONS_SERVER_SOURCE) {
  throw new Error('Set DSV_OPERATIONS_SERVER_SOURCE to the exported pinned server source.');
}
const port = Number(process.env.PLAYWRIGHT_OPERATIONS_SOURCE_PORT ?? 4178);
const sourcePort = Number(process.env.DSV_OPERATIONS_SOURCE_PORT ?? 3007);

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/operations-source.integration.spec.js',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'node scripts/dsv-operations-source-server.mjs',
      url: `http://127.0.0.1:${sourcePort}/api/dsv/__fixture/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npm exec vite -- --host 127.0.0.1 --port ${port}`,
      url: `http://127.0.0.1:${port}`,
      env: {
        VITE_DSV_API_MODE: 'remote',
        VITE_DSV_OPERATIONS_ENABLED: 'true',
        VITE_DSV_API_PROXY_TARGET: `http://127.0.0.1:${sourcePort}`,
        VITE_DSV_SHOP_DOMAIN: 'dsv-demo.local',
        DSV_OPERATIONS_SOURCE_INTEGRATION: 'true',
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
