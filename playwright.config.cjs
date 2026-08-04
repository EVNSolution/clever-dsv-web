const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  testIgnore: [
    '**/static-structure.spec.js',
    ...(process.env.VITE_DSV_API_MODE === 'remote' ? [] : ['**/remote-v1-boundary.spec.js']),
  ],
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
