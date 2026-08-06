import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

const v1Meta = { apiVersion: 'dsv.v1' };
const canonicalSentinels = {
  'clever.management.data.v1': 'G006-management-sentinel',
  'clever.admin.settings': 'G006-settings-sentinel',
  'clever.dispatch.last-import': 'G006-dispatch-sentinel',
};

const adminSession = {
  principalType: 'DSV_ADMIN',
  shopId: 'shop-g006',
  actorId: 'admin-actor-g006',
  displayName: 'G006 Admin Operator',
  scopes: ['dsv:session:read', 'dsv:control:read'],
};
const fullAdminSession = {
  principalType: 'DSV_ADMIN',
  shopId: 'shop-g006',
  actorId: 'admin-actor-g006',
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
const customerSession = {
  principalType: 'CUSTOMER_USER',
  shopId: 'shop-g006',
  scopes: ['dsv:session:read', 'dsv:customer-deliveries:read'],
  customerId: 'customer-g006',
};
const controlSummary = {
  serviceDate: '2026-07-23',
  totalDispatchCount: 7,
  assignedCount: 5,
  unassignedCount: 2,
  pendingEtaCount: 1,
  failedEtaCount: 1,
  readyEtaCount: 3,
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
const operationalSettings = {
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
};
const g003AdminSession = {
  ...fullAdminSession,
  scopes: [...fullAdminSession.scopes, 'dsv:dispatches:write'],
};
const demoIdentifierPattern = /DSV-2026-0709-(?:01|02)|DSV-SCHEDULED-03|CR-(?:101|204|207|303|330|410)|(?:11바 1201|12바 2302|13사 3403|14자 4504|15바 5605|21사 6101|22자 6202|23바 6303|24사 6404|31자 7104|32바 7207|33사 7311|34자 7412)|김도윤|역삼 진단센터/iu;
const forbiddenCustomerAuthorityParams = ['customer', 'customerId', 'accountId'];

function v1Envelope(data, requestId = 'g006-request') {
  return { data, meta: v1Meta, requestId };
}

function v1Error(status, message) {
  return {
    body: { error: { code: `G006_${status}`, message, requestId: `g006-error-${status}` } },
    status,
  };
}

function emptyV1List() {
  return v1Envelope({ items: [], page: { hasMore: false } });
}

function g003DispatchRows() {
  return [
    {
      assignmentStatus: 'UNASSIGNED',
      customerId: 'customer-g003',
      deliveryStopId: '11111111-1111-4111-8111-111111111111',
      destinationAddress: '서울특별시 강남구 테헤란로 152',
      destinationDisplayName: '같은 주소 배송처 A',
      destinationId: 'destination-g003-a',
      etaStatus: 'NOT_REQUIRED',
      latitude: 37.500643,
      longitude: 127.036545,
      operationStatus: 'READY',
      rawNote: '오전 11시 배송',
      reviewStatus: 'UNCONFIRMED',
      routeConstraintStatus: 'UNCONFIRMED',
      sellerOrderId: '22222222-2222-4222-8222-222222222222',
      sellerOrderKey: '2018330248',
      timeConstraint: null,
    },
    {
      assignmentStatus: 'UNASSIGNED',
      customerId: 'customer-g003',
      deliveryStopId: '33333333-3333-4333-8333-333333333333',
      destinationAddress: '서울특별시 강남구 테헤란로 152',
      destinationDisplayName: '같은 주소 배송처 B',
      destinationId: 'destination-g003-b',
      etaStatus: 'NOT_REQUIRED',
      latitude: 37.500643,
      longitude: 127.036545,
      operationStatus: 'READY',
      reviewStatus: 'NOT_APPLICABLE',
      routeConstraintStatus: 'NOT_APPLICABLE',
      sellerOrderId: '44444444-4444-4444-8444-444444444444',
      sellerOrderKey: '2018330247',
      timeConstraint: null,
    },
  ];
}

async function installApiFixtures(page, fixtures) {
  const resolvedFixtures = {
    'GET /api/dsv/v1/map/profile': v1Envelope(mapProviderProfile, 'g006-map-profile'),
    'GET /api/dsv/v1/conditions?limit=100': emptyV1List(),
    'GET /api/dsv/manual-email': {
      apiConfigured: false,
      configured: false,
      defaultRecipients: [],
      defaultSubject: '',
      defaultTextContent: '',
      senderEmail: null,
      senderName: 'CLEVER DSV',
    },
    'GET /api/dsv/v1/drivers?limit=100': emptyV1List(),
    'GET /api/dsv/v1/operational-notifications': v1Envelope({ items: [] }, 'g006-empty-notifications'),
    'GET /api/dsv/settings/operations': { data: operationalSettings, error: null },
    ...fixtures,
  };
  const calls = [];
  const unexpected = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const call = { method: request.method(), path: url.pathname, search: url.search };
    calls.push(call);
    const key = `${call.method} ${call.path}`;
    const fixture = resolvedFixtures[key] ?? resolvedFixtures[`${call.method} ${call.path}${call.search}`];
    if (fixture === undefined) {
      unexpected.push(call);
      await route.fulfill({
        contentType: 'application/json',
        status: 599,
        body: JSON.stringify({ error: { code: 'UNFIXTURED_API_CALL', message: key, requestId: 'g006-unfixture' } }),
      });
      return;
    }
    const resolved = await (typeof fixture === 'function' ? fixture({ request, url, call }) : fixture);
    await route.fulfill({
      contentType: 'application/json',
      status: resolved.status ?? 200,
      body: JSON.stringify(resolved.body ?? resolved),
    });
  });
  return { calls, unexpected };
}

async function seedCanonicalSentinels(page) {
  await page.addInitScript((sentinels) => {
    for (const [key, value] of Object.entries(sentinels)) window.localStorage.setItem(key, value);
  }, canonicalSentinels);
}

async function seedTransportStorage(page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('clever.auth.token', 'stale-token-g006');
    window.sessionStorage.setItem('clever.auth.csrf', 'stale-csrf-g006');
  });
}

async function expectTransportStorage(page, expected) {
  await expect(page.evaluate(() => ({
    csrf: window.sessionStorage.getItem('clever.auth.csrf'),
    token: window.sessionStorage.getItem('clever.auth.token'),
  }))).resolves.toEqual(expected);
}

async function expectCanonicalSentinelsUntouched(page) {
  await expect(page.evaluate((keys) => {
    return Object.fromEntries(keys.map((key) => [key, window.localStorage.getItem(key)]));
  }, Object.keys(canonicalSentinels))).resolves.toEqual(canonicalSentinels);
}

async function expectNoDemoVisible(page) {
  await expect(page.locator('body')).not.toContainText(demoIdentifierPattern);
  const demoMapSources = await page.evaluate(() => {
    const map = window.dsvMap;
    if (!map || typeof map.getStyle !== 'function') return [];
    return Object.keys(map.getStyle().sources ?? {}).filter((sourceId) => sourceId.startsWith('demo-'));
  });
  expect(demoMapSources).toEqual([]);
}

async function expectBlockedStateVisible(page) {
  await expect(page.getByRole('status').or(page.getByRole('alert'))).toBeVisible();
}

async function waitForApiCall(api, predicate) {
  await expect.poll(() => api.calls.some(predicate)).toBe(true);
}

function expectSessionBeforeDelivery(calls) {
  const sessionIndex = calls.findIndex((call) => call.method === 'GET' && call.path === '/api/dsv/v1/session');
  const deliveriesIndex = calls.findIndex((call) => call.method === 'GET' && call.path === '/api/dsv/v1/customer/deliveries');
  expect(sessionIndex, 'remote customer route must consult v1 session').toBeGreaterThanOrEqual(0);
  expect(deliveriesIndex, 'remote customer route must request session-scoped deliveries').toBeGreaterThanOrEqual(0);
  expect(sessionIndex, 'v1 session must be consulted before customer deliveries').toBeLessThan(deliveriesIndex);
}

function extractAllowlist(source, name) {
  const block = source.match(new RegExp(`const ${name}:[^=]+=[\\s\\S]*?\\[([\\s\\S]*?)\\n\\];`, 'u'));
  expect(block, `${name} must remain an explicit static allowlist`).not.toBeNull();
  return [...block[1].matchAll(/\{ method: '([A-Z]+)', pattern: \/\^(.+?)\$\/u \}/gu)]
    .map((match) => `${match[1]} ${match[2].replaceAll('\\/', '/')}`);
}

function executableClientSource() {
  const source = readFileSync(new URL('../../src/api/client.ts', import.meta.url), 'utf8')
    .replace("import { apiConfig } from './config';", "const apiConfig = { legacyBaseUrl: '/api/dsv', v1BaseUrl: '/api/dsv/v1' };")
    .replace(
      "import { expireTransportSession, readAuthToken, readCsrfToken, storeCsrfToken } from './auth-session';",
      [
        "const readAuthToken = () => window.sessionStorage.getItem('clever.auth.token');",
        "const readCsrfToken = () => window.sessionStorage.getItem('clever.auth.csrf');",
        "const storeCsrfToken = (token) => window.sessionStorage.setItem('clever.auth.csrf', token);",
        "const expireTransportSession = () => {",
        "  window.sessionStorage.removeItem('clever.auth.token');",
        "  window.sessionStorage.removeItem('clever.auth.csrf');",
        "  window.dispatchEvent(new Event('clever:auth-expired'));",
        "};",
      ].join('\n'),
    );
  return transpileModule(source, {
    compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
  }).outputText;
}

function executableAuthSource() {
  const source = readFileSync(new URL('../../src/services/auth.ts', import.meta.url), 'utf8')
    .replace(
      "import { ApiError, requestJson, requestV1ReadJson } from '../api/client';",
      [
        'class ApiError extends Error {',
        '  constructor(status, message, body) {',
        '    super(message);',
        '    this.status = status;',
        '    this.body = body;',
        '  }',
        '}',
        'const requestJson = async () => ({});',
        'const requestV1ReadJson = async () => ({});',
      ].join('\n'),
    )
    .replace(
      "import { clearTransportSession, storeAuthToken, storeCsrfToken } from '../api/auth-session';",
      [
        'const clearTransportSession = () => undefined;',
        'const storeAuthToken = () => undefined;',
        'const storeCsrfToken = () => undefined;',
      ].join('\n'),
    )
    .replace("import { apiConfig } from '../api/config';", "const apiConfig = { mode: 'remote', shopDomain: 'dsv-demo.local' };")
    .replace('function principalFromSession', 'export function principalFromSession');
  return transpileModule(source, {
    compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
  }).outputText;
}

async function loadExecutableAuthModule() {
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(executableAuthSource())}`);
}

async function loadControlProgressModule() {
  const source = readFileSync(new URL('../../src/features/control/control-progress.ts', import.meta.url), 'utf8');
  const output = transpileModule(source, {
    compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(output)}`);
}

async function callAssignmentCommand(page, { body, path, status }) {
  await page.goto('/login');
  return page.evaluate(async ({ clientSource, responseBody, responseStatus, requestPath }) => {
    const calls = [];
    const originalFetch = window.fetch;
    const moduleUrl = URL.createObjectURL(new Blob([clientSource], { type: 'text/javascript' }));
    window.fetch = async (input, init) => {
      calls.push({ method: init?.method, url: String(input) });
      return new Response(JSON.stringify(responseBody), {
        headers: { 'Content-Type': 'application/json' },
        status: responseStatus,
      });
    };
    try {
      const client = await import(moduleUrl);
      try {
        const data = await client.requestV1AssignmentCommandJson(requestPath, { method: 'POST', json: { driverId: 'driver-g006' } });
        return { calls, data, outcome: 'resolved' };
      } catch (error) {
        return {
          calls,
          message: error instanceof Error ? error.message : String(error),
          outcome: 'rejected',
          status: typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined,
        };
      }
    } finally {
      window.fetch = originalFetch;
      URL.revokeObjectURL(moduleUrl);
    }
  }, {
    clientSource: executableClientSource(),
    requestPath: path,
    responseBody: body,
    responseStatus: status,
  });
}

async function callTimeConstraintCommand(page, { body, json, path, status }) {
  await page.goto('/login');
  return page.evaluate(async ({ clientSource, requestJson, requestPath, responseBody, responseStatus }) => {
    const calls = [];
    const originalFetch = window.fetch;
    const moduleUrl = URL.createObjectURL(new Blob([clientSource], { type: 'text/javascript' }));
    window.fetch = async (input, init) => {
      calls.push({
        body: init?.body === undefined ? null : JSON.parse(String(init.body)),
        method: init?.method,
        url: String(input),
      });
      return new Response(JSON.stringify(responseBody), {
        headers: { 'Content-Type': 'application/json' },
        status: responseStatus,
      });
    };
    try {
      const client = await import(moduleUrl);
      try {
        const data = await client.requestV1TimeConstraintCommandJson(requestPath, { method: 'POST', json: requestJson });
        return { calls, data, outcome: 'resolved' };
      } catch (error) {
        return {
          calls,
          message: error instanceof Error ? error.message : String(error),
          outcome: 'rejected',
          status: typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined,
        };
      }
    } finally {
      window.fetch = originalFetch;
      URL.revokeObjectURL(moduleUrl);
    }
  }, {
    clientSource: executableClientSource(),
    requestJson: json,
    requestPath: path,
    responseBody: body,
    responseStatus: status,
  });
}

test('mandatory G006 boundary scenarios are not skipped in this spec', () => {
  const source = readFileSync(new URL(import.meta.url), 'utf8');
  for (const token of ['test' + '.skip', 'describe' + '.skip', '.skip' + '(']) {
    expect(source).not.toContain(token);
  }
});

test('maps DSV admin principal id from actorId and preserves displayName', async () => {
  const auth = await loadExecutableAuthModule();
  expect(auth.principalFromSession(adminSession)).toMatchObject({
    id: 'admin-actor-g006',
    principalType: 'DSV_ADMIN',
    shopId: 'shop-g006',
    displayName: 'G006 Admin Operator',
  });
});

test('separates control progress state from selection and splits a selected route monotonically', async () => {
  const progress = await loadControlProgressModule();
  const order = (eventSummary) => ({ eventSummary });
  const destinations = progress.assignControlDestinationProgress([
    { orders: [order([{ occurredAt: '2026-08-05T00:10:00.000Z', type: 'STOP_ARRIVED' }])] },
    { orders: [order([{ occurredAt: '2026-08-05T00:20:00.000Z', type: 'STOP_FAILED' }])] },
    { orders: [order([])] },
    { orders: [order([])] },
  ]);
  expect(destinations.map((destination) => destination.progressStatus)).toEqual([
    'completed',
    'failed',
    'current',
    'planned',
  ]);

  const segments = progress.splitControlRouteByProgress({
    coordinates: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
    stops: [
      { coordinate: [1, 0], progressStatus: 'completed' },
      { coordinate: [2, 0], progressStatus: 'failed' },
      { coordinate: [3, 0], progressStatus: 'current' },
      { coordinate: [4, 0], progressStatus: 'planned' },
    ],
    vehiclePosition: [2.5, 0],
  });
  expect(segments.map((segment) => segment.status)).toEqual(['completed', 'current', 'planned']);
  expect(segments[0].coordinates.at(-1)[0]).toBeCloseTo(2.5, 5);
  expect(segments[1].coordinates[0][0]).toBeCloseTo(2.5, 5);
  expect(segments[1].coordinates.at(-1)[0]).toBeCloseTo(3, 5);
  expect(segments[2].coordinates[0][0]).toBeCloseTo(3, 5);
  expect(progress.CONTROL_PROGRESS_COLORS).toEqual({
    completed: '#8e8e93',
    current: '#1f8b4c',
    failed: '#e87514',
    planned: '#0066cc',
  });
});

test('renders selected control progress without letting a future destination click change its state color', async ({ page }) => {
  const vehicleId = 'vehicle-progress';
  const routePlanId = 'route-progress';
  const routeCoordinates = [
    [127, 37.5],
    [127.01, 37.5],
    [127.02, 37.5],
    [127.03, 37.5],
    [127.04, 37.5],
  ];
  const events = [
    [{ occurredAt: '2026-08-05T00:10:00.000Z', type: 'STOP_ARRIVED' }],
    [{ occurredAt: '2026-08-05T00:20:00.000Z', type: 'STOP_FAILED' }],
    [],
    [],
  ];
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/control': v1Envelope({ ...controlSummary, assignedCount: 4, totalDispatchCount: 4, unassignedCount: 0 }),
    'GET /api/dsv/v1/control/routes': v1Envelope({
      routes: [{
        coordinates: routeCoordinates,
        generatedAt: '2026-08-05T00:00:00.000Z',
        geometryStatus: 'fresh',
        legDurationsSeconds: [60, 60, 60, 60],
        routePlanId,
      }],
      serviceDate: controlSummary.serviceDate,
    }),
    'GET /api/dsv/v1/vehicles?limit=100': v1Envelope({
      items: [{
        displayName: 'Progress Truck',
        driverAssignments: [],
        status: 'ACTIVE',
        telemetryActivity: 'ACTIVE',
        vehicleId,
        vehicleLatitude: 37.5,
        vehicleLongitude: 127.025,
        vehiclePlate: '진행12가3456',
        vehiclePositionObservedAt: '2026-08-05T00:30:00.000Z',
        vehiclePositionStale: false,
        vehicleStopped: false,
      }],
      page: { hasMore: false },
    }),
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({ items: [], page: { hasMore: false } }),
    'GET /api/dsv/v1/dispatches': v1Envelope({
      items: routeCoordinates.slice(1).map((coordinate, index) => ({
        assignmentStatus: 'ASSIGNED',
        customerId: 'customer-progress',
        destinationDisplayName: `진행 배송지 ${index + 1}`,
        destinationId: `destination-progress-${index + 1}`,
        driverId: 'driver-progress',
        etaStatus: 'PENDING',
        eventSummary: events[index],
        latitude: coordinate[1],
        longitude: coordinate[0],
        routePlanId,
        routeStopSequence: index + 1,
        sellerOrderId: `seller-order-progress-${index + 1}`,
        sellerOrderKey: `PROGRESS-${index + 1}`,
        vehicleId,
      })),
      page: { hasMore: false },
    }),
  });

  await page.goto('/control');
  const vehicleButton = page.getByRole('button', { name: /진행12가3456/u });
  await expect(vehicleButton).toBeVisible();
  await vehicleButton.click();
  const rows = page.locator('#destinationCard .control-destination-row');
  await expect(rows).toHaveCount(4);
  const expectedColors = [
    'rgb(142, 142, 147)',
    'rgb(232, 117, 20)',
    'rgb(31, 139, 76)',
    'rgb(0, 102, 204)',
  ];
  for (const [index, color] of expectedColors.entries()) {
    await expect(rows.nth(index).locator('.control-order-sequence')).toHaveCSS('background-color', color);
  }
  await expect.poll(() => page.evaluate(() => {
    const destinations = window.dsvMap?.getSource('operational-destinations');
    const routes = window.dsvMap?.getSource('operational-routes');
    if (!destinations || !routes) return null;
    return {
      destinations: destinations.serialize().data.features.map((feature) => feature.properties.color),
      routes: routes.serialize().data.features.map((feature) => ({
        casingColor: feature.properties.casingColor,
        color: feature.properties.color,
      })),
    };
  })).toEqual({
    destinations: ['#8e8e93', '#e87514', '#1f8b4c', '#0066cc'],
    routes: [
      { casingColor: '#ffffff', color: '#8e8e93' },
      { casingColor: '#ffffff', color: '#1f8b4c' },
      { casingColor: '#ffffff', color: '#0066cc' },
    ],
  });

  await rows.nth(3).click();
  await expect(rows.nth(3)).toHaveClass(/selected/u);
  await expect(rows.nth(3).locator('.control-order-sequence')).toHaveCSS('background-color', 'rgb(0, 102, 204)');
  await expect.poll(() => page.evaluate(() => {
    const destinations = window.dsvMap?.getSource('operational-destinations');
    return destinations?.serialize().data.features
      .find((feature) => feature.properties.pointId === 'destination-progress-4')?.properties.color;
  })).toBe('#0066cc');
  expect(api.unexpected).toEqual([]);
});

test('rejects a DSV admin session without actorId instead of falling back to shopId', async () => {
  const auth = await loadExecutableAuthModule();
  expect(() => auth.principalFromSession({
    principalType: 'DSV_ADMIN',
    shopId: 'shop-g006',
    scopes: ['dsv:session:read', 'dsv:control:read'],
  })).toThrow('세션 API 응답 형식이 올바르지 않습니다.');
});

test('keeps customer principal id mapping unchanged', async () => {
  const auth = await loadExecutableAuthModule();
  expect(auth.principalFromSession(customerSession)).toMatchObject({
    id: 'customer-g006',
    principalType: 'CUSTOMER_USER',
    shopId: 'shop-g006',
    displayName: null,
  });
});

test('accepts a valid admin session only through the strict v1 session envelope', async ({ page }) => {
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/control': v1Envelope(controlSummary),
    'GET /api/dsv/v1/vehicles?limit=100': v1Envelope({
      items: [{
        displayName: 'Canonical Refrigerated Truck',
        driverAssignments: [],
        note: '관제 차량 메모',
        status: 'ACTIVE',
        type: '냉장탑차',
        vehicleId: 'vehicle-g006-control',
        vehicleLatitude: 37.5665,
        vehicleLongitude: 126.978,
        vehiclePlate: '99테 6006',
        vehicleType: '냉장탑차',
      }],
      page: { hasMore: false },
    }),
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({
      items: [{ customerId: 'customer-g006-control', displayName: 'Canonical Customer', orderCount: 3, status: 'ACTIVE' }],
      page: { hasMore: false },
    }),
    'GET /api/dsv/v1/dispatches': v1Envelope({ items: [], page: { hasMore: false } }),
  });

  await page.goto('/control');

  await expect(page.getByLabel('관리자 세션 확인')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '관제', exact: true })).toBeVisible();
  await waitForApiCall(api, (call) => call.method === 'GET' && call.path === '/api/dsv/v1/control');
  await expect(page.getByLabel('지원되는 관제 요약')).toContainText(controlSummary.serviceDate);
  await expect(page.getByLabel('지원되는 관제 요약')).toContainText(`주문 수 ${controlSummary.totalDispatchCount}`);
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.getByRole('img', { name: /출발 위치: 경기도 군포시 번영로 82/ })).toBeVisible();
  const vehicleList = page.getByRole('region', { name: '차량 리스트', exact: true });
  await expect(vehicleList).not.toContainText('99테 6006');
  await expect(vehicleList).toContainText('차량이 없습니다.');
  await expect(page.getByLabel('고객사별 주문 리스트')).toBeVisible();
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/session')).toBe(true);
  expect(api.unexpected).toEqual([]);
});

test('shows only vehicles referenced by assigned dispatches in the scheduled fleet', async ({ page }) => {
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/control': v1Envelope(controlSummary),
    'GET /api/dsv/v1/control/routes': v1Envelope({
      routes: [
        {
          coordinates: [[126.9372235, 37.330948], [127.036545, 37.500643], [127.06316, 37.508844]],
          generatedAt: '2026-07-23T00:00:00.000Z',
          geometryStatus: 'fresh',
          legDurationsSeconds: [1800, 600],
          routePlanId: 'route-plan-g006-scheduled',
        },
        {
          coordinates: [[126.9372235, 37.330948], [126.889083, 37.57963]],
          generatedAt: '2026-07-23T00:00:00.000Z',
          geometryStatus: 'fresh',
          legDurationsSeconds: [2400],
          routePlanId: 'route-plan-g006-second',
        },
      ],
      serviceDate: controlSummary.serviceDate,
    }),
    'GET /api/dsv/v1/vehicles?limit=100': v1Envelope({
      items: [
        {
          distanceTodayKm: 128.4,
          displayName: 'Scheduled Truck',
          driverAssignments: [{ assignmentId: 'assignment-g006-control', driverId: 'driver-g006-control' }],
          ignitionOn: true,
          speedKph: 42.5,
          status: 'ACTIVE',
          temperatureA: 4.2,
          temperatureB: null,
          temperatureObservedAt: '2026-07-23T00:10:00.000Z',
          temperatureStale: false,
          telemetryActivity: 'ACTIVE',
          vehicleId: 'vehicle-g006-scheduled',
          vehicleLatitude: 37.5021,
          vehicleLongitude: 127.0412,
          vehiclePlate: '99테 6006',
          vehiclePositionObservedAt: '2026-07-23T00:11:00.000Z',
          vehiclePositionStale: false,
          vehicleStopped: false,
        },
        {
          displayName: 'Second Scheduled Truck',
          driverAssignments: [],
          status: 'ACTIVE',
          temperatureA: null,
          temperatureB: null,
          temperatureObservedAt: null,
          temperatureStale: true,
          telemetryActivity: 'DORMANT',
          vehicleId: 'vehicle-g006-second',
          vehiclePlate: '77테 4004',
          vehiclePositionObservedAt: null,
          vehiclePositionStale: null,
          vehicleStopped: null,
        },
        {
          displayName: 'Unscheduled Truck',
          driverAssignments: [],
          status: 'ACTIVE',
          temperatureA: -18.2,
          temperatureB: -17.9,
          telemetryActivity: 'ACTIVE',
          vehicleId: 'vehicle-g006-unscheduled',
          vehicleLatitude: 37.61,
          vehicleLongitude: 127.12,
          vehiclePlate: '88테 5005',
          vehicleStopped: true,
        },
      ],
      page: { hasMore: false },
    }),
    'GET /api/dsv/v1/drivers?limit=100': v1Envelope({
      items: [{ displayName: '김도윤', driverId: 'driver-g006-control', phone: '010-1234-5678', status: 'ACTIVE' }],
      page: { hasMore: false },
    }),
    'GET /api/dsv/v1/vehicles/vehicle-g006-scheduled/temperature-history': v1Envelope({
      vehicleId: 'vehicle-g006-scheduled',
      samples: [
        { observedAt: '2026-07-22T00:15:00.000Z', temperatureA: 6.4, temperatureB: 6.7 },
        { observedAt: '2026-07-23T00:00:00.000Z', temperatureA: 4.1, temperatureB: null },
        { observedAt: '2026-07-23T00:05:00.000Z', temperatureA: 4.2, temperatureB: 4.4 },
        { observedAt: '2026-07-23T00:10:00.000Z', temperatureA: 4.3, temperatureB: 4.5 },
      ],
    }),
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({
      items: [{ customerId: 'customer-g006-control', displayName: 'Canonical Customer', orderCount: 3, status: 'ACTIVE' }],
      page: { hasMore: false },
    }),
    'GET /api/dsv/v1/conditions?limit=100': v1Envelope({
      items: [
        {
          code: 'COLD',
          conditionId: 'condition-g006-cold',
          description: '냉장 운송',
          name: '냉장',
          status: 'ACTIVE',
          temperatureAlertEnabled: true,
          temperatureMaxC: 4,
          temperatureMinC: 2,
        },
        {
          code: 'AMBIENT',
          conditionId: 'condition-g006-ambient',
          description: '상온 운송',
          name: '상온',
          status: 'ACTIVE',
          temperatureAlertEnabled: true,
          temperatureMaxC: 25,
          temperatureMinC: 15,
        },
      ],
      page: { hasMore: false },
    }),
    'GET /api/dsv/v1/dispatches': v1Envelope({
      items: [
        {
          assignmentStatus: 'ASSIGNED',
          conditionCode: 'COLD',
          customerId: 'customer-g006-control',
          destinationAddress: '서울특별시 강남구 테헤란로 152',
          destinationDisplayName: 'Shared Control Destination',
          destinationId: 'destination-g006-control',
          driverId: 'driver-g006-control',
          etaStatus: 'PENDING',
          latitude: 37.500643,
          longitude: 127.036545,
          routePlanId: 'route-plan-g006-scheduled',
          routeStopSequence: 5,
          rawNote: '오전 11시 배송 필수',
          sellerOrderId: 'seller-order-g006-control',
          sellerOrderKey: 'SELLER-G006-CONTROL',
          shippedBoxes: 4,
          vehicleId: 'vehicle-g006-scheduled',
        },
        {
          assignmentStatus: 'ASSIGNED',
          conditionCode: 'AMBIENT',
          customerId: 'customer-g006-control',
          destinationAddress: '서울특별시 강남구 테헤란로 152',
          destinationDisplayName: 'Shared Control Destination',
          destinationId: 'destination-g006-control',
          driverId: 'driver-g006-control',
          etaStatus: 'PENDING',
          latitude: 37.508844,
          longitude: 127.06316,
          routePlanId: 'route-plan-g006-scheduled',
          routeStopSequence: 6,
          sellerOrderId: 'seller-order-g006-control-2',
          sellerOrderKey: 'SELLER-G006-CONTROL-2',
          shippedBoxes: 2,
          vehicleId: 'vehicle-g006-scheduled',
        },
        {
          assignmentStatus: 'ASSIGNED',
          customerId: 'customer-g006-control',
          destinationId: 'destination-g006-second',
          driverId: 'driver-g006-second',
          etaStatus: 'PENDING',
          latitude: 37.57963,
          longitude: 126.889083,
          routePlanId: 'route-plan-g006-second',
          routeStopSequence: 1,
          sellerOrderId: 'seller-order-g006-second',
          sellerOrderKey: 'SELLER-G006-SECOND',
          vehicleId: 'vehicle-g006-second',
        },
      ],
      page: { hasMore: false },
    }),
  });

  await page.goto('/control');

  const scheduledFleet = page.getByRole('region', { name: '차량 리스트', exact: true });
  await expect(scheduledFleet).toContainText('99테 6006');
  await expect(scheduledFleet.locator('.control-vehicle-row', { hasText: '99테 6006' })).toContainText('2건');
  await expect(scheduledFleet).toContainText('77테 4004');
  await expect(scheduledFleet).not.toContainText('88테 5005');
  await expect(scheduledFleet).not.toContainText('vehicle-g006');
  await scheduledFleet.locator('.control-vehicle-row', { hasText: '99테 6006' }).getByRole('button', { name: '온도', exact: true }).click();
  const temperatureDialog = page.getByRole('dialog', { name: '99테 6006 온도' });
  await expect(temperatureDialog).toBeVisible();
  await expect(temperatureDialog.getByRole('img', { name: '최근 24시간 차량 온도 A 채널과 B 채널 꺾은선 차트' })).toBeVisible();
  await expect(temperatureDialog).toContainText('A 채널');
  await expect(temperatureDialog).toContainText('B 채널');
  await expect(temperatureDialog.getByLabel('온도 수집 시간표')).toContainText('5분');
  await expect(temperatureDialog.getByLabel('운영 상태 온도 기준')).toContainText('COLD 냉장 2℃ ~ 4℃');
  await expect(temperatureDialog.getByLabel('운영 상태 온도 기준')).toContainText('AMBIENT 상온 15℃ ~ 25℃');
  await expect(temperatureDialog.locator('.temperature-condition-band')).toHaveCount(2);
  await expect.poll(() => temperatureDialog.locator('.temperature-condition-band').evaluateAll((bands) => (
    new Set(bands.map((band) => band.getAttribute('fill'))).size
  ))).toBe(2);
  await waitForApiCall(api, (call) => call.method === 'GET' && call.path === '/api/dsv/v1/vehicles/vehicle-g006-scheduled/temperature-history');
  await temperatureDialog.getByRole('button', { name: '온도 이력 닫기' }).click();
  const customerInquiryLink = page.getByRole('link', { name: 'Canonical Customer 고객사 조회 화면으로 이동' });
  await expect(customerInquiryLink).toBeVisible();
  await expect(customerInquiryLink).toHaveAttribute('href', `/customer/delivery-inquiry/admin?customer=customer-g006-control&serviceDate=${controlSummary.serviceDate}`);
  await expect(customerInquiryLink).toContainText('클릭하여 고객사 조회 화면으로 이동');
  await expect(customerInquiryLink).toHaveCSS('display', 'grid');
  await expect(page.getByLabel('고객사별 주문 리스트')).not.toContainText('destination-g006-control');
  await expect(page.getByLabel('고객사별 주문 리스트')).not.toContainText('SELLER-G006-CONTROL');
  await expect(page.locator('.control-customer-order-meta time')).toHaveText(/^\d{2}:\d{2}$/u);
  const customerCardLayout = await customerInquiryLink.evaluate((element) => {
    const card = element.getBoundingClientRect();
    const name = element.querySelector('strong')?.getBoundingClientRect();
    const hint = element.querySelector('small')?.getBoundingClientRect();
    return {
      cardHeight: card.height,
      hintBottom: hint?.bottom ?? 0,
      nameTop: name?.top ?? 0,
      cardBottom: card.bottom,
      cardTop: card.top,
    };
  });
  expect(customerCardLayout.cardHeight).toBeGreaterThanOrEqual(56);
  expect(customerCardLayout.nameTop).toBeGreaterThanOrEqual(customerCardLayout.cardTop);
  expect(customerCardLayout.hintBottom).toBeLessThanOrEqual(customerCardLayout.cardBottom);
  await expect.poll(() => page.evaluate(() => {
    const destinationSource = window.dsvMap?.getSource('operational-destinations');
    const routeSource = window.dsvMap?.getSource('operational-routes');
    const vehicleSource = window.dsvMap?.getSource('operational-vehicles');
    if (!destinationSource || !routeSource || !vehicleSource) return null;
    const vehicleImage = window.dsvMap.getImage('vehicle-marker-default');
    const vehicleImageBytes = vehicleImage?.data?.data ?? [];
    return {
      destinations: destinationSource.serialize().data.features.map((feature) => ({
        color: feature.properties.color,
        label: feature.properties.label,
        pinImage: feature.properties.pinImage,
        pointId: feature.properties.pointId,
      })),
      destinationSymbol: {
        hasTextField: window.dsvMap.getLayoutProperty('operational-destination-markers', 'text-field') !== undefined,
        iconAllowOverlap: window.dsvMap.getLayoutProperty('operational-destination-markers', 'icon-allow-overlap'),
        iconOptional: window.dsvMap.getLayoutProperty('operational-destination-markers', 'icon-optional'),
      },
      vehicleSymbol: {
        hasImage: window.dsvMap.hasImage('vehicle-marker-default'),
        hasIconOffset: window.dsvMap.getLayoutProperty('operational-vehicle-markers', 'icon-offset') !== undefined,
        imageHeight: vehicleImage?.data?.height,
        imageIsVisible: Array.from(vehicleImageBytes).some((value, index) => index % 4 === 3 && value > 0),
        imageWidth: vehicleImage?.data?.width,
        iconImage: window.dsvMap.getLayoutProperty('operational-vehicle-markers', 'icon-image'),
        labelField: window.dsvMap.getLayoutProperty('operational-vehicle-labels', 'text-field'),
      },
      routes: routeSource.serialize().data.features.map((feature) => ({
        color: feature.properties.color,
        routeId: feature.properties.routeId,
      })),
      routePaint: {
        casingOpacity: window.dsvMap.getPaintProperty('operational-route-casing', 'line-opacity'),
        lineOpacity: window.dsvMap.getPaintProperty('operational-route-lines', 'line-opacity'),
      },
      vehicles: vehicleSource.serialize().data.features.map((feature) => ({
        coordinates: feature.geometry.coordinates,
        label: feature.properties.label,
        markerImageId: feature.properties.markerImageId,
        vehicleId: feature.properties.vehicleId ?? null,
      })),
    };
  })).toMatchObject({
    destinations: [
      { label: '1', pinImage: expect.stringMatching(/-1$/), pointId: 'destination-g006-control' },
      { label: '1', pinImage: expect.stringMatching(/-1$/), pointId: 'destination-g006-second' },
    ],
    destinationSymbol: {
      hasTextField: false,
      iconAllowOverlap: false,
      iconOptional: false,
    },
    vehicleSymbol: {
      hasImage: true,
      hasIconOffset: false,
      imageHeight: 128,
      imageIsVisible: true,
      imageWidth: 128,
      iconImage: ['get', 'markerImageId'],
      labelField: ['get', 'label'],
    },
    routes: [
      { routeId: 'route-plan-g006-scheduled' },
      { routeId: 'route-plan-g006-second' },
    ],
    routePaint: {
      casingOpacity: ['case', ['get', 'selected'], 0.96, 1],
      lineOpacity: ['case', ['get', 'selected'], 0.96, 1],
    },
    vehicles: [
      { coordinates: [127.0412, 37.5021], label: '99테 6006', markerImageId: 'vehicle-marker-0066cc', vehicleId: null },
      { coordinates: [126.9372235, 37.330948], label: '1대 예정', markerImageId: 'vehicle-marker-default', vehicleId: null },
    ],
  });
  const colors = await page.evaluate(() => (
    window.dsvMap.getSource('operational-routes').serialize().data.features.map((feature) => feature.properties.color)
  ));
  expect(new Set(colors).size).toBe(2);

  const selectedVehicle = scheduledFleet.getByRole('button', { name: /99테 6006/ });
  const selectedVehicleRow = scheduledFleet.locator('.control-vehicle-row', { hasText: '99테 6006' });
  await expect(selectedVehicle).toHaveAttribute('aria-expanded', 'false');
  await expect(selectedVehicleRow.locator('.control-vehicle-details')).toHaveCount(0);
  await selectedVehicle.click();
  await expect(selectedVehicle).toHaveAttribute('aria-pressed', 'true');
  await expect(selectedVehicle).toHaveAttribute('aria-expanded', 'true');
  const vehicleDetails = selectedVehicleRow.locator('.control-vehicle-details');
  await expect(vehicleDetails).toBeVisible();
  await expect(vehicleDetails).toContainText('Scheduled Truck');
  await expect(vehicleDetails).toContainText('이동');
  await expect(vehicleDetails).toContainText('김도윤');
  await expect(vehicleDetails).toContainText('COLD 냉장');
  await expect(vehicleDetails).toContainText('AMBIENT');
  await expect(vehicleDetails).toContainText('오전 11시 배송 필수');
  await expect(vehicleDetails).not.toContainText('온도 이탈');
  await expect(page.locator('#destinationCard .control-destination-row')).toHaveCount(1);
  await expect(page.getByLabel('배송지 순서 1')).toHaveText('1');
  await expect(page.getByLabel('배송지 순서 1')).toHaveCSS('background-color', 'rgb(31, 139, 76)');
  await expect(page.locator('#destinationCard .control-destination-row')).toContainText('2건');
  const destinationRow = page.locator('#destinationCard .control-destination-row');
  await expect(destinationRow).toHaveAttribute('aria-expanded', 'false');
  await expect(destinationRow.locator('.control-destination-details')).toHaveCount(0);
  await destinationRow.click();
  await expect(destinationRow).toHaveClass(/selected/u);
  await expect(destinationRow).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('배송지 순서 1')).toHaveCSS('background-color', 'rgb(31, 139, 76)');
  const destinationDetails = destinationRow.locator('.control-destination-details');
  await expect(destinationDetails).toBeVisible();
  await expect(destinationDetails).toContainText('Shared Control Destination');
  await expect(destinationDetails).toContainText('서울특별시 강남구 테헤란로 152');
  await expect(destinationDetails).toContainText('SELLER-G006-CONTROL');
  await expect(destinationDetails).toContainText('운영 상태 COLD');
  await expect(destinationDetails).toContainText('박스 4박스');
  await expect(destinationDetails).toContainText('운영 상태 AMBIENT');
  await expect(destinationDetails).toContainText('박스 2박스');
  await expect(destinationDetails).not.toContainText('STOP_ARRIVED');
  await expect(destinationDetails.locator('.control-detail-value').first()).toHaveCSS('white-space', 'normal');
  await expect.poll(() => page.evaluate(() => ({
    destinations: window.dsvMap.getSource('operational-destinations').serialize().data.features.map((feature) => ({
      pointId: feature.properties.pointId,
      sortKey: feature.properties.sortKey,
    })),
    iconAllowOverlap: window.dsvMap.getLayoutProperty('operational-destination-markers', 'icon-allow-overlap'),
    routeIds: window.dsvMap.getSource('operational-routes').serialize().data.features.map((feature) => feature.properties.routeId),
  }))).toEqual({
    destinations: [
      { pointId: 'destination-g006-control', sortKey: -1 },
    ],
    iconAllowOverlap: true,
    routeIds: ['route-plan-g006-scheduled:completed', 'route-plan-g006-scheduled:planned'],
  });

  await selectedVehicle.click();
  await expect(selectedVehicle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.evaluate(() => ({
    destinationCount: window.dsvMap.getSource('operational-destinations').serialize().data.features.length,
    iconAllowOverlap: window.dsvMap.getLayoutProperty('operational-destination-markers', 'icon-allow-overlap'),
  }))).toEqual({
    destinationCount: 2,
    iconAllowOverlap: false,
  });
  expect(api.unexpected).toEqual([]);
});

test('marks previously loaded telemetry stale when a background refresh fails', async ({ page }) => {
  await page.clock.install();
  let vehicleReads = 0;
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/control': v1Envelope({
      ...controlSummary,
      assignedCount: 1,
      totalDispatchCount: 1,
      unassignedCount: 0,
    }),
    'GET /api/dsv/v1/control/routes': v1Envelope({ routes: [], serviceDate: controlSummary.serviceDate }),
    'GET /api/dsv/v1/vehicles?limit=100': () => {
      vehicleReads += 1;
      if (vehicleReads > 1) return v1Error(503, 'temporary telemetry read failure');
      return v1Envelope({
        items: [{
          displayName: 'Refresh Test Truck',
          driverAssignments: [],
          status: 'ACTIVE',
          temperatureA: 4.2,
          temperatureB: null,
          temperatureObservedAt: '2026-07-23T00:10:00.000Z',
          temperatureStale: false,
          telemetryActivity: 'ACTIVE',
          vehicleId: 'vehicle-g006-refresh',
          vehicleLatitude: 37.5021,
          vehicleLongitude: 127.0412,
          vehiclePlate: '99테 6006',
          vehiclePositionObservedAt: '2026-07-23T00:11:00.000Z',
          vehiclePositionStale: false,
          vehicleStopped: true,
        }],
        page: { hasMore: false },
      });
    },
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({ items: [], page: { hasMore: false } }),
    'GET /api/dsv/v1/dispatches': v1Envelope({
      items: [{
        assignmentStatus: 'ASSIGNED',
        customerId: 'customer-g006-refresh',
        destinationId: 'destination-g006-refresh',
        driverId: 'driver-g006-refresh',
        etaStatus: 'PENDING',
        latitude: 37.500643,
        longitude: 127.036545,
        routePlanId: 'route-plan-g006-refresh',
        routeStopSequence: 1,
        sellerOrderId: 'seller-order-g006-refresh',
        sellerOrderKey: 'SELLER-G006-REFRESH',
        vehicleId: 'vehicle-g006-refresh',
      }],
      page: { hasMore: false },
    }),
  });

  await page.goto('/control');

  const scheduledFleet = page.getByRole('region', { name: '차량 리스트', exact: true });
  const vehicleRow = scheduledFleet.locator('.control-vehicle-row', { hasText: '99테 6006' });
  await vehicleRow.getByRole('button', { name: /99테 6006/ }).click();
  const vehicleDetails = vehicleRow.locator('.control-vehicle-details');
  await expect(vehicleDetails).toContainText('정차');
  await page.clock.fastForward(30_000);
  await expect.poll(() => vehicleReads).toBeGreaterThan(1);
  await expect(vehicleDetails).toContainText('위치 지연');
  expect(api.unexpected).toEqual([]);
});

test('rejects one-sided and out-of-range vehicle coordinates at the v1 boundary', async ({ page }) => {
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/control': v1Envelope(controlSummary),
    'GET /api/dsv/v1/vehicles?limit=100': v1Envelope({
      items: [{
        displayName: 'Malformed Coordinate Truck',
        driverAssignments: [],
        status: 'ACTIVE',
        vehicleId: 'vehicle-g006-malformed-coordinate',
        vehicleLatitude: 91,
        vehicleLongitude: null,
        vehiclePlate: '99테 6006',
      }],
      page: { hasMore: false },
    }),
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({ items: [], page: { hasMore: false } }),
    'GET /api/dsv/v1/dispatches': v1Envelope({ items: [], page: { hasMore: false } }),
  });

  await page.goto('/control');

  await expect(page.getByRole('alert')).toContainText('API v1 관리 목록 형식이 올바르지 않습니다.');
  expect(api.unexpected).toEqual([]);
});

test('keeps both control side overlays above the map preview while the session is pending', async ({ page }) => {
  let releaseSession;
  const sessionPending = new Promise((resolve) => {
    releaseSession = resolve;
  });
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': async () => {
      await sessionPending;
      return v1Envelope(adminSession);
    },
    'GET /api/dsv/v1/control': v1Envelope(controlSummary),
    'GET /api/dsv/v1/vehicles?limit=100': v1Envelope({ items: [], page: { hasMore: false } }),
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({ items: [], page: { hasMore: false } }),
    'GET /api/dsv/v1/dispatches': v1Envelope({ items: [], page: { hasMore: false } }),
  });

  await page.goto('/control');

  await expect(page.getByLabel('주 메뉴')).toBeVisible();
  await expect(page.getByLabel('알림 열기')).toBeVisible();
  await expect(page.getByRole('button', { name: '2D', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '3D', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('관제 운영 패널')).toBeVisible();
  await expect(page.getByLabel('지도 불러오는 중')).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/control')).toBe(false);
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/vehicles')).toBe(false);
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/dispatches')).toBe(false);

  releaseSession();

  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('주 메뉴')).toBeVisible();
  await expect(page.getByLabel('관제 운영 패널')).toBeVisible();
  expect(api.unexpected).toEqual([]);
});

test('blocks a protected route before data calls when the route read scope is missing', async ({ page }) => {
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope({ ...adminSession, scopes: ['dsv:session:read'] }),
  });

  await page.goto('/control');

  await expect(page).toHaveURL(/\/control$/u);
  await expect(page.getByRole('alert')).toContainText('조회 권한이 없습니다');
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/session')).toBe(true);
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/control')).toBe(false);
  expect(api.unexpected).toEqual([]);
});

test('requires every read scope used by the remote master-data page before management calls', async ({ page }) => {
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope({
      ...fullAdminSession,
      scopes: fullAdminSession.scopes.filter((scope) => scope !== 'dsv:conditions:read'),
    }),
  });

  await page.goto('/master-data');

  await expect(page).toHaveURL(/\/master-data$/u);
  await expect(page.getByRole('alert')).toContainText('조회 권한이 없습니다');
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/session')).toBe(true);
  for (const path of ['/api/dsv/v1/drivers', '/api/dsv/v1/vehicles', '/api/dsv/v1/customers', '/api/dsv/v1/destinations', '/api/dsv/v1/conditions']) {
    expect(api.calls.some((call) => call.method === 'GET' && call.path === path), `${path} must be blocked by the route gate`).toBe(false);
  }
  expect(api.unexpected).toEqual([]);
});

test('edits only customer notification settings in remote master data', async ({ page }) => {
  const commandBodies = [];
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(fullAdminSession),
    'GET /api/dsv/v1/drivers?limit=100': emptyV1List(),
    'GET /api/dsv/v1/vehicles?limit=100': emptyV1List(),
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({
      items: [{
        customerId: 'customer-notification-settings',
        displayName: '알림 고객사',
        notificationEmailEnabled: false,
        notificationEmailRecipient: null,
        orderCount: 1,
        status: 'ACTIVE',
      }],
      page: { hasMore: false },
    }),
    'GET /api/dsv/v1/destinations?limit=100': emptyV1List(),
    'GET /api/dsv/v1/conditions?limit=100': emptyV1List(),
    'PATCH /api/dsv/v1/customers/customer-notification-settings/notification-settings': ({ request }) => {
      const body = JSON.parse(request.postData() ?? '{}');
      commandBodies.push(body);
      return v1Envelope({
        customerId: 'customer-notification-settings',
        notificationEmailEnabled: body.enabled,
        notificationEmailRecipient: body.recipient,
      });
    },
  });

  await page.goto('/master-data');
  await page.getByRole('button', { name: '고객사', exact: true }).click();
  await page.getByRole('row', { name: /알림 고객사/ }).click();
  await page.getByRole('button', { name: '고객사 수정' }).click();

  await expect(page.getByLabel('고객사명')).toHaveAttribute('readonly', '');
  await expect(page.getByLabel('고객 코드')).toHaveAttribute('readonly', '');
  await page.getByLabel('이메일 알림 사용').check();
  await page.getByLabel('대표 수신자 이메일').fill('customer@example.com');
  await page.getByRole('button', { name: '저장', exact: true }).click();

  await expect.poll(() => commandBodies).toEqual([{ enabled: true, recipient: 'customer@example.com' }]);
  expect(api.unexpected).toEqual([]);
});

test('fails closed when a v1 success envelope is missing requestId', async ({ page }) => {
  await seedCanonicalSentinels(page);
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': { data: adminSession, meta: v1Meta },
  });

  await page.goto('/control');

  await expectNoDemoVisible(page);
  await expectCanonicalSentinelsUntouched(page);
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/session')).toBe(true);
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/control')).toBe(false);
  expect(api.unexpected).toEqual([]);
});

test('fails closed when a v1 success envelope is missing apiVersion', async ({ page }) => {
  await seedCanonicalSentinels(page);
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': { data: adminSession, meta: {}, requestId: 'g006-missing-version' },
  });

  await page.goto('/control');

  await expectNoDemoVisible(page);
  await expectCanonicalSentinelsUntouched(page);
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/session')).toBe(true);
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/control')).toBe(false);
  expect(api.unexpected).toEqual([]);
});

test('fails closed when a v1 success envelope has extra top-level fields', async ({ page }) => {
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/control': { ...v1Envelope(controlSummary), extra: 'not-documented' },
  });

  await page.goto('/control');

  await expect(page.getByRole('alert')).toContainText('API v1 응답 형식이 올바르지 않습니다.');
  await expect(page.getByLabel('지원되는 관제 요약')).toHaveCount(0);
  expect(api.unexpected).toEqual([]);
});

test('fails closed when v1 success meta has extra fields', async ({ page }) => {
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/control': {
      data: controlSummary,
      meta: { apiVersion: 'dsv.v1', extra: 'not-documented' },
      requestId: 'g006-extra-meta',
    },
  });

  await page.goto('/control');

  await expect(page.getByRole('alert')).toContainText('API v1 응답 형식이 올바르지 않습니다.');
  await expect(page.getByLabel('지원되는 관제 요약')).toHaveCount(0);
  expect(api.unexpected).toEqual([]);
});

test('requests customer deliveries only after a valid customer v1 session', async ({ page }) => {
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(customerSession),
    'GET /api/dsv/v1/customer/deliveries': ({ url }) => {
      for (const param of forbiddenCustomerAuthorityParams) expect(url.searchParams.has(param), `${param} cannot become authority`).toBe(false);
      return v1Envelope({
        items: [
          {
            sellerOrderId: 'order-g006-authorized',
            sellerOrderKey: 'SELLER-G006-AUTHORIZED',
            destinationDisplayName: 'G006 Authorized Clinic',
            destinationId: 'destination-g006-authorized',
            deliveryStatus: 'IN_TRANSIT',
            etaStatus: 'ON_TIME',
            estimatedArrivalAt: '2026-07-23T06:30:00.000Z',
            proofStatus: 'NONE',
            shippedBoxes: 4,
            eventSummary: [{ type: 'DEPARTED', occurredAt: '2026-07-23T05:30:00.000Z' }],
          },
        ],
      });
    },
  });

  await page.goto('/customer/delivery-inquiry?customer=forged&customerId=forged-customer&accountId=forged-account');

  await waitForApiCall(api, (call) => call.method === 'GET' && call.path === '/api/dsv/v1/session');
  await waitForApiCall(api, (call) => call.method === 'GET' && call.path === '/api/dsv/v1/customer/deliveries');
  expectSessionBeforeDelivery(api.calls);
  await page.getByRole('button', { name: /G006 Authorized Clinic/u }).click();
  await expect(page.getByText('SELLER-G006-AUTHORIZED', { exact: true }).first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/forged-customer|forged-account/u);
  expect(api.unexpected).toEqual([]);
});

test('loads the administrator customer map through the customer-scoped contract', async ({ page }) => {
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(fullAdminSession),
    'GET /api/dsv/v1/customers/deliveries': ({ url }) => {
      expect(url.searchParams.get('customerId')).toBe('customer-g006-map');
      expect(url.searchParams.get('serviceDate')).toBe('2026-08-03');
      return v1Envelope({
        customerDisplayName: 'G006 Healthcare',
        departureLocation: {
          latitude: 37.330948,
          longitude: 126.9372235,
        },
        items: [
          {
            sellerOrderId: 'order-g006-map',
            sellerOrderKey: 'SELLER-G006-MAP',
            destinationDisplayName: 'G006 Customer Destination',
            destinationAddress: '서울특별시 중구 세종대로 110',
            destinationId: 'destination-g006-map',
            deliveryStatus: 'IN_TRANSIT',
            etaStatus: 'READY',
            estimatedArrivalAt: '2026-08-03T03:30:00.000Z',
            proofStatus: 'NONE',
            shippedBoxes: 3,
            eventSummary: [],
            latitude: 37.5663,
            longitude: 126.9779,
            vehicleDisplayName: '서울86바3800',
            vehicleId: 'vehicle-g006-map',
            vehicleLatitude: 37.564,
            vehicleLongitude: 126.982,
          },
        ],
        page: { hasMore: false },
        routes: [{
          vehicleId: 'vehicle-g006-map',
          coordinates: [[126.982, 37.564], [126.98, 37.565], [126.9779, 37.5663]],
        }],
      });
    },
  });

  await page.goto('/customer/delivery-inquiry/admin?customer=customer-g006-map&serviceDate=2026-08-03');

  await waitForApiCall(api, (call) => call.method === 'GET' && call.path === '/api/dsv/v1/customers/deliveries');
  await expect(page.getByRole('article', { name: '고객사 배송지 지도' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '고객사 메뉴' })).toContainText('G006 Healthcare');
  await expect(page.getByLabel('차량 목록')).toContainText('서울86바3800');
  await expect.poll(() => page.getByLabel('차량 목록').locator('.customer-vehicle-list').evaluate((element) => element.clientHeight)).toBe(56);
  await expect(page.getByLabel('배송지 리스트')).toBeVisible();
  await expect(page.getByText('G006 Customer Destination', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('서울86바3800', { exact: true }).first()).toBeVisible();
  await page.locator('.map-canvas.ready').waitFor({ state: 'visible' });
  await expect(page.locator('.departure-map-marker')).toHaveAttribute('aria-label', '출발 위치: 물류센터');
  await expect(page.getByLabel('차량 목록')).not.toContainText(/접기|펼치기/u);
  const destination = page.getByRole('button', { name: /G006 Customer Destination/u });
  await expect(destination).toHaveAttribute('aria-expanded', 'false');
  await destination.click();
  await expect(destination).toHaveAttribute('aria-expanded', 'true');
  await expect(destination).toContainText('SELLER-G006-MAP');
  await destination.click();
  await expect(destination).toHaveAttribute('aria-expanded', 'false');
  await expect(destination).not.toContainText('SELLER-G006-MAP');
  expect(api.unexpected).toEqual([]);
});

test('grows the customer vehicle list through three rows and scrolls additional vehicles', async ({ page }) => {
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(customerSession),
    'GET /api/dsv/v1/customer/deliveries': v1Envelope({
      items: Array.from({ length: 4 }, (_, index) => ({
        sellerOrderId: `order-g006-vehicle-${index + 1}`,
        sellerOrderKey: `SELLER-G006-VEHICLE-${index + 1}`,
        destinationDisplayName: `G006 Vehicle Destination ${index + 1}`,
        destinationId: `destination-g006-vehicle-${index + 1}`,
        deliveryStatus: 'PLANNED',
        etaStatus: 'READY',
        estimatedArrivalAt: '2026-08-04T01:30:00.000Z',
        proofStatus: 'NONE',
        shippedBoxes: 1,
        eventSummary: [],
        latitude: 37.5 + index * 0.01,
        longitude: 127.01 + index * 0.01,
        vehicleDisplayName: `테스트차량${index + 1}`,
        vehicleId: `vehicle-g006-${index + 1}`,
      })),
      page: { hasMore: false },
      routes: [],
    }),
  });

  await page.goto('/customer/delivery-inquiry');

  await waitForApiCall(api, (call) => call.method === 'GET' && call.path === '/api/dsv/v1/customer/deliveries');
  const vehicleList = page.getByLabel('차량 목록').locator('.customer-vehicle-list');
  await expect(vehicleList.locator('.customer-vehicle-row')).toHaveCount(4);
  await expect.poll(() => vehicleList.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))).toEqual({ clientHeight: 168, scrollHeight: 224 });
  expect(api.unexpected).toEqual([]);
});

test('shows a depot-start route when assigned vehicle telemetry is unavailable', async ({ page }) => {
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(customerSession),
    'GET /api/dsv/v1/customer/deliveries': v1Envelope({
      customerDisplayName: 'G006 Depot Customer',
      departureLocation: {
        latitude: 37.330948,
        longitude: 126.9372235,
      },
      items: [
        {
          sellerOrderId: 'order-g006-depot-route',
          sellerOrderKey: 'SELLER-G006-DEPOT-ROUTE',
          destinationDisplayName: 'G006 Depot Route Clinic',
          destinationAddress: '서울특별시 강남구 테헤란로 152',
          destinationId: 'destination-g006-depot-route',
          deliveryStatus: 'PLANNED',
          etaStatus: 'READY',
          estimatedArrivalAt: '2026-08-04T01:30:00.000Z',
          proofStatus: 'NONE',
          shippedBoxes: 2,
          eventSummary: [],
          latitude: 37.500643,
          longitude: 127.036545,
          vehicleDisplayName: '서울86바3800',
          vehicleId: 'vehicle-g006-depot-route',
        },
        {
          sellerOrderId: 'order-g006-other-route',
          sellerOrderKey: 'SELLER-G006-OTHER-ROUTE',
          destinationDisplayName: 'G006 Other Route Clinic',
          destinationAddress: '서울특별시 마포구 양화로 155',
          destinationId: 'destination-g006-other-route',
          deliveryStatus: 'PLANNED',
          etaStatus: 'READY',
          estimatedArrivalAt: '2026-08-04T02:10:00.000Z',
          proofStatus: 'NONE',
          shippedBoxes: 1,
          eventSummary: [],
          latitude: 37.5564,
          longitude: 126.9238,
          vehicleDisplayName: '경기88바9580',
          vehicleId: 'vehicle-g006-other-route',
        },
      ],
      page: { hasMore: false },
      routes: [
        {
          vehicleId: 'vehicle-g006-depot-route',
          coordinates: [[126.9372235, 37.330948], [126.98, 37.42], [127.036545, 37.500643]],
        },
        {
          vehicleId: 'vehicle-g006-other-route',
          coordinates: [[126.9372235, 37.330948], [126.93, 37.48], [126.9238, 37.5564]],
        },
      ],
    }),
  });

  await page.goto('/customer/delivery-inquiry');

  await waitForApiCall(api, (call) => call.method === 'GET' && call.path === '/api/dsv/v1/customer/deliveries');
  await page.locator('.map-canvas.ready').waitFor({ state: 'visible' });
  await expect(page.locator('.departure-map-marker')).toHaveCount(1);
  await expect(page.getByLabel('차량 목록')).toContainText('서울86바3800');
  await page.getByLabel('차량 목록').getByRole('button', { name: /서울86바3800/ }).click();
  await expect(page.getByLabel('배송지 리스트')).toContainText('G006 Depot Route Clinic');
  await expect(page.getByLabel('배송지 리스트')).not.toContainText('G006 Other Route Clinic');
  await expect.poll(() => page.evaluate(() => {
    const routeSource = window.dsvMap?.getSource('operational-routes');
    const routeData = routeSource && 'serialize' in routeSource ? routeSource.serialize().data : undefined;
    return {
      coordinates: routeData?.features?.[0]?.geometry?.coordinates,
      routeCount: routeData?.features?.length,
    };
  })).toEqual({
    coordinates: [[126.9372235, 37.330948], [126.98, 37.42], [127.036545, 37.500643]],
    routeCount: 1,
  });
  expect(api.unexpected).toEqual([]);
});

test('groups customer deliveries by destination id with shared ETA and deduped markers', async ({ page }) => {
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(customerSession),
    'GET /api/dsv/v1/customer/deliveries': v1Envelope({
      items: [
        {
          sellerOrderId: 'order-g006-same-late',
          sellerOrderKey: 'SELLER-G006-SAME-LATE',
          destinationDisplayName: 'G006 Shared Hospital',
          destinationAddress: '서울특별시 강남구 테헤란로 152, 5층, 5층',
          destinationId: 'destination-g006-shared',
          deliveryStatus: 'DELIVERED',
          etaStatus: 'DELAYED',
          estimatedArrivalAt: '2026-08-03T05:00:00.000Z',
          proofStatus: 'NONE',
          shippedBoxes: 3,
          eventSummary: [{ type: 'STOP_DELIVERED', occurredAt: '2026-08-03T04:15:00.000Z' }],
          latitude: 37.500643,
          longitude: 127.036545,
          vehicleDisplayName: '서울86바3800',
          vehicleId: 'vehicle-g006-shared',
          vehicleLatitude: 37.49,
          vehicleLongitude: 127.02,
        },
        {
          sellerOrderId: 'order-g006-other',
          sellerOrderKey: 'SELLER-G006-OTHER',
          destinationDisplayName: 'G006 Other Clinic',
          destinationAddress: '서울특별시 중구 세종대로 110',
          destinationId: 'destination-g006-other',
          deliveryStatus: 'PLANNED',
          etaStatus: 'READY',
          estimatedArrivalAt: '2026-08-03T04:00:00.000Z',
          proofStatus: 'NONE',
          shippedBoxes: 2,
          eventSummary: [],
          latitude: 37.5663,
          longitude: 126.9779,
          vehicleDisplayName: '서울86바3800',
          vehicleId: 'vehicle-g006-shared',
          vehicleLatitude: 37.49,
          vehicleLongitude: 127.02,
        },
        {
          sellerOrderId: 'order-g006-same-early',
          sellerOrderKey: 'SELLER-G006-SAME-EARLY',
          destinationDisplayName: 'G006 Shared Hospital',
          destinationAddress: '서울특별시 강남구 테헤란로 152, 5층, 5층',
          destinationId: 'destination-g006-shared',
          deliveryStatus: 'DELIVERED',
          etaStatus: 'ON_TIME',
          estimatedArrivalAt: '2026-08-03T03:30:00.000Z',
          proofStatus: 'SIGNED',
          shippedBoxes: 7,
          eventSummary: [{ type: 'STOP_DELIVERED', occurredAt: '2026-08-03T03:40:00.000Z' }],
          latitude: 37.500643,
          longitude: 127.036545,
          vehicleDisplayName: '서울86바3800',
          vehicleId: 'vehicle-g006-shared',
          vehicleLatitude: 37.49,
          vehicleLongitude: 127.02,
        },
      ],
      page: { hasMore: false },
      routes: [{
        vehicleId: 'vehicle-g006-shared',
        coordinates: [[127.02, 37.49], [127.01, 37.51], [126.99, 37.54], [126.9779, 37.5663]],
      }],
    }),
  });

  await page.goto('/customer/delivery-inquiry');

  await waitForApiCall(api, (call) => call.method === 'GET' && call.path === '/api/dsv/v1/customer/deliveries');
  await expect(page.getByLabel('배송지 리스트')).toContainText('2곳');
  const sharedDestination = page.getByRole('button', { name: /G006 Shared Hospital/ });
  const otherDestination = page.getByRole('button', { name: /G006 Other Clinic/ });
  await expect(page.getByLabel('배송지 리스트').locator('.customer-destination-columns')).toContainText('도착 예정');
  await expect(page.getByLabel('배송지 리스트').locator('.customer-destination-columns')).toContainText('실제 도착');
  await expect(sharedDestination).toContainText('G006 Shared Hospital');
  await expect(sharedDestination.getByLabel('배송지 순서 1')).toHaveText('1');
  await expect(sharedDestination).toContainText('12:30');
  await expect(sharedDestination).toContainText('13:15');
  await expect(sharedDestination.locator('.customer-destination-order-count')).toContainText('2건');
  await expect(sharedDestination).not.toContainText('서울특별시 강남구 테헤란로 152, 5층');
  await expect(sharedDestination).not.toContainText('5층, 5층');
  await expect(sharedDestination).toHaveAttribute('aria-expanded', 'false');
  await sharedDestination.click();
  await expect(sharedDestination).toHaveAttribute('aria-expanded', 'true');
  await expect(sharedDestination).toContainText('서울특별시 강남구 테헤란로 152, 5층');
  await expect(sharedDestination).not.toContainText('서울86바3800');
  await expect(page.getByText('SELLER-G006-SAME-EARLY', { exact: true })).toBeVisible();
  await expect(sharedDestination.getByText('DELIVERED', { exact: true })).toHaveCount(2);
  await expect(page.getByText('7박스', { exact: true })).toBeVisible();
  await expect(page.getByText('SELLER-G006-SAME-LATE', { exact: true })).toBeVisible();
  await expect(page.getByText('3박스', { exact: true })).toBeVisible();
  await expect(otherDestination).toContainText('G006 Other Clinic');
  await expect(otherDestination.getByLabel('배송지 순서 2')).toHaveText('2');
  await expect(otherDestination.locator('.customer-destination-order-count')).toContainText('1건');
  expect(await page.getByLabel('배송지 리스트').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.locator('.map-canvas.ready').waitFor({ state: 'visible' });
  await expect.poll(() => page.evaluate(() => {
    const destinationFeatures = window.dsvMap?.querySourceFeatures('operational-destinations') ?? [];
    const routeSource = window.dsvMap?.getSource('operational-routes');
    const routeData = routeSource && 'serialize' in routeSource ? routeSource.serialize().data : undefined;
    return {
      destinationCount: new Set(destinationFeatures.map((feature) => feature.properties?.pointId)).size,
      destinationLabels: [...new Set(destinationFeatures.map((feature) => feature.properties?.label))],
      routeCoordinates: routeData?.features?.[0]?.geometry?.coordinates,
    };
  })).toEqual({
    destinationCount: 2,
    destinationLabels: ['1', '2'],
    routeCoordinates: [[127.02, 37.49], [127.01, 37.51], [126.99, 37.54], [126.9779, 37.5663]],
  });
  await page.getByRole('navigation', { name: '고객사 메뉴' }).getByRole('button', { name: /이력/ }).click();
  await expect(page.getByLabel('배송지 리스트')).toContainText('1곳');
  await expect(page.getByLabel('배송지 리스트')).not.toContainText('G006 Other Clinic');
  await expect.poll(() => page.evaluate(() => {
    const routeSource = window.dsvMap?.getSource('operational-routes');
    const routeData = routeSource && 'serialize' in routeSource ? routeSource.serialize().data : undefined;
    return routeData?.features?.length ?? 0;
  })).toBe(0);
  expect(api.unexpected).toEqual([]);
});

test('blocks remote customer inquiry when query params are present without a session', async ({ page }) => {
  await seedCanonicalSentinels(page);
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Error(401, 'customer session required'),
  });

  await page.goto('/customer/delivery-inquiry?customer=customer-dsv&customerId=customer-dsv&accountId=customer-dsv');

  await expectBlockedStateVisible(page);
  await expectNoDemoVisible(page);
  await expectCanonicalSentinelsUntouched(page);
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/customer/deliveries')).toBe(false);
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/session')).toBe(true);
  expect(api.unexpected).toEqual([]);
});

test('blocks unauthenticated remote admin with no demo-visible content', async ({ page }) => {
  await seedCanonicalSentinels(page);
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Error(401, 'admin session required'),
  });

  await page.goto('/control');

  await expectNoDemoVisible(page);
  await expectCanonicalSentinelsUntouched(page);
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/session')).toBe(true);
  expect(api.unexpected).toEqual([]);
});

test('blocks unauthenticated remote customer with no demo-visible content', async ({ page }) => {
  await seedCanonicalSentinels(page);
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Error(401, 'customer session required'),
  });

  await page.goto('/customer/delivery-inquiry');

  await expectBlockedStateVisible(page);
  await expectNoDemoVisible(page);
  await expectCanonicalSentinelsUntouched(page);
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/session')).toBe(true);
  expect(api.unexpected).toEqual([]);
});

test('runtime 401 clears transport storage and redirects an admin route to login', async ({ page }) => {
  await seedTransportStorage(page);
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/control': v1Envelope(controlSummary),
    'GET /api/dsv/v1/vehicles?limit=100': v1Error(401, 'runtime session expired'),
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({ items: [], page: { hasMore: false } }),
    'GET /api/dsv/v1/dispatches': v1Envelope({ items: [], page: { hasMore: false } }),
  });

  await page.goto('/control');

  await expect(page).toHaveURL(/\/login$/u);
  await expectTransportStorage(page, { csrf: null, token: null });
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/vehicles')).toBe(true);
  expect(api.unexpected).toEqual([]);
});

test('runtime 403 does not clear transport storage or redirect', async ({ page }) => {
  await seedTransportStorage(page);
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/control': v1Error(403, 'control scope denied'),
  });

  await page.goto('/control');

  await expect(page).toHaveURL(/\/control$/u);
  await expect(page.getByRole('alert')).toContainText('control scope denied');
  await expectTransportStorage(page, { csrf: 'stale-csrf-g006', token: 'stale-token-g006' });
  expect(api.unexpected).toEqual([]);
});

test('failed remote login clears stale transport storage', async ({ page }) => {
  await seedTransportStorage(page);
  const api = await installApiFixtures(page, {
    'POST /api/dsv/auth/login': v1Error(401, 'login failed'),
  });

  await page.goto('/login');
  await page.getByLabel('ID').fill('admin-g006');
  await page.getByLabel('Password').fill('bad-password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText('login failed');
  await expectTransportStorage(page, { csrf: null, token: null });
  expect(api.unexpected).toEqual([]);
});

test('remote logout sends CSRF, clears transport storage, and returns to login', async ({ page }) => {
  let logoutCsrf = null;
  const api = await installApiFixtures(page, {
    'POST /api/dsv/auth/login': {
      data: {
        csrfToken: 'current-csrf-g006',
        expiresAt: '2026-07-27T08:37:22.456Z',
        shopDomain: 'dsv-demo.local',
      },
      error: null,
    },
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/control': v1Envelope(controlSummary),
    'GET /api/dsv/v1/vehicles?limit=100': v1Envelope({ items: [], page: { hasMore: false } }),
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({ items: [], page: { hasMore: false } }),
    'GET /api/dsv/v1/dispatches': v1Envelope({ items: [], page: { hasMore: false } }),
    'POST /api/dsv/auth/logout': ({ request }) => {
      logoutCsrf = request.headers()['x-csrf-token'] ?? null;
      return { data: { loggedOut: true }, error: null };
    },
  });

  await page.goto('/login');
  await page.getByLabel('ID').fill('admin-g006');
  await page.getByLabel('Password').fill('correct-password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/control$/u);
  await page.getByRole('button', { name: '사이드바 펼치기' }).click();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();

  await expect(page).toHaveURL(/\/login$/u);
  await expectTransportStorage(page, { csrf: null, token: null });
  expect(logoutCsrf).toBe('current-csrf-g006');
  expect(api.unexpected).toEqual([]);
});

test('notification center renders server alerts, preserves read state, and recovers cancelled orders', async ({ page }) => {
  const sellerOrderId = 'seller-order-notification-recover';
  let notificationReads = 0;
  let recovered = false;
  let recoverBody = null;
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/control': v1Envelope(controlSummary),
    'GET /api/dsv/v1/control/routes': v1Envelope({ routes: [], serviceDate: controlSummary.serviceDate }),
    'GET /api/dsv/v1/vehicles?limit=100': v1Envelope({ items: [], page: { hasMore: false } }),
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({ items: [], page: { hasMore: false } }),
    'GET /api/dsv/v1/dispatches': v1Envelope({ items: [], page: { hasMore: false } }),
    'GET /api/dsv/v1/operational-notifications': () => {
      notificationReads += 1;
      return v1Envelope({
        items: recovered ? [] : [{
          changeRequestId: 'change-request-notification-recover',
          createdAt: '2026-08-06T01:20:00.000Z',
          description: '취소된 주문이 배차 대상에서 제외되었습니다.',
          id: 'notification-cancelled-order-recover',
          kind: 'CANCELLED_ORDER',
          recoverable: true,
          sellerOrderId,
          severity: 'critical',
          title: '취소 주문 확인 필요',
        }],
      }, `g006-notifications-${notificationReads}`);
    },
    [`POST /api/dsv/v1/seller-orders/${sellerOrderId}/recover-unassigned`]: async ({ request }) => {
      recoverBody = await request.postDataJSON();
      recovered = true;
      return v1Envelope({ recovered: true }, 'g006-recover-cancelled-order');
    },
  });

  await page.goto('/control');
  await expect(page.locator('.notification-count')).toHaveText('1');
  await page.getByLabel('알림 열기').click();
  await expect(page.getByText('취소 주문 확인 필요')).toBeVisible();
  await expect(page.getByText('취소된 주문이 배차 대상에서 제외되었습니다.')).toBeVisible();
  await expect(page.getByText('긴급 · 읽지 않음')).toBeVisible();
  await page.getByRole('button', { name: '읽음', exact: true }).click();
  await expect(page.getByText('긴급 · 읽음')).toBeVisible();
  await expect(page.locator('.notification-count')).toBeHidden();
  await page.reload();
  await page.getByLabel('알림 열기').click();
  await expect(page.getByText('긴급 · 읽음')).toBeVisible();

  await page.getByRole('button', { name: '주문 복구' }).click();
  await expect(page.getByText('알림이 없습니다.')).toBeVisible();
  expect(recoverBody).toEqual({ commandId: expect.any(String) });
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/operational-notifications')).toBe(true);
  expect(api.calls.some((call) => call.method === 'POST' && call.path === `/api/dsv/v1/seller-orders/${sellerOrderId}/recover-unassigned`)).toBe(true);
  expect(api.unexpected).toEqual([]);
});

test('rejects legacy resource snapshots and new legacy read-model endpoints outside the bounded allowlist', () => {
  const clientSource = readFileSync(new URL('../../src/api/client.ts', import.meta.url), 'utf8');
  expect(extractAllowlist(clientSource, 'legacyAllowlist')).toEqual([
    'POST auth/login',
    'POST auth/logout',
    'GET auth/session',
    'POST dispatch-imports/preview',
    'POST dispatch-imports',
    'POST dispatch-imports/[^/]+/apply',
    'POST conditions',
    'PATCH conditions/[^/]+',
    'DELETE conditions/[^/]+',
    'GET settings/operations',
    'PATCH settings/operations',
    'POST settings/operations/geocode',
    'GET manual-email',
    'POST manual-email',
    'POST drivers',
    'POST drivers/signup-invite',
    'PATCH drivers/[^/]+',
    'DELETE drivers/[^/]+',
    'POST vehicles',
    'PATCH vehicles/[^/]+',
    'DELETE vehicles/[^/]+',
    'POST vehicles/[^/]+/drivers',
    'DELETE vehicles/[^/]+/drivers/[^/]+',
    'GET control/delivery-stops/[^/]+/context',
  ]);

  const serviceSources = [
    'src/api/config.ts',
    'src/services/auth.ts',
    'src/services/control.ts',
    'src/services/dispatch-imports.ts',
    'src/services/management.ts',
    'src/services/manual-email.ts',
    'src/services/settings.ts',
  ].map((path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')).join('\n');

  expect(serviceSources).not.toMatch(/request(?:Legacy)?Json(?:<[^>]+>)?\(['"`]auth\/session/u);
  expect(serviceSources).not.toMatch(/request(?:Legacy)?Json(?:<[^>]+>)?\(['"`]resources/u);
  expect(serviceSources).not.toMatch(/\/api\/dsv\/v1\/resources/u);
  expect(serviceSources).not.toMatch(/request(?:Legacy)?Json(?:<[^>]+>)?\(['"`](?:control|dispatches|records|customers|destinations)['"`]/u);
});

test('pins the exact normalized G005 v1 read allowlist', () => {
  const clientSource = readFileSync(new URL('../../src/api/client.ts', import.meta.url), 'utf8');
  expect(extractAllowlist(clientSource, 'v1ReadAllowlist')).toEqual([
    'GET session',
    'GET map/profile',
    'GET control',
    'GET control/routes',
    'GET dispatches',
    'GET records',
    'GET drivers',
    'GET vehicles',
    'GET vehicles/[^/]+/temperature-history',
    'GET customers',
    'GET destinations',
    'GET conditions',
    'GET customer/deliveries',
    'GET customers/deliveries',
    'GET operational-notifications',
  ]);

  const readClient = clientSource.match(/export async function requestV1ReadJson[\s\S]*?\n\}/u)?.[0] ?? '';
  expect(readClient.indexOf("assertAllowed('v1 read', target, v1ReadAllowlist)")).toBeGreaterThanOrEqual(0);
  expect(readClient.indexOf("assertAllowed('v1 read', target, v1ReadAllowlist)")).toBeLessThan(readClient.indexOf('fetchJson('));
});

test('keeps the v1 assignment-command legacy envelope exception bounded to the exact method and path allowlist', () => {
  const clientSource = readFileSync(new URL('../../src/api/client.ts', import.meta.url), 'utf8');
  expect(extractAllowlist(clientSource, 'assignmentCommandAllowlist')).toEqual([
    'POST seller-order-assignments/reassign',
    'POST seller-order-assignments/unassign',
    'POST seller-orders/[^/]+/assignment/unassign',
    'POST seller-orders/[^/]+/assignment/reassign',
  ]);
});

test('keeps the strict v1 time-constraint command allowlist exact', () => {
  const clientSource = readFileSync(new URL('../../src/api/client.ts', import.meta.url), 'utf8');
  expect(extractAllowlist(clientSource, 'timeConstraintCommandAllowlist')).toEqual([
    'POST seller-orders/[^/]+/time-constraint/confirm',
    'POST seller-orders/[^/]+/time-constraint/clear',
  ]);
});

test('keeps the strict v1 dispatch operation command allowlist exact', () => {
  const clientSource = readFileSync(new URL('../../src/api/client.ts', import.meta.url), 'utf8');
  expect(extractAllowlist(clientSource, 'dispatchOperationCommandAllowlist')).toEqual([
    'POST seller-orders/[^/]+/active-removal/request',
    'POST seller-orders/[^/]+/messages',
    'POST seller-orders/[^/]+/recover-unassigned',
    'POST dispatch-change-requests/[^/]+/cancel',
  ]);
});

test('unwraps a successful legacy assignment-command envelope', async ({ page }) => {
  const result = await callAssignmentCommand(page, {
    body: { data: { assignmentId: 'assignment-g006' }, error: null },
    path: 'seller-orders/order-g006/assignment/unassign',
    status: 200,
  });

  expect(result).toMatchObject({
    calls: [{ method: 'POST', url: '/api/dsv/v1/seller-orders/order-g006/assignment/unassign' }],
    data: { assignmentId: 'assignment-g006' },
    outcome: 'resolved',
  });
});

test('sends strict v1 time-constraint command payloads without using legacy envelopes', async ({ page }) => {
  const result = await callTimeConstraintCommand(page, {
    body: v1Envelope({
      auditEventId: 'audit-g003',
      commandId: 'command-g003',
      deliveryStopId: '11111111-1111-4111-8111-111111111111',
      rawNote: '오전 11시 배송',
      recalculation: {
        reason: 'SCHEDULER_UNAVAILABLE',
        retryable: true,
        routePlanId: 'route-plan-g003',
        status: 'FAILED_TO_SCHEDULE',
      },
      reviewStatus: 'CONFIRMED',
      routeConstraintStatus: 'PENDING_RECALCULATION',
      sellerOrderId: '22222222-2222-4222-8222-222222222222',
      sellerOrderKey: '2018330248',
      timeConstraint: {
        auditEventId: 'audit-g003',
        confirmedAt: '2026-08-03T09:47:08.000Z',
        status: 'CONFIRMED',
        timeWindowEnd: '11:00',
        timeWindowStart: '10:30',
      },
    }, 'g003-command'),
    json: {
      commandId: 'command-g003',
      deliveryStopId: '11111111-1111-4111-8111-111111111111',
      expectedVersion: 'route-version-g003',
      timeWindowEnd: '11:00',
      timeWindowStart: '10:30',
    },
    path: 'seller-orders/22222222-2222-4222-8222-222222222222/time-constraint/confirm',
    status: 200,
  });

  expect(result).toMatchObject({
    calls: [{
      body: {
        commandId: 'command-g003',
        deliveryStopId: '11111111-1111-4111-8111-111111111111',
        expectedVersion: 'route-version-g003',
        timeWindowEnd: '11:00',
        timeWindowStart: '10:30',
      },
      method: 'POST',
      url: '/api/dsv/v1/seller-orders/22222222-2222-4222-8222-222222222222/time-constraint/confirm',
    }],
    data: {
      rawNote: '오전 11시 배송',
      recalculation: { retryable: true, status: 'FAILED_TO_SCHEDULE' },
      reviewStatus: 'CONFIRMED',
      routeConstraintStatus: 'PENDING_RECALCULATION',
    },
    outcome: 'resolved',
  });
});

test('accepts an active-route time constraint that is pending driver acknowledgement', async ({ page }) => {
  const commandBodies = [];
  const dispatchItems = g003DispatchRows().map((row) => row.sellerOrderKey === '2018330248'
    ? {
        ...row,
        assignmentStatus: 'ASSIGNED',
        driverId: 'driver-active-route',
        operationStatus: 'IN_PROGRESS',
        routeVersionId: 'route-version-active-route',
        vehicleId: 'vehicle-active-route',
      }
    : row);
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(g003AdminSession),
    'GET /api/dsv/v1/dispatches': v1Envelope({ items: dispatchItems, page: { hasMore: false } }),
    'GET /api/dsv/v1/drivers?limit=100': emptyV1List(),
    'GET /api/dsv/v1/vehicles?limit=100': emptyV1List(),
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({
      items: [{ customerId: 'customer-g003', displayName: 'DSV-HEALTH', orderCount: 2, status: 'ACTIVE' }],
      page: { hasMore: false },
    }),
    'GET /api/dsv/v1/destinations?limit=100': v1Envelope({
      items: [
        { address: '서울특별시 강남구 테헤란로 152', destinationId: 'destination-g003-a', displayName: '같은 주소 배송처 A' },
        { address: '서울특별시 강남구 테헤란로 152', destinationId: 'destination-g003-b', displayName: '같은 주소 배송처 B' },
      ],
      page: { hasMore: false },
    }),
    'POST /api/dsv/v1/seller-orders/22222222-2222-4222-8222-222222222222/time-constraint/confirm': ({ request }) => {
      const body = JSON.parse(request.postData() ?? '{}');
      commandBodies.push(body);
      expect(body).toMatchObject({
        deliveryStopId: '11111111-1111-4111-8111-111111111111',
        expectedVersion: 'route-version-active-route',
        timeWindowEnd: '11:00',
        timeWindowStart: '10:30',
      });
      expect(body.commandId).toMatch(/^[0-9a-f-]{36}$/u);
      return v1Envelope({
        auditEventId: 'audit-active-route',
        changeRequestId: 'change-request-active-route',
        commandId: body.commandId,
        deliveryStopId: body.deliveryStopId,
        rawNote: '오전 11시 배송',
        recalculation: {
          reason: 'ACTIVE_ROUTE_PENDING_DRIVER_ACK',
          retryable: false,
          routePlanId: 'route-plan-active-route',
          status: 'PENDING_DRIVER_ACK',
        },
        reviewStatus: 'CONFIRMED',
        routeConstraintStatus: 'PENDING_RECALCULATION',
        sellerOrderId: '22222222-2222-4222-8222-222222222222',
        sellerOrderKey: '2018330248',
        timeConstraint: {
          auditEventId: 'audit-active-route',
          confirmedAt: '2026-08-03T09:47:08.000Z',
          status: 'CONFIRMED',
          timeWindowEnd: '11:00',
          timeWindowStart: '10:30',
        },
      }, 'active-route-command');
    },
  });

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '목록', exact: true }).click();
  const targetRow = page.locator('.dispatch-order-table tbody tr').filter({ hasText: '2018330248' });
  await targetRow.getByRole('button', { name: '같은 주소 배송처 A 작업' }).click();
  await page.getByLabel('시간 제약 시작').fill('10:30');
  await page.getByLabel('시간 제약 종료').fill('11:00');
  await page.getByRole('button', { name: '확정', exact: true }).click();

  await expect.poll(() => commandBodies.length).toBe(1);
  await expect(page.getByText('응답 형식이 올바르지 않습니다.', { exact: false })).toHaveCount(0);
  await expect(targetRow).toContainText('2018330248');
  expect(api.unexpected).toEqual([]);
});

test('preserves strict v1 409 time-constraint errors', async ({ page }) => {
  const result = await callTimeConstraintCommand(page, {
    body: {
      error: {
        code: 'SELLER_ORDER_ASSIGNMENT_CHANGED',
        message: 'SELLER_ORDER_ASSIGNMENT_CHANGED',
        requestId: 'g003-conflict',
      },
    },
    json: {
      commandId: 'command-g003',
      deliveryStopId: '11111111-1111-4111-8111-111111111111',
      expectedVersion: 'UNASSIGNED',
    },
    path: 'seller-orders/22222222-2222-4222-8222-222222222222/time-constraint/clear',
    status: 409,
  });

  expect(result).toMatchObject({
    message: 'SELLER_ORDER_ASSIGNMENT_CHANGED',
    outcome: 'rejected',
    status: 409,
  });
});

test('shows raw special instructions as preview-only 미확인 rows during upload', async ({ page }) => {
  const csv = [
    'driver,vehicle,배송처,condition,shippedbox,주소,customer,SellerOrderKey,특이사항,latitude,longitude',
    '김도윤,21사 6101,같은 주소 배송처 A,Cold,4,서울특별시 강남구 테헤란로 152,DSV-HEALTH,2018330248,오전 11시 배송,37.500643,127.036545',
    '김도윤,21사 6101,같은 주소 배송처 B,Cold,2,서울특별시 강남구 테헤란로 152,DSV-HEALTH,2018330247,,37.500643,127.036545',
  ].join('\n');
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(g003AdminSession),
    'GET /api/dsv/v1/dispatches': v1Envelope({ items: [], page: { hasMore: false } }),
    'GET /api/dsv/v1/drivers?limit=100': emptyV1List(),
    'GET /api/dsv/v1/vehicles?limit=100': emptyV1List(),
    'GET /api/dsv/v1/customers?limit=100': emptyV1List(),
    'GET /api/dsv/v1/destinations?limit=100': emptyV1List(),
    'POST /api/dsv/dispatch-imports/preview': ({ request }) => {
      const payload = JSON.parse(request.postData() ?? '{}');
      expect(payload.rows[0].notes).toBe('오전 11시 배송');
      expect(payload.rows[1].notes).toBeNull();
      return {
        data: {
          canCommit: true,
          conditionCandidates: [],
          fileName: 'g003-upload.csv',
          planDate: payload.planDate,
          rows: payload.rows.map((row) => ({
            ...row,
            driverId: null,
            issues: [],
            status: 'READY',
            vehicleId: null,
          })),
          summary: { errorRows: 0, readyRows: 2, reviewRows: 0, totalRows: 2 },
        },
        error: null,
      };
    },
  });

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({ buffer: Buffer.from(csv), mimeType: 'text/csv', name: 'g003-upload.csv' });

  const notePreview = page.getByLabel('특이사항 미리보기');
  await expect(notePreview).toContainText('2018330248');
  await expect(notePreview).toContainText('오전 11시 배송');
  await expect(notePreview).toContainText('미확인');
  await expect(notePreview).not.toContainText('2018330247');
  await expect(notePreview.getByRole('button')).toHaveCount(0);
  expect(api.unexpected).toEqual([]);
});

test('confirms and clears selected dispatch time constraints with exact IDs and expectedVersion', async ({ page }) => {
  const commandBodies = [];
  let dispatchItems = g003DispatchRows();
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(g003AdminSession),
    'GET /api/dsv/v1/dispatches': () => v1Envelope({ items: dispatchItems, page: { hasMore: false } }),
    'GET /api/dsv/v1/drivers?limit=100': emptyV1List(),
    'GET /api/dsv/v1/vehicles?limit=100': emptyV1List(),
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({
      items: [{ customerId: 'customer-g003', displayName: 'DSV-HEALTH', orderCount: 2, status: 'ACTIVE' }],
      page: { hasMore: false },
    }),
    'GET /api/dsv/v1/destinations?limit=100': v1Envelope({
      items: [
        { address: '서울특별시 강남구 테헤란로 152', destinationId: 'destination-g003-a', displayName: '같은 주소 배송처 A' },
        { address: '서울특별시 강남구 테헤란로 152', destinationId: 'destination-g003-b', displayName: '같은 주소 배송처 B' },
      ],
      page: { hasMore: false },
    }),
    'POST /api/dsv/v1/seller-orders/22222222-2222-4222-8222-222222222222/time-constraint/confirm': ({ request }) => {
      const body = JSON.parse(request.postData() ?? '{}');
      commandBodies.push({ action: 'confirm', body });
      expect(body).toMatchObject({
        deliveryStopId: '11111111-1111-4111-8111-111111111111',
        expectedVersion: 'UNASSIGNED',
        timeWindowEnd: '11:00',
        timeWindowStart: '10:30',
      });
      expect(body.commandId).toMatch(/^[0-9a-f-]{36}$/u);
      dispatchItems = dispatchItems.map((row) => row.sellerOrderId === '22222222-2222-4222-8222-222222222222'
        ? {
            ...row,
            reviewStatus: 'CONFIRMED',
            routeConstraintStatus: 'NOT_EVALUATED',
            timeConstraint: {
              auditEventId: 'audit-g003-confirm',
              confirmedAt: '2026-08-03T09:47:08.000Z',
              status: 'CONFIRMED',
              timeWindowEnd: '11:00',
              timeWindowStart: '10:30',
            },
          }
        : row);
      return v1Envelope({
        auditEventId: 'audit-g003-confirm',
        commandId: body.commandId,
        deliveryStopId: body.deliveryStopId,
        rawNote: '오전 11시 배송',
        recalculation: { reason: 'UNASSIGNED_ORDER', retryable: false, routePlanId: null, status: 'NOT_REQUIRED' },
        reviewStatus: 'CONFIRMED',
        routeConstraintStatus: 'NOT_EVALUATED',
        sellerOrderId: '22222222-2222-4222-8222-222222222222',
        sellerOrderKey: '2018330248',
        timeConstraint: {
          auditEventId: 'audit-g003-confirm',
          confirmedAt: '2026-08-03T09:47:08.000Z',
          status: 'CONFIRMED',
          timeWindowEnd: '11:00',
          timeWindowStart: '10:30',
        },
      });
    },
    'POST /api/dsv/v1/seller-orders/22222222-2222-4222-8222-222222222222/time-constraint/clear': ({ request }) => {
      const body = JSON.parse(request.postData() ?? '{}');
      commandBodies.push({ action: 'clear', body });
      expect(body).toMatchObject({
        deliveryStopId: '11111111-1111-4111-8111-111111111111',
        expectedVersion: 'UNASSIGNED',
        reason: '관리자 시간 제약 해제',
      });
      expect(body.commandId).toMatch(/^[0-9a-f-]{36}$/u);
      dispatchItems = dispatchItems.map((row) => row.sellerOrderId === '22222222-2222-4222-8222-222222222222'
        ? {
            ...row,
            reviewStatus: 'CLEARED',
            routeConstraintStatus: 'NOT_APPLICABLE',
            timeConstraint: null,
          }
        : row);
      return v1Envelope({
        auditEventId: 'audit-g003-clear',
        clearedAt: '2026-08-03T09:50:00.000Z',
        commandId: body.commandId,
        deliveryStopId: body.deliveryStopId,
        rawNote: '오전 11시 배송',
        recalculation: { reason: 'TIME_CONSTRAINT_CLEARED', retryable: false, routePlanId: null, status: 'NOT_REQUIRED' },
        reviewStatus: 'CLEARED',
        routeConstraintStatus: 'NOT_APPLICABLE',
        sellerOrderId: '22222222-2222-4222-8222-222222222222',
        sellerOrderKey: '2018330248',
        timeConstraint: null,
      });
    },
  });

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '목록', exact: true }).click();
  const targetRow = page.locator('.dispatch-order-table tbody tr').filter({ hasText: '2018330248' });
  const rowAction = targetRow.getByRole('button', { name: '같은 주소 배송처 A 작업' });
  await rowAction.click();

  const instruction = page.getByRole('menu');
  await expect(instruction).toContainText('오전 11시 배송');
  await expect(instruction).toContainText('미확인');
  const dispatchRows = page.locator('.dispatch-order-table tbody');
  await expect(dispatchRows).toContainText('2018330247');
  await expect(dispatchRows.locator('tr').filter({ hasText: '2018330247' })).not.toContainText('미확인');

  const startInput = page.getByLabel('시간 제약 시작');
  const endInput = page.getByLabel('시간 제약 종료');
  const confirmButton = page.getByRole('button', { name: '확정', exact: true });
  const clearButton = instruction.getByRole('button', { name: '해제', exact: true });
  await expect(startInput).toBeEnabled();
  await expect(endInput).toBeEnabled();
  await expect(confirmButton).toBeEnabled();
  await expect(clearButton).toBeEnabled();

  await startInput.fill('11:00');
  await endInput.fill('10:30');
  await confirmButton.click();
  await expect(instruction.getByRole('alert')).toContainText('시작 시간을 종료 시간보다 빠르게');
  expect(commandBodies).toEqual([]);

  await startInput.fill('10:30');
  await endInput.fill('11:00');
  await confirmButton.click();
  await expect(dispatchRows.locator('tr').filter({ hasText: '2018330248' })).toContainText('확정');
  await expect(rowAction).toHaveAttribute('aria-expanded', 'false');
  await rowAction.click();
  const refreshedInstruction = page.getByRole('menu');
  await expect(refreshedInstruction).toBeVisible();
  const refreshedClearButton = refreshedInstruction.getByRole('button', { name: '해제', exact: true });
  await expect(refreshedClearButton).toBeEnabled();
  await refreshedClearButton.click();
  await expect(dispatchRows.locator('tr').filter({ hasText: '2018330248' })).not.toContainText('확정');

  expect(commandBodies.map((entry) => entry.action)).toEqual(['confirm', 'clear']);
  expect(commandBodies.map((entry) => entry.body.deliveryStopId)).toEqual([
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
  ]);
  expect(commandBodies.every((entry) => entry.body.deliveryStopId !== '22222222-2222-4222-8222-222222222222')).toBe(true);
  expect(api.unexpected).toEqual([]);
});

test('preserves HTTP status and error message from a legacy assignment-command error', async ({ page }) => {
  const result = await callAssignmentCommand(page, {
    body: { data: null, error: { code: 'ASSIGNMENT_CONFLICT', message: 'seller order is already assigned' } },
    path: 'seller-orders/order-g006/assignment/reassign',
    status: 409,
  });

  expect(result).toMatchObject({
    calls: [{ method: 'POST', url: '/api/dsv/v1/seller-orders/order-g006/assignment/reassign' }],
    message: 'seller order is already assigned',
    outcome: 'rejected',
    status: 409,
  });
});

test('rejects malformed assignment-command envelopes as 502 contract failures', async ({ page }) => {
  const result = await callAssignmentCommand(page, {
    body: { data: { assignmentId: 'must-not-pass-through' } },
    path: 'seller-orders/order-g006/assignment/unassign',
    status: 200,
  });

  expect(result).toMatchObject({
    message: 'v1 배정 명령 API 응답 형식이 올바르지 않습니다.',
    outcome: 'rejected',
    status: 502,
  });
});

test('rejects a legacy non-2xx envelope on a v1 read as a 502 contract failure', async ({ page }) => {
  const leakedMessage = 'legacy v1 error must not pass through';
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/control': {
      body: { data: null, error: { code: 'LEGACY_ERROR', message: leakedMessage } },
      status: 500,
    },
  });

  await page.goto('/control');

  await expect(page.getByRole('alert')).toContainText('API v1 오류 응답 형식이 올바르지 않습니다.');
  await expect(page.getByRole('alert')).not.toContainText(leakedMessage);
  expect(api.unexpected).toEqual([]);
});

test('rejects extra fields in a non-2xx v1 error as a 502 contract failure', async ({ page }) => {
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/control': {
      body: {
        error: { code: 'CONTROL_FAILED', message: 'must not pass through', requestId: 'g006-malformed-error' },
        requestId: 'legacy-top-level-request-id',
      },
      status: 500,
    },
  });

  await page.goto('/control');

  await expect(page.getByRole('alert')).toContainText('API v1 오류 응답 형식이 올바르지 않습니다.');
  await expect(page.getByRole('alert')).not.toContainText('must not pass through');
  expect(api.unexpected).toEqual([]);
});

test('accepts documented details on a strict non-2xx v1 error', async ({ page }) => {
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/control': {
      body: {
        error: {
          code: 'CONTROL_CONFLICT',
          details: { activeDispatchId: 'dispatch-g006', retryable: false },
          message: 'control details error',
          requestId: 'g006-error-details',
        },
      },
      status: 409,
    },
  });

  await page.goto('/control');

  await expect(page.getByRole('alert')).toContainText('control details error');
  await expect(page.getByRole('alert')).not.toContainText('API v1 오류 응답 형식이 올바르지 않습니다.');
  expect(api.unexpected).toEqual([]);
});

test('rejects non-string required values in a strict non-2xx v1 error', async ({ page }) => {
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/control': {
      body: {
        error: {
          code: 'CONTROL_FAILED',
          details: { retryable: true },
          message: 'must not pass through',
          requestId: 42,
        },
      },
      status: 500,
    },
  });

  await page.goto('/control');

  await expect(page.getByRole('alert')).toContainText('API v1 오류 응답 형식이 올바르지 않습니다.');
  await expect(page.getByRole('alert')).not.toContainText('must not pass through');
  expect(api.unexpected).toEqual([]);
});

test('leaves canonical localStorage sentinel keys untouched during remote read failures', async ({ page }) => {
  await seedCanonicalSentinels(page);
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/control': v1Error(500, 'control read failed'),
  });

  await page.goto('/control');

  await expectNoDemoVisible(page);
  await expectCanonicalSentinelsUntouched(page);
  await waitForApiCall(api, (call) => call.method === 'GET' && call.path === '/api/dsv/v1/control');
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/control')).toBe(true);
  expect(api.unexpected).toEqual([]);
});

test('never renders concrete demo identifiers or demo-prefixed map sources in blocked remote states', async ({ page }) => {
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Error(403, 'blocked'),
  });

  await page.goto('/control');

  await expectNoDemoVisible(page);
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/session')).toBe(true);
  expect(api.unexpected).toEqual([]);
});
