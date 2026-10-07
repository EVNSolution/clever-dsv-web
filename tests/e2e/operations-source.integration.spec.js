import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const ids = {
  execution: '44444444-4444-4444-8444-444444444444',
  report: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  notification: '66666666-6666-4666-8666-666666666666',
};

test('opens and handles the exact N07 report against pinned Fastify routes and real service DTOs', async ({ page, context }) => {
  const health = await context.request.get('/api/dsv/__fixture/health');
  expect(health.ok()).toBe(true);
  expect(JSON.stringify(await health.json())).toContain('af9b4b43b40a5c6c5cba7bc83587217b2bbe25ab');
  const login = await context.request.get('/api/dsv/__fixture/session/admin');
  expect(login.ok()).toBe(true);
  const calls = [];
  page.on('request', (request) => { if (request.url().includes('/api/dsv/v1/operations/')) calls.push({ method: request.method(), path: new URL(request.url()).pathname }); });
  await page.goto(`/executions?serviceDate=2026-10-07&execution=${ids.execution}`);
  const execution = page.getByRole('region', { name: '회차 상세', exact: true });
  await expect(execution).toContainText(ids.execution);
  await expect(execution).toContainText('N05');
  await page.getByRole('button', { name: '알림', exact: true }).click();
  await page.getByRole('button', { name: `알림 ${ids.notification} 열기`, exact: true }).click();
  const report = page.getByRole('region', { name: '미배송 보고 상세', exact: true });
  await expect(report).toContainText(ids.report);
  expect(calls.filter(({ method }) => method === 'POST')).toEqual([]);
  const before = await (await context.request.get('/api/dsv/__fixture/state')).json();
  await page.getByRole('button', { name: '읽음 기록', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '알림 읽음을 기록했습니다' })).toBeVisible();
  const read = await (await context.request.get('/api/dsv/__fixture/state')).json();
  expect(read.reportStatus).toBe(before.reportStatus);
  await report.getByRole('button', { name: '보고 확인', exact: true }).click();
  await expect(report.getByText('보고 상태', { exact: true }).locator('..').locator('dd')).toContainText('ACKNOWLEDGED');
  await report.getByRole('button', { name: '처리 완료', exact: true }).click();
  await expect(report.getByText('보고 상태', { exact: true }).locator('..').locator('dd')).toContainText('RESOLVED');
  await expect(report).toHaveAttribute('aria-busy', 'false');
  const after = await (await context.request.get('/api/dsv/__fixture/state')).json();
  expect(after.reportStatus).toBe('RESOLVED');
  expect(after.routeStatus).toBe(before.routeStatus);
  expect(after.stopStatus).toBe(before.stopStatus);
  expect(calls.filter(({ method }) => method === 'POST').map(({ path }) => path)).toEqual([
    `/api/dsv/v1/operations/notifications/${ids.notification}/acks`,
    `/api/dsv/v1/operations/delivery-exceptions/${ids.report}/acknowledge`,
    `/api/dsv/v1/operations/delivery-exceptions/${ids.report}/resolve`,
  ]);
  const screenshotDir = process.env.DSV_OPERATIONS_SCREENSHOT_DIR;
  if (screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: `${screenshotDir}/source-http-report-resolved.png`, fullPage: true });
  }
});
