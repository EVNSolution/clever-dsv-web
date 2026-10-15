// Synthetic contract fixtures only. These tests never contact a provider or an operational database.
export const serviceDate = '2026-10-07';
export const ids = {
  executionA: '11111111-1111-4111-8111-111111111111',
  executionB: '22222222-2222-4222-8222-222222222222',
  routeA: '33333333-3333-4333-8333-333333333333',
  routeB: '44444444-4444-4444-8444-444444444444',
  vehicle: '55555555-5555-4555-8555-555555555555',
  driver: '66666666-6666-4666-8666-666666666666',
  reportA: '77777777-7777-4777-8777-777777777777',
  reportB: '88888888-8888-4888-8888-888888888888',
  notificationA: '99999999-9999-4999-8999-999999999999',
  notificationB: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  stopA: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  stopB: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  child: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  sample: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  incident: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
};
export const base = '/api/dsv/v1/operations';
export const instant = '2026-10-07T00:00:00.000Z';
export const csrf = 'synthetic-operations-csrf';
export const adminSession = {
  principalType: 'DSV_ADMIN',
  shopId: '01234567-0123-4123-8123-0123456789ab',
  actorId: '01234567-0123-4123-8123-0123456789ac',
  displayName: '합성 관제 관리자',
  scopes: ['dsv:session:read', 'dsv:control:read', 'dsv:dispatches:write'],
  csrfToken: csrf,
};
export const envelope = (data) => ({ data, error: null });
export const v1Envelope = (data) => ({ data, meta: { apiVersion: 'dsv.v1' }, requestId: 'synthetic-operations-request' });
export const failure = (status, code, message = code) => ({ status, body: { data: null, error: { code, message } } });

export function execution(overrides = {}) {
  return {
    assignmentEpoch: '9', assignmentGeneration: '12', closedAt: null,
    departureObservedAt: '2026-10-07T00:15:00.000Z', driverId: ids.driver,
    endReason: null, executionContextId: ids.executionA, expectedRouteVersionId: ids.child,
    missingStartDelivery: { attemptRecordsByStatus: { SENT: 1, RETRY: 1 }, businessByStatus: { OPEN: 2 }, workerAttemptCount: 7, warningCount: 2 },
    monitorEndAt: '2026-10-07T09:00:00.000Z', monitorStartAt: instant,
    notificationMode: 'SHADOW',
    notificationSummary: { byBusinessStatus: { OPEN: 5, RESOLVED: 1 }, byKind: { N01: 1, N02: 1, N03: 1, N04: 1, N05: 1, N06: 1 }, total: 6 },
    operationalSummaryTruncated: false, reminderDueAt: '2026-10-07T00:20:00.000Z',
    reminderIncidentId: ids.incident, reminderOrdinal: 2, reminderStatus: 'ACTIVE',
    routePlanId: ids.routeA, routeVersion: 3, serviceDate, startedAt: null,
    status: 'ACTIVE', vehicleId: ids.vehicle, warehouseNotifiedAt: '2026-10-07T00:05:00.000Z',
    ...overrides,
  };
}
export function report(overrides = {}) {
  return {
    acknowledgedAt: null, assignmentEpoch: '9', createdAt: '2026-10-07T00:25:00.000Z',
    driverId: ids.driver, executionContextId: ids.executionA,
    explanation: '합성 검증: 수취인에게 연락할 수 없습니다.', id: ids.reportA,
    reasonCode: 'SYNTHETIC_RECIPIENT_UNAVAILABLE', resolvedAt: null,
    routeVersion: 3, status: 'OPEN', targetStopId: ids.stopA,
    ...overrides,
  };
}
export function notification(overrides = {}) {
  return {
    ackedAt: null, businessStatus: 'OPEN', createdAt: '2026-10-07T00:25:00.000Z',
    expiresAt: '2026-10-08T00:25:00.000Z', id: ids.notificationA, kind: 'N07',
    summary: { title: '배송 예외 보고', body: '합성 보고를 확인하세요.' },
    ...overrides,
  };
}
export function detail(overrides = {}) {
  const row = execution();
  const context = Object.fromEntries(Object.entries(row).filter(([key]) => !['expectedRouteVersionId', 'assignmentGeneration', 'notificationSummary', 'missingStartDelivery', 'operationalSummaryTruncated'].includes(key)));
  context.effectiveAt = instant;
  context.liveEligibleAt = null;
  const notices = ['N01', 'N02', 'N03', 'N04', 'N05', 'N06'].map((kind, index) => ({
    assignmentEpoch: '9', attemptRecordsByStatus: kind === 'N05' ? { SENT: 1, RETRY: 1 } : {},
    businessStatus: kind === 'N03' ? 'RESOLVED' : 'OPEN', createdAt: instant, dueAt: instant,
    expiresAt: '2026-10-08T00:00:00.000Z', id: `0000000${index + 1}-0000-4000-8000-000000000001`,
    kind, lastCompletedAt: kind === 'N05' ? '2026-10-07T00:20:05.000Z' : null,
    ordinal: kind === 'N05' ? 2 : 0, resolutionReason: kind === 'N03' ? 'REASSIGNED' : null,
    resolvedAt: kind === 'N03' ? instant : null, routeVersion: 3,
    workerAttemptCount: kind === 'N05' ? 7 : 0,
  }));
  return {
    context,
    deliveryExceptions: { byStatus: { OPEN: 1 }, items: [{ acknowledgedAt: null, createdAt: instant, id: ids.reportA, reasonCode: 'SYNTHETIC_RECIPIENT_UNAVAILABLE', resolvedAt: null, status: 'OPEN', targetStopId: ids.stopA }], limit: 100, truncated: false },
    geofenceEvidence: { items: [{ assignmentEpoch: '9', boundary: { targetKey: 'WAREHOUSE', transition: 'ARRIVED', visitOrdinal: 1 }, confirmedAt: '2026-10-07T00:05:02.000Z', confirmedObservedAt: '2026-10-07T00:05:00.000Z', firstObservedAt: instant, id: ids.sample, policyVersion: 'synthetic-shadow-v1', routeVersion: 3, sourceSampleId: ids.sample }], limit: 100, truncated: false },
    notifications: { attemptRecordsByStatus: { SENT: 1, RETRY: 1 }, attemptsTruncated: false, byBusinessStatus: { OPEN: 5, RESOLVED: 1 }, byKind: { N01: 1, N02: 1, N03: 1, N04: 1, N05: 1, N06: 1 }, items: notices, limit: 100, workerAttemptCount: 7, truncated: false },
    ...overrides,
  };
}

export async function installOperationsFixtures(page, overrides = {}) {
  const state = {
    session: structuredClone(adminSession), executions: [execution(), execution({ executionContextId: ids.executionB, routePlanId: ids.routeB })],
    details: { [ids.executionA]: detail(), [ids.executionB]: detail({ context: { ...detail().context, executionContextId: ids.executionB, routePlanId: ids.routeB } }) },
    notifications: [notification(), notification({ id: ids.notificationB })],
    reports: [report(), report({ id: ids.reportB, targetStopId: ids.stopB, explanation: '다른 보고. 이 보고를 열면 잘못된 이동입니다.' })],
  };
  const calls = [];
  const unexpected = [];
  const handlers = {
    'GET /api/dsv/v1/session': () => v1Envelope(state.session),
    'POST /api/dsv/auth/login': envelope({ csrfToken: csrf }),
    'GET /api/dsv/v1/operational-notifications': v1Envelope({ items: [] }),
    [`GET ${base}/executions`]: () => envelope({ items: state.executions, limit: 100 }),
    [`GET ${base}/notifications`]: () => envelope({ items: state.notifications, nextCursor: null }),
    [`GET ${base}/delivery-exceptions`]: () => envelope({ items: state.reports, nextCursor: null }),
    ...overrides,
  };
  await page.route('**/api/dsv/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const call = { method: request.method(), path: url.pathname, search: url.search, headers: request.headers(), body: request.postDataJSON() };
    calls.push(call);
    const key = `${call.method} ${call.path}`;
    let handler = handlers[`${key}${call.search}`] ?? handlers[key];
    if (handler === undefined && call.method === 'GET' && call.path.startsWith(`${base}/executions/`)) {
      const data = state.details[call.path.split('/').at(-1)];
      if (data) handler = envelope(data);
    }
    if (handler === undefined && call.method === 'GET' && call.path.startsWith(`${base}/delivery-exceptions/`)) {
      const data = state.reports.find((row) => row.id === call.path.split('/').at(-1));
      if (data) handler = envelope(data);
    }
    if (handler === undefined && call.path === `${base}/notifications/${ids.notificationA}/resolve` && call.method === 'GET') {
      handler = envelope({ notificationId: ids.notificationA, destination: { executionContextId: ids.executionA, reportId: ids.reportA, targetStopId: ids.stopA, type: 'OPERATIONS_EXCEPTION' } });
    }
    if (handler === undefined && call.path === `${base}/notifications/${ids.notificationA}/acks` && call.method === 'POST') {
      state.notifications[0].ackedAt = instant;
      handler = envelope({ ackedAt: instant, notificationId: ids.notificationA });
    }
    if (handler === undefined && call.method === 'POST' && call.path.startsWith(`${base}/delivery-exceptions/`)) {
      const reportId = call.path.split('/').at(-2);
      const row = state.reports.find((item) => item.id === reportId);
      if (row && ['acknowledge', 'resolve'].includes(call.path.split('/').at(-1))) {
        row.acknowledgedAt ??= instant;
        if (call.path.endsWith('/resolve')) {
          row.resolvedAt = instant;
          row.status = 'RESOLVED';
          state.notifications[0].businessStatus = 'RESOLVED';
        } else if (row.status !== 'RESOLVED') row.status = 'ACKNOWLEDGED';
        handler = envelope(row);
      }
    }
    if (handler === undefined) {
      unexpected.push(call);
      handler = failure(599, 'UNFIXTURED_API_CALL', key);
    }
    const resolved = typeof handler === 'function' ? await handler({ request, route, url, call, state }) : handler;
    // An override can abort, defer, or fulfil the intercepted request itself.
    if (resolved === null) return;
    await route.fulfill({ status: resolved.status ?? 200, headers: { 'cache-control': 'private, no-store' }, contentType: 'application/json', body: JSON.stringify(resolved.body ?? resolved) });
  });
  return { calls, unexpected, state, handlers };
}

export const operationsCalls = (api) => api.calls.filter(({ path }) => path.startsWith(`${base}/`));
export const mutationCalls = (api) => operationsCalls(api).filter(({ method }) => method !== 'GET');
export const executionUrl = (params = '') => `/executions?serviceDate=${serviceDate}${params ? `&${params}` : ''}`;
