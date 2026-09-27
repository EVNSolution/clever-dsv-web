import { expect, test } from '@playwright/test';

const remote = process.env.VITE_DSV_API_MODE === 'remote';
const envelope = (data) => ({ data, meta: { apiVersion: 'dsv.v1' }, requestId: 'layout-regression' });

function record(number) {
  return {
    sellerOrderId: `order-${number}`,
    sellerOrderKey: `ORDER-${String(number).padStart(3, '0')}`,
    destinationDisplayName: `배송지 ${number}`,
    destinationAddress: `서울특별시 중구 세종대로 ${number}`,
    deliveryStatus: 'OUT_FOR_DELIVERY',
    etaStatus: 'READY',
    estimatedArrivalAt: '2026-09-26T02:00:00.000Z',
    proofStatus: 'AVAILABLE',
    proofs: [],
    eventSummary: [],
  };
}

async function installRemoteFixtures(page, { customer = false } = {}) {
  if (!remote) return [];
  const calls = [];
  await page.route('**/api/dsv/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    calls.push(`${request.method()} ${path}${url.search}`);
    let data;
    if (path === '/api/dsv/v1/session') {
      data = envelope(customer ? {
        principalType: 'CUSTOMER_USER', shopId: 'layout-shop', customerId: 'customer-layout',
        scopes: ['dsv:session:read', 'dsv:customer-deliveries:read'],
      } : {
        csrfToken: 'layout-csrf', principalType: 'DSV_ADMIN', shopId: 'layout-shop',
        actorId: 'layout-actor', displayName: 'Layout Admin',
        scopes: ['dsv:session:read', 'dsv:control:read', 'dsv:dispatches:read', 'dsv:records:read',
          'dsv:resources:read', 'dsv:resources:write', 'dsv:customers:read',
          'dsv:destinations:read', 'dsv:conditions:read', 'dsv:settings:read'],
      });
    } else if (path === '/api/dsv/v1/customer/deliveries') {
      data = envelope({
        customerDisplayName: '고객사 가',
        items: [1, 2].map((number) => ({
          sellerOrderId: `customer-order-${number}`, sellerOrderKey: `CUSTOMER-${number}`,
          destinationDisplayName: `배송지 ${number}`, destinationAddress: '서울특별시 중구 퇴계로 131',
          destinationId: `customer-destination-${number}`, deliveryStatus: 'IN_TRANSIT', etaStatus: 'READY',
          estimatedArrivalAt: '2026-09-27T02:30:00.000Z', proofStatus: 'AVAILABLE', shippedBoxes: 2,
          eventSummary: [{ type: 'STOP_ARRIVED', occurredAt: '2026-09-27T02:35:00.000Z' }],
          latitude: 37.5 + number * 0.01, longitude: 127.01 + number * 0.01,
          vehicleDisplayName: `차량 ${number}`, vehicleId: `customer-vehicle-${number}`,
        })),
        page: { hasMore: false }, routes: [],
      });
    } else if (path === '/api/dsv/v1/records') {
      const currentPage = Number(url.searchParams.get('page') ?? '1');
      const count = currentPage === 20 ? 38 : 50;
      data = envelope({
        items: Array.from({ length: count }, (_, index) => record((currentPage - 1) * 50 + index + 1)),
        page: { currentPage, hasMore: currentPage < 20, pageSize: 50, totalItems: 988, totalPages: 20 },
      });
    } else if (path === '/api/dsv/v1/drivers') {
      data = envelope({ items: [{ driverId: 'driver-layout', displayName: '배송원 가', phone: '01012345678', status: 'ACTIVE', age: 42, gender: '남성', career: '6년', score: 'A', traits: [], zone: '서울' }], page: { hasMore: false } });
    } else if (path === '/api/dsv/v1/vehicles') {
      data = envelope({ items: [{ vehicleId: 'vehicle-layout', displayName: '차량 가', vehiclePlate: '60가 6006', vehicleType: '냉장탑차', type: '냉장탑차', status: 'ACTIVE', driverAssignments: [], telematicsCapabilities: [] }], page: { hasMore: false } });
    } else if (path === '/api/dsv/v1/customers') {
      data = envelope({ items: [{ customerId: 'customer-layout', displayName: '고객사 가', externalCustomerCode: 'CUSTOMER-A', orderCount: 4, status: 'ACTIVE' }], page: { hasMore: false } });
    } else if (path === '/api/dsv/v1/destinations') {
      data = envelope({ items: [{ destinationId: 'destination-layout', displayName: '배송지 가', address: '서울특별시 중구 세종대로 1' }], page: { hasMore: false } });
    } else if (path === '/api/dsv/v1/conditions') {
      data = envelope({ items: [{ conditionId: 'condition-layout', code: 'COLD', name: '냉장 운송', description: '냉장 상태 유지', status: 'ACTIVE' }], page: { hasMore: false } });
    } else if (path === '/api/dsv/driver-account-links/pending') {
      data = { data: { reviews: [] }, error: null };
    } else if (path === '/api/dsv/customers/customer-layout/accounts') {
      data = { data: { accounts: [] }, error: null };
    } else if (path === '/api/dsv/v1/operational-notifications') {
      data = envelope({ items: [] });
    } else if (path === '/api/dsv/v1/map/profile') {
      data = envelope({ attribution: 'OpenFreeMap', bounds: [124.5, 33, 132, 39.5], initialView: { center: [126.995, 37.43], zoom: 10.35 }, profileId: 'dsv-korea-v1', providerMode: 'public_allowlisted', regionCode: 'KR', styleUrl: '/map/styles/dsv-korea-v1.json', version: '2026-07' });
    } else {
      await route.fulfill({ status: 599, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNFIXTURED', message: path, requestId: 'layout' } }) });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  return calls;
}

async function box(locator) {
  const result = await locator.boundingBox();
  expect(result, 'expected a rendered element').not.toBeNull();
  return result;
}

function expectInside(inner, outer, label) {
  const tolerance = 2;
  expect(inner.x, `${label}: left`).toBeGreaterThanOrEqual(outer.x - tolerance);
  expect(inner.x + inner.width, `${label}: right`).toBeLessThanOrEqual(outer.x + outer.width + tolerance);
  expect(inner.y, `${label}: top`).toBeGreaterThanOrEqual(outer.y - tolerance);
  expect(inner.y + inner.height, `${label}: bottom`).toBeLessThanOrEqual(outer.y + outer.height + tolerance);
}

test('records header keeps count and date selector within its panel at common widths', async ({ page }) => {
  test.skip(!remote, 'The mock records page deliberately has no date selector.');
  await installRemoteFixtures(page);
  for (const width of [1440, 1024, 768, 390, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/records');
    const panel = page.locator('.records-page .page-panel.wide');
    const count = panel.locator('.records-heading-actions .record-detail-count');
    const picker = panel.getByRole('button', { name: '이력 기준일 날짜 변경' });
    await expect(count).toHaveText('988건');
    await expect(picker).toBeVisible();
    const panelBox = await box(panel);
    expectInside(await box(count), panelBox, `${width}px count`);
    expectInside(await box(picker), panelBox, `${width}px date picker`);
    const text = picker.locator('.control-date-picker-copy');
    await expect(text).toContainText('이력 기준일');
    await expect(text).toContainText('전체 기간');
    expectInside(await box(text), await box(picker), `${width}px date label`);
    const countLines = await count.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.y))).size;
    });
    expect(countLines, `${width}px count stays on one line`).toBe(1);
    for (const label of await text.locator('small, strong').all()) {
      const fit = await label.evaluate((node) => node.scrollWidth <= node.clientWidth + 1);
      expect(fit, `${width}px date text is not truncated`).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test('records calendar remains reachable in a short viewport and after sidebar expansion', async ({ page }) => {
  test.skip(!remote, 'The mock records page deliberately has no date selector.');
  await installRemoteFixtures(page);
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto('/records');
  await page.getByRole('button', { name: '사이드바 펼치기' }).click();
  const picker = page.getByRole('button', { name: '이력 기준일 날짜 변경' });
  expectInside(await box(picker), await box(page.locator('.records-page .page-panel.wide')), 'expanded sidebar picker');
  await picker.click();
  const calendar = page.locator('.records-page .control-calendar-popover');
  await expect(calendar).toBeVisible();
  const clear = calendar.getByRole('button', { name: '전체 기간' });
  await expect(clear).toBeVisible();
  expectInside(await box(clear), await box(calendar), 'calendar bottom action');
  const calendarBox = await box(calendar);
  expect(calendarBox.x).toBeGreaterThanOrEqual(0);
  expect(calendarBox.x + calendarBox.width).toBeLessThanOrEqual(1440);
  expect(calendarBox.y + calendarBox.height).toBeLessThanOrEqual(600);
  await clear.click();
  await expect(calendar).toHaveCount(0);
});

test('records sorting, page metadata, and row selection survive responsive layout', async ({ page }) => {
  test.skip(!remote, 'The mock records page deliberately has no rows or pagination.');
  const calls = await installRemoteFixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/records');
  await expect(page.locator('.record-table tbody tr')).toHaveCount(50);
  await expect(page.getByText('988건', { exact: true })).toBeVisible();
  const tableViewport = page.locator('.records-page .record-scroll');
  const tableScroll = await tableViewport.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(tableScroll.scrollHeight).toBeGreaterThan(tableScroll.clientHeight);
  expect(tableScroll.clientHeight).toBeLessThanOrEqual(Math.min(844 * 0.58, 520) + 2);
  const rows = page.locator('.record-table tbody tr');
  await page.getByRole('button', { name: '주문번호 정렬 기본순' }).click();
  await expect(rows.first()).toContainText('ORDER-050');
  await rows.nth(1).click();
  await expect(rows.nth(1)).toHaveClass(/active/);
  const pages = page.getByRole('navigation', { name: '배송 이력 페이지' });
  await pages.getByRole('button', { name: '20', exact: true }).click();
  await expect(page.locator('.record-table tbody tr')).toHaveCount(38);
  await expect(pages.getByRole('button', { name: '20', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(calls).toContain('GET /api/dsv/v1/records?limit=50&page=20');
});

test('management workspaces contain their panels without overlapping at intermediate width', async ({ page }) => {
  await installRemoteFixtures(page);
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/master-data');
  for (const scope of ['운송자원', '고객사']) {
    await page.getByRole('button', { name: scope, exact: true }).click();
    const workspaces = page.locator('.resource-workspace');
    await expect(workspaces).toHaveCount(2);
    let previousBottom = 0;
    for (const workspace of await workspaces.all()) {
      const parent = await box(workspace);
      expect(parent.y).toBeGreaterThanOrEqual(previousBottom - 2);
      for (const panel of await workspace.locator('.management-list-panel, .management-detail-panel').all()) {
        expectInside(await box(panel), parent, `${scope} panel`);
      }
      previousBottom = parent.y + parent.height;
    }
  }
});

test('mobile management lists and details use the full width and keep editing reachable', async ({ page }) => {
  await installRemoteFixtures(page);
  for (const width of [768, 390, 375]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/master-data');
    const workspace = page.getByLabel('배송원 관리');
    const list = workspace.getByLabel('배송원 리스트');
    const detail = workspace.getByLabel('배송원 상세');
    const outer = await box(workspace);
    const listBox = await box(list);
    expectInside(listBox, outer, `${width}px list`);
    expect(listBox.width).toBeGreaterThan(width * 0.7);
    const create = list.getByRole('button', { name: '배송원 등록', exact: true });
    await expect(create).toBeVisible();
    await create.click();
    const editor = page.getByLabel('배송원 편집');
    await expect(editor.getByLabel('이름')).toBeVisible();
    const detailBox = await box(detail);
    expectInside(detailBox, await box(workspace), `${width}px editor detail`);
    expect(detailBox.width).toBeGreaterThan(width * 0.7);
    expect(detailBox.y).toBeGreaterThanOrEqual((await box(list)).y + (await box(list)).height - 2);
    await editor.getByRole('button', { name: '취소', exact: true }).click();
  }
});

function overlaps(first, second) {
  return first.x < second.x + second.width - 2
    && second.x < first.x + first.width - 2
    && first.y < second.y + second.height - 2
    && second.y < first.y + first.height - 2;
}

async function expectCenterHit(locator, label) {
  expect(await locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return hit === element || element.contains(hit);
  }), `${label} center is clickable`).toBe(true);
}

test('customer navigation, map tools, and lists stay separate and usable across widths', async ({ page }) => {
  test.skip(!remote, 'Customer session and populated delivery fixtures use the remote API.');
  await installRemoteFixtures(page, { customer: true });
  for (const [width, height] of [[1024, 768], [920, 768], [769, 768], [768, 1024], [390, 844], [375, 812], [375, 667]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/customer/delivery-inquiry');
    const nav = page.getByRole('navigation', { name: '고객사 메뉴' });
    const tools = page.locator('.customer-map-tools');
    const side = page.getByRole('complementary', { name: '고객사 관제 패널' });
    const search = page.getByRole('searchbox', { name: '고객사 배송 검색' });
    const controlButton = nav.getByRole('button', { name: /관제/ });
    const historyButton = nav.getByRole('button', { name: /이력/ });
    const map = await box(page.locator('.customer-delivery-demo .map-card'));
    expect(map.x, `${width}px map left`).toBeLessThanOrEqual(2);
    expect(map.y, `${width}px map top`).toBeLessThanOrEqual(2);
    expect(map.width, `${width}px map width`).toBeGreaterThanOrEqual(width - 2);
    expect(map.height, `${width}px map height`).toBeGreaterThanOrEqual(height - 2);
    for (const view of ['control', 'history']) {
      if (view === 'history') await historyButton.click();
      await expect(search).toBeVisible();
      expect(overlaps(await box(nav), await box(tools)), `${width}px ${view} nav/tools`).toBe(false);
      expect(overlaps(await box(tools), await box(side)), `${width}px ${view} tools/lists`).toBe(false);
      await expectCenterHit(search, `${width}px ${view} search`);
      await expectCenterHit(controlButton, `${width}px ${view} control navigation`);
      await expectCenterHit(historyButton, `${width}px ${view} history navigation`);
      if (view === 'history') {
        await expect(page).toHaveURL(/view=history/);
        const picker = page.getByRole('button', { name: '이력 기준일 날짜 변경' });
        await expect(picker).toBeVisible();
        await expectCenterHit(picker, `${width}px history date`);
      }
    }
  }
});
