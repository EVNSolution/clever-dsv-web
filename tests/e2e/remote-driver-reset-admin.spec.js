import { test, expect } from '@playwright/test';

const driverId = '11111111-1111-4111-8111-111111111111';
const token = 'test-reset-token-'.padEnd(43, 'x');
const name = 'Reset Fixture Driver';
const phone = '01098765432';
const scopes = ['dsv:resources:read', 'dsv:customers:read', 'dsv:destinations:read', 'dsv:conditions:read', 'dsv:accounts:write'];
const envelope = (data) => ({ data, error: null });
const v1 = (data) => ({ data, meta: { apiVersion: 'dsv.v1' }, requestId: 'reset-fixture' });

test.skip(process.env.VITE_DSV_API_MODE !== 'remote', 'remote API contract');

async function setup(page, options = {}) {
  const writes = [];
  const logs = [];
  page.on('console', (message) => logs.push(message.text()));
  page.on('pageerror', (error) => logs.push(error.message));
  await page.addInitScript(() => {
    window.__clipboardCalls = 0;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { window.__clipboardCalls += 1; } } });
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() !== 'GET') writes.push({ path, body: request.postDataJSON(), headers: request.headers() });
    let body;
    let status = 200;
    if (path === '/api/dsv/v1/session') body = v1({ principalType: options.role ?? 'DSV_ADMIN', actorId: 'admin-fixture', customerId: 'customer-fixture', shopId: 'shop-fixture', displayName: 'Fixture Admin', csrfToken: 'csrf-fixture', scopes: options.scopes ?? scopes });
    else if (path === `/api/dsv/drivers/${driverId}/password-reset-link`) {
      if (options.wait) await options.wait;
      status = options.status ?? 201;
      body = status === 201 ? envelope({ passwordReset: { method: 'ADMIN_LINK', expiresAt: options.expiresAt ?? new Date(Date.now() + 1800000).toISOString(), setupUrl: `${url.origin}/driver/password-reset#token=${token}`, ...options.reset } }) : { data: null, error: { code: 'FIXTURE_ERROR', message: `unsafe ${token} ${name} ${phone}` } };
    } else if (path === '/api/dsv/v1/drivers') body = v1({ items: [{ driverId, displayName: name, phone, status: 'ACTIVE' }], page: { hasMore: false } });
    else if (path === '/api/dsv/v1/vehicles') body = v1({ items: [{ vehicleId: 'vehicle-fixture', displayName: 'Fixture Vehicle', vehiclePlate: '99가 9999', vehicleType: 'OTHER', status: 'ACTIVE', driverAssignments: [{ assignmentId: 'assignment-fixture', driverId }] }], page: { hasMore: false } });
    else if (path === '/api/dsv/driver-account-links/pending') body = envelope({ reviews: [] });
    else if (path.startsWith('/api/dsv/v1/')) body = v1({ items: [], page: { hasMore: false } });
    else body = envelope({});
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/master-data');
  return { writes, logs };
}

async function open(page) {
  const row = page.getByLabel('배송원 리스트', { exact: true }).getByRole('row').filter({ hasText: name });
  if (await row.getAttribute('aria-selected') !== 'true') await row.click();
  await page.getByRole('button', { name: '비밀번호 초기화', exact: true }).click();
  return page.getByRole('dialog');
}

async function issue(page) {
  const dialog = await open(page);
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: '초기화 링크 발급', exact: true }).click();
  return dialog;
}

async function noLeaks(page, logs) {
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  for (const secret of [token, name, phone]) {
    expect(logs.join('\n')).not.toContain(secret);
    expect(storage).not.toContain(secret);
    expect(page.url()).not.toContain(secret);
  }
}

test('confirms the precise driver, issues only reset, copies once and clears without assignment changes', async ({ page }) => {
  const api = await setup(page);
  const dialog = await open(page);
  await expect(dialog).toContainText(driverId);
  await expect(dialog).toContainText(name);
  if (process.env.DRIVER_RESET_SCREENSHOT) await page.screenshot({ path: process.env.DRIVER_RESET_SCREENSHOT });
  await expect(dialog.getByRole('button', { name: '초기화 링크 발급', exact: true })).toBeDisabled();
  expect(api.writes).toEqual([]);
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: '초기화 링크 발급', exact: true }).dblclick();
  await expect(dialog.getByLabel('일회용 초기화 링크')).toHaveValue(new RegExp(`#token=${token}$`));
  expect(api.writes).toHaveLength(1);
  expect(api.writes[0]).toMatchObject({ path: `/api/dsv/drivers/${driverId}/password-reset-link`, body: {}, headers: { 'x-csrf-token': 'csrf-fixture' } });
  await noLeaks(page, api.logs);
  await dialog.getByRole('button', { name: '링크 한 번 복사' }).click();
  await expect(dialog.getByLabel('일회용 초기화 링크')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '링크 한 번 복사' })).toHaveCount(0);
  expect(await page.evaluate(() => window.__clipboardCalls)).toBe(1);
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.getByLabel('배송원 상세', { exact: true })).toContainText('99가 9999');
  await open(page);
  await expect(page.getByLabel('일회용 초기화 링크')).toHaveCount(0);
  expect(api.writes).toHaveLength(1);
});

for (const [title, overrides] of [
  ['read-only admin', { scopes: scopes.filter((scope) => scope !== 'dsv:accounts:write') }],
  ['customer', { role: 'CUSTOMER_USER' }],
  ['missing resource permission', { scopes: scopes.filter((scope) => scope !== 'dsv:resources:read') }],
]) test(`denies ${title}`, async ({ page }) => {
  const api = await setup(page, overrides);
  if (title === 'read-only admin') await page.getByLabel('배송원 리스트', { exact: true }).getByRole('row').filter({ hasText: name }).click();
  else await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: '비밀번호 초기화', exact: true })).toHaveCount(0);
  expect(api.writes).toEqual([]);
});

for (const status of [401, 403, 404, 429, 503, 500]) test(`handles ${status} without exposing response secrets`, async ({ page }) => {
  const api = await setup(page, { status });
  await issue(page);
  if (status === 401) await expect(page).toHaveURL(/\/login$/u);
  else await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(token);
  await noLeaks(page, api.logs);
  expect(api.writes).toHaveLength(1);
});

test('clears an expired link and refuses copying', async ({ page }) => {
  await page.clock.install();
  const api = await setup(page, { expiresAt: new Date(Date.now() + 5000).toISOString() });
  const dialog = await issue(page);
  await expect(dialog.getByLabel('일회용 초기화 링크')).toBeVisible();
  await page.clock.fastForward(6000);
  await expect(dialog.getByRole('status')).toContainText('만료');
  await expect(dialog.getByLabel('일회용 초기화 링크')).toHaveCount(0);
  expect(await page.evaluate(() => window.__clipboardCalls)).toBe(0);
  await noLeaks(page, api.logs);
});

for (const action of ['close', 'pagehide', 'copy failure']) test(`discards secret on ${action}`, async ({ page }) => {
  const api = await setup(page);
  const dialog = await issue(page);
  await expect(dialog.getByLabel('일회용 초기화 링크')).toBeVisible();
  if (action === 'close') await page.keyboard.press('Escape');
  else if (action === 'pagehide') await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  else {
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('clipboard unavailable'); }; });
    await dialog.getByRole('button', { name: '링크 한 번 복사' }).click();
  }
  await expect(page.getByLabel('일회용 초기화 링크')).toHaveCount(0);
  await noLeaks(page, api.logs);
});

test('late issuance cannot resurrect a dismissed token', async ({ page }) => {
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const api = await setup(page, { wait });
  const dialog = await issue(page);
  await expect.poll(() => api.writes.length).toBe(1);
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  release();
  await open(page);
  await expect(page.getByLabel('일회용 초기화 링크')).toHaveCount(0);
  await noLeaks(page, api.logs);
});

for (const reset of [{ setupUrl: `https://untrusted.example/driver/password-reset#token=${token}` }, { method: 'SMS' }, { expiresAt: 'invalid' }]) test(`rejects unsupported reset response ${Object.keys(reset)[0]}`, async ({ page }) => {
  const api = await setup(page, { reset });
  const dialog = await issue(page);
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('일회용 초기화 링크')).toHaveCount(0);
  await noLeaks(page, api.logs);
});


test('manual copy consumes the same one-time display as the copy button', async ({ page }) => {
  const api = await setup(page);
  const dialog = await issue(page);
  const input = dialog.getByLabel('일회용 초기화 링크');
  await expect(input).toBeVisible();
  await input.dispatchEvent('copy');
  await expect(input).toHaveCount(0);
  expect(await page.evaluate(() => window.__clipboardCalls)).toBe(1);
  await noLeaks(page, api.logs);
});
