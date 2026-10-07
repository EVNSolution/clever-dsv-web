import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const screenshotDir = process.env.DSV_OPERATIONS_POSTGRES_SCREENSHOT_DIR ?? '/tmp/dsv-operations-postgres-browser';
const expectedServerSha = process.env.DSV_OPERATIONS_POSTGRES_SERVER_SHA;

async function json(response) {
  expect(response.ok(), `${response.url()} returned ${response.status()}`).toBe(true);
  return response.json();
}

async function reset(context) {
  const health = await json(await context.request.get('/api/dsv/__fixture/health'));
  expect(health.data).toMatchObject({ database: 'postgresql' });
  expect(health.data.serverSha).toBe(expectedServerSha);
  const fixture = await json(await context.request.post('/api/dsv/__fixture/reset'));
  expect(fixture).toMatchObject({ contextId: expect.any(String), csrfToken: expect.any(String), serviceDate: expect.any(String), stopId: expect.any(String) });
  return fixture;
}

async function fixtureAction(context, fixture, action) {
  return json(await context.request.post(`/api/dsv/__fixture/actions/${action}`, {
    headers: { 'x-csrf-token': fixture.csrfToken },
  }));
}

async function state(context) {
  return json(await context.request.get('/api/dsv/__fixture/state'));
}

async function capture(page, name) {
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: true });
}

test('opens a Driver API N07 and keeps route, order, and stop state separate from report handling', async ({ page, context }) => {
  const fixture = await reset(context);
  const before = await state(context);
  expect(before).toMatchObject({
    orderCurrentRouteVersionId: before.expectedChildVersionId,
    routeStatus: 'READY',
    stopStatus: 'PENDING',
  });
  const created = await fixtureAction(context, fixture, 'report');
  expect(created.data).toMatchObject({ exceptionId: expect.any(String), notificationId: expect.any(String) });

  const operationsPosts = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path.includes('/api/dsv/v1/operations/')) operationsPosts.push(path);
  });
  await page.goto(`/executions?serviceDate=${fixture.serviceDate}&notification=${created.data.notificationId}`);
  const report = page.getByRole('region', { name: '미배송 보고 상세', exact: true });
  await expect(report).toContainText(created.data.exceptionId);
  await expect(report).toContainText(fixture.stopId);
  expect(operationsPosts).toEqual([]);

  await page.getByRole('button', { name: '읽음 기록', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '알림 읽음을 기록했습니다' })).toBeVisible();
  expect((await state(context)).reportStatus).toBe('OPEN');

  await report.getByRole('button', { name: '보고 확인', exact: true }).click();
  await expect(report.getByText('보고 상태', { exact: true }).locator('..').locator('dd')).toContainText('ACKNOWLEDGED');
  await report.getByRole('button', { name: '처리 완료', exact: true }).click();
  await expect(report.getByText('보고 상태', { exact: true }).locator('..').locator('dd')).toContainText('RESOLVED');

  const after = await state(context);
  expect(after).toMatchObject({
    reportStatus: 'RESOLVED',
    routeStatus: before.routeStatus,
    stopStatus: before.stopStatus,
    orderCurrentRouteVersionId: before.orderCurrentRouteVersionId,
  });
  expect(operationsPosts).toEqual([
    `/api/dsv/v1/operations/notifications/${created.data.notificationId}/acks`,
    `/api/dsv/v1/operations/delivery-exceptions/${created.data.exceptionId}/acknowledge`,
    `/api/dsv/v1/operations/delivery-exceptions/${created.data.exceptionId}/resolve`,
  ]);

  await capture(page, 'postgres-n07-resolved-1440x900');
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(report).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await capture(page, 'postgres-n07-resolved-375x812');
});

test('refreshes an OPEN start warning after the server approves route start', async ({ page, context }) => {
  const fixture = await reset(context);
  await page.clock.install();
  await page.goto(`/executions?serviceDate=${fixture.serviceDate}&execution=${fixture.contextId}`);
  const warning = page.getByRole('region', { name: '시작 경고', exact: true });
  await expect(warning).toContainText('OPEN');
  expect((await state(context)).warningStatus).toBe('OPEN');

  await fixtureAction(context, fixture, 'start');
  await page.clock.fastForward(30_000);
  await expect(warning).toContainText('RESOLVED');
  await expect(warning).not.toContainText('OPEN');
  expect((await state(context)).warningStatus).toBe('RESOLVED');
});
