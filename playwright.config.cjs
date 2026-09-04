const { defineConfig } = require('@playwright/test');

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4174);

module.exports = defineConfig({
  expect: {
    timeout: 15_000,
  },
  testDir: './tests/e2e',
  testIgnore: [
    '**/static-structure.spec.js',
    ...(process.env.VITE_DSV_API_MODE === 'remote' ? [] : ['**/remote-v1-boundary.spec.js']),
  ],
  timeout: 45_000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `npm run build && npm exec vite -- preview --host 0.0.0.0 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
