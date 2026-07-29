import { test, expect } from '@playwright/test';

const v1Meta = { apiVersion: 'dsv.v1' };
const adminSession = {
  csrfToken: 'g006-admin-csrf',
  principalType: 'DSV_ADMIN',
  shopId: 'shop-g006-parity',
  actorId: 'admin-actor-g006-parity',
  displayName: 'G006 Admin Operator',
  scopes: [
    'dsv:session:read',
    'dsv:control:read',
    'dsv:dispatches:read',
    'dsv:records:read',
    'dsv:resources:read',
    'dsv:customers:read',
    'dsv:destinations:read',
    'dsv:conditions:read',
    'dsv:settings:read',
  ],
};
const mapProviderProfile = {
  attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
  bounds: [124.5, 33, 132, 39.5],
  initialView: { center: [126.995, 37.43], zoom: 10.35 },
  profileId: 'dsv-korea-v1',
  providerMode: 'public_allowlisted',
  regionCode: 'KR',
  styleUrl: '/map/styles/dsv-korea-v1.json',
  version: '2026-07',
};
const demoIdentifierPattern = /DSV-2026-0709-(?:01|02)|DSV-SCHEDULED-03|CR-(?:101|204|207|303|330|410)|(?:11바 1201|12바 2302|13사 3403|14자 4504|15바 5605|21사 6101|22자 6202|23바 6303|24사 6404|31자 7104|32바 7207|33사 7311|34자 7412)|김도윤|역삼 진단센터/iu;

function v1Envelope(data, requestId = 'g006-parity-request') {
  return { data, meta: v1Meta, requestId };
}

function v1Error(status, message) {
  return {
    body: { error: { code: `G006_${status}`, message, requestId: `g006-parity-error-${status}` } },
    status,
  };
}

function legacyEnvelope(data) {
  return { data, error: null };
}

function legacyError(status, message) {
  return { body: { data: null, error: { code: `G006_${status}`, message } }, status };
}

function operationSettings(overrides = {}) {
  return {
    departureAddress: '경기도 군포시 번영로 82 군포복합물류센터',
    departureLatitude: 37.330948,
    departureLongitude: 126.9372235,
    dwellMinutes: 5,
    etaDelayMinutes: 10,
    forwardDelayAlerts: true,
    gpsSilenceSeconds: 30,
    loadingStartTime: '07:30',
    plannedDepartureTime: '08:30',
    recordMissingProof: true,
    showTemperatureAlerts: true,
    temperatureLimit: 8,
    ...overrides,
  };
}

function adminFixtures(fixtures) {
  return {
    'GET /api/dsv/v1/session': v1Envelope(adminSession, 'g006-parity-session'),
    ...fixtures,
  };
}

async function installApiFixtures(page, fixtures) {
  const resolvedFixtures = {
    'GET /api/dsv/v1/map/profile': v1Envelope(mapProviderProfile, 'g006-map-profile'),
    'GET /api/dsv/settings/operations': legacyEnvelope(operationSettings()),
    ...fixtures,
  };
  const calls = [];
  const unexpected = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}${url.search}`;
    const call = { key, method: request.method(), path: url.pathname, search: url.search };
    calls.push(call);
    const pathKey = `${request.method()} ${url.pathname}`;
    if (!Object.hasOwn(resolvedFixtures, key) && !Object.hasOwn(resolvedFixtures, pathKey)) {
      unexpected.push(call);
      await route.fulfill({
        contentType: 'application/json',
        status: 599,
        body: JSON.stringify({ error: { code: 'UNFIXTURED_API_CALL', message: key, requestId: 'g006-parity-unfixture' } }),
      });
      return;
    }
    const fixture = resolvedFixtures[key] ?? resolvedFixtures[pathKey];
    const resolved = typeof fixture === 'function' ? await fixture({ request, url, call }) : fixture;
    await route.fulfill({
      contentType: 'application/json',
      status: resolved.status ?? 200,
      body: JSON.stringify(resolved.body ?? resolved),
    });
  });
  return { calls, unexpected };
}

async function seedSentinel(page, key, value) {
  await page.addInitScript(({ storageKey, sentinel }) => {
    window.localStorage.setItem(storageKey, sentinel);
  }, { storageKey: key, sentinel: value });
}

async function expectSentinel(page, key, value) {
  await expect(page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key)).resolves.toBe(value);
}

async function expectNoConcreteDemo(page) {
  await expect(page.locator('body')).not.toContainText(demoIdentifierPattern);
}

function expectOnlyFixtureCalls(api) {
  expect(api.unexpected, `unexpected API calls: ${api.unexpected.map((call) => call.key).join(', ')}`).toEqual([]);
}

function managementListFixtures(overrides = {}) {
  return {
    'GET /api/dsv/v1/drivers?limit=100': v1Envelope({
      items: [{ displayName: 'Canonical Driver G006', driverId: 'driver-g006', phone: '010-6006-6006', status: 'ACTIVE' }],
      page: { hasMore: false },
    }, 'g006-drivers'),
    'GET /api/dsv/v1/vehicles?limit=100': v1Envelope({
      items: [{
        displayName: 'Canonical Vehicle G006',
        driverAssignments: [{ assignmentId: 'assignment-g006', driverId: 'driver-g006' }],
        status: 'ACTIVE',
        telematicsCapabilities: ['LOCATION', 'TEMPERATURE', 'TACHOMETER'],
        telematicsSerialNumber: '012-6006-6006',
        vehicleId: 'vehicle-g006',
        vehiclePlate: '60가 6006',
        vehicleType: '냉장탑차',
      }],
      page: { hasMore: false },
    }, 'g006-vehicles'),
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({
      items: [{ customerId: 'customer-g006', displayName: 'Canonical Customer G006', externalCustomerCode: 'CUSTOMER-G006', status: 'ACTIVE' }],
      page: { hasMore: false },
    }, 'g006-customers'),
    'GET /api/dsv/v1/destinations?limit=100': v1Envelope({
      items: [{ address: 'Seoul Canonical Address 6006', destinationId: 'destination-g006', displayName: 'Canonical Destination G006' }],
      page: { hasMore: false },
    }, 'g006-destinations'),
    'GET /api/dsv/v1/conditions?limit=100': v1Envelope({
      items: [{
        code: 'COLD',
        conditionId: 'condition-g006',
        description: '냉장 상태를 유지하여 운송합니다.',
        name: '냉장 운송',
        status: 'ACTIVE',
      }],
      page: { hasMore: false },
    }, 'g006-conditions'),
    ...overrides,
  };
}

function dispatchPageFixture() {
  return v1Envelope({ items: [], page: { hasMore: false } }, 'g006-dispatch-empty');
}

function dispatchFixtures(fixtures = {}) {
  return {
    'GET /api/dsv/settings/operations': legacyEnvelope(operationSettings({ loadingStartTime: '07:15', plannedDepartureTime: '08:45' })),
    'GET /api/dsv/v1/drivers?limit=100': v1Envelope({
      items: [{ displayName: 'Canonical Driver G006', driverId: 'driver-g006', phone: '010-6006-6006', status: 'ACTIVE' }],
      page: { hasMore: false },
    }, 'g006-dispatch-drivers'),
    'GET /api/dsv/v1/vehicles?limit=100': v1Envelope({
      items: [{
        displayName: 'Canonical Vehicle G006',
        driverAssignments: [{ assignmentId: 'assignment-g006', driverId: 'driver-g006' }],
        status: 'ACTIVE',
        vehicleId: 'vehicle-g006',
        vehiclePlate: '60가 6006',
        vehicleType: '냉장탑차',
      }],
      page: { hasMore: false },
    }, 'g006-dispatch-vehicles'),
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({
      items: [{ customerId: 'customer-g006', displayName: 'Canonical Manufacturer G006', status: 'ACTIVE' }],
      page: { hasMore: false },
    }, 'g006-dispatch-customers'),
    'GET /api/dsv/v1/destinations?limit=100': v1Envelope({
      items: [{ destinationId: 'destination-g006', displayName: 'Canonical Destination G006' }],
      page: { hasMore: false },
    }, 'g006-dispatch-destinations'),
    ...fixtures,
  };
}

function dispatchCsv(sellerOrderKey, conditionCode = 'AMBIENT') {
  return [
    'driver,vehicle,배송처,condition,shippedbox,주소,customer,SellerOrderKey,특이사항,latitude,longitude',
    `Canonical Driver,99테 9001,Canonical Clinic,${conditionCode},1,Seoul Canonical Address,CUSTOMER-G006,${sellerOrderKey},Parity test,37.5,127.0`,
  ].join('\n');
}

if (process.env.VITE_DSV_API_MODE === 'remote') {
test('dispatch renders the canonical v1 seller orders on the map without a duplicate order table', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': v1Envelope({
      items: [{
        assignmentStatus: 'ASSIGNED',
        customerId: 'customer-g006',
        destinationDisplayName: 'Canonical Destination G006',
        destinationId: 'destination-g006',
        driverId: 'driver-g006',
        estimatedArrivalAt: '2026-07-23T08:30:00.000Z',
        etaStatus: 'READY',
        latitude: 37.5,
        longitude: 127,
        routePlanId: 'route-plan-g006',
        routeVersionId: 'route-version-g006',
        sellerOrderId: 'seller-order-g006',
        sellerOrderKey: 'SELLER-G006-DISPATCH',
        vehicleId: 'vehicle-g006',
      }],
      page: { hasMore: false },
    }, 'g006-dispatch-success'),
  })));

  await page.goto('/dispatch');

  await expect(page.getByRole('region', { name: '지도' })).toBeVisible();
  await expect(page.getByRole('region', { name: '배송원' })).toBeVisible();
  await expect(page.getByRole('region', { name: '주문' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '1 배송지' })).toBeVisible();
  await expect(page.getByRole('img', { name: /출발 위치: 경기도 군포시 번영로 82/ })).toBeVisible();
  await expect(page.getByLabel('운영 시간 편집')).toBeVisible();
  await expect(page.getByLabel('출발 시간')).toHaveValue('08:45');
  await expectNoConcreteDemo(page);
  expectOnlyFixtureCalls(api);
});

test('dispatch assigns an unassigned order to the selected driver and vehicle', async ({ page }) => {
  let dispatchReads = 0;
  let assignmentPayload;
  const dispatchItem = {
    assignmentStatus: 'UNASSIGNED',
    customerId: 'customer-g006',
    destinationAddress: 'Seoul Canonical Address 6006',
    destinationDisplayName: 'Canonical Destination G006',
    destinationId: 'destination-g006',
    etaStatus: 'NOT_REQUIRED',
    latitude: 37.5,
    longitude: 127,
    sellerOrderId: 'seller-order-g006-assignment',
    sellerOrderKey: 'SELLER-G006-ASSIGNMENT',
  };
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': () => {
      dispatchReads += 1;
      return v1Envelope({
        items: dispatchReads === 1 ? [dispatchItem] : [{
          ...dispatchItem,
          assignmentStatus: 'ASSIGNED',
          driverId: 'driver-g006',
          etaStatus: 'PENDING',
          routePlanId: 'route-plan-g006-assignment',
          routeVersionId: 'route-version-g006-assignment',
          vehicleId: 'vehicle-g006',
        }],
        page: { hasMore: false },
      }, `g006-dispatch-assignment-${dispatchReads}`);
    },
    'POST /api/dsv/v1/seller-orders/seller-order-g006-assignment/assignment/reassign': async ({ request }) => {
      assignmentPayload = await request.postDataJSON();
      return legacyEnvelope({
        assignmentResult: {
          assignmentStatus: 'ASSIGNED',
          auditEventId: 'audit-g006-assignment',
          commandId: assignmentPayload.commandId,
          etaStatus: 'PENDING',
          newRouteVersionId: 'route-version-g006-assignment',
          previousRouteVersionId: null,
          receiptId: 'receipt-g006-assignment',
          routePlanId: 'route-plan-g006-assignment',
          sellerOrderId: 'seller-order-g006-assignment',
        },
      });
    },
  })));

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '1 배송지' }).click();
  const driverRegion = page.getByRole('region', { name: '배송원' });
  await expect(driverRegion).toContainText('Canonical Destination G006');
  await driverRegion.getByRole('button', { name: '선택 배정', exact: true }).click();

  await expect.poll(() => dispatchReads).toBe(2);
  await expect(page.locator('[aria-label="배정 진행"]')).toContainText('배정 1');
  expect(assignmentPayload).toMatchObject({
    expectedVersion: 'UNASSIGNED',
    reason: '관리자 배정',
    targetDriverId: 'driver-g006',
    targetVehicleId: 'vehicle-g006',
  });
  expect(assignmentPayload.commandId).toEqual(expect.any(String));
  expectOnlyFixtureCalls(api);
});

test('dispatch selects multiple destinations with a map polygon', async ({ page }) => {
  const assignmentPayloads = [];
  const assignmentFixture = async ({ request, url }) => {
    const payload = await request.postDataJSON();
    assignmentPayloads.push(payload);
    const sellerOrderId = url.pathname.split('/').at(-3);
    return legacyEnvelope({
      assignmentResult: {
        assignmentStatus: 'ASSIGNED',
        auditEventId: `audit-${sellerOrderId}`,
        commandId: payload.commandId,
        etaStatus: 'PENDING',
        newRouteVersionId: `route-version-${sellerOrderId}`,
        previousRouteVersionId: null,
        receiptId: `receipt-${sellerOrderId}`,
        routePlanId: 'route-plan-g006-polygon',
        sellerOrderId,
      },
    });
  };
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': v1Envelope({
      items: [
        {
          assignmentStatus: 'UNASSIGNED',
          customerId: 'customer-g006',
          destinationDisplayName: 'Canonical Destination North',
          destinationId: 'destination-g006',
          etaStatus: 'NOT_REQUIRED',
          latitude: 37.51,
          longitude: 126.99,
          sellerOrderId: 'seller-order-g006-north',
          sellerOrderKey: 'SELLER-G006-NORTH',
        },
        {
          assignmentStatus: 'UNASSIGNED',
          customerId: 'customer-g006',
          destinationDisplayName: 'Canonical Destination South',
          destinationId: 'destination-g006',
          etaStatus: 'NOT_REQUIRED',
          latitude: 37.49,
          longitude: 127.01,
          sellerOrderId: 'seller-order-g006-south',
          sellerOrderKey: 'SELLER-G006-SOUTH',
        },
      ],
      page: { hasMore: false },
    }, 'g006-dispatch-polygon'),
    'POST /api/dsv/v1/seller-orders/seller-order-g006-north/assignment/reassign': assignmentFixture,
    'POST /api/dsv/v1/seller-orders/seller-order-g006-south/assignment/reassign': assignmentFixture,
  })));

  await page.goto('/dispatch');
  await page.locator('.map-canvas.ready').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '영역 선택', exact: true }).click();
  const mapCanvas = page.locator('.maplibregl-canvas');
  const box = await mapCanvas.boundingBox();
  expect(box).not.toBeNull();
  for (const [x, y] of [[0.02, 0.02], [0.98, 0.02], [0.98, 0.98], [0.02, 0.98]]) {
    await mapCanvas.click({ position: { x: box.width * x, y: box.height * y } });
  }
  await page.getByRole('button', { name: '선택 적용', exact: true }).click();

  const driverRegion = page.getByRole('region', { name: '배송원' });
  await expect(driverRegion).toContainText('2곳');
  await driverRegion.getByRole('button', { name: '선택 배정', exact: true }).click();
  await expect.poll(() => assignmentPayloads.length).toBe(2);
  expect(assignmentPayloads[1]).toMatchObject({ targetRoutePlanId: 'route-plan-g006-polygon' });
  expectOnlyFixtureCalls(api);
});

test('dispatch keeps past service dates read-only in the same workspace', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': v1Envelope({
      items: [{
        assignmentStatus: 'ASSIGNED',
        customerId: 'customer-g006',
        destinationId: 'destination-g006',
        driverId: 'driver-g006',
        etaStatus: 'PENDING',
        routePlanId: 'route-plan-g006-past',
        routeVersionId: 'route-version-g006-past',
        sellerOrderId: 'seller-order-g006-past',
        sellerOrderKey: 'SELLER-G006-PAST',
        vehicleId: 'vehicle-g006',
      }],
      page: { hasMore: false },
    }, 'g006-dispatch-past'),
  })));

  await page.goto('/dispatch');
  await page.getByLabel('배차일 선택').fill('2020-01-01');

  await expect(page.getByText('지난 배차는 조회만 가능합니다.')).toBeVisible();
  await expect(page.getByRole('region', { name: '배송원' }).getByRole('button', { name: '배정 해제' })).toBeDisabled();
  await expect.poll(() => api.calls.some((call) => call.key.includes('serviceDate=2020-01-01'))).toBe(true);
  expectOnlyFixtureCalls(api);
});

test('dispatch read failure is visible and leaves the dispatch sentinel untouched', async ({ page }) => {
  const key = 'clever.dispatch.last-import';
  const sentinel = 'g006-dispatch-read-sentinel';
  await seedSentinel(page, key, sentinel);
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': v1Error(500, 'dispatch read failed'),
  })));

  await page.goto('/dispatch');

  await expect(page.getByRole('alert').filter({ hasText: 'dispatch read failed' })).toBeVisible();
  await expectNoConcreteDemo(page);
  await expectSentinel(page, key, sentinel);
  expectOnlyFixtureCalls(api);
});

test('dispatch blocks departure editing when operational settings fail to load', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/settings/operations': legacyError(500, 'operational settings read failed'),
    'GET /api/dsv/v1/dispatches': dispatchPageFixture(),
  })));

  await page.goto('/dispatch');

  await expect(page.getByRole('alert').filter({ hasText: '운영 시간을 불러오지 못했습니다.' })).toBeVisible();
  await expect(page.getByLabel('운영 시간 편집')).toHaveCount(0);
  await expect(page.getByLabel('출발 시간')).toHaveCount(0);
  expectOnlyFixtureCalls(api);
});

test('dispatch rejects incomplete remote operational settings instead of masking contract drift', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/settings/operations': legacyEnvelope({ loadingStartTime: '07:15' }),
    'GET /api/dsv/v1/dispatches': dispatchPageFixture(),
  })));

  await page.goto('/dispatch');

  await expect(page.getByRole('alert').filter({ hasText: '운영 시간을 불러오지 못했습니다.' })).toBeVisible();
  await expect(page.getByLabel('운영 시간 편집')).toHaveCount(0);
  await expect(page.getByLabel('출발 시간')).toHaveCount(0);
  await expectNoConcreteDemo(page);
  expectOnlyFixtureCalls(api);
});

test('records route stays visible and renders an empty canonical record list', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/v1/records': v1Envelope({ items: [], page: { hasMore: false } }, 'g006-empty-records'),
  }));

  await page.goto('/records');

  await expect(page).toHaveURL(/\/records$/);
  await expect(page.getByRole('heading', { name: '이력', exact: true })).toBeVisible();
  await expect(page.getByText('배송 이력이 없습니다.')).toBeVisible();
  expect(api.calls.some((call) => call.key === 'GET /api/dsv/v1/records')).toBe(true);
  await expectNoConcreteDemo(page);
  expectOnlyFixtureCalls(api);
});

test('admin tab navigation preserves the sidebar node and expanded state', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/v1/records': v1Envelope({ items: [], page: { hasMore: false } }, 'g006-stable-shell-records'),
  }));

  await page.goto('/records');
  await expect(page.getByRole('heading', { name: '이력', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '사이드바 펼치기' }).click();
  await expect(page.locator('main.page')).toHaveClass(/nav-expanded/u);
  await page.evaluate(() => {
    window.__stableAdminNavigation = document.querySelector('.left-tabs');
  });

  await page.getByRole('link', { name: '설정', exact: true }).click();

  await expect(page).toHaveURL(/\/settings$/u);
  await expect(page.getByRole('heading', { name: '설정', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '사이드바 접기', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => page.evaluate(() => window.__stableAdminNavigation === document.querySelector('.left-tabs'))).toBe(true);
  expect(api.calls.filter((call) => call.key === 'GET /api/dsv/v1/session')).toHaveLength(1);
  expectOnlyFixtureCalls(api);
});

test('management renders customer, destination, and condition reference lists', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures(managementListFixtures()));
  await page.setViewportSize({ width: 1024, height: 900 });

  await page.goto('/master-data');

  await expect(page.getByRole('button', { name: '운송자원', exact: true })).toBeVisible();
  const driverWorkspace = page.getByLabel('배송원 관리');
  const driverList = driverWorkspace.getByLabel('배송원 리스트');
  const driverDetail = driverWorkspace.getByLabel('배송원 상세');
  expect((await driverList.boundingBox()).width).toBeGreaterThan((await driverDetail.boundingBox()).width);
  const driverRow = driverWorkspace.getByRole('row').filter({ hasText: 'Canonical Driver G006' });
  await expect(driverRow).toContainText('010-6006-6006');
  await expect(driverRow).toContainText('60가 6006');
  await driverRow.click();
  await expect(driverWorkspace).toHaveClass(/has-selection/u);
  await expect.poll(async () => (await driverDetail.boundingBox()).width > (await driverList.boundingBox()).width).toBe(true);
  await expect(driverWorkspace.getByLabel('배송원 상세')).toContainText('Canonical Driver G006');
  await expect(driverWorkspace.getByLabel('배송원 상세')).toContainText('010-6006-6006');
  await driverRow.click();
  await expect(driverWorkspace).toHaveClass(/is-idle/u);

  const vehicleWorkspace = page.getByLabel('차량 관리');
  const vehicleRow = vehicleWorkspace.getByRole('row').filter({ hasText: '60가 6006' });
  await expect(vehicleRow).toContainText('냉장탑차');
  await expect(vehicleRow).toContainText('Canonical Driver G006');
  await expect(vehicleRow).toContainText('012-6006-6006');
  await vehicleRow.click();
  await expect(vehicleWorkspace).toHaveClass(/has-selection/u);
  await expect(vehicleWorkspace.getByLabel('차량 상세')).toContainText('60가 6006');
  await expect(vehicleWorkspace.getByLabel('차량 상세')).toContainText('012-6006-6006');
  await vehicleWorkspace.getByRole('button', { name: '선택 취소' }).click();
  await expect(vehicleWorkspace).toHaveClass(/is-idle/u);

  await page.getByRole('button', { name: '고객사', exact: true }).click();
  await expect(page.getByText('Canonical Customer G006', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Canonical Destination G006', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '운송조건', exact: true }).click();
  await expect(page.getByText('냉장 운송', { exact: true }).first()).toBeVisible();
  const conditionRow = page.locator('.master-condition-grid tbody tr').filter({ hasText: '냉장 운송' });
  await expect(conditionRow.locator('td')).toHaveText(['COLD', '냉장 운송', '냉장 상태를 유지하여 운송합니다.']);
  expectOnlyFixtureCalls(api);
});

test('management exposes a v1 list failure without falling back to local data', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures(managementListFixtures({
    'GET /api/dsv/v1/customers?limit=100': {
      body: { error: { code: 'G006_500', message: 'customers read failed', requestId: 'g006-management-error-500' } },
      status: 500,
    },
  })));

  await page.goto('/master-data');

  await expect(page.getByRole('alert').filter({ hasText: 'customers read failed' })).toBeVisible();
  await expectNoConcreteDemo(page);
  expectOnlyFixtureCalls(api);
});

test('management rejects unknown v1 list page keys without rendering canonical data', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures(managementListFixtures({
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({
      items: [{ customerId: 'customer-g006', displayName: 'Canonical Customer G006' }],
      page: { hasMore: false },
      total: 1,
    }, 'g006-customers-extra-key'),
  })));

  await page.goto('/master-data');

  await expect(page.getByRole('alert')).toContainText('API v1 관리 목록 형식이 올바르지 않습니다.');
  await expectNoConcreteDemo(page);
  expectOnlyFixtureCalls(api);
});

test('settings GET and PATCH use the exact bounded legacy path', async ({ page }) => {
  const key = 'clever.admin.settings';
  const sentinel = 'g006-settings-success-sentinel';
  await seedSentinel(page, key, sentinel);
  let csrfRefreshCount = 0;
  let patchBody;
  const patchCsrfTokens = [];
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/v1/session': v1Envelope({
      ...adminSession,
      csrfToken: 'g006-stale-csrf',
    }, 'g006-parity-session-stale-csrf'),
    'GET /api/dsv/auth/session': () => {
      csrfRefreshCount += 1;
      return legacyEnvelope({
        csrfToken: 'g006-current-csrf',
        expiresAt: '2026-07-28T00:00:00.000Z',
        shopDomain: 'dsv-demo.local',
      });
    },
    'GET /api/dsv/settings/operations': legacyEnvelope(operationSettings({ loadingStartTime: '07:15', plannedDepartureTime: '08:45' })),
    'POST /api/dsv/settings/operations/geocode': legacyEnvelope({
      address: '서울특별시 중구 세종대로 110',
      latitude: 37.5663,
      longitude: 126.9779,
    }),
    'PATCH /api/dsv/settings/operations': ({ request }) => {
      patchBody = request.postDataJSON();
      const csrfToken = request.headers()['x-csrf-token'];
      patchCsrfTokens.push(csrfToken);
      if (csrfToken === 'g006-stale-csrf') {
        return {
          body: { data: null, error: { code: 'FORBIDDEN', message: 'Invalid CSRF token' } },
          status: 403,
        };
      }
      return legacyEnvelope(operationSettings({
        departureAddress: '서울특별시 중구 세종대로 110',
        departureLatitude: 37.5663,
        departureLongitude: 126.9779,
        loadingStartTime: '07:30',
        plannedDepartureTime: '09:00',
      }));
    },
  }));

  await page.goto('/settings');
  await expect(page.getByLabel('준비 시작 시간')).toHaveValue('07:15');
  await expect(page.getByLabel('출발 예정 시간')).toHaveValue('08:45');
  await expect(page.getByLabel('특장 온도 상한')).toHaveValue('8');
  await expect(page.getByLabel('ETA 지연 알림')).toHaveValue('10');
  await expect(page.getByLabel('GPS 미수신 알림')).toHaveValue('30');
  await expect(page.getByLabel('도착 후 대기시간')).toHaveValue('5');
  await expect(page.getByLabel('출발지 주소')).toHaveValue('경기도 군포시 번영로 82 군포복합물류센터');
  await expect(page.getByRole('img', { name: /출발 위치: 경기도 군포시 번영로 82/ })).toBeVisible();
  await page.getByLabel('출발지 주소').fill('서울특별시 중구 세종대로 110');
  await page.getByRole('button', { name: '주소 검색' }).click();
  await expect(page.getByLabel('출발지 위도')).toHaveValue('37.5663');
  await expect(page.getByLabel('출발지 경도')).toHaveValue('126.9779');
  await expect(page.getByText('원격 설정')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '초기화', exact: true })).toBeVisible();
  await page.getByLabel('준비 시작 시간').fill('07:30');
  await page.getByLabel('출발 예정 시간').fill('09:00');
  await page.getByRole('button', { name: '저장', exact: true }).click();

  await expect(page.getByRole('status').filter({ hasText: '설정을 저장했습니다.' })).toBeVisible();
  expect(patchBody).toEqual(operationSettings({
    departureAddress: '서울특별시 중구 세종대로 110',
    departureLatitude: 37.5663,
    departureLongitude: 126.9779,
    loadingStartTime: '07:30',
    plannedDepartureTime: '09:00',
  }));
  expect(patchCsrfTokens).toEqual(['g006-stale-csrf', 'g006-current-csrf']);
  expect(csrfRefreshCount).toBe(1);
  await expectSentinel(page, key, sentinel);
  expectOnlyFixtureCalls(api);
});

test('settings renders the complete backend defaults', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/settings/operations': legacyEnvelope(operationSettings()),
  }));

  await page.goto('/settings');

  await expect(page.getByLabel('준비 시작 시간')).toHaveValue('07:30');
  await expect(page.getByLabel('출발 예정 시간')).toHaveValue('08:30');
  await expect(page.getByLabel('특장 온도 상한')).toHaveValue('8');
  await expect(page.getByLabel('ETA 지연 알림')).toHaveValue('10');
  await expect(page.getByLabel('GPS 미수신 알림')).toHaveValue('30');
  await expect(page.getByLabel('도착 후 대기시간')).toHaveValue('5');
  await expect(page.getByRole('checkbox', { name: '관제 화면 표시' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '배송원에게 전달' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '기록 페이지에 표시' })).toBeChecked();
  expectOnlyFixtureCalls(api);
});

test('settings GET failure keeps the remote form blocked', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/settings/operations': legacyError(500, 'settings read failed'),
  }));

  await page.goto('/settings');

  await expect(page.getByText('설정을 불러오지 못했습니다.')).toBeVisible();
  await expect(page.getByRole('button', { name: '초기화', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '저장', exact: true })).toBeDisabled();
  await expect(page.getByLabel('출발 예정 시간')).toHaveCount(0);
  expectOnlyFixtureCalls(api);
});

test('an older geocode response cannot overwrite a newer departure address', async ({ page }) => {
  let resolveGeocode;
  const geocodeResponse = new Promise((resolve) => { resolveGeocode = resolve; });
  const api = await installApiFixtures(page, adminFixtures({
    'POST /api/dsv/settings/operations/geocode': () => geocodeResponse,
  }));

  await page.goto('/settings');
  const address = page.getByLabel('출발지 주소');
  await address.fill('이전 주소');
  await page.getByRole('button', { name: '주소 검색' }).click();
  await expect(page.getByRole('button', { name: '검색 중' })).toBeDisabled();
  await address.fill('새 주소');
  resolveGeocode(legacyEnvelope({
    address: '이전 주소',
    latitude: 37.5663,
    longitude: 126.9779,
  }));

  await expect(address).toHaveValue('새 주소');
  await expect(page.getByLabel('출발지 위도')).toHaveValue('');
  await expect(page.getByLabel('출발지 경도')).toHaveValue('');
  expectOnlyFixtureCalls(api);
});

test('failed settings PATCH keeps the component draft and leaves the settings sentinel untouched', async ({ page }) => {
  const key = 'clever.admin.settings';
  const sentinel = 'g006-settings-failure-sentinel';
  await seedSentinel(page, key, sentinel);
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/settings/operations': legacyEnvelope(operationSettings({ loadingStartTime: '07:15', plannedDepartureTime: '08:45' })),
    'PATCH /api/dsv/settings/operations': legacyError(500, 'settings patch failed'),
  }));

  await page.goto('/settings');
  await expect(page.getByLabel('출발 예정 시간')).toHaveValue('08:45');
  await page.getByLabel('출발 예정 시간').fill('09:20');
  await page.getByRole('button', { name: '저장', exact: true }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'settings patch failed' })).toBeVisible();
  await expect(page.getByLabel('출발 예정 시간')).toHaveValue('09:20');
  await expectSentinel(page, key, sentinel);
  expectOnlyFixtureCalls(api);
});

test('failed dispatch preview leaves the dispatch sentinel untouched', async ({ page }) => {
  const key = 'clever.dispatch.last-import';
  const sentinel = 'g006-dispatch-preview-sentinel';
  await seedSentinel(page, key, sentinel);
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': dispatchPageFixture(),
    'POST /api/dsv/dispatch-imports/preview': legacyError(500, 'dispatch preview failed'),
  })));

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({
    buffer: Buffer.from(dispatchCsv('SELLER-G006-PREVIEW')),
    mimeType: 'text/csv',
    name: 'g006-preview.csv',
  });

  await expect(page.getByRole('alert').filter({ hasText: 'dispatch preview failed' })).toBeVisible();
  await expectSentinel(page, key, sentinel);
  expect(api.calls.some((call) => call.key === 'POST /api/dsv/dispatch-imports/preview')).toBe(true);
  expectOnlyFixtureCalls(api);
});

test('dispatch registers a structured condition candidate using its raw value as the exact code', async ({ page }) => {
  const key = 'clever.dispatch.last-import';
  const sentinel = 'g006-condition-candidate-sentinel';
  const rawValue = 'LIVE-COLD-2-8C';
  let conditionBody;
  let previewCount = 0;
  await seedSentinel(page, key, sentinel);
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': dispatchPageFixture(),
    'POST /api/dsv/dispatch-imports/preview': ({ request }) => {
      const input = request.postDataJSON();
      previewCount += 1;
      const registered = previewCount > 1;
      return legacyEnvelope({
        canCommit: registered,
        conditionCandidates: registered ? [] : [{ comparisonKey: 'live-cold-2-8c', rawValue, rowNumbers: [2] }],
        fileName: input.fileName,
        planDate: input.planDate,
        rows: input.rows.map((row) => ({
          ...row,
          driverId: 'driver-g006',
          issues: registered ? [] : [{ code: 'CONDITION_UNREGISTERED', field: 'conditionCode', message: '운송조건을 먼저 등록해야 합니다.', severity: 'error' }],
          status: registered ? 'READY' : 'NEEDS_REVIEW',
          vehicleId: 'vehicle-g006',
        })),
        summary: registered
          ? { errorRows: 0, readyRows: input.rows.length, reviewRows: 0, totalRows: input.rows.length }
          : { errorRows: input.rows.length, readyRows: 0, reviewRows: 0, totalRows: input.rows.length },
      });
    },
    'POST /api/dsv/conditions': ({ request }) => {
      conditionBody = request.postDataJSON();
      return legacyEnvelope({ condition: { conditionId: 'condition-live-g006' } });
    },
  })));

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({
    buffer: Buffer.from(dispatchCsv('SELLER-G006-CONDITION', rawValue)),
    mimeType: 'text/csv',
    name: 'g006-condition.csv',
  });

  const candidate = page.locator('.condition-candidate').filter({ hasText: rawValue });
  await expect(candidate).toBeVisible();
  await expect(candidate.getByText(rawValue, { exact: true })).toBeVisible();
  await expect(candidate.getByLabel('명칭')).toHaveValue(rawValue);
  await candidate.getByLabel('명칭').fill('Live cold-chain condition');
  await candidate.getByLabel('설명').fill('Keep between 2C and 8C');
  await candidate.getByRole('button', { name: '등록', exact: true }).click();

  await expect(page.getByRole('status').filter({ hasText: '필수 검사와 주소 정본 확인을 통과했습니다.' })).toBeVisible();
  expect(conditionBody).toEqual({ code: rawValue, description: 'Keep between 2C and 8C', name: 'Live cold-chain condition' });
  expect(api.calls.filter((call) => call.key === 'POST /api/dsv/dispatch-imports/preview')).toHaveLength(2);
  expect(api.calls.filter((call) => call.key === 'POST /api/dsv/conditions')).toHaveLength(1);
  await expectSentinel(page, key, sentinel);
  expectOnlyFixtureCalls(api);
});

test('dispatch registers missing drivers and vehicles from the upload review', async ({ page }) => {
  let driverBody;
  let vehicleBody;
  let driverRegistered = false;
  let vehicleRegistered = false;
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': dispatchPageFixture(),
    'POST /api/dsv/dispatch-imports/preview': ({ request }) => {
      const input = request.postDataJSON();
      const issues = [
        ...(driverRegistered ? [] : [{ code: 'DRIVER_NOT_FOUND', field: 'driverName', message: '등록된 배송원을 찾을 수 없습니다.', severity: 'error' }]),
        ...(vehicleRegistered ? [] : [{ code: 'VEHICLE_NOT_FOUND', field: 'vehiclePlate', message: '등록된 차량 번호를 찾을 수 없습니다.', severity: 'error' }]),
      ];
      return legacyEnvelope({
        canCommit: issues.length === 0,
        conditionCandidates: [],
        fileName: input.fileName,
        planDate: input.planDate,
        rows: input.rows.map((row) => ({
          ...row,
          driverId: driverRegistered ? 'driver-upload-g006' : null,
          issues,
          status: issues.length === 0 ? 'READY' : 'NEEDS_REVIEW',
          vehicleId: vehicleRegistered ? 'vehicle-upload-g006' : null,
        })),
        summary: issues.length === 0
          ? { errorRows: 0, readyRows: input.rows.length, reviewRows: 0, totalRows: input.rows.length }
          : { errorRows: input.rows.length, readyRows: 0, reviewRows: 0, totalRows: input.rows.length },
      });
    },
    'POST /api/dsv/drivers': ({ request }) => {
      driverBody = request.postDataJSON();
      driverRegistered = true;
      return legacyEnvelope({ driver: { id: 'driver-upload-g006' } });
    },
    'POST /api/dsv/vehicles': ({ request }) => {
      vehicleBody = request.postDataJSON();
      vehicleRegistered = true;
      return legacyEnvelope({ vehicle: { id: 'vehicle-upload-g006' } });
    },
  })));

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({
    buffer: Buffer.from(dispatchCsv('SELLER-G006-RESOURCE')),
    mimeType: 'text/csv',
    name: 'g006-resource.csv',
  });

  await expect(page.locator('.dispatch-upload-sheet tbody tr:nth-child(2) td:nth-of-type(1)')).toHaveClass(/is-error/u);
  await expect(page.locator('.dispatch-upload-sheet tbody tr:nth-child(2) td:nth-of-type(2)')).toHaveClass(/is-error/u);
  await page.locator('.driver-candidate').getByRole('button', { name: '배송원 등록', exact: true }).click();
  await expect(page.locator('.driver-candidate')).toHaveCount(0);
  await page.locator('.vehicle-candidate').getByRole('button', { name: '차량 등록', exact: true }).click();

  await expect(page.getByRole('button', { name: '업로드 확정', exact: true })).toBeEnabled();
  expect(driverBody).toEqual({
    age: 18,
    career: '미제공',
    gender: '미제공',
    name: 'Canonical Driver',
    score: '미제공',
    traits: [],
    zone: '미제공',
  });
  expect(vehicleBody).toEqual({ note: '', plate: '99테 9001', type: '미지정' });
  expect(api.calls.filter((call) => call.key === 'POST /api/dsv/dispatch-imports/preview')).toHaveLength(3);
  expectOnlyFixtureCalls(api);
});

test('dispatch blocks a malformed structured condition candidate without changing its sentinel', async ({ page }) => {
  const key = 'clever.dispatch.last-import';
  const sentinel = 'g006-malformed-condition-candidate-sentinel';
  await seedSentinel(page, key, sentinel);
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': dispatchPageFixture(),
    'POST /api/dsv/dispatch-imports/preview': ({ request }) => {
      const input = request.postDataJSON();
      return legacyEnvelope({
        canCommit: false,
        conditionCandidates: [{ comparisonKey: 'malformed-cold', rawValue: 'MALFORMED-COLD', rowNumbers: [] }],
        fileName: input.fileName,
        planDate: input.planDate,
        rows: input.rows.map((row) => ({ ...row, driverId: 'driver-g006', issues: [], status: 'READY', vehicleId: 'vehicle-g006' })),
        summary: { errorRows: 0, readyRows: input.rows.length, reviewRows: 0, totalRows: input.rows.length },
      });
    },
  })));

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({
    buffer: Buffer.from(dispatchCsv('SELLER-G006-MALFORMED', 'MALFORMED-COLD')),
    mimeType: 'text/csv',
    name: 'g006-malformed-condition.csv',
  });

  await expect(page.getByRole('alert').filter({ hasText: '배차 사전 검사 conditionCandidates 응답 계약이 올바르지 않습니다.' })).toBeVisible();
  await expect(page.locator('.condition-candidate')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '업로드 확정', exact: true })).toBeDisabled();
  await expectSentinel(page, key, sentinel);
  expectOnlyFixtureCalls(api);
});

test('failed dispatch apply leaves the dispatch sentinel untouched', async ({ page }) => {
  const key = 'clever.dispatch.last-import';
  const sentinel = 'g006-dispatch-apply-sentinel';
  await seedSentinel(page, key, sentinel);
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': dispatchPageFixture(),
    'POST /api/dsv/dispatch-imports/preview': ({ request }) => {
      const input = request.postDataJSON();
      return legacyEnvelope({
        canCommit: true,
        conditionCandidates: [],
        fileName: input.fileName,
        planDate: input.planDate,
        rows: input.rows.map((row) => ({ ...row, driverId: 'driver-g006', issues: [], status: 'READY', vehicleId: 'vehicle-g006' })),
        summary: { errorRows: 0, readyRows: input.rows.length, reviewRows: 0, totalRows: input.rows.length },
      });
    },
    'POST /api/dsv/dispatch-imports': legacyError(500, 'dispatch apply failed'),
  })));

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({
    buffer: Buffer.from(dispatchCsv('SELLER-G006-APPLY')),
    mimeType: 'text/csv',
    name: 'g006-apply.csv',
  });
  await expect(page.getByRole('button', { name: '업로드 확정', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '업로드 확정', exact: true }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'dispatch apply failed' })).toBeVisible();
  await expect(page.getByText('1건 업로드 완료')).toHaveCount(0);
  await expectSentinel(page, key, sentinel);
  expect(api.calls.some((call) => call.key === 'POST /api/dsv/dispatch-imports')).toBe(true);
  expectOnlyFixtureCalls(api);
});
}
