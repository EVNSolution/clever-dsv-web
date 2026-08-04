const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: 'static-structure.spec.js',
  timeout: 30_000,
  workers: 1,
});
