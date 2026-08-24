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
    'dsv:resources:write',
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
const guidePdf = Buffer.from('JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSIC9GMiAzIDAgUgo+PgplbmRvYmoKMiAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyAvTmFtZSAvRjEgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250Cj4+CmVuZG9iagozIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhLUJvbGQgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0YyIC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKNCAwIG9iago8PAovQ29udGVudHMgMTAgMCBSIC9NZWRpYUJveCBbIDAgMCA4NDIgNTk1IF0gL1BhcmVudCA5IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9PdXRsaW5lcyA3IDAgUiAvUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDkgMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago2IDAgb2JqCjw8Ci9BdXRob3IgKGFub255bW91cykgL0NyZWF0aW9uRGF0ZSAoRDoyMDI2MDgxMTE4MTkyNCswOScwMCcpIC9DcmVhdG9yIChhbm9ueW1vdXMpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDI2MDgxMTE4MTkyNCswOScwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkpIAogIC9TdWJqZWN0ICh1bnNwZWNpZmllZCkgL1RpdGxlIChDTEVWRVIgRFNWIFRlc3QgR3VpZGUpIC9UcmFwcGVkIC9GYWxzZQo+PgplbmRvYmoKNyAwIG9iago8PAovQ291bnQgMSAvRmlyc3QgOCAwIFIgL0xhc3QgOCAwIFIgL1R5cGUgL091dGxpbmVzCj4+CmVuZG9iago4IDAgb2JqCjw8Ci9EZXN0IFsgNCAwIFIgL0ZpdCBdIC9QYXJlbnQgNyAwIFIgL1RpdGxlIChcMzc2XDM3N1wwMDAxXDAwMC5cMDAwIFwzMDJcMzM0XDMwN1wyMjFcMzI1WFwyNTYwKQo+PgplbmRvYmoKOSAwIG9iago8PAovQ291bnQgMSAvS2lkcyBbIDQgMCBSIF0gL1R5cGUgL1BhZ2VzCj4+CmVuZG9iagoxMCAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAxODkKPj4Kc3RyZWFtCkdhcm85NW1yOTAnU1ByU01FK11Cby5AImcwIjIqS2pqU1JYY2UoSmQ7Pl43RCclSjk0TD5iNEE2XHElaURxYj4/YHFEcUciYD9SZGVETT0kIjQlXkhJVzpYLWwnS2snWXU/SVIjaSZtM2FBJDR1YUdMPTlaJkRWLGNISTJTI0IpZjdqaSx0JnEuJWxGbHRxSS9CYjkmSDxzclVmJWlJKEVpIzY3M1VbKCJrXXEmP2tgaCpKPTpXS0ZsUU5+PmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDExCjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDA2MSAwMDAwMCBuIAowMDAwMDAwMTAyIDAwMDAwIG4gCjAwMDAwMDAyMDkgMDAwMDAgbiAKMDAwMDAwMDMyMSAwMDAwMCBuIAowMDAwMDAwNTE1IDAwMDAwIG4gCjAwMDAwMDA1OTkgMDAwMDAgbiAKMDAwMDAwMDg3MyAwMDAwMCBuIAowMDAwMDAwOTQ0IDAwMDAwIG4gCjAwMDAwMDEwNTkgMDAwMDAgbiAKMDAwMDAwMTExOCAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9JRCAKWzw1NTdhZmVhMzcxNDJmZTE1MzQ4ZDk1ZjFlNzQzOTA3ZD48NTU3YWZlYTM3MTQyZmUxNTM0OGQ5NWYxZTc0MzkwN2Q+XQolIFJlcG9ydExhYiBnZW5lcmF0ZWQgUERGIGRvY3VtZW50IC0tIGRpZ2VzdCAob3BlbnNvdXJjZSkKCi9JbmZvIDYgMCBSCi9Sb290IDUgMCBSCi9TaXplIDExCj4+CnN0YXJ0eHJlZgoxMzk4CiUlRU9GCg==', 'base64');

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
    manualEmailBody: '안녕하세요.\n\nCLEVER DSV 고객사 배송조회 페이지와 임시 계정 정보를 안내드립니다.\n\n배송조회 페이지:\n임시 아이디:\n임시 비밀번호:\n\n최초 로그인 후 아이디와 비밀번호를 변경해 주세요.',
    manualEmailSenderEmail: null,
    manualEmailSubject: '[CLEVER DSV] 고객사 배송조회 계정 안내',
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
    'GET /api/dsv/v1/operational-notifications': v1Envelope({ items: [] }, 'g006-parity-empty-notifications'),
    'GET /api/dsv/manual-email': legacyEnvelope({ apiConfigured: false, configured: false, defaultRecipients: [], defaultSubject: operationSettings().manualEmailSubject, defaultTextContent: operationSettings().manualEmailBody, senderEmail: null, senderName: 'CLEVER DSV' }),
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

async function installGuideFixture(page) {
  await page.route(/\/api\/dsv\/guides\/(operator|driver)(\?.*)?$/, async (route) => {
    await route.fulfill({
      body: guidePdf,
      contentType: 'application/pdf',
      headers: {
        'accept-ranges': 'bytes',
        'cache-control': 'private, no-store',
      },
      status: 200,
    });
  });
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
      items: [{
        age: 42,
        career: '6년',
        displayName: 'Canonical Driver G006',
        driverId: 'driver-g006',
        gender: '남성',
        phone: '01060066006',
        score: 'A',
        status: 'ACTIVE',
        traits: ['냉장 운송'],
        zone: '서울',
      }],
      page: { hasMore: false },
    }, 'g006-drivers'),
    'GET /api/dsv/v1/vehicles?limit=100': v1Envelope({
      items: [{
        displayName: 'Canonical Vehicle G006',
        driverAssignments: [{ assignmentId: 'assignment-g006', driverId: 'driver-g006' }],
        note: '운영 차량 메모',
        status: 'ACTIVE',
        telematicsCapabilities: ['LOCATION', 'TEMPERATURE', 'TACHOMETER'],
        telematicsSerialNumber: '012-6006-6006',
        type: '냉장탑차',
        vehicleId: 'vehicle-g006',
        vehicleLatitude: 37.5665,
        vehicleLongitude: 126.978,
        vehiclePlate: '60가 6006',
        vehicleType: '냉장탑차',
      }],
      page: { hasMore: false },
    }, 'g006-vehicles'),
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({
      items: [{ customerId: 'customer-g006', displayName: 'Canonical Customer G006', externalCustomerCode: 'CUSTOMER-G006', orderCount: 4, status: 'ACTIVE' }],
      page: { hasMore: false },
    }, 'g006-customers'),
    'GET /api/dsv/customers/customer-g006/accounts': legacyEnvelope({ accounts: [] }),
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
      items: [{
        age: 42,
        career: '6년',
        displayName: 'Canonical Driver G006',
        driverId: 'driver-g006',
        gender: '남성',
        phone: '010-6006-6006',
        score: 'A',
        status: 'ACTIVE',
        traits: ['냉장 운송'],
        zone: '서울',
      }],
      page: { hasMore: false },
    }, 'g006-dispatch-drivers'),
    'GET /api/dsv/v1/vehicles?limit=100': v1Envelope({
      items: [{
        displayName: 'Canonical Vehicle G006',
        driverAssignments: [{ assignmentId: 'assignment-g006', driverId: 'driver-g006' }],
        note: '배차 참조 차량',
        status: 'ACTIVE',
        type: '냉장탑차',
        vehicleId: 'vehicle-g006',
        vehicleLatitude: 37.5665,
        vehicleLongitude: 126.978,
        vehiclePlate: '60가 6006',
        vehicleType: '냉장탑차',
      }],
      page: { hasMore: false },
    }, 'g006-dispatch-vehicles'),
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({
      items: [{ customerId: 'customer-g006', displayName: 'Canonical Customer G006', orderCount: 4, status: 'ACTIVE' }],
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
  await expect(page.getByRole('region', { name: '배송원' })).toContainText('Canonical Driver G006');
  await expect(page.getByRole('region', { name: '배송원' })).toContainText('1건');
  await expect(page.getByRole('region', { name: '주문' })).toHaveCount(0);
  await expect(page.getByRole('img', { name: /출발 위치: 경기도 군포시 번영로 82/ })).toBeVisible();
  await expect(page.getByLabel('운영 시간 편집')).toBeVisible();
  await expect(page.getByLabel('출발 시간')).toHaveValue('08:45');
  await expectNoConcreteDemo(page);
  expectOnlyFixtureCalls(api);
});

test('dispatch keeps every order in the list and groups map markers by destination', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': v1Envelope({
      items: [
        {
          assignmentStatus: 'UNASSIGNED',
          customerId: 'customer-g006',
          destinationDisplayName: 'Canonical Shared Destination',
          destinationId: 'destination-g006-shared',
          etaStatus: 'NOT_REQUIRED',
          latitude: 37.5,
          longitude: 127,
          sellerOrderId: 'seller-order-g006-shared-one',
          sellerOrderKey: 'SELLER-G006-SHARED-ONE',
        },
        {
          assignmentStatus: 'UNASSIGNED',
          customerId: 'customer-g006',
          destinationDisplayName: 'Canonical Shared Destination',
          destinationId: 'destination-g006-shared',
          etaStatus: 'NOT_REQUIRED',
          latitude: 37.5,
          longitude: 127,
          sellerOrderId: 'seller-order-g006-shared-two',
          sellerOrderKey: 'SELLER-G006-SHARED-TWO',
        },
        {
          assignmentStatus: 'UNASSIGNED',
          customerId: 'customer-g006',
          destinationDisplayName: 'Canonical Other Destination',
          destinationId: 'destination-g006-other',
          etaStatus: 'NOT_REQUIRED',
          latitude: 37.51,
          longitude: 127.01,
          sellerOrderId: 'seller-order-g006-other',
          sellerOrderKey: 'SELLER-G006-OTHER',
        },
      ],
      page: { hasMore: false },
    }, 'g006-dispatch-destination-groups'),
  })));

  await page.goto('/dispatch');
  await page.locator('.map-canvas.ready').waitFor({ state: 'visible' });
  const mapCounts = page.getByLabel('배차 지도 집계');
  await expect(mapCounts).toContainText('주문 3건');
  await expect(mapCounts).toContainText('배송지 2곳');
  await expect.poll(() => page.evaluate(() => {
    const source = window.dsvMap.getSource('operational-destinations');
    const features = source?.serialize().data.features ?? [];
    return features.map((feature) => ({
      label: feature.properties.label,
      pointId: feature.properties.pointId,
    })).sort((left, right) => left.pointId.localeCompare(right.pointId));
  })).toEqual([
    { label: '', pointId: 'destination-g006-other' },
    { label: '', pointId: 'destination-g006-shared' },
  ]);

  await page.getByRole('button', { name: '목록', exact: true }).click();
  await expect(page.locator('.dispatch-order-table tbody tr[aria-selected]')).toHaveCount(3);
  await page.getByRole('checkbox', { name: '전체 선택' }).check();
  const selectedCounts = page.getByLabel('선택 집계');
  await expect(selectedCounts).toContainText('배송지2곳');
  await expect(selectedCounts).toContainText('주문3건');
  expectOnlyFixtureCalls(api);
});

test('dispatch list selects and clears every visible order from the header checkbox', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': v1Envelope({
      items: [
        {
          assignmentStatus: 'UNASSIGNED',
          customerId: 'customer-g006',
          destinationDisplayName: 'Canonical Destination One',
          destinationId: 'destination-g006-one',
          etaStatus: 'NOT_REQUIRED',
          latitude: 37.5,
          longitude: 127,
          sellerOrderId: 'seller-order-g006-one',
          sellerOrderKey: 'SELLER-G006-ONE',
        },
        {
          assignmentStatus: 'UNASSIGNED',
          customerId: 'customer-g006',
          destinationDisplayName: 'Canonical Destination Two',
          destinationId: 'destination-g006-two',
          etaStatus: 'NOT_REQUIRED',
          latitude: 37.51,
          longitude: 127.01,
          sellerOrderId: 'seller-order-g006-two',
          sellerOrderKey: 'SELLER-G006-TWO',
        },
      ],
      page: { hasMore: false },
    }, 'g006-dispatch-select-all'),
  })));

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '목록', exact: true }).click();
  const orderTable = page.locator('.dispatch-order-table');
  const addressSort = orderTable.getByRole('button', { name: '주소 정렬 기본순' });
  await addressSort.click();
  await expect(orderTable.getByRole('button', { name: '주소 정렬 내림차순' })).toBeVisible();
  await orderTable.getByRole('button', { name: '주소 정렬 내림차순' }).click();
  await expect(orderTable.getByRole('button', { name: '주소 정렬 오름차순' })).toBeVisible();
  await orderTable.getByRole('button', { name: '주소 정렬 오름차순' }).click();
  await expect(orderTable.getByRole('button', { name: '주소 정렬 기본순' })).toBeVisible();
  const driverTable = page.locator('.dispatch-driver-table');
  await driverTable.getByRole('button', { name: '배송원 정렬 기본순' }).click();
  await expect(driverTable.getByRole('button', { name: '배송원 정렬 내림차순' })).toBeVisible();
  const selectAll = page.getByRole('checkbox', { name: '전체 선택' });
  await selectAll.check();
  await expect(page.getByRole('region', { name: '배송원' })).toContainText('2곳');
  await expect(page.locator('.dispatch-order-table tbody tr.selected')).toHaveCount(2);

  await selectAll.uncheck();
  await expect(page.getByRole('region', { name: '배송원' })).toContainText('0곳');
  await expect(page.locator('.dispatch-order-table tbody tr.selected')).toHaveCount(0);
  expectOnlyFixtureCalls(api);
});

test('dispatch moves one assigned order through the compatible single-order endpoint', async ({ page }) => {
  let dispatchReads = 0;
  let assignmentPayload;
  const dispatchItem = {
    assignmentStatus: 'ASSIGNED',
    customerId: 'customer-g006',
    destinationAddress: 'Seoul Canonical Address 6006',
    destinationDisplayName: 'Canonical Destination G006',
    destinationId: 'destination-g006',
    driverId: 'driver-g006-current',
    etaStatus: 'PENDING',
    latitude: 37.5,
    longitude: 127,
    routePlanId: 'route-plan-g006-current',
    routeVersionId: 'route-version-g006-current',
    sellerOrderId: 'seller-order-g006-assignment',
    sellerOrderKey: 'SELLER-G006-ASSIGNMENT',
    vehicleId: 'vehicle-g006-current',
  };
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/drivers?limit=100': v1Envelope({
      items: [
        { age: 42, career: '6년', displayName: 'Canonical Driver G006 Target', driverId: 'driver-g006-target', gender: '남성', phone: '010-7006-7006', score: 'A', status: 'ACTIVE', traits: [], zone: '서울' },
        { age: 42, career: '6년', displayName: 'Canonical Driver G006 Current', driverId: 'driver-g006-current', gender: '남성', phone: '010-6006-6006', score: 'A', status: 'ACTIVE', traits: [], zone: '서울' },
      ],
      page: { hasMore: false },
    }, 'g006-dispatch-move-drivers'),
    'GET /api/dsv/v1/vehicles?limit=100': v1Envelope({
      items: [
        { displayName: 'Canonical Vehicle G006 Target', driverAssignments: [{ assignmentId: 'assignment-g006-target', driverId: 'driver-g006-target' }], status: 'ACTIVE', vehicleId: 'vehicle-g006-target', vehiclePlate: '70가 7006', vehicleType: 'OTHER' },
        { displayName: 'Canonical Vehicle G006 Current', driverAssignments: [{ assignmentId: 'assignment-g006-current', driverId: 'driver-g006-current' }], status: 'ACTIVE', vehicleId: 'vehicle-g006-current', vehiclePlate: '60가 6006', vehicleType: 'OTHER' },
      ],
      page: { hasMore: false },
    }, 'g006-dispatch-move-vehicles'),
    'GET /api/dsv/v1/dispatches': () => {
      dispatchReads += 1;
      return v1Envelope({
        items: dispatchReads === 1 ? [dispatchItem] : [{
          ...dispatchItem,
          driverId: 'driver-g006-target',
          routePlanId: 'route-plan-g006-assignment',
          routeVersionId: 'route-version-g006-assignment',
          vehicleId: 'vehicle-g006-target',
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
          previousRouteVersionId: 'route-version-g006-current',
          receiptId: 'receipt-g006-assignment',
          routePlanId: 'route-plan-g006-assignment',
          sellerOrderId: 'seller-order-g006-assignment',
        },
      });
    },
  })));

  await page.goto('/dispatch');
  await page.locator('.map-canvas.ready').waitFor({ state: 'visible' });
  const viewportBeforeSelection = await page.evaluate(() => ({
    center: window.dsvMap.getCenter().toArray(),
    zoom: window.dsvMap.getZoom(),
  }));
  await page.getByRole('button', { name: '영역 선택', exact: true }).click();
  await expect.poll(() => page.evaluate(() => ({
    center: window.dsvMap.getCenter().toArray(),
    zoom: window.dsvMap.getZoom(),
  }))).toEqual(viewportBeforeSelection);
  const mapCanvas = page.locator('.maplibregl-canvas');
  const mapBox = await mapCanvas.boundingBox();
  expect(mapBox).not.toBeNull();
  for (const [x, y] of [[0.02, 0.15], [0.98, 0.15], [0.98, 0.98], [0.02, 0.98], [0.02, 0.15]]) {
    await mapCanvas.click({ position: { x: mapBox.width * x, y: mapBox.height * y } });
  }
  const driverRegion = page.getByRole('region', { name: '배송원' });
  await expect(driverRegion).toContainText('Canonical Destination G006');
  await driverRegion.getByRole('button', { name: '선택 이관', exact: true }).click();

  await expect.poll(() => dispatchReads).toBe(2);
  await expect(page.locator('[aria-label="배정 진행"]')).toContainText('배정 1');
  expect(assignmentPayload).toMatchObject({
    expectedVersion: 'route-version-g006-current',
    reason: '관리자 배정',
    targetDriverId: 'driver-g006-target',
    targetVehicleId: 'vehicle-g006-target',
  });
  expect(assignmentPayload.commandId).toEqual(expect.any(String));
  expectOnlyFixtureCalls(api);
});

test('dispatch unassigns one selected order through the compatible single-order endpoint', async ({ page }) => {
  let dispatchReads = 0;
  let unassignmentPayload;
  const assignedRow = {
    assignmentStatus: 'ASSIGNED',
    customerId: 'customer-g006',
    destinationAddress: 'Seoul Canonical Address Single',
    destinationDisplayName: 'Canonical Destination Single',
    destinationId: 'destination-g006-single-unassign',
    driverId: 'driver-g006',
    etaStatus: 'PENDING',
    latitude: 37.5,
    longitude: 127,
    routePlanId: 'route-plan-g006-single-unassign',
    routeVersionId: 'route-version-g006-single-unassign',
    sellerOrderId: 'seller-order-g006-single-unassign',
    sellerOrderKey: 'SELLER-G006-SINGLE-UNASSIGN',
    vehicleId: 'vehicle-g006',
  };
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': () => {
      dispatchReads += 1;
      return v1Envelope({
        items: dispatchReads === 1 ? [assignedRow] : [{
          ...assignedRow,
          assignmentStatus: 'UNASSIGNED',
          driverId: undefined,
          etaStatus: 'NOT_REQUIRED',
          routePlanId: undefined,
          routeVersionId: undefined,
          vehicleId: undefined,
        }],
        page: { hasMore: false },
      }, `g006-dispatch-single-unassign-${dispatchReads}`);
    },
    'POST /api/dsv/v1/seller-orders/seller-order-g006-single-unassign/assignment/unassign': async ({ request }) => {
      unassignmentPayload = await request.postDataJSON();
      return legacyEnvelope({
        assignmentResult: {
          assignmentStatus: 'UNASSIGNED',
          auditEventId: 'audit-g006-single-unassign',
          commandId: unassignmentPayload.commandId,
          etaStatus: 'NOT_REQUIRED',
          newRouteVersionId: 'route-version-g006-single-unassigned',
          previousRouteVersionId: 'route-version-g006-single-unassign',
          receiptId: 'receipt-g006-single-unassign',
          routePlanId: 'route-plan-g006-single-unassigned',
          sellerOrderId: assignedRow.sellerOrderId,
        },
      });
    },
  })));

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '목록', exact: true }).click();
  await page.getByRole('checkbox', { name: '전체 선택' }).check();
  await page.getByRole('region', { name: '배송원' }).getByRole('button', { name: '배정 해제' }).click();

  await expect.poll(() => dispatchReads).toBe(2);
  expect(unassignmentPayload).toMatchObject({
    expectedVersion: assignedRow.routeVersionId,
    reason: '관리자 배정 해제',
  });
  expect(unassignmentPayload.commandId).toEqual(expect.any(String));
  expectOnlyFixtureCalls(api);
});

test('dispatch refreshes a stale route version once before unassigning', async ({ page }) => {
  let dispatchReads = 0;
  const unassignmentPayloads = [];
  const assignedRow = {
    assignmentStatus: 'ASSIGNED',
    customerId: 'customer-g006',
    destinationAddress: 'Seoul Canonical Address Retry',
    destinationDisplayName: 'Canonical Destination Retry',
    destinationId: 'destination-g006-retry-unassign',
    driverId: 'driver-g006',
    etaStatus: 'PENDING',
    latitude: 37.5,
    longitude: 127,
    routePlanId: 'route-plan-g006-retry-unassign',
    routeVersionId: 'route-version-g006-retry-old',
    sellerOrderId: 'seller-order-g006-retry-unassign',
    sellerOrderKey: 'SELLER-G006-RETRY-UNASSIGN',
    vehicleId: 'vehicle-g006',
  };
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': () => {
      dispatchReads += 1;
      const currentRow = dispatchReads === 1
        ? assignedRow
        : dispatchReads === 2
          ? { ...assignedRow, routeVersionId: 'route-version-g006-retry-current' }
          : {
              ...assignedRow,
              assignmentStatus: 'UNASSIGNED',
              driverId: undefined,
              etaStatus: 'NOT_REQUIRED',
              routePlanId: undefined,
              routeVersionId: undefined,
              vehicleId: undefined,
            };
      return v1Envelope({ items: [currentRow], page: { hasMore: false } }, `g006-dispatch-retry-unassign-${dispatchReads}`);
    },
    'POST /api/dsv/v1/seller-orders/seller-order-g006-retry-unassign/assignment/unassign': async ({ request }) => {
      const payload = await request.postDataJSON();
      unassignmentPayloads.push(payload);
      if (unassignmentPayloads.length === 1) {
        return {
          body: { data: null, error: { code: 'SELLER_ORDER_ASSIGNMENT_CHANGED', message: 'SELLER_ORDER_ASSIGNMENT_CHANGED' } },
          status: 409,
        };
      }
      return legacyEnvelope({
        assignmentResult: {
          assignmentStatus: 'UNASSIGNED',
          auditEventId: 'audit-g006-retry-unassign',
          commandId: payload.commandId,
          etaStatus: 'NOT_REQUIRED',
          newRouteVersionId: 'route-version-g006-retry-unassigned',
          previousRouteVersionId: 'route-version-g006-retry-current',
          receiptId: 'receipt-g006-retry-unassign',
          routePlanId: 'route-plan-g006-retry-unassigned',
          sellerOrderId: assignedRow.sellerOrderId,
        },
      });
    },
  })));

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '목록', exact: true }).click();
  await page.getByRole('checkbox', { name: '전체 선택' }).check();
  await page.getByRole('region', { name: '배송원' }).getByRole('button', { name: '배정 해제' }).click();

  await expect.poll(() => dispatchReads).toBe(3);
  expect(unassignmentPayloads).toHaveLength(2);
  expect(unassignmentPayloads.map((payload) => payload.expectedVersion)).toEqual([
    'route-version-g006-retry-old',
    'route-version-g006-retry-current',
  ]);
  expectOnlyFixtureCalls(api);
});

test('dispatch unassigns 53 selected orders with one atomic batch request', async ({ page }) => {
  let dispatchReads = 0;
  let unassignmentCalls = 0;
  let unassignmentPayload;
  const assignedRows = Array.from({ length: 53 }, (_, index) => ({
    assignmentStatus: 'ASSIGNED',
    customerId: 'customer-g006',
    destinationAddress: `Seoul Canonical Address ${index + 1}`,
    destinationDisplayName: `Canonical Destination ${index + 1}`,
    destinationId: `destination-g006-${index + 1}`,
    driverId: 'driver-g006',
    etaStatus: 'PENDING',
    latitude: 37.5 + index * 0.0001,
    longitude: 127 + index * 0.0001,
    routePlanId: 'route-plan-g006-batch-unassign',
    routeVersionId: 'route-version-g006-batch-unassign',
    sellerOrderId: `seller-order-g006-${index + 1}`,
    sellerOrderKey: `SELLER-G006-${index + 1}`,
    vehicleId: 'vehicle-g006',
  }));
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': () => {
      dispatchReads += 1;
      return v1Envelope({
        items: dispatchReads === 1
          ? assignedRows
          : assignedRows.map((row) => ({
              ...row,
              assignmentStatus: 'UNASSIGNED',
              driverId: undefined,
              etaStatus: 'NOT_REQUIRED',
              routePlanId: undefined,
              routeVersionId: undefined,
              vehicleId: undefined,
            })),
        page: { hasMore: false },
      }, `g006-dispatch-batch-unassign-${dispatchReads}`);
    },
    'POST /api/dsv/v1/seller-order-assignments/unassign': async ({ request }) => {
      unassignmentCalls += 1;
      unassignmentPayload = await request.postDataJSON();
      return legacyEnvelope({
        assignmentResults: unassignmentPayload.items.map((item) => ({
          assignmentStatus: 'UNASSIGNED',
          auditEventId: `audit-${item.sellerOrderId}`,
          commandId: item.commandId,
          etaStatus: 'NOT_REQUIRED',
          newRouteVersionId: 'route-version-g006-unassigned',
          previousRouteVersionId: 'route-version-g006-batch-unassign',
          receiptId: `receipt-${item.sellerOrderId}`,
          routePlanId: 'route-plan-g006-unassigned',
          sellerOrderId: item.sellerOrderId,
        })),
        routePlanId: 'route-plan-g006-unassigned',
      });
    },
  })));

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '목록', exact: true }).click();
  await page.getByRole('checkbox', { name: '전체 선택' }).check();
  await page.getByRole('region', { name: '배송원' }).getByRole('button', { name: '배정 해제' }).click();

  await expect.poll(() => dispatchReads).toBe(2);
  expect(unassignmentCalls).toBe(1);
  expect(unassignmentPayload).toMatchObject({
    items: assignedRows.map((row) => ({
      expectedVersion: row.routeVersionId,
      sellerOrderId: row.sellerOrderId,
    })),
    reason: '관리자 배정 해제',
  });
  expect(unassignmentPayload.items.every((item) => typeof item.commandId === 'string')).toBe(true);
  expectOnlyFixtureCalls(api);
});

test('dispatch permanently deletes selected orders with one confirmed batch request', async ({ page }) => {
  let dispatchReads = 0;
  let deletionCalls = 0;
  let deletionPayload;
  const selectedRows = [
    {
      assignmentStatus: 'ASSIGNED',
      customerId: 'customer-g006',
      destinationAddress: 'Seoul Canonical Address Deleted 1',
      destinationDisplayName: 'Canonical Destination Deleted 1',
      destinationId: 'destination-g006-delete-1',
      driverId: 'driver-g006',
      etaStatus: 'PENDING',
      latitude: 37.5,
      longitude: 127,
      routePlanId: 'route-plan-g006-delete',
      routeVersionId: 'route-version-g006-delete-1',
      sellerOrderId: 'seller-order-g006-delete-1',
      sellerOrderKey: 'SELLER-G006-DELETE-1',
      vehicleId: 'vehicle-g006',
    },
    {
      assignmentStatus: 'UNASSIGNED',
      customerId: 'customer-g006',
      destinationAddress: 'Seoul Canonical Address Deleted 2',
      destinationDisplayName: 'Canonical Destination Deleted 2',
      destinationId: 'destination-g006-delete-2',
      etaStatus: 'NOT_REQUIRED',
      latitude: 37.501,
      longitude: 127.001,
      sellerOrderId: 'seller-order-g006-delete-2',
      sellerOrderKey: 'SELLER-G006-DELETE-2',
    },
  ];
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': () => {
      dispatchReads += 1;
      return v1Envelope({
        items: dispatchReads === 1 ? selectedRows : [],
        page: { hasMore: false },
      }, `g006-dispatch-delete-${dispatchReads}`);
    },
    'POST /api/dsv/v1/seller-order-deletions': async ({ request }) => {
      deletionCalls += 1;
      deletionPayload = await request.postDataJSON();
      return legacyEnvelope({
        commandId: deletionPayload.commandId,
        deletedSellerOrderIds: deletionPayload.items.map((item) => item.sellerOrderId),
        receiptId: 'delete-receipt-g006',
      });
    },
  })));

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '목록', exact: true }).click();
  await page.getByRole('checkbox', { name: '전체 선택' }).check();
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('2건');
    expect(dialog.message()).toContain('영구 삭제');
    void dialog.accept();
  });
  await page.getByRole('region', { name: '배송원' }).getByRole('button', { name: '배송 삭제' }).click();

  await expect.poll(() => dispatchReads).toBe(2);
  expect(deletionCalls).toBe(1);
  expect(deletionPayload).toMatchObject({
    items: [
      { expectedVersion: 'route-version-g006-delete-1', sellerOrderId: 'seller-order-g006-delete-1' },
      { expectedVersion: 'UNASSIGNED', sellerOrderId: 'seller-order-g006-delete-2' },
    ],
    reason: '관리자 배송 삭제',
  });
  expect(deletionPayload.commandId).toEqual(expect.any(String));
  expectOnlyFixtureCalls(api);
});

test('dispatch blocks permanent deletion above the 100 order API limit', async ({ page }) => {
  let deletionCalls = 0;
  const rows = Array.from({ length: 101 }, (_, index) => ({
    assignmentStatus: 'UNASSIGNED',
    customerId: 'customer-g006',
    destinationAddress: `Seoul Canonical Address Delete Limit ${index + 1}`,
    destinationDisplayName: `Canonical Destination Delete Limit ${index + 1}`,
    destinationId: `destination-g006-delete-limit-${index + 1}`,
    etaStatus: 'NOT_REQUIRED',
    latitude: 37.5 + index / 10000,
    longitude: 127 + index / 10000,
    sellerOrderId: `seller-order-g006-delete-limit-${index + 1}`,
    sellerOrderKey: `SELLER-G006-DELETE-LIMIT-${index + 1}`,
  }));
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': v1Envelope({
      items: rows,
      page: { hasMore: false },
    }, 'g006-dispatch-delete-limit'),
    'POST /api/dsv/v1/seller-order-deletions': () => {
      deletionCalls += 1;
      return legacyEnvelope({ commandId: 'unexpected', deletedSellerOrderIds: [], receiptId: 'unexpected' });
    },
  })));

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '목록', exact: true }).click();
  await page.getByRole('checkbox', { name: '전체 선택' }).check();
  await page.getByRole('region', { name: '배송원' }).getByRole('button', { name: '배송 삭제' }).click();

  await expect(page.getByRole('alert')).toContainText('배송 삭제는 한 번에 최대 100건까지 가능합니다.');
  expect(deletionCalls).toBe(0);
  expectOnlyFixtureCalls(api);
});

test('dispatch blocks batch assignment and unassignment above the 100 order API limit', async ({ page }) => {
  let assignmentCalls = 0;
  let assigned = false;
  const rows = Array.from({ length: 101 }, (_, index) => ({
    assignmentStatus: assigned ? 'ASSIGNED' : 'UNASSIGNED',
    customerId: 'customer-g006',
    destinationDisplayName: `Canonical Assignment Limit ${index + 1}`,
    destinationId: `destination-g006-assignment-limit-${index + 1}`,
    ...(assigned ? {
      driverId: 'driver-g006',
      routePlanId: 'route-plan-g006-assignment-limit',
      routeVersionId: 'route-version-g006-assignment-limit',
      vehicleId: 'vehicle-g006',
    } : {}),
    etaStatus: assigned ? 'PENDING' : 'NOT_REQUIRED',
    latitude: 37.5 + index / 10000,
    longitude: 127 + index / 10000,
    sellerOrderId: `seller-order-g006-assignment-limit-${index + 1}`,
    sellerOrderKey: `SELLER-G006-ASSIGNMENT-LIMIT-${index + 1}`,
  }));
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': () => v1Envelope({
      items: rows.map((row) => ({
        ...row,
        assignmentStatus: assigned ? 'ASSIGNED' : 'UNASSIGNED',
        driverId: assigned ? 'driver-g006' : undefined,
        etaStatus: assigned ? 'PENDING' : 'NOT_REQUIRED',
        routePlanId: assigned ? 'route-plan-g006-assignment-limit' : undefined,
        routeVersionId: assigned ? 'route-version-g006-assignment-limit' : undefined,
        vehicleId: assigned ? 'vehicle-g006' : undefined,
      })),
      page: { hasMore: false },
    }, 'g006-dispatch-assignment-limit'),
    'POST /api/dsv/v1/seller-order-assignments/reassign': () => { assignmentCalls += 1; return legacyEnvelope({}); },
    'POST /api/dsv/v1/seller-order-assignments/unassign': () => { assignmentCalls += 1; return legacyEnvelope({}); },
  })));

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '목록', exact: true }).click();
  await page.getByRole('checkbox', { name: '전체 선택' }).check();
  await page.getByRole('region', { name: '배송원' }).getByRole('button', { name: '선택 배정', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('배송 배정은 한 번에 최대 100건까지 가능합니다.');

  assigned = true;
  await page.reload();
  await page.getByRole('button', { name: '목록', exact: true }).click();
  await page.getByRole('checkbox', { name: '전체 선택' }).check();
  await page.getByRole('region', { name: '배송원' }).getByRole('button', { name: '배정 해제', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('배정 해제는 한 번에 최대 100건까지 가능합니다.');
  expect(assignmentCalls).toBe(0);
  expectOnlyFixtureCalls(api);
});

test('dispatch keeps the last valid service date when the date input is cleared', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': dispatchPageFixture(),
  })));

  await page.goto('/dispatch');
  const dateInput = page.getByLabel('배차일 선택');
  const initialDate = await dateInput.inputValue();
  await dateInput.fill('');

  await expect(dateInput).toHaveValue(initialDate);
  expect(api.calls.filter((call) => call.path === '/api/dsv/v1/dispatches')).toHaveLength(1);
  expect(api.calls.some((call) => call.key.endsWith('serviceDate='))).toBe(false);
  expectOnlyFixtureCalls(api);
});

test('dispatch selects multiple destinations with a map polygon', async ({ page }) => {
  const assignmentPayloads = [];
  const assignmentFixture = async ({ request }) => {
    const payload = await request.postDataJSON();
    assignmentPayloads.push(payload);
    return legacyEnvelope({
      assignmentResults: payload.items.map((item) => ({
          assignmentStatus: 'ASSIGNED',
          auditEventId: `audit-${item.sellerOrderId}`,
          commandId: item.commandId,
          etaStatus: 'PENDING',
          newRouteVersionId: `route-version-${item.sellerOrderId}`,
          previousRouteVersionId: null,
          receiptId: `receipt-${item.sellerOrderId}`,
          routePlanId: 'route-plan-g006-polygon',
          sellerOrderId: item.sellerOrderId,
        })),
      routePlanId: 'route-plan-g006-polygon',
    });
  };
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': v1Envelope({
      items: [
        {
          assignmentStatus: 'UNASSIGNED',
          customerId: 'customer-g006',
          destinationDisplayName: 'Canonical Destination North',
          destinationId: 'destination-g006-north',
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
          destinationId: 'destination-g006-south',
          etaStatus: 'NOT_REQUIRED',
          latitude: 37.49,
          longitude: 127.01,
          sellerOrderId: 'seller-order-g006-south',
          sellerOrderKey: 'SELLER-G006-SOUTH',
        },
      ],
      page: { hasMore: false },
    }, 'g006-dispatch-polygon'),
    'POST /api/dsv/v1/seller-order-assignments/reassign': assignmentFixture,
  })));

  await page.goto('/dispatch');
  await page.locator('.map-canvas.ready').waitFor({ state: 'visible' });
  const viewportBeforeSelection = await page.evaluate(() => ({
    center: window.dsvMap.getCenter().toArray(),
    zoom: window.dsvMap.getZoom(),
  }));
  await page.getByRole('button', { name: '영역 선택', exact: true }).click();
  const mapCanvas = page.locator('.maplibregl-canvas');
  const box = await mapCanvas.boundingBox();
  expect(box).not.toBeNull();
  for (const [x, y] of [[0.02, 0.15], [0.98, 0.15], [0.98, 0.98], [0.02, 0.98]]) {
    await mapCanvas.click({ position: { x: box.width * x, y: box.height * y } });
  }
  await page.mouse.move(box.x + box.width * 0.02, box.y + box.height * 0.15);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.04, box.y + box.height * 0.17, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  await mapCanvas.click({ position: { x: box.width * 0.98, y: box.height * 0.15 } });

  const driverRegion = page.getByRole('region', { name: '배송원' });
  await expect(page.getByLabel('영역 선택 도구')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    window.dsvMap.querySourceFeatures('dispatch-selection-source')
      .some((feature) => feature.geometry.type === 'Polygon'))).toBe(true);
  await expect(driverRegion).toContainText('2곳');
  const finalizedPolygon = await page.evaluate(() => JSON.stringify(
    window.dsvMap.querySourceFeatures('dispatch-selection-source')
      .find((feature) => feature.geometry.type === 'Polygon')?.geometry,
  ));
  await page.mouse.move(box.x + box.width * 0.98, box.y + box.height * 0.15);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.21, { steps: 3 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => JSON.stringify(
    window.dsvMap.querySourceFeatures('dispatch-selection-source')
      .find((feature) => feature.geometry.type === 'Polygon')?.geometry,
  ))).not.toBe(finalizedPolygon);

  await page.getByRole('button', { name: '선택 지우기', exact: true }).click();
  await page.getByRole('button', { name: '영역 선택', exact: true }).click();
  for (const [x, y] of [[0.02, 0.15], [0.98, 0.15], [0.98, 0.98]]) {
    await mapCanvas.click({ position: { x: box.width * x, y: box.height * y } });
  }
  await mapCanvas.dblclick({ position: { x: box.width * 0.02, y: box.height * 0.98 } });
  await expect(page.getByLabel('영역 선택 도구')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    window.dsvMap.querySourceFeatures('dispatch-selection-source')
      .some((feature) => feature.geometry.type === 'Polygon'))).toBe(true);
  await expect(driverRegion).toContainText('2곳');

  await driverRegion.getByRole('button', { name: '선택 배정', exact: true }).click();
  await expect.poll(() => assignmentPayloads.length).toBe(1);
  await expect.poll(() => page.evaluate(() => ({
    center: window.dsvMap.getCenter().toArray(),
    zoom: window.dsvMap.getZoom(),
  }))).toEqual(viewportBeforeSelection);
  expect(assignmentPayloads[0]).toMatchObject({
    items: [
      { sellerOrderId: 'seller-order-g006-north' },
      { sellerOrderId: 'seller-order-g006-south' },
    ],
  });
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
        operationStatus: 'READY',
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
  await expect(page.getByRole('region', { name: '배송원' }).getByRole('button', { name: '배송 삭제' })).toBeDisabled();
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
  expect(api.calls.some((call) => call.key === 'GET /api/dsv/v1/records?limit=50&page=1')).toBe(true);
  await expectNoConcreteDemo(page);
  expectOnlyFixtureCalls(api);
});

test('records route keeps first, nearby, and last numbered pages and filters only when a date is selected', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/v1/records': ({ url }) => {
      const currentPage = Number(url.searchParams.get('page') ?? '1');
      return v1Envelope({
        items: [],
        page: { currentPage, hasMore: currentPage < 10, pageSize: 50, totalItems: 500, totalPages: 10 },
      }, `records-page-${currentPage}`);
    },
  }));

  await page.goto('/records?page=4&serviceDate=2026-08-05');

  const pagination = page.getByRole('navigation', { name: '배송 이력 페이지' });
  await expect(pagination.getByRole('button')).toHaveText(['1', '3', '4', '5', '10']);
  await expect(pagination.getByText('…')).toHaveCount(2);
  await pagination.getByRole('button', { name: '5', exact: true }).click();
  await expect(page).toHaveURL(/serviceDate=2026-08-05.*page=5|page=5.*serviceDate=2026-08-05/u);
  expect(api.calls.some((call) => call.key === 'GET /api/dsv/v1/records?limit=50&page=4&serviceDate=2026-08-05')).toBe(true);
  expect(api.calls.some((call) => call.key === 'GET /api/dsv/v1/records?limit=50&page=5&serviceDate=2026-08-05')).toBe(true);
  expectOnlyFixtureCalls(api);
});

test('records route renders proof metadata and event details for the selected delivery', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/v1/records': v1Envelope({
      items: [{
        deliveryStatus: 'OUT_FOR_DELIVERY',
        destinationAddress: '서울특별시 중구 퇴계로 131 5층',
        destinationDisplayName: '명동 병원',
        estimatedArrivalAt: '2026-07-29T00:30:00.000Z',
        etaStatus: 'READY',
        eventSummary: [{
          driverDisplayName: '김도윤',
          eventId: 'event-1',
          latitude: 37.5601,
          longitude: 126.9902,
          occurredAt: '2026-07-29T00:34:00.000Z',
          type: 'STOP_DELIVERED',
        }],
        proofs: [{
          contentType: 'image/jpeg',
          driverDisplayName: '김도윤',
          kind: 'PHOTO',
          originalFilename: 'delivery.jpg',
          proofId: 'proof-1',
          sizeBytes: 2048,
          source: 'CAMERA',
          status: 'AVAILABLE',
          uploadedAt: '2026-07-29T00:35:00.000Z',
        }],
        proofStatus: 'AVAILABLE',
        rawNote: '오전 11시 배송',
        reviewStatus: 'CONFIRMED',
        routeConstraintStatus: 'NOT_EVALUATED',
        sellerOrderId: 'order-1',
        sellerOrderKey: 'SO-001',
        timeConstraint: {
          auditEventId: 'audit-time-1',
          confirmedAt: '2026-07-28T08:00:00.000Z',
          confirmedBy: 'admin-1',
          status: 'CONFIRMED',
          timeWindowEnd: '11:30',
          timeWindowStart: '10:30',
        },
      }],
      page: { hasMore: false },
    }, 'records-detail'),
  }));

  await page.goto('/records');

  await page.getByRole('button', { name: '주문번호 정렬 기본순' }).click();
  await expect(page.getByRole('button', { name: '주문번호 정렬 내림차순' })).toBeVisible();
  await page.getByRole('button', { name: '주문번호 정렬 내림차순' }).click();
  await expect(page.getByRole('button', { name: '주문번호 정렬 오름차순' })).toBeVisible();
  await page.getByRole('button', { name: '주문번호 정렬 오름차순' }).click();
  await expect(page.getByRole('button', { name: '주문번호 정렬 기본순' })).toBeVisible();
  await expect(page.getByText('서울특별시 중구 퇴계로 131 5층', { exact: true })).toBeVisible();
  await expect(page.getByText('delivery.jpg', { exact: true })).toBeVisible();
  await expect(page.getByText('배송 완료', { exact: true })).toBeVisible();
  await expect(page.getByText('37.56010, 126.99020', { exact: true })).toBeVisible();
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
  await vehicleWorkspace.getByRole('button', { name: '차량 수정', exact: true }).click();
  await expect(vehicleWorkspace.getByLabel('차량 번호')).toHaveAttribute('maxlength', '40');
  await expect(vehicleWorkspace.getByLabel('차종')).toHaveAttribute('maxlength', '160');
  await expect(vehicleWorkspace.getByLabel('TMS 일련번호')).toHaveAttribute('maxlength', '160');
  await expect(vehicleWorkspace.getByLabel('메모')).toHaveAttribute('maxlength', '1000');
  await vehicleWorkspace.getByRole('button', { name: '취소', exact: true }).click();
  await vehicleWorkspace.getByRole('button', { name: '선택 취소' }).click();
  await expect(vehicleWorkspace).toHaveClass(/is-idle/u);

  await page.getByRole('button', { name: '고객사', exact: true }).click();
  await expect(page.getByText('Canonical Customer G006', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Canonical Destination G006', { exact: true }).first()).toBeVisible();
  const customerWorkspace = page.getByLabel('고객사 관리');
  await expect(customerWorkspace.getByLabel('고객사 목록').getByRole('button', { name: '고객사 등록', exact: true })).toBeDisabled();
  const customerRow = customerWorkspace.getByRole('row').filter({ hasText: 'Canonical Customer G006' });
  await expect(customerRow).toContainText('4건');
  await expect(customerRow.getByRole('link', { name: 'Canonical Customer G006 배송조회' })).toBeVisible();
  await customerRow.click();
  await expect(customerWorkspace).toHaveClass(/has-selection/u);
  await expect(customerWorkspace.getByLabel('고객사 상세')).toContainText('4건 Order');
  await expect(customerWorkspace.getByLabel('고객사 상세').getByRole('button', { name: '고객사 수정', exact: true })).toBeEnabled();
  await customerWorkspace.getByRole('button', { name: '선택 취소', exact: true }).click();
  await expect(customerWorkspace).toHaveClass(/is-idle/u);
  await page.getByRole('button', { name: '운송조건', exact: true }).click();
  await expect(page.getByText('냉장 운송', { exact: true }).first()).toBeVisible();
  const conditionRow = page.locator('.master-condition-grid tbody tr').filter({ hasText: '냉장 운송' });
  await expect(conditionRow.locator('td')).toHaveText(['COLD', '냉장 운송', '냉장 상태를 유지하여 운송합니다.']);
  await conditionRow.click();
  await page.getByRole('button', { name: '운송조건 수정', exact: true }).click();
  const conditionForm = page.getByLabel('운송조건 편집');
  await expect(conditionForm.getByLabel('조건 코드')).toHaveAttribute('maxlength', '80');
  await expect(conditionForm.getByLabel('명칭')).toHaveAttribute('maxlength', '160');
  await expect(conditionForm.getByLabel('설명')).toHaveAttribute('maxlength', '1000');
  await expect(conditionForm.getByLabel('온도 범위')).toHaveCount(0);
  await expect(conditionForm.getByLabel('적합 차량')).toHaveCount(0);
  await expect(conditionForm.getByLabel('필수 증빙')).toHaveCount(0);
  expectOnlyFixtureCalls(api);
});

test('management writes the editable TMS serial number in the exact vehicle payload', async ({ page }) => {
  let vehiclePayload;
  let serialNumber = '012-6006-6006';
  const api = await installApiFixtures(page, adminFixtures(managementListFixtures({
    'GET /api/dsv/v1/vehicles?limit=100': () => v1Envelope({
      items: [{
        displayName: 'Canonical Vehicle G006',
        driverAssignments: [],
        note: '운영 차량 메모',
        status: 'ACTIVE',
        telematicsSerialNumber: serialNumber,
        type: '냉장탑차',
        vehicleId: 'vehicle-g006',
        vehiclePlate: '60가 6006',
        vehicleType: '냉장탑차',
      }],
      page: { hasMore: false },
    }, 'g006-vehicle-write'),
    'PATCH /api/dsv/vehicles/vehicle-g006': async ({ request }) => {
      vehiclePayload = await request.postDataJSON();
      serialNumber = vehiclePayload.telematicsSerialNumber;
      return legacyEnvelope({ vehicle: { id: 'vehicle-g006', ...vehiclePayload } });
    },
  })));

  await page.goto('/master-data');
  const vehicleWorkspace = page.getByLabel('차량 관리');
  await vehicleWorkspace.getByRole('row').filter({ hasText: '60가 6006' }).click();
  await vehicleWorkspace.getByRole('button', { name: '차량 수정', exact: true }).click();
  const form = vehicleWorkspace.getByLabel('차량 편집');
  await form.getByLabel('TMS 일련번호').fill('TMS-UPDATED-6006');
  await form.getByRole('button', { name: '저장', exact: true }).click();

  await expect(vehicleWorkspace.getByRole('row').filter({ hasText: 'TMS-UPDATED-6006' })).toBeVisible();
  expect(vehiclePayload).toEqual({
    note: '운영 차량 메모',
    plate: '60가 6006',
    telematicsSerialNumber: 'TMS-UPDATED-6006',
    type: '냉장탑차',
  });
  expectOnlyFixtureCalls(api);
});

test('management creates a driver with the supported unknown-age sentinel', async ({ page }) => {
  let driverPayload;
  let drivers = [];
  const api = await installApiFixtures(page, adminFixtures(managementListFixtures({
    'GET /api/dsv/v1/drivers?limit=100': () => v1Envelope({
      items: drivers,
      page: { hasMore: false },
    }, 'g006-created-drivers'),
    'POST /api/dsv/drivers': async ({ request }) => {
      driverPayload = await request.postDataJSON();
      drivers = [{
        age: driverPayload.age,
        career: driverPayload.career,
        displayName: driverPayload.name,
        driverId: 'driver-g006-created',
        gender: driverPayload.gender,
        phone: driverPayload.phone,
        score: driverPayload.score,
        status: 'ACTIVE',
        traits: driverPayload.traits,
        zone: driverPayload.zone,
      }];
      return legacyEnvelope({ driver: drivers[0] });
    },
  })));

  await page.goto('/master-data');
  const driverWorkspace = page.getByLabel('배송원 관리');
  await driverWorkspace.getByLabel('배송원 리스트').getByRole('button', { name: '배송원 등록', exact: true }).click();
  const form = page.getByLabel('배송원 편집');
  await form.getByLabel('이름').fill('Created Driver G006');
  await form.getByLabel('연락처').fill('010-7006-7006');
  await form.getByRole('button', { name: '저장', exact: true }).click();

  await expect(driverWorkspace.getByRole('row').filter({ hasText: 'Created Driver G006' })).toBeVisible();
  expect(driverPayload).toMatchObject({
    age: 0,
    career: '미제공',
    gender: '미제공',
    name: 'Created Driver G006',
    phone: '010-7006-7006',
    score: '미제공',
    traits: [],
    zone: '미제공',
  });
  expectOnlyFixtureCalls(api);
});

test('management keeps a successful create when the post-write list refresh fails', async ({ page }) => {
  let driverReads = 0;
  const api = await installApiFixtures(page, adminFixtures(managementListFixtures({
    'GET /api/dsv/v1/drivers?limit=100': () => {
      driverReads += 1;
      if (driverReads > 1) return v1Error(503, 'drivers refresh failed');
      return v1Envelope({ items: [], page: { hasMore: false } }, 'g006-driver-before-create');
    },
    'POST /api/dsv/drivers': async ({ request }) => {
      const payload = await request.postDataJSON();
      return legacyEnvelope({ driver: { id: 'driver-g006-created', ...payload } });
    },
  })));

  await page.goto('/master-data');
  const driverWorkspace = page.getByLabel('배송원 관리');
  await driverWorkspace.getByLabel('배송원 리스트').getByRole('button', { name: '배송원 등록', exact: true }).click();
  const form = driverWorkspace.getByLabel('배송원 편집');
  await expect(form.getByLabel('이름')).toHaveAttribute('maxlength', '80');
  await expect(form.getByLabel('연락처')).toHaveAttribute('maxlength', '40');
  await form.getByLabel('이름').fill('Refresh Safe Driver');
  await form.getByRole('button', { name: '저장', exact: true }).click();

  await expect(driverWorkspace.getByRole('row').filter({ hasText: 'Refresh Safe Driver' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(driverReads).toBe(2);
  expectOnlyFixtureCalls(api);
});

test('management issues a driver signup invite without an existing driver', async ({ page, context }) => {
  const signupToken = 'A'.repeat(43);
  const signupUrl = `clever-driver://signup?token=${signupToken}`;
  let requestBody;
  let csrfToken;
  const api = await installApiFixtures(page, adminFixtures({
    ...managementListFixtures(),
    'POST /api/dsv/drivers/signup-invite': ({ request }) => {
      requestBody = request.postData();
      csrfToken = request.headers()['x-csrf-token'];
      return legacyEnvelope({
        invite: {
          expiresAt: '2026-08-05T02:00:00.000Z',
          signupUrl,
        },
      });
    },
  }));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto('/master-data');
  const driverList = page.getByLabel('배송원 리스트');
  await driverList.getByRole('button', { name: '초대 생성', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '배송원 초대' });
  const appDownloadUrl = 'https://drive.google.com/file/d/1XRXAqREGtJJRMUsRnKgRAhFsiikE4V1y/view?usp=share_link';
  await expect(dialog.getByRole('tab', { name: '설치', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByLabel('배송원 앱 설치 링크 QR 코드', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('배송원 앱 설치 링크 QR 코드', { exact: true }).locator('path')).toHaveAttribute('d', /M/u);
  await expect(dialog.getByLabel('배송원 앱 설치 링크', { exact: true })).toHaveValue(appDownloadUrl);
  await expect(dialog.getByRole('link', { name: '설치 페이지 열기', exact: true })).toHaveAttribute('href', appDownloadUrl);
  await dialog.getByRole('button', { name: '설치 링크 복사', exact: true }).click();
  await expect(dialog.getByText('설치 링크를 복사했습니다.', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(appDownloadUrl);

  await dialog.getByRole('tab', { name: '초대', exact: true }).click();
  await expect(dialog.getByRole('tab', { name: '초대', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(dialog).toContainText('배송원 정보는 미리 입력하지 않습니다.');
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await dialog.getByRole('button', { name: '초대 링크 생성', exact: true }).click();

  await expect(dialog.getByLabel('배송원 가입 링크', { exact: true })).toHaveValue(signupUrl);
  await expect(dialog.getByLabel('배송원 가입 링크 QR 코드', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('배송원 가입 링크 QR 코드', { exact: true }).locator('path')).toHaveAttribute('d', /M/u);
  await expect(dialog).toContainText('1회');
  expect(requestBody).toBeNull();
  expect(csrfToken).toBe('g006-admin-csrf');

  await dialog.getByRole('button', { name: '초대 링크 복사', exact: true }).click();
  await expect(dialog.getByText('초대 링크를 복사했습니다.', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(signupUrl);
  const storedValues = await page.evaluate(() => JSON.stringify({
    local: Object.values(window.localStorage),
    session: Object.values(window.sessionStorage),
  }));
  expect(storedValues).not.toContain(signupToken);
  expectOnlyFixtureCalls(api);
});

test('customer detail manages customer accounts without exposing passwords', async ({ page }) => {
  let inviteBody;
  let statusBody;
  const invitedAccount = {
    displayName: '초대 담당자',
    email: 'customer@example.com',
    id: 'customer-account-invited',
    invitedAt: '2026-08-03T08:00:00.000Z',
    inviteExpiresAt: '2026-08-10T08:00:00.000Z',
    lastAuthenticatedAt: null,
    loginId: 'direct-login',
    status: 'INVITED',
  };
  const activeAccount = {
    displayName: '기존 담당자',
    email: 'active@example.com',
    id: 'customer-account-active',
    invitedAt: '2026-08-01T08:00:00.000Z',
    inviteExpiresAt: '2026-08-08T08:00:00.000Z',
    lastAuthenticatedAt: '2026-08-03T09:00:00.000Z',
    loginId: 'active-login',
    status: 'ACTIVE',
  };
  const api = await installApiFixtures(page, adminFixtures({
    ...managementListFixtures(),
    'GET /api/dsv/customers/customer-g006/accounts': legacyEnvelope({ accounts: [activeAccount] }),
    'POST /api/dsv/customers/customer-g006/accounts/invitations': ({ request }) => {
      inviteBody = request.postDataJSON();
      return { ...legacyEnvelope({ account: invitedAccount }), status: 201 };
    },
    'POST /api/dsv/customer-accounts/customer-account-invited/reinvite': legacyEnvelope({ account: { ...invitedAccount, inviteExpiresAt: '2026-08-11T08:00:00.000Z' } }),
    'POST /api/dsv/customer-accounts/customer-account-active/password-reset': legacyEnvelope({ account: activeAccount }),
    'PATCH /api/dsv/customer-accounts/customer-account-active/status': ({ request }) => {
      statusBody = request.postDataJSON();
      return legacyEnvelope({ account: { ...activeAccount, status: 'DISABLED' } });
    },
  }));

  await page.goto('/master-data');
  await page.getByRole('button', { name: '고객사', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'Canonical Customer G006' }).click();

  const panel = page.getByLabel('고객 계정 관리');
  await expect(panel.getByText('기존 담당자')).toBeVisible();
  await expect(panel.getByText('active-login')).toBeVisible();
  await expect(panel).not.toContainText('temporary');
  await expect(panel).not.toContainText('password');

  await panel.getByRole('button', { name: '계정 발급', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '고객 계정 발급' });
  await dialog.getByLabel('수신자 이메일').fill('customer@example.com');
  await dialog.getByLabel('표시 이름').fill('초대 담당자');
  await dialog.getByLabel('직접 지정').check();
  await dialog.getByLabel('직접 로그인 아이디').fill('direct-login');
  await expect(dialog.getByLabel('발급 이메일 미리보기')).toContainText('48시간 동안 한 번만 사용할 수 있습니다.');
  await expect(dialog.getByLabel('발급 이메일 미리보기')).toContainText('direct-login');
  await expect(dialog.getByLabel('발급 이메일 미리보기')).toContainText('/customer/login');
  await expect(dialog.getByLabel('발급 이메일 미리보기')).toContainText('고객이 설정 화면에서 직접 만듭니다.');
  await expect(dialog).not.toContainText('임시 비밀번호');
  await dialog.getByRole('button', { name: '발급 이메일 보내기', exact: true }).click();
  await expect(panel.getByRole('status').filter({ hasText: '초대 이메일 발송을 요청했습니다.' })).toBeVisible();
  await expect(panel.getByText('초대 담당자')).toBeVisible();
  await expect(panel.getByText('direct-login')).toBeVisible();
  expect(inviteBody).toEqual({ email: 'customer@example.com', displayName: '초대 담당자', loginId: 'direct-login' });

  await panel.getByRole('row').filter({ hasText: '초대 담당자' }).getByRole('button', { name: '재초대', exact: true }).click();
  await expect(panel.getByRole('status').filter({ hasText: '재초대 이메일 발송을 요청했습니다.' })).toBeVisible();

  await panel.getByRole('row').filter({ hasText: '기존 담당자' }).getByRole('button', { name: '재설정', exact: true }).click();
  await expect(panel.getByRole('status').filter({ hasText: '비밀번호 재설정 이메일 발송을 요청했습니다.' })).toBeVisible();

  await panel.getByRole('row').filter({ hasText: '기존 담당자' }).getByRole('button', { name: '비활성화', exact: true }).click();
  await expect(panel.getByRole('row').filter({ hasText: '기존 담당자' }).getByText('비활성', { exact: true })).toBeVisible();
  expect(statusBody).toEqual({ status: 'DISABLED' });
  expectOnlyFixtureCalls(api);
});

test('customer signup uses reserved login ID and returned session', async ({ page }) => {
  let completeBody;
  const serviceDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const api = await installApiFixtures(page, {
    'POST /api/dsv/customer/auth/invitations/validate': legacyEnvelope({
      customerName: 'Canonical Customer G006',
      displayName: '초대 담당자',
      email: 'customer@example.com',
      expiresAt: '2026-08-10T08:00:00.000Z',
      loginId: 'reserved-login',
      purpose: 'SIGNUP',
    }),
    'POST /api/dsv/customer/auth/complete': ({ request }) => {
      completeBody = request.postDataJSON();
      return legacyEnvelope({ accessToken: 'customer-access-token', csrfToken: 'customer-csrf-token' });
    },
    'GET /api/dsv/v1/session': v1Envelope({
      csrfToken: 'customer-csrf-token',
      principalType: 'CUSTOMER_USER',
      shopId: 'shop-g006-parity',
      actorId: 'customer-account-g006',
      displayName: '초대 담당자',
      scopes: ['dsv:customer-deliveries:read'],
    }, 'g006-customer-session'),
    [`GET /api/dsv/v1/customer/deliveries?limit=100&serviceDate=${serviceDate}`]: v1Envelope({ items: [], page: { hasMore: false }, routes: [] }),
  });

  await page.goto('/customer/account/setup#token=signup-token');
  await expect(page.getByLabel('Login ID')).toHaveValue('reserved-login');
  await expect(page.getByLabel('Login ID')).toHaveAttribute('readonly', '');
  await page.getByLabel('Password', { exact: true }).fill('StrongPassw0rd!');
  await page.getByLabel('Confirm password').fill('StrongPassw0rd!');
  await page.getByRole('button', { name: '계정 설정 완료', exact: true }).click();

  await expect(page).toHaveURL(/\/customer\/delivery-inquiry$/u);
  expect(completeBody).toEqual({ password: 'StrongPassw0rd!', shopDomain: 'dsv-demo.local', token: 'signup-token' });
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('clever.auth.csrf'))).toBe('customer-csrf-token');
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
      items: [{ customerId: 'customer-g006', displayName: 'Canonical Customer G006', orderCount: 4 }],
      page: { hasMore: false },
      total: 1,
    }, 'g006-customers-extra-key'),
  })));

  await page.goto('/master-data');

  await expect(page.getByRole('alert')).toContainText('API v1 관리 목록 형식이 올바르지 않습니다.');
  await expectNoConcreteDemo(page);
  expectOnlyFixtureCalls(api);
});

test('management rejects multiple default driver assignments for one vehicle', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures(managementListFixtures({
    'GET /api/dsv/v1/vehicles?limit=100': v1Envelope({
      items: [{
        displayName: 'Canonical Vehicle G006',
        driverAssignments: [
          { assignmentId: 'assignment-g006-a', driverId: 'driver-g006-a' },
          { assignmentId: 'assignment-g006-b', driverId: 'driver-g006-b' },
        ],
        status: 'ACTIVE',
        vehicleId: 'vehicle-g006',
        vehiclePlate: '60가 6006',
      }],
      page: { hasMore: false },
    }, 'g006-vehicles-invalid-assignments'),
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
  await expect(page.getByText('특장 온도 상한')).toHaveCount(0);
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
  await page.getByLabel('테스트 이메일 발신자').fill('sender@example.com');
  await page.getByRole('button', { name: '저장', exact: true }).click();

  await expect(page.getByRole('status').filter({ hasText: '설정을 저장했습니다.' })).toBeVisible();
  expect(patchBody).toEqual(operationSettings({
    departureAddress: '서울특별시 중구 세종대로 110',
    departureLatitude: 37.5663,
    departureLongitude: 126.9779,
    loadingStartTime: '07:30',
    manualEmailSenderEmail: 'sender@example.com',
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
  await expect(page.getByText('특장 온도 상한')).toHaveCount(0);
  await expect(page.getByLabel('ETA 지연 알림')).toHaveValue('10');
  await expect(page.getByLabel('GPS 미수신 알림')).toHaveValue('30');
  await expect(page.getByLabel('도착 후 대기시간')).toHaveValue('5');
  await expect(page.getByRole('checkbox', { name: '배송원에게 전달' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '기록 페이지에 표시' })).toBeChecked();
  await expect(page.getByRole('tab', { name: '계정' })).toHaveCount(0);
  expectOnlyFixtureCalls(api);
});

test('settings opens the protected web guide with outline, paging, search, and file actions', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/settings/operations': legacyEnvelope(operationSettings()),
  }));
  await installGuideFixture(page);

  await page.goto('/settings');
  await page.getByRole('button', { name: '웹 가이드', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'CLEVER DSV 사용자 가이드' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('현재 페이지')).toHaveValue('1');
  await expect(dialog.getByText('/ 1', { exact: true })).toBeVisible();
  await expect(dialog.locator('.user-guide-pdf-viewer .page[data-page-number="1"] canvas')).toBeVisible();
  await expect(dialog.getByRole('complementary', { name: '사용자 가이드 목차' })).toContainText('1페이지');
  await expect(dialog.getByRole('link', { name: '새 창' })).toHaveAttribute('href', '/api/dsv/guides/operator');
  await expect(dialog.getByRole('link', { name: '다운로드' })).toHaveAttribute('href', '/api/dsv/guides/operator?download=1');

  await dialog.getByRole('button', { name: '페이지', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '페이지', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByLabel('가이드 검색').fill('CLEVER');
  await dialog.getByRole('button', { name: '다음 검색 결과' }).click();
  await expect(dialog.getByText('1 / 1', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '가이드 닫기' }).click();
  await expect(dialog).toHaveCount(0);
  expectOnlyFixtureCalls(api);
});

test('settings opens the protected driver app guide and checklist', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/settings/operations': legacyEnvelope(operationSettings()),
  }));
  await installGuideFixture(page);

  await page.goto('/settings');
  await page.getByRole('button', { name: '앱 가이드 및 체크리스트', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'CLEVER Driver 앱 가이드 및 체크리스트' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('현재 페이지')).toHaveValue('1');
  await expect(dialog.getByRole('link', { name: '새 창' })).toHaveAttribute('href', '/api/dsv/guides/driver');
  await expect(dialog.getByRole('link', { name: '다운로드' })).toHaveAttribute('href', '/api/dsv/guides/driver?download=1');
  await dialog.getByRole('button', { name: '가이드 닫기' }).click();
  await expect(dialog).toHaveCount(0);
  expectOnlyFixtureCalls(api);
});

test('settings guide uses a full-screen mobile viewer and an overlay outline', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/settings/operations': legacyEnvelope(operationSettings()),
  }));
  await installGuideFixture(page);

  await page.goto('/settings');
  await page.getByRole('button', { name: '웹 가이드', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'CLEVER DSV 사용자 가이드' });
  await expect(dialog.locator('.user-guide-pdf-viewer .page[data-page-number="1"] canvas')).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).toMatchObject({ x: 0, width: 390 });
  expect(box.height).toBeGreaterThanOrEqual(843);
  await expect(dialog.getByRole('button', { name: '목차 닫기' })).toBeHidden();
  await dialog.getByRole('button', { name: '목차' }).click();
  await expect(dialog.getByRole('button', { name: '목차 닫기' })).toBeVisible();
  await dialog.getByRole('button', { name: '목차 닫기' }).click();
  await expect(dialog.getByRole('button', { name: '목차 닫기' })).toBeHidden();
  expectOnlyFixtureCalls(api);
});

test('super admin manages persistent operation accounts from settings', async ({ page }) => {
  const existingAccount = {
    createdAt: '2026-08-01T00:00:00.000Z',
    displayName: '기존 운영 관리자',
    failedLoginAttempts: 0,
    id: adminSession.actorId,
    lastAuthenticatedAt: '2026-08-09T00:00:00.000Z',
    lockedUntil: null,
    loginId: 'operator',
    scopes: ['dsv:accounts:read', 'dsv:accounts:write'],
    status: 'ACTIVE',
    updatedAt: '2026-08-09T00:00:00.000Z',
  };
  let inviteBody;
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/v1/session': v1Envelope({
      ...adminSession,
      scopes: [...adminSession.scopes, 'dsv:accounts:read', 'dsv:accounts:write'],
    }, 'g006-account-session'),
    'GET /api/dsv/settings/operations': legacyEnvelope(operationSettings({ manualEmailSenderEmail: 'noreply@example.com' })),
    'GET /api/dsv/admin-accounts': legacyEnvelope({ accounts: [existingAccount] }),
    'POST /api/dsv/admin-accounts/invitations': ({ request }) => {
      inviteBody = request.postDataJSON();
      return {
        ...legacyEnvelope({ invitation: { displayName: 'DSV 관제 운영자', email: 'operator@example.com', expiresAt: '2026-08-11T08:00:00.000Z' } }),
        status: 201,
      };
    },
  }));

  await page.goto('/settings');
  await page.getByRole('tab', { name: '계정' }).click();
  await expect(page.getByText('기존 운영 관리자')).toBeVisible();
  await page.getByRole('button', { name: '계정 초대' }).click();
  const dialog = page.getByRole('dialog', { name: 'DSV 관제 운영 계정 초대' });
  await dialog.getByLabel('수신자 이메일').fill('operator@example.com');
  await dialog.getByLabel('표시 이름').fill('DSV 관제 운영자');
  await dialog.getByLabel('안내 문장').fill('DSV 관제팀 계정 설정을 안내드립니다.');
  const form = dialog.getByLabel('DSV 관제 운영 계정 초대', { exact: true });
  const preview = dialog.getByLabel('DSV 관제 운영 계정 초대 미리보기');
  await expect(preview).toContainText('noreply@example.com');
  await expect(preview).toContainText('[CLEVER DSV] 운영자 계정 초대');
  await expect(preview.getByLabel('초대 이메일 본문')).toHaveText([
    '안녕하세요 DSV 관제 운영자님.',
    'DSV 관제팀 계정 설정을 안내드립니다.',
    '48시간 안에 아래 일회용 링크로 접속해 로그인 ID와 비밀번호를 설정해 주세요.',
    'https://dsv.cleversystem.ai/admin/account/setup#token=EXAMPLE-ONE-TIME-LINK',
    '초대 링크는 한 번만 사용할 수 있습니다.',
    '설정 후에는 아래 주소에서 계속 로그인할 수 있습니다.',
    'https://dsv.cleversystem.ai/login',
  ].join('\n\n').replace('초대 링크는 한 번만 사용할 수 있습니다.\n\n설정 후에는', '초대 링크는 한 번만 사용할 수 있습니다.\n설정 후에는'));
  await expect(preview).toContainText('실제 이메일에는 수신자 전용 일회성 링크가 포함됩니다.');
  await expect(dialog).not.toContainText('운영사 배송조회');
  const [emailBox, nameBox, messageBox, formBox, previewBox, dialogBox] = await Promise.all([
    dialog.getByLabel('수신자 이메일').boundingBox(),
    dialog.getByLabel('표시 이름').boundingBox(),
    dialog.getByLabel('안내 문장').boundingBox(),
    form.boundingBox(),
    preview.boundingBox(),
    dialog.boundingBox(),
  ]);
  expect(emailBox && nameBox && messageBox && formBox && previewBox && dialogBox).toBeTruthy();
  expect(dialogBox.width).toBeGreaterThanOrEqual(1000);
  expect(nameBox.y).toBeGreaterThan(emailBox.y + emailBox.height);
  expect(messageBox.y).toBeGreaterThan(nameBox.y + nameBox.height);
  expect(previewBox.x).toBeGreaterThanOrEqual(formBox.x + formBox.width);
  await dialog.getByRole('button', { name: '초대 이메일 보내기', exact: true }).click();

  await expect(page.getByRole('status').filter({ hasText: 'DSV 관제 운영 계정 초대 이메일 발송을 요청했습니다.' })).toBeVisible();
  await expect(page.getByText('기존 운영 관리자')).toBeVisible();
  expect(inviteBody).toEqual({
    displayName: 'DSV 관제 운영자',
    email: 'operator@example.com',
    message: 'DSV 관제팀 계정 설정을 안내드립니다.',
  });
  expectOnlyFixtureCalls(api);
});

test('admin account status and delete actions stay attached to the selected row', async ({ page }) => {
  const targetAccount = {
    createdAt: '2026-08-10T01:00:00.000Z',
    displayName: 'DSV 관제 운영자',
    failedLoginAttempts: 0,
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    lastAuthenticatedAt: '2026-08-10T01:30:00.000Z',
    lockedUntil: null,
    loginId: 'asd',
    scopes: ['dsv:session:read'],
    status: 'ACTIVE',
    updatedAt: '2026-08-10T01:30:00.000Z',
  };
  const currentAccount = {
    ...targetAccount,
    displayName: 'CLEVER 개발 관리자',
    id: adminSession.actorId,
    loginId: 'dsv-admin',
    scopes: ['dsv:session:read', 'dsv:accounts:read', 'dsv:accounts:write'],
  };
  let statusBody;
  let deleteRequested = false;
  let sessionRevokeRequested = false;
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/v1/session': v1Envelope({
      ...adminSession,
      scopes: [...adminSession.scopes, 'dsv:accounts:read', 'dsv:accounts:write'],
    }, 'g006-account-action-session'),
    'GET /api/dsv/admin-accounts': legacyEnvelope({ accounts: [targetAccount, currentAccount] }),
    ['DELETE /api/dsv/admin-accounts/' + targetAccount.id + '/session']: () => {
      sessionRevokeRequested = true;
      return legacyEnvelope({ accountId: targetAccount.id, revoked: true });
    },
    [`PATCH /api/dsv/admin-accounts/${targetAccount.id}/status`]: ({ request }) => {
      statusBody = request.postDataJSON();
      return legacyEnvelope({ account: { ...targetAccount, status: 'DISABLED' } });
    },
    [`DELETE /api/dsv/admin-accounts/${targetAccount.id}`]: () => {
      deleteRequested = true;
      return legacyEnvelope({ deletedAccountId: targetAccount.id });
    },
  }));

  await page.goto('/settings');
  await page.getByRole('tab', { name: '계정' }).click();
  const table = page.getByRole('table');
  const targetRow = table.getByRole('row').filter({ hasText: 'asd' });
  const currentRow = table.getByRole('row').filter({ hasText: 'dsv-admin' });
  await expect(table.locator('tbody tr').nth(0)).toContainText('dsv-admin');
  await targetRow.getByRole('button', { name: '강제 로그아웃', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'asd 계정의 활성 세션을 종료했습니다.' })).toBeVisible();
  await expect(currentRow.getByRole('button', { name: '강제 로그아웃', exact: true })).toHaveCount(0);
  expect(sessionRevokeRequested).toBe(true);

  await targetRow.getByRole('button', { name: '비활성화', exact: true }).click();

  await expect(table.locator('tbody tr').nth(0)).toContainText('dsv-admin');
  await expect(targetRow.getByText('비활성', { exact: true })).toBeVisible();
  await expect(targetRow.getByRole('button', { name: '활성화', exact: true })).toBeVisible();
  await expect(targetRow.getByRole('button', { name: '삭제', exact: true })).toBeVisible();
  await expect(currentRow.getByRole('button', { name: '비활성화', exact: true })).toBeDisabled();
  expect(statusBody).toEqual({ status: 'DISABLED' });

  await table.getByRole('button', { name: '권한 정렬: 개발 관리 먼저' }).click();
  await expect(table.locator('tbody tr').nth(0)).toContainText('asd');
  await expect(table.getByRole('button', { name: '권한 정렬: 관제 운영 먼저' })).toBeVisible();

  await targetRow.getByRole('button', { name: '삭제', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '계정 영구 삭제' });
  await expect(dialog).toContainText('복구할 수 없는');
  await expect(dialog).toContainText('asd');
  await dialog.getByLabel('삭제 확인').fill('wrong');
  await expect(dialog.getByRole('button', { name: '영구 삭제', exact: true })).toBeDisabled();
  await dialog.getByLabel('삭제 확인').fill('asd');
  await dialog.getByRole('button', { name: '영구 삭제', exact: true }).click();

  await expect(targetRow).toHaveCount(0);
  await expect(currentRow).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'asd 계정을 영구 삭제했습니다.' })).toBeVisible();
  expect(deleteRequested).toBe(true);
  expectOnlyFixtureCalls(api);
});

test('DSV admin setup validates invitation and stores returned session', async ({ page }) => {
  let validateBody;
  let completeBody;
  const api = await installApiFixtures(page, {
    'POST /api/dsv/admin/auth/invitations/validate': ({ request }) => {
      validateBody = request.postDataJSON();
      return legacyEnvelope({ displayName: 'DSV 관제 운영자', email: 'operator@example.com', expiresAt: '2026-08-11T08:00:00.000Z' });
    },
    'POST /api/dsv/admin/auth/complete': ({ request }) => {
      completeBody = request.postDataJSON();
      return legacyEnvelope({ accessToken: 'admin-setup-token', csrfToken: 'admin-setup-csrf' });
    },
    'GET /api/dsv/v1/session': v1Envelope({
      ...adminSession,
      csrfToken: 'admin-setup-csrf',
      actorId: 'new-admin-operator',
      displayName: 'DSV 관제 운영자',
    }, 'g006-admin-setup-session'),
    'GET /api/dsv/v1/control': v1Envelope({
      assignedCount: 0,
      failedEtaCount: 0,
      pendingEtaCount: 0,
      readyEtaCount: 0,
      serviceDate: '2026-08-10',
      totalDispatchCount: 0,
      unassignedCount: 0,
    }),
  });

  await page.goto('/admin/account/setup#token=admin-invite-token');
  await expect(page.getByText('관제 운영 계정 설정')).toBeVisible();
  await expect(page.getByText('DSV 관제 운영 계정', { exact: true })).toBeVisible();
  await page.getByLabel('Login ID').fill('dsv-operator');
  await page.getByLabel('Password', { exact: true }).fill('StrongPass!234');
  await page.getByLabel('Confirm password', { exact: true }).fill('StrongPass!234');
  const [passwordBox, helpBox, confirmBox] = await Promise.all([
    page.getByLabel('Password', { exact: true }).locator('..').boundingBox(),
    page.getByText('영문 대문자, 소문자, 숫자, 특수문자를 포함해 12자 이상 입력하세요.', { exact: true }).boundingBox(),
    page.getByLabel('Confirm password', { exact: true }).boundingBox(),
  ]);
  expect(passwordBox).not.toBeNull();
  expect(helpBox).not.toBeNull();
  expect(confirmBox).not.toBeNull();
  expect(helpBox.y).toBeGreaterThanOrEqual(passwordBox.y + passwordBox.height);
  expect(confirmBox.y).toBeGreaterThanOrEqual(helpBox.y + helpBox.height);
  await page.getByRole('button', { name: '계정 설정 완료' }).click();
  await expect(page).toHaveURL(/\/control$/u);
  await expect(page.evaluate(() => ({
    csrf: window.sessionStorage.getItem('clever.auth.csrf'),
    token: window.sessionStorage.getItem('clever.auth.token'),
  }))).resolves.toEqual({ csrf: 'admin-setup-csrf', token: 'admin-setup-token' });
  expect(validateBody).toEqual({ shopDomain: 'dsv-demo.local', token: 'admin-invite-token' });
  expect(completeBody).toEqual({ shopDomain: 'dsv-demo.local', token: 'admin-invite-token', loginId: 'dsv-operator', password: 'StrongPass!234' });
  expectOnlyFixtureCalls(api);
});

test('DSV admin without account scopes can update own credentials from shell', async ({ page }) => {
  let credentialBody;
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/v1/session': v1Envelope({
      ...adminSession,
      scopes: ['dsv:session:read', 'dsv:settings:read'],
    }, 'g006-operator-session'),
    'PATCH /api/dsv/auth/credentials': ({ request }) => {
      credentialBody = request.postDataJSON();
      return legacyEnvelope({
        session: {
          ...adminSession,
          csrfToken: 'updated-csrf-token',
          actorId: adminSession.actorId,
          displayName: 'G006 Admin Operator',
          scopes: ['dsv:session:read', 'dsv:settings:read'],
        },
      });
    },
  }));

  await page.goto('/settings');
  await expect(page.getByRole('tab', { name: '계정' })).toHaveCount(0);
  await page.getByRole('button', { name: '계정 설정' }).click();
  const dialog = page.getByRole('dialog', { name: '계정 설정' });
  await expect(dialog.getByLabel('새 로그인 아이디')).toHaveAttribute('autocomplete', 'off');
  await dialog.getByLabel('새 로그인 아이디').evaluate((input) => { input.value = 'saved-operator-id'; });
  await dialog.getByLabel('현재 비밀번호').fill('CurrentPass!234');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('변경할 로그인 아이디 또는 새 비밀번호를 입력하세요.');
  expect(credentialBody).toBeUndefined();
  await dialog.getByLabel('새 로그인 아이디').fill('new-operator-id');
  await dialog.getByLabel('새 비밀번호', { exact: true }).fill('NewStrongPass!234');
  await dialog.getByLabel('새 비밀번호 확인', { exact: true }).fill('NewStrongPass!234');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: '계정 설정을 저장했습니다.' })).toBeVisible();
  await expect(page.evaluate(() => window.sessionStorage.getItem('clever.auth.csrf'))).resolves.toBe('g006-admin-csrf');
  expect(credentialBody).toEqual({ currentPassword: 'CurrentPass!234', loginId: 'new-operator-id', password: 'NewStrongPass!234' });
  expectOnlyFixtureCalls(api);
});

test('settings sends a Brevo test email only after the explicit confirmation checkbox', async ({ page }) => {
  let sentBody;
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/settings/operations': legacyEnvelope(operationSettings({ manualEmailSenderEmail: 'noreply@example.com' })),
    'GET /api/dsv/manual-email': legacyEnvelope({
      apiConfigured: true,
      configured: true,
      defaultRecipients: ['ops@example.com'],
      defaultSubject: operationSettings().manualEmailSubject,
      defaultTextContent: operationSettings().manualEmailBody,
      senderEmail: 'noreply@example.com',
      senderName: 'CLEVER DSV',
    }),
    'POST /api/dsv/manual-email': ({ request }) => {
      sentBody = request.postDataJSON();
      return legacyEnvelope({ recipientCount: 1, sentAt: '2026-08-03T08:00:00.000Z' });
    },
  }));

  await page.goto('/settings');
  const sendButton = page.getByRole('button', { name: '1회 발송', exact: true });
  await expect(page.getByLabel('테스트 이메일 수신자')).toHaveValue('ops@example.com');
  await expect(page.getByLabel('테스트 이메일 발신자')).toHaveValue('noreply@example.com');
  await expect(sendButton).toBeDisabled();
  await page.getByRole('checkbox', { name: '수신자와 발송 내용을 확인했습니다.' }).check();
  await expect(sendButton).toBeEnabled();
  await sendButton.click();

  await expect(page.getByRole('status').filter({ hasText: '1명에게 발송 요청을 완료했습니다.' })).toBeVisible();
  expect(sentBody).toMatchObject({
    confirmed: true,
    recipients: ['ops@example.com'],
    subject: operationSettings().manualEmailSubject,
    textContent: operationSettings().manualEmailBody,
  });
  expect(sentBody.commandId).toMatch(/^[0-9a-f-]{36}$/u);
  expectOnlyFixtureCalls(api);
});

test('settings blocks malformed or oversized manual email recipient lists before the API call', async ({ page }) => {
  let sendCalls = 0;
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/settings/operations': legacyEnvelope(operationSettings({ manualEmailSenderEmail: 'noreply@example.com' })),
    'GET /api/dsv/manual-email': legacyEnvelope({
      apiConfigured: true,
      configured: true,
      defaultRecipients: [],
      defaultSubject: operationSettings().manualEmailSubject,
      defaultTextContent: operationSettings().manualEmailBody,
      senderEmail: 'noreply@example.com',
      senderName: 'CLEVER DSV',
    }),
    'POST /api/dsv/manual-email': () => { sendCalls += 1; return legacyEnvelope({ recipientCount: 1, sentAt: '2026-08-03T08:00:00.000Z' }); },
  }));

  await page.goto('/settings');
  const recipients = page.getByLabel('테스트 이메일 수신자');
  const sendButton = page.getByRole('button', { name: '1회 발송', exact: true });
  await recipients.fill('not-an-email');
  await expect(page.getByRole('alert')).toContainText('올바른 이메일 주소');
  await expect(recipients).toHaveAttribute('aria-invalid', 'true');
  await expect(sendButton).toBeDisabled();

  await recipients.fill(Array.from({ length: 11 }, (_, index) => `ops${index + 1}@example.com`).join(', '));
  await expect(page.getByRole('alert')).toContainText('수신자는 최대 10명');
  await expect(sendButton).toBeDisabled();
  expect(sendCalls).toBe(0);
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

test('dispatch applies a destination search candidate and previews the corrected address again', async ({ page }) => {
  const previewBodies = [];
  const suggestedAddress = '서울특별시 마포구 양화로 166, 5층';
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': dispatchPageFixture(),
    'POST /api/dsv/dispatch-imports/preview': ({ request }) => {
      const input = request.postDataJSON();
      previewBodies.push(input);
      const corrected = input.rows[0]?.address === suggestedAddress;
      return legacyEnvelope({
        canCommit: corrected,
        conditionCandidates: [],
        fileName: input.fileName,
        planDate: input.planDate,
        rows: input.rows.map((row) => ({
          ...row,
          ...(corrected ? {
            address: '서울특별시 마포구 양화로 166',
            addressResolutionStatus: 'RESOLVED',
            detailAddress: '5층',
            jibunAddress: '서울특별시 마포구 동교동 165-4',
            postalCode: '04050',
            rawAddress: suggestedAddress,
          } : {
            address: '서울 마포구 양화로 155',
            addressResolutionStatus: 'ADDRESS_ONLY',
            detailAddress: '5층',
            addressSuggestions: [{
              address: '서울특별시 마포구 양화로 166',
              detailAddress: '5층',
              jibunAddress: '서울특별시 마포구 동교동 165-4',
              latitude: 37.5561,
              longitude: 126.9238,
              providerPlaceId: 'place-g006',
              recommended: true,
              score: 94,
              title: '제이필의원',
            }],
            rawAddress: row.address,
          }),
          driverId: 'driver-g006',
          issues: corrected ? [] : [{
            code: 'ADDRESS_COORDINATES_NOT_RESOLVED',
            field: 'address',
            message: '도로명주소와 우편번호를 확인하지 못했습니다.',
            severity: 'review',
          }],
          status: corrected ? 'READY' : 'NEEDS_REVIEW',
          vehicleId: 'vehicle-g006',
        })),
        summary: corrected
          ? { errorRows: 0, readyRows: input.rows.length, reviewRows: 0, totalRows: input.rows.length }
          : { errorRows: 0, readyRows: 0, reviewRows: input.rows.length, totalRows: input.rows.length },
      });
    },
  })));

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({
    buffer: Buffer.from(dispatchCsv('SELLER-G006-ADDRESS-CANDIDATE')),
    mimeType: 'text/csv',
    name: 'g006-address-candidate.csv',
  });

  await page.locator('details.dispatch-upload-issues > summary').click();
  await expect(page.getByText('기본 주소', { exact: true })).toBeVisible();
  await expect(page.getByText('서울 마포구 양화로 155', { exact: true })).toBeVisible();
  await expect(page.getByText('상세주소', { exact: true })).toBeVisible();
  await expect(page.getByText('5층', { exact: true })).toBeVisible();
  await expect(page.getByText('제이필의원', { exact: true })).toBeVisible();
  await expect(page.getByText(suggestedAddress, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '적용', exact: true }).click();

  await expect(page.getByRole('button', { name: '업로드 확정', exact: true })).toBeEnabled();
  expect(previewBodies).toHaveLength(2);
  expect(previewBodies[1].rows[0]).toMatchObject({ address: suggestedAddress });
  expect(previewBodies[1].rows[0]).not.toHaveProperty('addressResolutionStatus');
  expectOnlyFixtureCalls(api);
});

test('dispatch separates existing order changes from validation errors and allows a safe update preview', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': dispatchPageFixture(),
    'POST /api/dsv/dispatch-imports/preview': ({ request }) => {
      const input = request.postDataJSON();
      return legacyEnvelope({
        canCommit: true,
        conditionCandidates: [],
        fileName: input.fileName,
        planDate: input.planDate,
        rows: input.rows.map((row) => ({
          ...row,
          candidateDiff: [{ existing: '2026-07-30', field: 'deliveryDate', incoming: input.planDate }],
          diffKind: 'UPDATE_CANDIDATE',
          driverId: null,
          issues: [],
          status: 'READY',
          vehicleId: null,
        })),
        summary: {
          errorRows: 0,
          readyRows: input.rows.length,
          reviewRows: 0,
          totalRows: input.rows.length,
          updateCandidateRows: input.rows.length,
        },
      });
    },
  })));

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({
    buffer: Buffer.from(dispatchCsv('SELLER-G006-UPDATE')),
    mimeType: 'text/csv',
    name: 'g006-update.csv',
  });

  await expect(page.getByRole('status').filter({ hasText: '변경 1' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '오류 0' })).toBeVisible();
  await expect(page.getByRole('button', { name: '업로드 확정', exact: true })).toBeEnabled();
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
    'POST /api/dsv/dispatch-imports': ({ request }) => {
      const input = request.postDataJSON();
      return legacyEnvelope({
        dispatchImport: {
          createdAt: '2026-07-30T00:00:00.000Z',
          fileName: input.fileName,
          id: 'import-g006',
          planDate: input.planDate,
          rowCount: input.rows.length,
          rows: input.rows,
          sourceHash: 'a'.repeat(64),
          status: 'READY',
        },
      });
    },
    'POST /api/dsv/dispatch-imports/import-g006/apply': legacyError(500, 'dispatch apply failed'),
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
  expect(api.calls.some((call) => call.key === 'POST /api/dsv/dispatch-imports/import-g006/apply')).toBe(true);
  expectOnlyFixtureCalls(api);
});

test('successful dispatch apply closes the upload workspace and returns to the map', async ({ page }) => {
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
    'POST /api/dsv/dispatch-imports': ({ request }) => {
      const input = request.postDataJSON();
      return legacyEnvelope({
        dispatchImport: {
          createdAt: '2026-07-30T00:00:00.000Z',
          fileName: input.fileName,
          id: 'import-g006-success',
          planDate: input.planDate,
          rowCount: input.rows.length,
          rows: input.rows,
          sourceHash: 'b'.repeat(64),
          status: 'READY',
        },
      });
    },
    'POST /api/dsv/dispatch-imports/import-g006-success/apply': legacyEnvelope({ applyResult: { status: 'APPLIED' } }),
  })));

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '목록', exact: true }).click();
  await expect(page.getByRole('region', { name: '목록' })).toBeVisible();
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({
    buffer: Buffer.from(dispatchCsv('SELLER-G006-SUCCESS')),
    mimeType: 'text/csv',
    name: 'g006-success.csv',
  });
  await expect(page.getByRole('button', { name: '업로드 확정', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '업로드 확정', exact: true }).click();

  await expect(page.getByRole('region', { name: '주문 업로드' })).toBeHidden();
  await expect(page.getByRole('region', { name: '지도' })).toBeVisible();
  await expect(page.getByRole('button', { name: '지도', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(api.calls.some((call) => call.key === 'POST /api/dsv/dispatch-imports/import-g006-success/apply')).toBe(true);
  expectOnlyFixtureCalls(api);
});
}
