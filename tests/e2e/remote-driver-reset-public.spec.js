import { expect, test } from '@playwright/test';

const token = 'A'.repeat(43);
const password = 'FreshDriverPassw0rd!';

test.skip(process.env.VITE_DSV_API_MODE !== 'remote', 'requires the remote API boundary');

function envelope(data) {
  return { data, error: null };
}

async function installResetApi(page, fixtures = {}) {
  const calls = [];
  await page.route('**/api/dsv/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const call = {
      body: request.postDataJSON(),
      headers: request.headers(),
      method: request.method(),
      path,
    };
    calls.push(call);
    const fixture = fixtures[`${call.method} ${path}`];
    if (fixture === undefined) {
      await route.fulfill({
        contentType: 'application/json',
        status: 599,
        body: JSON.stringify({ data: null, error: { code: 'UNFIXTURED_API_CALL', message: path } }),
      });
      return;
    }
    const resolved = typeof fixture === 'function' ? await fixture(call) : fixture;
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'cache-control': 'private, no-store' },
      status: resolved.status ?? 200,
      body: JSON.stringify(resolved.body ?? resolved),
    });
  });
  return calls;
}

test('consumes a one-time fragment without session credentials or browser persistence', async ({ context, page }) => {
  await context.addCookies([{ name: 'dsv-session', value: 'must-not-be-sent', domain: '127.0.0.1', path: '/' }]);
  await page.addInitScript(() => {
    localStorage.setItem('reset-sentinel', 'local-only');
    sessionStorage.setItem('reset-sentinel', 'session-only');
  });
  const browserMessages = [];
  page.on('console', (message) => browserMessages.push(message.text()));
  page.on('pageerror', (error) => browserMessages.push(error.message));
  const calls = await installResetApi(page, {
    'POST /api/dsv/driver/auth/password-reset/validate': envelope({
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      method: 'ADMIN_LINK',
      valid: true,
    }),
    'POST /api/dsv/driver/auth/password-reset/complete': envelope({ completed: true }),
  });

  await page.goto(`/driver/password-reset#token=${token}`);

  await expect(page).toHaveURL(/\/driver\/password-reset$/u);
  await expect(page.getByRole('heading', { name: '비밀번호 초기화' })).toBeVisible();
  await expect(page.getByRole('form', { name: '배송원 비밀번호 초기화' })).toBeVisible();
  if (process.env.DRIVER_RESET_PUBLIC_SCREENSHOT) {
    await page.screenshot({ path: process.env.DRIVER_RESET_PUBLIC_SCREENSHOT, fullPage: true });
  }
  await page.getByLabel('새 비밀번호', { exact: true }).fill('weak-password');
  await page.getByLabel('새 비밀번호 확인', { exact: true }).fill('weak-password');
  await page.getByRole('button', { name: '새 비밀번호 설정' }).click();
  await expect(page.getByRole('alert')).toContainText('대문자, 소문자, 숫자, 특수문자');
  expect(calls.filter(({ path }) => path.endsWith('/complete'))).toHaveLength(0);

  await page.getByLabel('새 비밀번호', { exact: true }).fill(password);
  await page.getByLabel('새 비밀번호 확인', { exact: true }).fill(password);
  await page.getByRole('button', { name: '새 비밀번호 설정' }).click();

  await expect(page.getByRole('status')).toContainText('새 비밀번호로 로그인');
  await expect(page.getByRole('form', { name: '배송원 비밀번호 초기화' })).toHaveCount(0);
  expect(calls.map(({ path }) => path)).toEqual([
    '/api/dsv/driver/auth/password-reset/validate',
    '/api/dsv/driver/auth/password-reset/complete',
  ]);
  expect(calls[0].body).toEqual({ token });
  expect(calls[1].body).toEqual({ token, password });
  for (const call of calls) {
    expect(call.headers.cookie).toBeUndefined();
    expect(call.headers.authorization).toBeUndefined();
    expect(call.headers['x-csrf-token']).toBeUndefined();
    expect(call.headers.referer).toBeUndefined();
  }
  const storage = await page.evaluate(() => JSON.stringify({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
  }));
  expect(storage).not.toContain(token);
  expect(storage).not.toContain(password);
  expect(browserMessages.join('\n')).not.toContain(token);
  expect(browserMessages.join('\n')).not.toContain(password);
});

test('uses one account-neutral message for malformed, expired, revoked, and consumed links', async ({ page }) => {
  const calls = await installResetApi(page, {
    'POST /api/dsv/driver/auth/password-reset/validate': {
      status: 401,
      body: { data: null, error: { code: 'INVALID_RESET_LINK', message: 'private server detail' } },
    },
  });

  await page.goto('/driver/password-reset#token=malformed');
  await expect(page).toHaveURL(/\/driver\/password-reset$/u);
  await expect(page.getByRole('alert')).toHaveText('링크가 만료되었거나 사용할 수 없습니다. 관리자에게 새 링크를 요청해 주세요.');
  expect(calls).toHaveLength(0);

  await page.goto(`/driver/password-reset#token=${token}`);
  await expect.poll(() => calls.length).toBe(1);
  await expect(page).toHaveURL(/\/driver\/password-reset$/u);
  await expect(page.getByRole('alert')).toHaveText('링크가 만료되었거나 사용할 수 없습니다. 관리자에게 새 링크를 요청해 주세요.');
  await expect(page.getByText('private server detail')).toHaveCount(0);
});

test('expires a validated link in place and clears password fields', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-10T06:00:00.000Z') });
  await installResetApi(page, {
    'POST /api/dsv/driver/auth/password-reset/validate': envelope({
      expiresAt: '2026-09-10T06:01:00.000Z',
      method: 'ADMIN_LINK',
      valid: true,
    }),
  });

  await page.goto(`/driver/password-reset#token=${token}`);
  await page.getByLabel('새 비밀번호', { exact: true }).fill(password);
  await page.clock.fastForward(60_001);
  await expect(page.getByRole('alert')).toHaveText('링크가 만료되었거나 사용할 수 없습니다. 관리자에게 새 링크를 요청해 주세요.');
  await expect(page.getByRole('form', { name: '배송원 비밀번호 초기화' })).toHaveCount(0);
});

test('discards the token and password when completion reports a consumed link', async ({ page }) => {
  const calls = await installResetApi(page, {
    'POST /api/dsv/driver/auth/password-reset/validate': envelope({
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      method: 'ADMIN_LINK',
      valid: true,
    }),
    'POST /api/dsv/driver/auth/password-reset/complete': {
      status: 401,
      body: { data: null, error: { code: 'INVALID_RESET_LINK', message: 'consumed token detail' } },
    },
  });

  await page.goto(`/driver/password-reset#token=${token}`);
  await page.getByLabel('새 비밀번호', { exact: true }).fill(password);
  await page.getByLabel('새 비밀번호 확인', { exact: true }).fill(password);
  await page.getByRole('button', { name: '새 비밀번호 설정' }).click();

  await expect(page.getByRole('alert')).toHaveText('링크가 만료되었거나 사용할 수 없습니다. 관리자에게 새 링크를 요청해 주세요.');
  await expect(page.getByRole('form', { name: '배송원 비밀번호 초기화' })).toHaveCount(0);
  expect(calls.filter(({ path }) => path.endsWith('/complete'))).toHaveLength(1);
  await expect(page.getByText('consumed token detail')).toHaveCount(0);
});

test('clears secrets on pagehide and ignores a late completion response', async ({ page }) => {
  let releaseCompletion;
  const completionGate = new Promise((resolve) => { releaseCompletion = resolve; });
  const calls = await installResetApi(page, {
    'POST /api/dsv/driver/auth/password-reset/validate': envelope({
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      method: 'ADMIN_LINK',
      valid: true,
    }),
    'POST /api/dsv/driver/auth/password-reset/complete': async () => {
      await completionGate;
      return envelope({ completed: true });
    },
  });

  await page.goto(`/driver/password-reset#token=${token}`);
  await page.getByLabel('새 비밀번호', { exact: true }).fill(password);
  await page.getByLabel('새 비밀번호 확인', { exact: true }).fill(password);
  await page.getByRole('button', { name: '새 비밀번호 설정' }).click();
  await expect.poll(() => calls.filter(({ path }) => path.endsWith('/complete')).length).toBe(1);

  await page.evaluate(() => {
    window.resetPasswordNodeForTest = document.querySelector('#driver-reset-password');
    window.dispatchEvent(new Event('pagehide'));
  });
  await expect(page.getByRole('alert')).toHaveText('링크가 만료되었거나 사용할 수 없습니다. 관리자에게 새 링크를 요청해 주세요.');
  await expect(page.evaluate(() => window.resetPasswordNodeForTest?.value)).resolves.toBe('');

  releaseCompletion();
  await page.waitForTimeout(50);
  await expect(page.getByRole('alert')).toHaveText('링크가 만료되었거나 사용할 수 없습니다. 관리자에게 새 링크를 요청해 주세요.');
  await expect(page.getByText('새 비밀번호가 설정되었습니다.')).toHaveCount(0);
});

for (const { status, message } of [
  { status: 409, message: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.' },
  { status: 429, message: '요청 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.' },
  { status: 503, message: '비밀번호 초기화 기능을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.' },
]) {
  test(`shows a sanitized ${status} completion error`, async ({ page }) => {
    await installResetApi(page, {
      'POST /api/dsv/driver/auth/password-reset/validate': envelope({
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        method: 'ADMIN_LINK',
        valid: true,
      }),
      'POST /api/dsv/driver/auth/password-reset/complete': {
        status,
        body: { data: null, error: { code: 'PRIVATE_DETAIL', message: 'account and token detail' } },
      },
    });

    await page.goto(`/driver/password-reset#token=${token}`);
    await page.getByLabel('새 비밀번호', { exact: true }).fill(password);
    await page.getByLabel('새 비밀번호 확인', { exact: true }).fill(password);
    await page.getByRole('button', { name: '새 비밀번호 설정' }).click();

    await expect(page.getByRole('alert')).toHaveText(message);
    await expect(page.getByText('account and token detail')).toHaveCount(0);
  });
}
