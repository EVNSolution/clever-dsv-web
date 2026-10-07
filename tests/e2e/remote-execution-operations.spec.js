import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { adminSession, base, csrf, detail, envelope, execution, executionUrl, failure, ids, installOperationsFixtures, instant, mutationCalls, notification, operationsCalls, report, serviceDate, v1Envelope } from './fixtures/dsv-operations.js';

const screenshotDir = process.env.DSV_OPERATIONS_SCREENSHOT_DIR;
const executionButton = (page, id = ids.executionA) => page.getByRole('button', { name: `회차 ${id} 열기`, exact: true });
const reportButton = (page, id = ids.reportA) => page.getByRole('button', { name: `미배송 보고 ${id} 열기`, exact: true });
const reportRegion = (page) => page.getByRole('region', { name: '미배송 보고 상세', exact: true });
const reportState = (page) => reportRegion(page).getByText('보고 상태', { exact: true }).locator('..').locator('dd');
const detailRegion = (page) => page.getByRole('region', { name: '회차 상세', exact: true });
const refresh = (page) => page.getByRole('button', { name: '새로고침', exact: true });

async function screenshot(page, filename) {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: `${screenshotDir}/${filename}.png`, fullPage: true });
}
async function openExecution(page, api) {
  await page.goto(executionUrl());
  await executionButton(page).click();
  await expect(detailRegion(page)).toBeVisible();
  expect(api.unexpected).toEqual([]);
}
async function openNotification(page) {
  await page.getByRole('button', { name: '알림', exact: true }).click();
  await page.getByRole('button', { name: `알림 ${ids.notificationA} 열기`, exact: true }).click();
  await expect(reportRegion(page)).toContainText(ids.reportA);
}
async function fillMapping(page, mapping = 'NEW_EXECUTION') {
  const form = page.getByRole('form', { name: '회차 연결', exact: true });
  await form.getByLabel('연결할 배차 ID', { exact: true }).fill(ids.routeB);
  await form.getByRole('combobox').selectOption(mapping);
  if (mapping === 'SAME_EXECUTION') await form.getByLabel('연결할 회차 ID', { exact: true }).fill(ids.executionA);
  await form.getByLabel('적용 시각 (한국시간)', { exact: true }).fill('2026-10-07T09:00');
  return form;
}
async function fillSelection(page) {
  const form = page.getByRole('form', { name: '회차 선택', exact: true });
  await form.getByLabel('선택할 회차 ID', { exact: true }).fill(ids.executionA);
  await form.getByLabel('차량 ID', { exact: true }).fill(ids.vehicle);
  await form.getByLabel('선택 시작 (한국시간)', { exact: true }).fill('2026-10-07T09:00');
  await form.getByLabel('선택 종료 (한국시간)', { exact: true }).fill('2026-10-07T12:00');
  return form;
}

test('shows execution evidence and N01–N06 without writing business state', async ({ page }) => {
  const api = await installOperationsFixtures(page);
  await openExecution(page, api);
  const region = detailRegion(page);
  for (const value of ['N01', 'N02', 'N03', 'N04', 'N05', 'N06', ids.driver, ids.vehicle, 'synthetic-shadow-v1', 'SHADOW']) await expect(region).toContainText(value);
  await expect(region).toContainText(/시작 승인/u);
  await expect(region).toContainText(/출발 관측/u);
  await expect(region).toContainText(/작업.*시도|workerAttemptCount/u);
  await expect(region).toContainText(/기기.*수신.*확인|수신.*확인.*안|수신 여부.*확인/u);
  const warning = region.getByRole('region', { name: '시작 경고', exact: true });
  await expect(warning).toContainText('OPEN');
  await expect(warning).not.toContainText('RESOLVED');
  await expect(region).not.toContainText(/7회.*(?:수신 완료|기사.*전달)|수신 완료.*7/u);
  expect(mutationCalls(api)).toEqual([]);
  const listCall = operationsCalls(api).find(({ path }) => path === `${base}/executions`);
  expect(new URLSearchParams(listCall.search).get('serviceDate')).toBe(serviceDate);
  expect(operationsCalls(api).every(({ path }) => !path.includes('/operational-notifications'))).toBe(true);
  await screenshot(page, 'execution-evidence-desktop');
});

test('resolves N07 to the exact report and separates notification acks from report handling', async ({ page }) => {
  const api = await installOperationsFixtures(page);
  api.state.reports.reverse();
  await page.context().addCookies([{ name: 'dsv_admin_session', value: 'synthetic-cookie', url: 'http://127.0.0.1:4187' }]);
  await page.goto(executionUrl());
  await openNotification(page);
  await expect(reportRegion(page)).toContainText('합성 검증: 수취인에게 연락할 수 없습니다.');
  await expect(reportRegion(page)).not.toContainText('다른 보고. 이 보고를 열면 잘못된 이동입니다.');
  expect(mutationCalls(api)).toEqual([]);
  await page.getByRole('button', { name: '읽음 기록', exact: true }).click();
  await expect(reportRegion(page)).toContainText('알림 확인 시각 (종류 미제공)');
  await expect(reportRegion(page)).not.toContainText('열람 완료');
  await page.getByRole('button', { name: '열람 기록', exact: true }).click();
  expect(api.state.reports.find(({ id }) => id === ids.reportA).status).toBe('OPEN');
  expect(api.state.notifications[0].businessStatus).toBe('OPEN');
  const ackCalls = mutationCalls(api);
  expect(ackCalls.map(({ body }) => body)).toEqual([{ ackKind: 'READ' }, { ackKind: 'OPENED' }]);
  await reportRegion(page).getByRole('button', { name: '보고 확인', exact: true }).click();
  await expect(reportState(page)).toContainText('ACKNOWLEDGED');
  await reportRegion(page).getByRole('button', { name: '처리 완료', exact: true }).click();
  await expect(reportState(page)).toContainText('RESOLVED');
  const calls = mutationCalls(api);
  expect(calls.map(({ path }) => path)).toEqual([`${base}/notifications/${ids.notificationA}/acks`, `${base}/notifications/${ids.notificationA}/acks`, `${base}/delivery-exceptions/${ids.reportA}/acknowledge`, `${base}/delivery-exceptions/${ids.reportA}/resolve`]);
  expect(calls.every(({ headers }) => headers['x-csrf-token'] === csrf && headers.cookie?.includes('synthetic-cookie'))).toBe(true);
  expect(calls.slice(2).map(({ body }) => body)).toEqual([{}, {}]);
  expect(calls.some(({ path }) => /orders|events|stops|complete|failed/u.test(path))).toBe(false);
  expect(api.unexpected).toEqual([]);
  await expect(reportRegion(page)).toHaveAttribute('aria-busy', 'false');
  await screenshot(page, 'n07-report-resolved');
});

test('revalidates notification destinations on direct URLs, reload and manual refresh', async ({ page }) => {
  const api = await installOperationsFixtures(page);
  await page.goto(executionUrl(`notification=${ids.notificationA}`));
  await expect(reportRegion(page)).toContainText(ids.reportA);
  await page.reload();
  await expect(reportRegion(page)).toContainText(ids.reportA);
  await refresh(page).click();
  await expect.poll(() => operationsCalls(api).filter(({ path }) => path.endsWith(`/${ids.notificationA}/resolve`)).length).toBeGreaterThanOrEqual(3);
  expect(mutationCalls(api)).toEqual([]);
  expect(api.unexpected).toEqual([]);
});

test('supports direct report URLs with current session access and no automatic ack', async ({ page }) => {
  const api = await installOperationsFixtures(page);
  await page.goto(executionUrl(`report=${ids.reportA}`));
  await expect(reportRegion(page)).toContainText(ids.stopA);
  await page.reload();
  await expect(reportRegion(page)).toContainText(ids.reportA);
  expect(mutationCalls(api)).toEqual([]);
  expect(api.calls.findIndex(({ path }) => path === '/api/dsv/v1/session')).toBeLessThan(api.calls.findIndex(({ path }) => path === `${base}/delivery-exceptions/${ids.reportA}`));
  expect(api.unexpected).toEqual([]);
});

test('keeps read-only administrators from sending acks, reports or mapping commands', async ({ page }) => {
  const api = await installOperationsFixtures(page);
  api.state.session.scopes = ['dsv:session:read', 'dsv:control:read'];
  await page.goto(executionUrl(`notification=${ids.notificationA}`));
  await expect(reportRegion(page)).toContainText(ids.reportA);
  for (const name of ['읽음 기록', '열람 기록', '보고 확인', '처리 완료', '회차 연결 실행', '회차 선택 실행']) {
    const button = page.getByRole('button', { name, exact: true });
    if (await button.count()) await expect(button).toBeDisabled();
  }
  expect(mutationCalls(api)).toEqual([]);
  expect(api.unexpected).toEqual([]);
});

for (const session of [
  { ...adminSession, scopes: ['dsv:session:read'] },
  { principalType: 'CUSTOMER_USER', shopId: adminSession.shopId, customerId: ids.driver, scopes: ['dsv:session:read', 'dsv:control:read'] },
]) test(`blocks direct operations access for ${session.principalType} ${session.scopes.join(',')}`, async ({ page }) => {
  const api = await installOperationsFixtures(page, { 'GET /api/dsv/v1/session': v1Envelope(session) });
  await page.goto(executionUrl(`notification=${ids.notificationA}`));
  await expect(page.getByRole('alert')).toContainText(/조회 권한|현재 화면을 볼 수 없습니다/u);
  expect(operationsCalls(api)).toEqual([]);
});

test('does not change reports when the server rejects a missing CSRF token', async ({ page }) => {
  const api = await installOperationsFixtures(page, { [`POST ${base}/delivery-exceptions/${ids.reportA}/acknowledge`]: failure(403, 'FORBIDDEN', 'Invalid CSRF token'), 'GET /api/dsv/auth/session': envelope({}) });
  delete api.state.session.csrfToken;
  await page.goto(executionUrl(`report=${ids.reportA}`));
  await expect(reportRegion(page).getByRole('button', { name: '보고 확인', exact: true })).toBeVisible();
  await reportRegion(page).getByRole('button', { name: '보고 확인', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/권한|보안 토큰/u);
  expect(api.state.reports[0].status).toBe('OPEN');
  expect(mutationCalls(api)).toHaveLength(1);
  expect(mutationCalls(api)[0].headers['x-csrf-token']).toBeUndefined();
  expect(api.unexpected).toEqual([]);
});

test('uses current permissions after read scope is revoked', async ({ page }) => {
  const api = await installOperationsFixtures(page);
  await page.goto(executionUrl(`report=${ids.reportA}`));
  await expect(reportRegion(page)).toBeVisible();
  api.state.session.scopes = ['dsv:session:read'];
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toContainText('조회 권한');
  await expect(reportRegion(page).getByRole('region', { name: '보고 설명', exact: true })).toHaveCount(0);
  expect(mutationCalls(api)).toEqual([]);
});

test('removes old tenant detail when current session changes tenant', async ({ page }) => {
  const api = await installOperationsFixtures(page);
  await page.goto(executionUrl(`report=${ids.reportA}`));
  await expect(reportRegion(page)).toContainText('합성 검증');
  api.state.session.shopId = '01234567-0123-4123-8123-0123456789ff';
  api.handlers[`GET ${base}/delivery-exceptions/${ids.reportA}`] = failure(404, 'REPORT_NOT_FOUND');
  api.state.reports = [];
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toContainText(/대상을 찾을 수 없습니다/u);
  await expect(page.locator('body')).not.toContainText('합성 검증: 수취인');
  expect(mutationCalls(api)).toEqual([]);
  expect(operationsCalls(api).every(({ search, body }) => !/shopId|tenantId/u.test(`${search}${JSON.stringify(body)}`))).toBe(true);
});

test('restores the exact notification URL after login and re-runs the resolver', async ({ page }) => {
  let authenticated = false;
  const api = await installOperationsFixtures(page, {
    'GET /api/dsv/v1/session': () => authenticated ? v1Envelope(adminSession) : { status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'session required', requestId: 'synthetic-login' } } },
    'POST /api/dsv/auth/login': () => { authenticated = true; return envelope({ csrfToken: csrf }); },
  });
  await page.goto(executionUrl(`notification=${ids.notificationA}`));
  await expect(page).toHaveURL(/\/login/u);
  expect(operationsCalls(api)).toEqual([]);
  await page.getByRole('textbox', { name: 'ID', exact: true }).fill('synthetic-admin');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(reportRegion(page)).toContainText(ids.reportA);
  await expect(page).toHaveURL(new RegExp(`notification=${ids.notificationA}`, 'u'));
  expect(mutationCalls(api)).toEqual([]);
  expect(api.unexpected).toEqual([]);
});

for (const [status, code, expected] of [
  [403, 'FORBIDDEN', '권한'], [404, 'NOT_FOUND', '대상을 찾을 수 없습니다'],
  [409, 'ASSIGNMENT_CHANGED', '최신 상태'], [503, 'DEPENDENCY_UNAVAILABLE', '서버 지원'],
]) test(`shows a safe ${status} notification destination error without opening a report`, async ({ page }) => {
  const api = await installOperationsFixtures(page, { [`GET ${base}/notifications/${ids.notificationA}/resolve`]: failure(status, code) });
  await page.goto(executionUrl(`notification=${ids.notificationA}`));
  await expect(page.getByRole('alert')).toContainText(expected);
  await expect(reportRegion(page).getByRole('region', { name: '보고 설명', exact: true })).toHaveCount(0);
  expect(operationsCalls(api).some(({ path }) => path === `${base}/delivery-exceptions/${ids.reportA}`)).toBe(false);
  expect(mutationCalls(api)).toEqual([]);
  await screenshot(page, `notification-error-${status}`);
});

test('shows connection failure and permits a manual recovery', async ({ page }) => {
  let failed = true;
  const api = await installOperationsFixtures(page, {
    [`GET ${base}/executions`]: async ({ route, state }) => { if (failed) { await route.abort('failed'); return null; } return envelope({ items: state.executions, limit: 100 }); },
  });
  await page.goto(executionUrl());
  await expect(page.getByRole('alert')).toContainText(/연결/u);
  failed = false;
  await refresh(page).click();
  await expect(executionButton(page)).toBeVisible();
  expect(api.unexpected).toEqual([]);
});

test('displays unknown states and all server truncation flags', async ({ page }) => {
  const data = detail();
  data.context.status = 'FUTURE_STATE';
  data.context.notificationMode = 'FUTURE_MODE';
  data.context.reminderStatus = 'FUTURE_REMINDER';
  data.context.endReason = 'FUTURE_END';
  data.geofenceEvidence.truncated = true;
  data.deliveryExceptions.truncated = true;
  data.notifications.truncated = true;
  data.notifications.attemptsTruncated = true;
  const api = await installOperationsFixtures(page, {
    [`GET ${base}/executions`]: envelope({ items: [execution({ operationalSummaryTruncated: true })], limit: 100 }),
    [`GET ${base}/executions/${ids.executionA}`]: envelope(data),
  });
  await openExecution(page, api);
  for (const state of ['FUTURE_STATE', 'FUTURE_MODE', 'FUTURE_REMINDER', 'FUTURE_END']) await expect(detailRegion(page)).toContainText(state);
  await expect(detailRegion(page)).toContainText(/100/u);
  await expect(detailRegion(page)).toContainText(/제한|잘림|일부|truncated/u);
  expect(mutationCalls(api)).toEqual([]);
});

test('blocks new SAME_EXECUTION and selection commands for an exact target with an unknown status', async ({ page }) => {
  const future = detail();
  future.context.status = 'FUTURE_STATE';
  const api = await installOperationsFixtures(page, {
    [`GET ${base}/executions/${ids.executionA}`]: envelope(future),
  });
  await openExecution(page, api);

  const mapForm = await fillMapping(page, 'SAME_EXECUTION');
  await mapForm.getByLabel('연결할 회차 ID', { exact: true }).fill(ids.executionA.toUpperCase());
  await mapForm.getByRole('button', { name: '회차 연결 실행', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/상태.*해석.*새 명령.*보내지 않았/u);

  const selectForm = await fillSelection(page);
  await selectForm.getByLabel('선택할 회차 ID', { exact: true }).fill(ids.executionA.toUpperCase());
  await selectForm.getByRole('button', { name: '회차 선택 실행', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('FUTURE_STATE');
  expect(mutationCalls(api)).toEqual([]);
  expect(api.unexpected).toEqual([]);
});

for (const [name, response] of [
  ['legacy v1 envelope', v1Envelope({ items: [execution()], limit: 100 })],
  ['extra envelope field', { ...envelope({ items: [execution()], limit: 100 }), meta: { apiVersion: 'dsv.v1' } }],
  ['non-null error on success', { data: { items: [], limit: 100 }, error: { code: 'AMBIGUOUS', message: 'ambiguous' } }],
  ['wrong UUID DTO', envelope({ items: [execution({ executionContextId: 'execution-symbolic' })], limit: 100 })],
]) test(`rejects ${name} without fallback data`, async ({ page }) => {
  const api = await installOperationsFixtures(page, { [`GET ${base}/executions`]: response });
  await page.goto(executionUrl());
  await expect(page.getByRole('alert')).toContainText(/응답.*형식|응답.*올바르|응답.*계약/u);
  await expect(executionButton(page)).toHaveCount(0);
  expect(mutationCalls(api)).toEqual([]);
});

test('rejects a resolver destination outside the operations report contract', async ({ page }) => {
  const api = await installOperationsFixtures(page, {
    [`GET ${base}/notifications/${ids.notificationA}/resolve`]: envelope({ notificationId: ids.notificationA, destination: { type: 'EXECUTION', executionContextId: ids.executionA, routePlanId: ids.routeA } }),
  });
  await page.goto(executionUrl(`notification=${ids.notificationA}`));
  await expect(page.getByRole('alert')).toContainText(/응답.*형식|응답.*올바르|응답.*계약/u);
  await expect(reportRegion(page).getByRole('region', { name: '보고 설명', exact: true })).toHaveCount(0);
  expect(mutationCalls(api)).toEqual([]);
});

test('keeps opaque pagination cursors bounded and exposes later notifications and reports', async ({ page }) => {
  const cursor = 'eyJpZCI6ImZpeHR1cmUiLCJjcmVhdGVkQXQiOiIyMDI2LTEwLTA3In0';
  const api = await installOperationsFixtures(page, {
    [`GET ${base}/notifications`]: ({ url }) => envelope({ items: [notification({ id: url.searchParams.has('cursor') ? ids.notificationB : ids.notificationA })], nextCursor: url.searchParams.has('cursor') ? null : cursor }),
    [`GET ${base}/delivery-exceptions`]: ({ url }) => envelope({ items: [report({ id: url.searchParams.has('cursor') ? ids.reportB : ids.reportA })], nextCursor: url.searchParams.has('cursor') ? null : cursor }),
  });
  await page.goto(executionUrl());
  await page.getByRole('button', { name: '알림', exact: true }).click();
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
  await expect(page.getByRole('button', { name: `알림 ${ids.notificationB} 열기`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '미배송 보고', exact: true }).click();
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
  await expect(reportButton(page, ids.reportB)).toBeVisible();
  const pages = operationsCalls(api).filter(({ search }) => search.includes('cursor='));
  expect(pages).toHaveLength(2);
  expect(pages.map(({ search }) => [...new URLSearchParams(search).keys()])).toEqual([['limit', 'cursor'], ['limit', 'cursor']]);
  expect(pages.every(({ method, search }) => method === 'GET' && new URLSearchParams(search).get('cursor') === cursor)).toBe(true);
  expect(mutationCalls(api)).toEqual([]);
});

test('refreshes every 30 seconds while preserving selected detail and form input', async ({ page }) => {
  await page.clock.install();
  const api = await installOperationsFixtures(page);
  await openExecution(page, api);
  const form = await fillMapping(page);
  const count = operationsCalls(api).filter(({ path }) => path === `${base}/executions`).length;
  await page.clock.fastForward(30_100);
  await expect.poll(() => operationsCalls(api).filter(({ path }) => path === `${base}/executions`).length).toBeGreaterThan(count);
  await expect(detailRegion(page)).toContainText(ids.executionA);
  await expect(form.getByLabel('연결할 배차 ID', { exact: true })).toHaveValue(ids.routeB);
  await expect(form.getByLabel('적용 시각 (한국시간)', { exact: true })).toHaveValue('2026-10-07T09:00');
  expect(mutationCalls(api)).toEqual([]);
});

test('ignores a late detail response after the operator selects another execution', async ({ page }) => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const api = await installOperationsFixtures(page, {
    [`GET ${base}/executions/${ids.executionA}`]: async () => { await pending; return envelope(detail()); },
  });
  await page.goto(executionUrl());
  await executionButton(page).click();
  await expect.poll(() => operationsCalls(api).some(({ path }) => path === `${base}/executions/${ids.executionA}`)).toBe(true);
  await executionButton(page, ids.executionB).click();
  await expect(detailRegion(page)).toContainText(ids.executionB);
  release();
  await expect(detailRegion(page)).not.toContainText(ids.executionA);
  await expect(page).toHaveURL(new RegExp(`execution=${ids.executionB}`, 'u'));
});

test('freezes lost map input and retries the identical command without duplicate submissions', async ({ page }) => {
  let count = 0;
  const api = await installOperationsFixtures(page, {
    [`POST ${base}/executions/map`]: async ({ route }) => { count += 1; if (count === 1) { await route.abort('failed'); return null; } return envelope({ assignmentEpoch: '9', executionContextId: ids.executionA, notificationKinds: [], outcome: 'REPLAY', routePlanId: ids.routeB, routeVersion: 3 }); },
  });
  await page.goto(executionUrl());
  const form = await fillMapping(page);
  await form.getByRole('button', { name: '회차 연결 실행', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/결과.*확인|연결하지 못/u);
  await expect(form.getByLabel('연결할 배차 ID', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '같은 명령 재시도', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /회차 연결 결과: REPLAY/u })).toBeVisible();
  const calls = mutationCalls(api);
  expect(calls).toHaveLength(2);
  expect(calls[0].body).toEqual(calls[1].body);
  expect(calls[0].body).toEqual({ commandId: expect.stringMatching(/^[0-9a-f-]{36}$/u), effectiveAt: instant, mapping: 'NEW_EXECUTION', routePlanId: ids.routeB });
  expect(calls.every(({ headers }) => headers['x-csrf-token'] === csrf)).toBe(true);
  expect(api.unexpected).toEqual([]);
});

test('maps SAME_EXECUTION explicitly and refreshes after conflict without overwriting', async ({ page }) => {
  const api = await installOperationsFixtures(page, { [`POST ${base}/executions/map`]: failure(409, 'EXECUTION_CONTEXT_SCOPE_INVALID') });
  await page.goto(executionUrl());
  const before = operationsCalls(api).filter(({ path }) => path === `${base}/executions`).length;
  const form = await fillMapping(page, 'SAME_EXECUTION');
  await form.getByRole('button', { name: '회차 연결 실행', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('최신 상태');
  await expect.poll(() => operationsCalls(api).filter(({ path }) => path === `${base}/executions`).length).toBeGreaterThan(before);
  expect(mutationCalls(api)).toHaveLength(1);
  expect(mutationCalls(api)[0].body).toMatchObject({ executionContextId: ids.executionA, mapping: 'SAME_EXECUTION', routePlanId: ids.routeB });
  await expect(page.getByRole('button', { name: '같은 명령 재시도', exact: true })).toHaveCount(0);
});

test('selects a vehicle execution with an explicit bounded interval and the same retry command', async ({ page }) => {
  let count = 0;
  const api = await installOperationsFixtures(page, {
    [`POST ${base}/executions/select`]: async ({ route }) => { count += 1; if (count === 1) { await route.abort('failed'); return null; } return envelope({ executionContextId: ids.executionA, outcome: 'REPLAY', vehicleId: ids.vehicle }); },
  });
  await page.goto(executionUrl());
  const form = await fillSelection(page);
  await form.getByRole('button', { name: '회차 선택 실행', exact: true }).click();
  await expect(form.getByLabel('차량 ID', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '같은 명령 재시도', exact: true }).click();
  const calls = mutationCalls(api);
  expect(calls).toHaveLength(2);
  expect(calls[0].body).toEqual(calls[1].body);
  expect(calls[0].body).toEqual({ commandId: expect.stringMatching(/^[0-9a-f-]{36}$/u), executionContextId: ids.executionA, validFrom: instant, validUntil: '2026-10-07T03:00:00.000Z', vehicleId: ids.vehicle });
});

test('rejects invalid selection intervals before network mutations', async ({ page }) => {
  const api = await installOperationsFixtures(page);
  await page.goto(executionUrl());
  const form = await fillSelection(page);
  await form.getByLabel('선택 종료 (한국시간)', { exact: true }).fill('2026-10-07T08:00');
  await form.getByRole('button', { name: '회차 선택 실행', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/종료.*시작|시작.*종료/u);
  expect(mutationCalls(api)).toEqual([]);
});

test('keeps report resolved when a concurrent acknowledgement returns the final server state', async ({ page }) => {
  const api = await installOperationsFixtures(page, {
    [`POST ${base}/delivery-exceptions/${ids.reportA}/acknowledge`]: ({ state }) => { Object.assign(state.reports[0], { acknowledgedAt: instant, resolvedAt: instant, status: 'RESOLVED' }); return envelope(state.reports[0]); },
  });
  await page.goto(executionUrl(`report=${ids.reportA}`));
  await reportRegion(page).getByRole('button', { name: '보고 확인', exact: true }).click();
  await expect(reportState(page)).toContainText('RESOLVED');
  const acknowledge = reportRegion(page).getByRole('button', { name: '보고 확인', exact: true });
  if (await acknowledge.count()) await expect(acknowledge).toBeDisabled();
  expect(mutationCalls(api)).toHaveLength(1);
});

test('keeps report input and current screen on a forbidden mutation response', async ({ page }) => {
  const api = await installOperationsFixtures(page, { [`POST ${base}/delivery-exceptions/${ids.reportA}/acknowledge`]: failure(403, 'CSRF_INVALID') });
  await page.goto(executionUrl(`report=${ids.reportA}`));
  await reportRegion(page).getByRole('button', { name: '보고 확인', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('권한');
  await expect(reportRegion(page)).toContainText(ids.reportA);
  expect(api.state.reports[0].status).toBe('OPEN');
  expect(mutationCalls(api)).toHaveLength(1);
});

test('renders report text safely and retains a usable narrow viewport', async ({ page }) => {
  const unsafe = '<img src=x onerror="window.__dsvOperationsXss=true">';
  const api = await installOperationsFixtures(page);
  api.state.reports[0].explanation = unsafe;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(executionUrl(`report=${ids.reportA}`));
  await expect(reportRegion(page)).toContainText(unsafe);
  await expect(reportRegion(page).locator('img, script')).toHaveCount(0);
  expect(await page.evaluate(() => window.__dsvOperationsXss)).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await screenshot(page, 'report-mobile');
});

test('restores the frozen map receipt after reload without creating a replacement command', async ({ page }) => {
  let count = 0;
  const api = await installOperationsFixtures(page, {
    [`POST ${base}/executions/map`]: async ({ route }) => {
      count += 1;
      if (count === 1) { await route.abort('failed'); return null; }
      return envelope({ assignmentEpoch: '9', executionContextId: ids.executionA, notificationKinds: [], outcome: 'REPLAY', routePlanId: ids.routeB, routeVersion: 3 });
    },
  });
  await page.goto(executionUrl());
  const form = await fillMapping(page);
  await form.getByRole('button', { name: '회차 연결 실행', exact: true }).click();
  await expect(page.getByRole('button', { name: '같은 명령 재시도', exact: true })).toBeVisible();
  const first = mutationCalls(api)[0].body;
  await page.reload();
  await expect(page.getByRole('button', { name: '같은 명령 재시도', exact: true })).toBeVisible();
  expect(mutationCalls(api)).toHaveLength(1);
  await page.getByRole('button', { name: '같은 명령 재시도', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '회차 연결 결과: REPLAY' })).toBeVisible();
  expect(mutationCalls(api)[1].body).toEqual(first);
});

for (const outcome of ['MAPPING_REQUIRED', 'REPLAY', 'FUTURE_OUTCOME']) test(`shows ${outcome} without an accepted context as an unconfirmed mapping`, async ({ page }) => {
  const api = await installOperationsFixtures(page, {
    [`POST ${base}/executions/map`]: envelope({ assignmentEpoch: null, executionContextId: null, notificationKinds: [], outcome, routePlanId: ids.routeB, routeVersion: null }),
  });
  await page.goto(executionUrl());
  const form = await fillMapping(page);
  await form.getByRole('button', { name: '회차 연결 실행', exact: true }).click();
  const status = page.getByRole('alert').filter({ hasText: `회차 연결 결과: ${outcome}` });
  await expect(status).toContainText('회차 연결을 확정할 수 없습니다');
  await expect(status).not.toContainText('회차 ID:');
  expect(mutationCalls(api)).toHaveLength(1);
  if (outcome === 'FUTURE_OUTCOME') await expect(page.getByRole('button', { name: '같은 명령 재시도', exact: true })).toBeVisible();
});

test('suppresses repeated map submission while the first response is pending', async ({ page }) => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const api = await installOperationsFixtures(page, {
    [`POST ${base}/executions/map`]: async () => { await pending; return envelope({ assignmentEpoch: '9', executionContextId: ids.executionA, notificationKinds: [], outcome: 'ACCEPT', routePlanId: ids.routeB, routeVersion: 3 }); },
  });
  await page.goto(executionUrl());
  const form = await fillMapping(page);
  await form.evaluate((element) => { element.requestSubmit(); element.requestSubmit(); element.requestSubmit(); });
  await expect.poll(() => mutationCalls(api).length).toBe(1);
  await expect(form.getByRole('button', { name: '회차 연결 실행', exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole('status').filter({ hasText: '회차 연결 결과: ACCEPT' })).toBeVisible();
  expect(mutationCalls(api)).toHaveLength(1);
});

test('treats an HTML 404 response as unavailable current destination without exposing prior detail', async ({ page }) => {
  const api = await installOperationsFixtures(page, {
    [`GET ${base}/notifications/${ids.notificationA}/resolve`]: async ({ route }) => { await route.fulfill({ status: 404, contentType: 'text/html', body: '<html>old server</html>' }); return null; },
  });
  await page.goto(executionUrl(`notification=${ids.notificationA}`));
  await expect(page.getByRole('alert')).toContainText('대상을 찾을 수 없습니다');
  await expect(reportRegion(page).getByRole('region', { name: '보고 설명', exact: true })).toHaveCount(0);
  expect(mutationCalls(api)).toEqual([]);
});

test('keeps execution controls usable at the required desktop, tablet and phone widths', async ({ page }) => {
  const api = await installOperationsFixtures(page);
  await page.goto(executionUrl(`execution=${ids.executionA}`));
  await expect(detailRegion(page)).toContainText(ids.executionA);
  for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [390, 844], [375, 812]]) {
    await page.setViewportSize({ width, height });
    await expect(refresh(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${width} x ${height} document overflow`).toBe(true);
    const boxes = await page.locator('.execution-operations, .execution-tabs .btn, .execution-toolbar input, .execution-toolbar button, .execution-command-grid form, .execution-operations .page-panel').evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { element: element.getAttribute('aria-label') ?? element.className, left: rect.left, right: rect.right };
    }));
    for (const box of boxes) {
      expect(box.left, `${width} x ${height}: ${box.element} clipped left`).toBeGreaterThanOrEqual(0);
      expect(box.right, `${width} x ${height}: ${box.element} clipped right`).toBeLessThanOrEqual(width + 1);
    }
    await screenshot(page, `execution-${width}x${height}`);
  }
  expect(api.unexpected).toEqual([]);
});

test('supports phone navigation from execution detail to the exact report', async ({ page }) => {
  const api = await installOperationsFixtures(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(executionUrl(`execution=${ids.executionA}`));
  await expect(detailRegion(page)).toContainText(ids.executionA);
  await page.getByRole('button', { name: '미배송 보고', exact: true }).click();
  await reportButton(page).click();
  await expect(reportState(page)).toContainText('OPEN');
  await expect(reportRegion(page)).toContainText(ids.stopA);
  expect(mutationCalls(api)).toEqual([]);
  await screenshot(page, 'report-phone-direct');
});

test('revalidates the same report after an operations 401 and login recovery', async ({ page }) => {
  let authenticated = true;
  const api = await installOperationsFixtures(page, {
    'GET /api/dsv/v1/session': () => authenticated ? v1Envelope(adminSession) : { status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'session expired', requestId: 'synthetic-expired' } } },
    'POST /api/dsv/auth/login': () => { authenticated = true; return envelope({ csrfToken: csrf }); },
    [`GET ${base}/delivery-exceptions/${ids.reportA}`]: ({ state }) => authenticated ? envelope(state.reports[0]) : failure(401, 'UNAUTHORIZED'),
  });
  await page.goto(executionUrl(`report=${ids.reportA}`));
  await expect(reportRegion(page)).toContainText(ids.reportA);
  authenticated = false;
  await refresh(page).click();
  await expect(page).toHaveURL(/\/login/u);
  await page.getByRole('textbox', { name: 'ID', exact: true }).fill('synthetic-admin');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(reportState(page)).toContainText('OPEN');
  await expect(page).toHaveURL(new RegExp(`report=${ids.reportA}`, 'u'));
  expect(mutationCalls(api)).toEqual([]);
});

test('rejects a report that does not match the resolver target fence', async ({ page }) => {
  const api = await installOperationsFixtures(page, {
    [`GET ${base}/notifications/${ids.notificationA}/resolve`]: envelope({ notificationId: ids.notificationA, destination: { executionContextId: ids.executionA, reportId: ids.reportA, targetStopId: ids.stopB, type: 'OPERATIONS_EXCEPTION' } }),
  });
  await page.goto(executionUrl(`notification=${ids.notificationA}`));
  await expect(page.getByRole('alert')).toContainText(/응답.*계약/u);
  await expect(reportRegion(page).getByRole('region', { name: '보고 설명', exact: true })).toHaveCount(0);
  expect(mutationCalls(api)).toEqual([]);
});

for (const state of ['CANCELLED', 'REASSIGNED', 'EXPIRED']) test(`shows ${state} execution provenance on the retained operations report`, async ({ page }) => {
  const api = await installOperationsFixtures(page, {
    [`GET ${base}/executions/${ids.executionA}`]: envelope(detail({ context: { ...detail().context, status: state, endReason: state, assignmentEpoch: '10', closedAt: instant } })),
  });
  await page.goto(executionUrl(`notification=${ids.notificationA}`));
  await expect(reportRegion(page)).toContainText(state);
  await expect(reportRegion(page)).toContainText(/보고 시점.*배정|현재 배정|이전 배정|별도.*보고/u);
  await expect(reportState(page)).toContainText('OPEN');
  expect(mutationCalls(api)).toEqual([]);
});

test('prioritizes permission loss over a simultaneous list failure and removes previous data', async ({ page }) => {
  const api = await installOperationsFixtures(page);
  await page.goto(executionUrl(`notification=${ids.notificationA}`));
  await expect(reportState(page)).toContainText('OPEN');
  await expect(page.getByRole('button', { name: `알림 ${ids.notificationA} 열기`, exact: true })).toBeVisible();
  api.handlers[`GET ${base}/notifications`] = failure(502, 'UPSTREAM_FAILURE');
  api.handlers[`GET ${base}/notifications/${ids.notificationA}/resolve`] = failure(403, 'FORBIDDEN');
  await refresh(page).click();
  await expect(page.getByRole('alert')).toContainText('권한');
  await expect(page.getByRole('button', { name: `알림 ${ids.notificationA} 열기`, exact: true })).toHaveCount(0);
  await expect(reportRegion(page).getByRole('region', { name: '보고 설명', exact: true })).toHaveCount(0);
  expect(mutationCalls(api)).toEqual([]);
});
