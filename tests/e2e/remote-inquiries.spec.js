import { test, expect } from '@playwright/test';

const v1Meta = { apiVersion: 'dsv.v1' };
const inquiryScope = 'dsv:accounts:read';
const screenshotDir = process.env.INQUIRY_SCREENSHOT_DIR;
const inquiryA = {
  id: '11111111-1111-4111-8111-111111111111',
  title: '배송 완료 사진 문의',
  body: '완료 사진이 흐리게 보입니다.',
  authorName: '김배송',
  createdAt: '2026-09-07T01:23:00.000Z',
};
const inquiryB = {
  id: '22222222-2222-4222-8222-222222222222',
  title: '다음 배송지 문의',
  body: '다음 배송지 주소를 확인해 주세요.',
  authorName: '이운송',
  createdAt: '2026-09-07T02:34:00.000Z',
};
const adminSession = {
  principalType: 'DSV_ADMIN',
  shopId: 'shop-inquiries',
  actorId: 'admin-inquiries',
  displayName: '문의 관리자',
  scopes: ['dsv:session:read', inquiryScope],
};

function v1Envelope(data) {
  return { data, meta: v1Meta, requestId: 'inquiries-session' };
}

function v1Error(status, message) {
  return {
    body: { error: { code: `INQUIRIES_${status}`, message, requestId: `inquiries-${status}` } },
    status,
  };
}

function legacyEnvelope(data) {
  return { data, error: null };
}

function legacyError(status, message) {
  return { body: { data: null, error: { code: `INQUIRIES_${status}`, message } }, status };
}

function listEnvelope(items, nextCursor = null) {
  return legacyEnvelope({ items, nextCursor });
}

async function installApiFixtures(page, fixtures = {}) {
  const resolvedFixtures = {
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/operational-notifications': v1Envelope({ items: [] }),
    'GET /api/dsv/driver-inquiries?limit=20': listEnvelope([]),
    ...fixtures,
  };
  const calls = [];
  const unexpected = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const call = { headers: request.headers(), method: request.method(), path: url.pathname, search: url.search };
    calls.push(call);
    const exactKey = `${call.method} ${call.path}${call.search}`;
    const pathKey = `${call.method} ${call.path}`;
    const fixture = resolvedFixtures[exactKey] ?? resolvedFixtures[pathKey];
    if (fixture === undefined) {
      unexpected.push(call);
      await route.fulfill({
        contentType: 'application/json',
        status: 599,
        body: JSON.stringify({ data: null, error: { code: 'UNFIXTURED_API_CALL', message: exactKey } }),
      });
      return;
    }
    const resolved = typeof fixture === 'function' ? await fixture({ request, route, url }) : fixture;
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'cache-control': 'private, no-store' },
      status: resolved.status ?? 200,
      body: JSON.stringify(resolved.body ?? resolved),
    });
  });
  return { calls, unexpected };
}

function inquiryCalls(api) {
  return api.calls.filter(({ path }) => path.startsWith('/api/dsv/driver-inquiries'));
}

if (process.env.VITE_DSV_API_MODE === 'remote') {
  test('shows the inquiry menu to an administrator with account read scope', async ({ page }) => {
    const api = await installApiFixtures(page);

    await page.goto('/inquiries');

    await expect(page.getByRole('link', { name: '문의', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '문의', exact: true })).toBeVisible();
    expect(api.unexpected).toEqual([]);
  });

  test('hides the inquiry menu from an administrator without account read scope', async ({ page }) => {
    const api = await installApiFixtures(page, {
      'GET /api/dsv/v1/session': v1Envelope({
        ...adminSession,
        scopes: ['dsv:session:read', 'dsv:control:read'],
      }),
      'GET /api/dsv/v1/control': v1Envelope({
        serviceDate: '2026-09-07',
        totalDispatchCount: 0,
        assignedCount: 0,
        unassignedCount: 0,
        pendingEtaCount: 0,
        failedEtaCount: 0,
        readyEtaCount: 0,
      }),
      'GET /api/dsv/v1/control/routes': v1Envelope({ routes: [], serviceDate: '2026-09-07' }),
      'GET /api/dsv/v1/vehicles?limit=100': v1Envelope({ items: [], page: { hasMore: false } }),
      'GET /api/dsv/v1/customers?limit=100': v1Envelope({ items: [], page: { hasMore: false } }),
      'GET /api/dsv/v1/dispatches': v1Envelope({ items: [], page: { hasMore: false } }),
    });

    await page.goto('/control');

    await expect(page.getByRole('link', { name: '관제', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '문의', exact: true })).toHaveCount(0);
    expect(inquiryCalls(api)).toEqual([]);
    expect(api.unexpected).toEqual([]);
  });

  test('blocks a direct inquiry route before data calls when account read scope is missing', async ({ page }) => {
    const api = await installApiFixtures(page, {
      'GET /api/dsv/v1/session': v1Envelope({ ...adminSession, scopes: ['dsv:session:read'] }),
    });

    await page.goto('/inquiries');

    await expect(page).toHaveURL(/\/inquiries$/u);
    await expect(page.getByRole('alert')).toContainText('조회 권한이 없습니다');
    expect(inquiryCalls(api)).toEqual([]);
    expect(api.unexpected).toEqual([]);
  });

  test('blocks a non-administrator direct inquiry route before data calls', async ({ page }) => {
    const api = await installApiFixtures(page, {
      'GET /api/dsv/v1/session': v1Envelope({
        principalType: 'CUSTOMER_USER',
        shopId: 'shop-inquiries',
        customerId: 'customer-inquiries',
        displayName: '고객 사용자',
        scopes: ['dsv:session:read', inquiryScope],
      }),
    });

    await page.goto('/inquiries');

    await expect(page.getByRole('alert')).toContainText('현재 화면을 볼 수 없습니다');
    expect(inquiryCalls(api)).toEqual([]);
    expect(api.unexpected).toEqual([]);
  });

  test('redirects an unauthenticated direct inquiry route before data calls', async ({ page }) => {
    const api = await installApiFixtures(page, {
      'GET /api/dsv/v1/session': v1Error(401, 'session required'),
    });

    await page.goto('/inquiries');

    await expect(page).toHaveURL(/\/login$/u);
    expect(inquiryCalls(api)).toEqual([]);
    expect(api.unexpected).toEqual([]);
  });

  test('renders inquiry content as plain text with the server author and Seoul receipt time', async ({ page }) => {
    const unsafeInquiry = {
      ...inquiryA,
      title: '<img src=x onerror="window.__inquiryXss=true">',
      body: '<script>window.__inquiryXss=true</script>\n배송 메모 원문',
    };
    const api = await installApiFixtures(page, {
      'GET /api/dsv/driver-inquiries?limit=20': listEnvelope([unsafeInquiry]),
      [`GET /api/dsv/driver-inquiries/${unsafeInquiry.id}`]: legacyEnvelope({ inquiry: unsafeInquiry }),
    });

    await page.goto('/inquiries');
    await page.getByRole('button', { name: unsafeInquiry.title, exact: true }).click();

    const detail = page.getByRole('region', { name: '문의 상세' });
    await expect(detail).toContainText(unsafeInquiry.body);
    await expect(detail).toContainText(unsafeInquiry.authorName);
    await expect(detail).toContainText(/2026.*9.*7.*10:23/u);
    await expect(detail.locator('script, img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__inquiryXss)).toBeUndefined();
    if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/inquiries-desktop.png`, fullPage: true });
    expect(api.unexpected).toEqual([]);
  });

  test('loads the next inquiry page with an opaque cursor using GET and no authority override', async ({ page }) => {
    const api = await installApiFixtures(page, {
      'GET /api/dsv/driver-inquiries?limit=20': listEnvelope([inquiryA], 'opaque-cursor/+=='),
      'GET /api/dsv/driver-inquiries?limit=20&cursor=opaque-cursor%2F%2B%3D%3D': listEnvelope([inquiryB]),
    });

    await page.goto('/inquiries');
    await page.getByRole('button', { name: '더 보기', exact: true }).click();

    await expect(page.getByRole('button', { name: inquiryB.title, exact: true })).toBeVisible();
    const calls = inquiryCalls(api);
    expect(calls).toHaveLength(2);
    expect(calls.every(({ method }) => method === 'GET')).toBe(true);
    expect(calls.map(({ search }) => [...new URLSearchParams(search).keys()])).toEqual([
      ['limit'],
      ['limit', 'cursor'],
    ]);
    expect(api.unexpected).toEqual([]);
  });

  test('sends inquiry reads with the same-origin session cookie', async ({ page }) => {
    await page.context().addCookies([{
      name: 'dsv_admin_session',
      value: 'inquiry-session-cookie',
      domain: '127.0.0.1',
      path: '/',
    }]);
    const api = await installApiFixtures(page);

    await page.goto('/inquiries');

    await expect.poll(() => inquiryCalls(api).length).toBe(1);
    const [call] = inquiryCalls(api);
    expect(call.headers.cookie).toContain('dsv_admin_session=inquiry-session-cookie');
    expect(api.unexpected).toEqual([]);
  });

  test('shows a loading status until the inquiry list request completes', async ({ page }) => {
    let releaseList;
    const listPending = new Promise((resolve) => { releaseList = resolve; });
    const api = await installApiFixtures(page, {
      'GET /api/dsv/driver-inquiries?limit=20': async () => {
        await listPending;
        return listEnvelope([inquiryA]);
      },
    });

    await page.goto('/inquiries');
    await expect(page.getByRole('status').filter({ hasText: '문의를 불러오는 중입니다.' })).toBeVisible();
    releaseList();

    await expect(page.getByRole('button', { name: inquiryA.title, exact: true })).toBeVisible();
    expect(api.unexpected).toEqual([]);
  });

  test('shows the documented empty state when there are no inquiries', async ({ page }) => {
    const api = await installApiFixtures(page);

    await page.goto('/inquiries');

    await expect(page.getByRole('region', { name: '문의 목록' })).toContainText('접수된 문의가 없습니다.');
    expect(api.unexpected).toEqual([]);
  });

  test('retries a generic list error without exposing the server message', async ({ page }) => {
    const serverMessage = 'database host and internal stack must stay private';
    let attempts = 0;
    const api = await installApiFixtures(page, {
      'GET /api/dsv/driver-inquiries?limit=20': () => {
        attempts += 1;
        return attempts === 1 ? legacyError(500, serverMessage) : listEnvelope([inquiryA]);
      },
    });

    await page.goto('/inquiries');

    await expect(page.getByRole('alert')).toContainText(/문의를 불러오지 못했습니다/u);
    await expect(page.getByRole('alert')).not.toContainText(serverMessage);
    await page.getByRole('button', { name: '다시 시도', exact: true }).click();
    await expect(page.getByRole('button', { name: inquiryA.title, exact: true })).toBeVisible();
    expect(attempts).toBe(2);
    expect(api.unexpected).toEqual([]);
  });

  test('keeps a forbidden inquiry response on the inquiry route with a generic retry state', async ({ page }) => {
    const api = await installApiFixtures(page, {
      'GET /api/dsv/driver-inquiries?limit=20': legacyError(403, 'foreign shop denied'),
    });

    await page.goto('/inquiries');

    await expect(page).toHaveURL(/\/inquiries$/u);
    await expect(page.getByRole('alert')).toContainText('문의 조회 권한이 없습니다');
    await expect(page.getByRole('alert')).not.toContainText('foreign shop denied');
    expect(api.unexpected).toEqual([]);
  });

  test('redirects to login when the inquiry API reports an expired session', async ({ page }) => {
    const api = await installApiFixtures(page, {
      'GET /api/dsv/driver-inquiries?limit=20': legacyError(401, 'expired session'),
    });

    await page.goto('/inquiries');

    await expect(page).toHaveURL(/\/login$/u);
    expect(inquiryCalls(api)).toHaveLength(1);
    expect(api.unexpected).toEqual([]);
  });

  test('shows a generic detail error when a selected inquiry no longer exists', async ({ page }) => {
    const api = await installApiFixtures(page, {
      'GET /api/dsv/driver-inquiries?limit=20': listEnvelope([inquiryA]),
      [`GET /api/dsv/driver-inquiries/${inquiryA.id}`]: legacyError(404, 'foreign or missing'),
    });

    await page.goto('/inquiries');
    await page.getByRole('button', { name: inquiryA.title, exact: true }).click();

    const detail = page.getByRole('region', { name: '문의 상세' });
    await expect(detail.getByRole('alert')).toContainText('문의를 찾을 수 없습니다');
    await expect(detail.getByRole('alert')).not.toContainText('foreign or missing');
    await expect(page.getByRole('button', { name: '목록으로', exact: true })).toBeVisible();
    expect(api.unexpected).toEqual([]);
  });

  test('does not replace a newer inquiry selection with a late older response', async ({ page }) => {
    let releaseFirstDetail;
    const firstDetailPending = new Promise((resolve) => { releaseFirstDetail = resolve; });
    const api = await installApiFixtures(page, {
      'GET /api/dsv/driver-inquiries?limit=20': listEnvelope([inquiryA, inquiryB]),
      [`GET /api/dsv/driver-inquiries/${inquiryA.id}`]: async () => {
        await firstDetailPending;
        return legacyEnvelope({ inquiry: inquiryA });
      },
      [`GET /api/dsv/driver-inquiries/${inquiryB.id}`]: legacyEnvelope({ inquiry: inquiryB }),
    });

    await page.goto('/inquiries');
    await page.getByRole('button', { name: inquiryA.title, exact: true }).click();
    await page.getByRole('button', { name: '목록으로', exact: true }).click();
    await page.getByRole('button', { name: inquiryB.title, exact: true }).click();
    await expect(page.getByRole('region', { name: '문의 상세' })).toContainText(inquiryB.body);
    releaseFirstDetail();

    await expect(page.getByRole('region', { name: '문의 상세' })).toContainText(inquiryB.body);
    await expect(page.getByRole('region', { name: '문의 상세' })).not.toContainText(inquiryA.body);
    expect(api.unexpected).toEqual([]);
  });

  test('clears the previous shop inquiry state before showing data for a revalidated shop', async ({ page }) => {
    let sessionReads = 0;
    let listReads = 0;
    let releaseOldDetail;
    let releaseNewShopList;
    const oldDetailPending = new Promise((resolve) => { releaseOldDetail = resolve; });
    const newShopListPending = new Promise((resolve) => { releaseNewShopList = resolve; });
    const api = await installApiFixtures(page, {
      'GET /api/dsv/v1/session': () => {
        sessionReads += 1;
        return v1Envelope({
          ...adminSession,
          shopId: sessionReads === 1 ? 'shop-inquiries-a' : 'shop-inquiries-b',
        });
      },
      'GET /api/dsv/driver-inquiries?limit=20': async () => {
        listReads += 1;
        if (listReads === 1) return listEnvelope([inquiryA]);
        await newShopListPending;
        return listEnvelope([inquiryB]);
      },
      [`GET /api/dsv/driver-inquiries/${inquiryA.id}`]: async () => {
        await oldDetailPending;
        return legacyEnvelope({ inquiry: inquiryA });
      },
    });

    await page.goto('/inquiries');
    await page.getByRole('button', { name: inquiryA.title, exact: true }).click();
    await expect(page.getByRole('region', { name: '문의 상세' })).toContainText('문의 상세를 불러오는 중입니다.');

    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => sessionReads).toBe(2);
    await expect.poll(() => listReads).toBe(2);
    await expect(page.getByText(inquiryA.title, { exact: true })).toHaveCount(0);
    await expect(page.getByText(inquiryA.body, { exact: true })).toHaveCount(0);

    releaseNewShopList();
    await expect(page.getByRole('button', { name: inquiryB.title, exact: true })).toBeVisible();
    releaseOldDetail();
    await expect(page.getByRole('button', { name: inquiryB.title, exact: true })).toBeVisible();
    await expect(page.getByText(inquiryA.title, { exact: true })).toHaveCount(0);
    await expect(page.getByText(inquiryA.body, { exact: true })).toHaveCount(0);
    expect(api.unexpected).toEqual([]);
  });

  test('removes inquiry content and blocks further data reads when revalidation revokes account read scope', async ({ page }) => {
    let sessionReads = 0;
    const api = await installApiFixtures(page, {
      'GET /api/dsv/v1/session': () => {
        sessionReads += 1;
        return v1Envelope(sessionReads === 1
          ? adminSession
          : { ...adminSession, scopes: ['dsv:session:read'] });
      },
      'GET /api/dsv/driver-inquiries?limit=20': listEnvelope([inquiryA]),
      [`GET /api/dsv/driver-inquiries/${inquiryA.id}`]: legacyEnvelope({ inquiry: inquiryA }),
    });

    await page.goto('/inquiries');
    await page.getByRole('button', { name: inquiryA.title, exact: true }).click();
    await expect(page.getByRole('region', { name: '문의 상세' })).toContainText(inquiryA.body);
    const dataReadsBeforeRevocation = inquiryCalls(api).length;

    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => sessionReads).toBe(2);
    await expect(page.getByRole('alert')).toContainText('조회 권한이 없습니다');
    await expect(page.getByText(inquiryA.title, { exact: true })).toHaveCount(0);
    await expect(page.getByText(inquiryA.body, { exact: true })).toHaveCount(0);

    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => sessionReads).toBe(3);
    expect(inquiryCalls(api)).toHaveLength(dataReadsBeforeRevocation);
    expect(api.unexpected).toEqual([]);
  });

  test('returns keyboard focus to the inquiry list heading after closing mobile detail', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 817 });
    const api = await installApiFixtures(page, {
      'GET /api/dsv/driver-inquiries?limit=20': listEnvelope([inquiryA]),
      [`GET /api/dsv/driver-inquiries/${inquiryA.id}`]: legacyEnvelope({ inquiry: inquiryA }),
    });

    await page.goto('/inquiries');
    const inquiryButton = page.getByRole('button', { name: inquiryA.title, exact: true });
    await inquiryButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: '문의 상세', exact: true })).toBeFocused();
    await expect(page.getByRole('region', { name: '문의 상세' })).toContainText(inquiryA.body);
    if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/inquiries-360-detail.png`, fullPage: true });
    await page.getByRole('button', { name: '목록으로', exact: true }).click();

    await expect(page.getByRole('heading', { name: '문의 목록', exact: true })).toBeFocused();
    expect(api.unexpected).toEqual([]);
  });

  test('keeps the inquiry page within 489 and 360 pixel compact viewports', async ({ page }) => {
    const api = await installApiFixtures(page, {
      'GET /api/dsv/driver-inquiries?limit=20': listEnvelope([inquiryA]),
    });

    for (const width of [489, 360]) {
      await page.setViewportSize({ width, height: 817 });
      await page.goto('/inquiries');
      await expect(page.getByRole('region', { name: '문의 목록' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/inquiries-${width}.png`, fullPage: true });
    }
    expect(api.unexpected).toEqual([]);
  });
}
