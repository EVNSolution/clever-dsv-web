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
  csrfToken: 'g006-admin-csrf',
  principalType: 'DSV_ADMIN',
  shopId: 'shop-g006',
  scopes: ['dsv:session:read', 'dsv:control:read'],
};
const customerSession = {
  csrfToken: 'g006-customer-csrf',
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

async function installApiFixtures(page, fixtures) {
  const calls = [];
  const unexpected = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const call = { method: request.method(), path: url.pathname, search: url.search };
    calls.push(call);
    const key = `${call.method} ${call.path}`;
    const fixture = fixtures[key] ?? fixtures[`${call.method} ${call.path}${call.search}`];
    if (fixture === undefined) {
      unexpected.push(call);
      await route.fulfill({
        contentType: 'application/json',
        status: 599,
        body: JSON.stringify({ error: { code: 'UNFIXTURED_API_CALL', message: key, requestId: 'g006-unfixture' } }),
      });
      return;
    }
    const resolved = typeof fixture === 'function' ? fixture({ request, url, call }) : fixture;
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
    .replace("import { apiConfig } from './config';", "const apiConfig = { legacyBaseUrl: '/api/dsv', v1BaseUrl: '/api/dsv/v1' };");
  return transpileModule(source, {
    compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
  }).outputText;
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

test('mandatory G006 boundary scenarios are not skipped in this spec', () => {
  const source = readFileSync(new URL(import.meta.url), 'utf8');
  for (const token of ['test' + '.skip', 'describe' + '.skip', '.skip' + '(']) {
    expect(source).not.toContain(token);
  }
});

test('accepts a valid admin session only through the strict v1 session envelope', async ({ page }) => {
  const api = await installApiFixtures(page, {
    'GET /api/dsv/v1/session': v1Envelope(adminSession),
    'GET /api/dsv/v1/control': v1Envelope(controlSummary),
    'GET /api/dsv/v1/vehicles?limit=100': v1Envelope({
      items: [{
        displayName: 'Canonical Refrigerated Truck',
        driverAssignments: [],
        status: 'ACTIVE',
        vehicleId: 'vehicle-g006-control',
        vehiclePlate: '99테 6006',
      }],
      page: { hasMore: false },
    }),
    'GET /api/dsv/v1/customers?limit=100': v1Envelope({
      items: [{ customerId: 'customer-g006-control', displayName: 'Canonical Manufacturer', status: 'ACTIVE' }],
      page: { hasMore: false },
    }),
    'GET /api/dsv/v1/dispatches': v1Envelope({ items: [], page: { hasMore: false } }),
  });

  await page.goto('/control');

  await expect(page.getByLabel('관리자 세션 확인')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '관제', exact: true })).toBeVisible();
  await waitForApiCall(api, (call) => call.method === 'GET' && call.path === '/api/dsv/v1/control');
  await expect(page.getByLabel('지원되는 관제 요약')).toContainText(controlSummary.serviceDate);
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.getByLabel('예정 차량 리스트')).toContainText('99테 6006');
  await expect(page.getByLabel('제조사별 주문 리스트')).toBeVisible();
  expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/dsv/v1/session')).toBe(true);
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
            sellerOrderKey: 'SELLER-G006-AUTHORIZED',
            destinationDisplayName: 'G006 Authorized Clinic',
            deliveryStatus: 'IN_TRANSIT',
            etaStatus: 'ON_TIME',
            estimatedArrivalAt: '2026-07-23T06:30:00.000Z',
            proofStatus: 'NONE',
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
  await expect(page.getByText('SELLER-G006-AUTHORIZED', { exact: true }).first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/forged-customer|forged-account/u);
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

test('rejects legacy resource snapshots and new legacy read-model endpoints outside the bounded allowlist', () => {
  const clientSource = readFileSync(new URL('../../src/api/client.ts', import.meta.url), 'utf8');
  expect(extractAllowlist(clientSource, 'legacyAllowlist')).toEqual([
    'POST auth/login',
    'POST dispatch-imports/preview',
    'POST dispatch-imports',
    'POST conditions',
    'GET settings/operations',
    'PATCH settings/operations',
    'POST drivers',
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
    'GET control',
    'GET dispatches',
    'GET records',
    'GET drivers',
    'GET vehicles',
    'GET customers',
    'GET destinations',
    'GET conditions',
    'GET customer/deliveries',
  ]);

  const readClient = clientSource.match(/export async function requestV1ReadJson[\s\S]*?\n\}/u)?.[0] ?? '';
  expect(readClient.indexOf("assertAllowed('v1 read', target, v1ReadAllowlist)")).toBeGreaterThanOrEqual(0);
  expect(readClient.indexOf("assertAllowed('v1 read', target, v1ReadAllowlist)")).toBeLessThan(readClient.indexOf('fetchJson('));
});

test('keeps the v1 assignment-command legacy envelope exception bounded to the exact method and path allowlist', () => {
  const clientSource = readFileSync(new URL('../../src/api/client.ts', import.meta.url), 'utf8');
  expect(extractAllowlist(clientSource, 'assignmentCommandAllowlist')).toEqual([
    'POST seller-orders/[^/]+/assignment/unassign',
    'POST seller-orders/[^/]+/assignment/reassign',
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
