import { test, expect } from '@playwright/test';
import { adminSession, executionUrl, installOperationsFixtures, operationsCalls, v1Envelope } from './fixtures/dsv-operations.js';

test('keeps execution operations disabled by default and preserves legacy access', async ({ page }) => {
  test.skip(process.env.VITE_DSV_API_MODE !== 'remote' || process.env.VITE_DSV_OPERATIONS_ENABLED === 'true', 'Default-OFF remote build only.');
  const api = await installOperationsFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/control': v1Envelope({ serviceDate: '2026-10-07', totalDispatchCount: 0, assignedCount: 0, unassignedCount: 0, pendingEtaCount: 0, failedEtaCount: 0, readyEtaCount: 0 }),
    'GET /api/dsv/v1/control/routes': v1Envelope({ routes: [], serviceDate: '2026-10-07' }),
    'GET /api/dsv/v1/vehicles?limit=100': v1Envelope({ items: [], page: { hasMore: false } }),
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({ items: [], page: { hasMore: false } }),
    'GET /api/dsv/v1/dispatches': v1Envelope({ items: [], page: { hasMore: false } }),
  });
  await page.goto(executionUrl());
  await expect(page.getByRole('link', { name: '회차', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '회차 상세', exact: true })).toHaveCount(0);
  expect(operationsCalls(api)).toEqual([]);
});
