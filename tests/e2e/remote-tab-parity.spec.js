import { test, expect } from '@playwright/test';

const v1Meta = { apiVersion: 'dsv.v1' };
const adminSession = {
  csrfToken: 'g006-admin-csrf',
  principalType: 'DSV_ADMIN',
  shopId: 'shop-g006-parity',
  scopes: [
    'dsv:session:read',
    'dsv:dispatches:read',
    'dsv:records:read',
    'dsv:resources:read',
    'dsv:customers:read',
    'dsv:destinations:read',
    'dsv:conditions:read',
  ],
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
  const calls = [];
  const unexpected = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}${url.search}`;
    const call = { key, method: request.method(), path: url.pathname, search: url.search };
    calls.push(call);
    if (!Object.hasOwn(fixtures, key)) {
      unexpected.push(call);
      await route.fulfill({
        contentType: 'application/json',
        status: 599,
        body: JSON.stringify({ error: { code: 'UNFIXTURED_API_CALL', message: key, requestId: 'g006-parity-unfixture' } }),
      });
      return;
    }
    const fixture = fixtures[key];
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
      items: [{ displayName: 'Canonical Driver G006', driverId: 'driver-g006', phone: '010-0000-6006', status: 'ACTIVE' }],
    }, 'g006-drivers'),
    'GET /api/dsv/v1/vehicles?limit=100': v1Envelope({
      items: [{
        displayName: 'Canonical Refrigerated Truck',
        driverAssignments: [{ assignmentId: 'assignment-g006', driverId: 'driver-g006' }],
        status: 'ACTIVE',
        vehicleId: 'vehicle-g006',
        vehiclePlate: '99테 6006',
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
test('dispatch success renders the canonical v1 seller-order summary without concrete demo data', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/v1/dispatches': v1Envelope({
      items: [{
        assignmentStatus: 'ASSIGNED',
        customerId: 'customer-g006',
        destinationId: 'destination-g006',
        estimatedArrivalAt: '2026-07-23T08:30:00.000Z',
        etaStatus: 'READY',
        routePlanId: 'route-plan-g006',
        routeVersionId: 'route-version-g006',
        sellerOrderId: 'seller-order-g006',
        sellerOrderKey: 'SELLER-G006-DISPATCH',
      }],
      page: { hasMore: false },
    }, 'g006-dispatch-success'),
  })));

  await page.goto('/dispatch');

  const dispatchRow = page.getByRole('row').filter({ hasText: 'SELLER-G006-DISPATCH' });
  await expect(dispatchRow).toBeVisible();
  await expect(dispatchRow).toContainText('도착 예정');
  await expect(page.getByLabel('배송 일정')).toBeVisible();
  await expect(page.getByLabel('배송 상세')).toBeVisible();
  await expect(page.getByLabel('운영 시간 편집')).toBeVisible();
  await expect(page.getByLabel('출발 시간')).toHaveValue('08:45');
  await expectNoConcreteDemo(page);
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

test('dispatch uses the operating default when remote operational settings are incomplete', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures(dispatchFixtures({
    'GET /api/dsv/settings/operations': legacyEnvelope({ loadingStartTime: '07:15' }),
    'GET /api/dsv/v1/dispatches': dispatchPageFixture(),
  })));

  await page.goto('/dispatch');

  await expect(page.getByLabel('운영 시간 편집')).toBeVisible();
  await expect(page.getByLabel('출발 시간')).toHaveValue('08:30');
  await expect(page.getByText('unavailable')).toHaveCount(0);
  await expectNoConcreteDemo(page);
  expectOnlyFixtureCalls(api);
});

test('records success renders canonical v1 record fields', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/v1/records': v1Envelope({
      items: [{
        sellerOrderKey: 'SELLER-G006-RECORD',
        destinationDisplayName: 'Canonical Record Destination',
        deliveryStatus: 'DELIVERED',
        etaStatus: 'READY',
        estimatedArrivalAt: '2026-07-23T07:45:00.000Z',
        proofStatus: 'AVAILABLE',
        eventSummary: [{ type: 'STOP_DELIVERED', occurredAt: '2026-07-23T07:44:00.000Z' }],
      }],
      page: { hasMore: false },
    }, 'g006-records-success'),
  }));

  await page.goto('/records');

  await expect(page.getByText('SELLER-G006-RECORD', { exact: true })).toBeVisible();
  await expect(page.getByText('Canonical Record Destination', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('AVAILABLE', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('STOP_DELIVERED', { exact: true })).toBeVisible();
  await expectNoConcreteDemo(page);
  expectOnlyFixtureCalls(api);
});

test('records read failure is visible without demo fallback', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/v1/records': v1Error(500, 'records read failed'),
  }));

  await page.goto('/records');

  await expect(page.getByRole('alert').filter({ hasText: 'records read failed' })).toBeVisible();
  await expectNoConcreteDemo(page);
  expectOnlyFixtureCalls(api);
});

test('management success renders all five canonical v1 lists', async ({ page }) => {
  const api = await installApiFixtures(page, adminFixtures(managementListFixtures()));

  await page.goto('/master-data');

  await expect(page.getByText('Canonical Driver G006', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '배송원 수정', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '차량', exact: true }).click();
  await expect(page.getByText('99테 6006', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '차량 수정', exact: true })).toBeDisabled();
  const vehicleRow = page.getByLabel('차량 리스트').getByRole('row').filter({ hasText: '99테 6006' });
  await expect(vehicleRow.locator('td').nth(1)).toHaveText('Canonical Refrigerated Truck');
  await expect(vehicleRow.locator('td').nth(2)).toHaveText('미제공');
  const assignment = page.getByLabel('배송원 배정');
  await expect(assignment.getByRole('row').filter({ hasText: 'Canonical Driver G006' })).toBeVisible();
  await page.getByRole('button', { name: '고객사', exact: true }).click();
  await expect(page.getByText('Canonical Customer G006', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Canonical Destination G006', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '운송조건', exact: true }).click();
  await expect(page.getByText('냉장 운송', { exact: true }).first()).toBeVisible();
  const conditionRow = page.locator('.master-condition-grid tbody tr').filter({ hasText: '냉장 운송' });
  await expect(conditionRow.locator('td')).toHaveText(['COLD', '냉장 운송', '냉장 상태를 유지하여 운송합니다.']);
  expectOnlyFixtureCalls(api);
});

test('management assignment mutations render only refetched v1 vehicle assignments', async ({ page }) => {
  let assigned = false;
  const api = await installApiFixtures(page, adminFixtures(managementListFixtures({
    'GET /api/dsv/v1/vehicles?limit=100': () => v1Envelope({
      items: [{
        displayName: 'Canonical Refrigerated Truck',
        driverAssignments: assigned ? [{ assignmentId: 'assignment-v1-g006', driverId: 'driver-g006' }] : [],
        status: 'ACTIVE',
        vehicleId: 'vehicle-g006',
        vehiclePlate: '99테 6006',
      }],
      page: { hasMore: false },
    }, 'g006-vehicles-refetch'),
    'POST /api/dsv/vehicles/vehicle-g006/drivers': () => {
      assigned = true;
      return legacyEnvelope({ assignmentId: 'legacy-command-response-g006' });
    },
    'DELETE /api/dsv/vehicles/vehicle-g006/drivers/assignment-v1-g006': () => {
      assigned = false;
      return legacyEnvelope({ assignmentId: 'assignment-v1-g006' });
    },
  })));

  await page.goto('/master-data');
  await page.getByRole('button', { name: '차량', exact: true }).click();
  const assignment = page.getByLabel('배송원 배정');
  await expect(assignment.getByText('배정된 배송원이 없습니다.', { exact: true })).toBeVisible();

  await assignment.getByLabel('배송원 선택').selectOption('driver-g006');
  await assignment.getByRole('button', { name: '배정', exact: true }).click();
  const assignmentRow = assignment.getByRole('row').filter({ hasText: 'Canonical Driver G006' });
  await expect(assignmentRow).toBeVisible();
  expect(api.calls.some((call) => call.key === 'POST /api/dsv/vehicles/vehicle-g006/drivers')).toBe(true);

  await assignment.getByRole('button', { name: 'Canonical Driver G006 배정 해제', exact: true }).click();
  await expect(assignmentRow).toHaveCount(0);
  expect(api.calls.some((call) => call.key === 'DELETE /api/dsv/vehicles/vehicle-g006/drivers/assignment-v1-g006')).toBe(true);
  expect(api.calls.some((call) => call.key.includes('legacy-command-response-g006'))).toBe(false);
  await expect.poll(() => api.calls.filter((call) => call.key === 'GET /api/dsv/v1/vehicles?limit=100').length).toBe(3);
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

test('failed remote driver creation leaves the management sentinel untouched', async ({ page }) => {
  const key = 'clever.management.data.v1';
  const sentinel = 'g006-management-mutation-sentinel';
  await seedSentinel(page, key, sentinel);
  const api = await installApiFixtures(page, adminFixtures({
    ...managementListFixtures(),
    'POST /api/dsv/drivers': legacyError(500, 'driver mutation failed'),
  }));
  let dialogMessage = '';
  page.once('dialog', (dialog) => {
    dialogMessage = dialog.message();
    void dialog.dismiss();
  });

  await page.goto('/master-data');
  await expect(page.getByText('Canonical Driver G006', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '배송원 등록', exact: true }).click();
  const form = page.getByLabel('배송원 편집');
  await form.getByLabel('이름').fill('Failed Driver G006');
  await form.getByLabel('경력').fill('Canonical mutation test');
  await form.getByLabel('담당 권역').fill('Seoul');
  await form.getByRole('button', { name: '저장', exact: true }).click();

  await expect.poll(() => dialogMessage).toContain('driver mutation failed');
  await expect(form).toBeVisible();
  await expectSentinel(page, key, sentinel);
  expect(api.calls.some((call) => call.key === 'POST /api/dsv/drivers')).toBe(true);
  expectOnlyFixtureCalls(api);
});

test('settings GET and PATCH use the exact bounded legacy path', async ({ page }) => {
  const key = 'clever.admin.settings';
  const sentinel = 'g006-settings-success-sentinel';
  await seedSentinel(page, key, sentinel);
  let sessionReadCount = 0;
  let patchBody;
  const patchCsrfTokens = [];
  const api = await installApiFixtures(page, adminFixtures({
    'GET /api/dsv/v1/session': () => {
      sessionReadCount += 1;
      return v1Envelope({
        ...adminSession,
        csrfToken: sessionReadCount === 1 ? 'g006-stale-csrf' : 'g006-current-csrf',
      }, `g006-parity-session-${sessionReadCount}`);
    },
    'GET /api/dsv/settings/operations': legacyEnvelope(operationSettings({ loadingStartTime: '07:15', plannedDepartureTime: '08:45' })),
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
      return legacyEnvelope(operationSettings({ loadingStartTime: '07:30', plannedDepartureTime: '09:00' }));
    },
  }));

  await page.goto('/settings');
  await expect(page.getByLabel('준비 시작 시간')).toHaveValue('07:15');
  await expect(page.getByLabel('출발 예정 시간')).toHaveValue('08:45');
  await expect(page.getByLabel('특장 온도 상한')).toHaveValue('8');
  await expect(page.getByLabel('ETA 지연 알림')).toHaveValue('10');
  await expect(page.getByLabel('GPS 미수신 알림')).toHaveValue('30');
  await expect(page.getByLabel('도착 후 대기시간')).toHaveValue('5');
  await expect(page.getByText('원격 설정')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '초기화', exact: true })).toBeVisible();
  await page.getByLabel('준비 시작 시간').fill('07:30');
  await page.getByLabel('출발 예정 시간').fill('09:00');
  await page.getByRole('button', { name: '저장', exact: true }).click();

  await expect(page.getByRole('status').filter({ hasText: '설정을 저장했습니다.' })).toBeVisible();
  expect(patchBody).toEqual(operationSettings({ loadingStartTime: '07:30', plannedDepartureTime: '09:00' }));
  expect(patchCsrfTokens).toEqual(['g006-stale-csrf', 'g006-current-csrf']);
  expect(sessionReadCount).toBe(2);
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
  await expect(page.getByRole('button', { name: '사전 검사', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '사전 검사', exact: true }).click();

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
  await expect(page.getByRole('button', { name: '사전 검사', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '사전 검사', exact: true }).click();

  const candidate = page.locator('.condition-candidate').filter({ hasText: rawValue });
  await expect(candidate).toBeVisible();
  await expect(candidate.getByText(rawValue, { exact: true })).toBeVisible();
  await expect(candidate.getByLabel('명칭')).toHaveValue(rawValue);
  await candidate.getByLabel('명칭').fill('Live cold-chain condition');
  await candidate.getByLabel('설명').fill('Keep between 2C and 8C');
  await candidate.getByRole('button', { name: '등록', exact: true }).click();

  await expect(page.getByRole('status').filter({ hasText: '필수 검사를 통과했습니다.' })).toBeVisible();
  expect(conditionBody).toEqual({ code: rawValue, description: 'Keep between 2C and 8C', name: 'Live cold-chain condition' });
  expect(api.calls.filter((call) => call.key === 'POST /api/dsv/dispatch-imports/preview')).toHaveLength(2);
  expect(api.calls.filter((call) => call.key === 'POST /api/dsv/conditions')).toHaveLength(1);
  await expectSentinel(page, key, sentinel);
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
  await expect(page.getByRole('button', { name: '사전 검사', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '사전 검사', exact: true }).click();

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
  await expect(page.getByRole('button', { name: '사전 검사', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '사전 검사', exact: true }).click();
  await expect(page.getByRole('button', { name: '업로드 확정', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '업로드 확정', exact: true }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'dispatch apply failed' })).toBeVisible();
  await expect(page.getByText('1건 업로드 완료')).toHaveCount(0);
  await expectSentinel(page, key, sentinel);
  expect(api.calls.some((call) => call.key === 'POST /api/dsv/dispatch-imports')).toBe(true);
  expectOnlyFixtureCalls(api);
});
}
