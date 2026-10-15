import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSourceServer, fixtureIds as ids, fixtureServiceDate, serverCommit } from '../../scripts/dsv-operations-source-server.mjs';

const base = '/api/dsv/v1/operations';
const enabled = Boolean(process.env.DSV_OPERATIONS_SERVER_SOURCE);

async function withHttp(run) {
  const fixture = await createSourceServer();
  const address = await fixture.app.listen({ host: '127.0.0.1', port: 0 });
  const headers = (role = 'admin', csrf = true) => {
    const signed = fixture.createSession(role);
    return { cookie: signed.cookieHeader.split(';')[0], ...(csrf ? { 'x-csrf-token': signed.session.csrfToken } : {}) };
  };
  const request = async (path, { method = 'GET', role = 'admin', csrf = true, json, anonymous = false } = {}) => {
    const response = await fetch(`${address}${base}${path}`, {
      method,
      headers: { ...(anonymous ? {} : headers(role, csrf)), ...(json === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  try { await run({ ...fixture, address, request, headers }); } finally { await fixture.app.close(); }
}

test('pinned server source emits strict operations DTOs over actual HTTP', { skip: !enabled }, async () => withHttp(async ({ request, storage, address }) => {
  const health = await (await fetch(`${address}/api/dsv/__fixture/health`)).json();
  assert.equal(health.serverCommit, serverCommit);
  assert.equal((await request('/executions', { anonymous: true })).status, 401);
  const result = await request(`/executions?serviceDate=${fixtureServiceDate}`, { csrf: false });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Object.keys(result.body).sort(), ['data', 'error']);
  assert.equal(result.body.error, null);
  assert.equal(result.body.data.limit, 100);
  assert.equal(result.body.data.items[0].executionContextId, ids.context);
  assert.equal(result.body.data.items[0].missingStartDelivery.workerAttemptCount, 2);
  assert.equal(result.body.data.items[0].missingStartDelivery.warningCount, 1);
  const detail = await request(`/executions/${ids.context}`);
  assert.equal(detail.body.data.context.startedAt, null);
  assert.equal(detail.body.data.geofenceEvidence.items[0].policyVersion, 'synthetic-shadow-v1');
  assert.equal(detail.body.data.notifications.items.find((item) => item.kind === 'N05').workerAttemptCount, 2);
  assert.ok(storage.calls.filter((call) => call.action === 'read' && call.where?.shopId).every((call) => call.where.shopId === ids.shop));
  assert.equal(storage.calls.filter((call) => call.action !== 'read').length, 0);
}));

test('source authorization and CSRF separate read access from mutation access and tenant identity', { skip: !enabled }, async () => withHttp(async ({ request, storage, address, headers }) => {
  assert.equal((await request(`/executions/${ids.context}`, { role: 'reader', csrf: false })).status, 200);
  for (const role of ['denied', 'customer']) assert.equal((await request('/executions', { role })).status, 403);
  assert.equal((await request(`/delivery-exceptions/${ids.report}/acknowledge`, { method: 'POST', role: 'reader', json: {} })).status, 403);
  assert.equal((await request(`/delivery-exceptions/${ids.report}/acknowledge`, { method: 'POST', csrf: false, json: {} })).status, 403);
  assert.equal((await request(`/delivery-exceptions/${ids.report}`, { role: 'foreign' })).status, 404);
  assert.equal((await request(`/executions/${ids.context}`, { role: 'foreign' })).status, 404);
  assert.equal((await request(`/notifications/${ids.notification}/resolve`, { role: 'foreign' })).status, 404);
  assert.deepEqual((await request('/executions', { role: 'foreign' })).body.data.items, []);
  const signed = headers();
  const forged = await fetch(`${address}${base}/executions`, { headers: { cookie: `${signed.cookie}tampered` } });
  assert.equal(forged.status, 401);
  const badCsrf = await fetch(`${address}${base}/delivery-exceptions/${ids.report}/acknowledge`, { method: 'POST', headers: { ...signed, 'x-csrf-token': 'invalid-token', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(badCsrf.status, 403);
  assert.equal(storage.tables().dsvDeliveryException[0].status, 'OPEN');
}));

test('source routes reject unapproved query and body fields', { skip: !enabled }, async () => withHttp(async ({ request }) => {
  for (const path of ['/executions?shopId=other', '/executions?serviceDate=2026-02-30', '/notifications?limit=101', '/notifications?cursor=malformed', '/delivery-exceptions?limit=0', '/delivery-exceptions?cursor=malformed', `/delivery-exceptions/${ids.report}?shopId=other`]) {
    assert.equal((await request(path)).status, 400, path);
  }
  assert.equal((await request(`/notifications/${ids.notification}/acks`, { method: 'POST', json: { ackKind: 'OPENED', shopId: ids.foreignShop } })).status, 400);
  assert.equal((await request(`/delivery-exceptions/${ids.report}/resolve`, { method: 'POST', json: { status: 'FAILED' } })).status, 400);
  assert.equal((await request('/executions/map', { method: 'POST', json: { commandId: ids.command, routePlanId: ids.route, mapping: 'SAME_EXECUTION', effectiveAt: '2026-10-07T00:20:00Z' } })).status, 400);
}));

test('source resolver opens exact report without business writes; report transitions preserve route and stop', { skip: !enabled }, async () => withHttp(async ({ request, storage }) => {
  const before = structuredClone(storage.tables());
  const resolved = await request(`/notifications/${ids.notification}/resolve`);
  assert.equal(resolved.status, 200);
  assert.deepEqual(resolved.body.data.destination, { executionContextId: ids.context, reportId: ids.report, targetStopId: ids.stop, type: 'OPERATIONS_EXCEPTION' });
  assert.equal((await request(`/delivery-exceptions/${resolved.body.data.destination.reportId}`)).body.data.status, 'OPEN');
  assert.deepEqual(storage.tables(), before);
  const opened = await request(`/notifications/${ids.notification}/acks`, { method: 'POST', json: { ackKind: 'OPENED' } });
  assert.equal(opened.status, 200);
  assert.equal(storage.tables().dsvOperationalNotificationAck.length, 1);
  assert.equal(storage.tables().dsvDeliveryException[0].status, 'OPEN');
  await request(`/notifications/${ids.notification}/acks`, { method: 'POST', json: { ackKind: 'OPENED' } });
  assert.equal(storage.tables().dsvOperationalNotificationAck.length, 1);
  const acknowledged = await request(`/delivery-exceptions/${ids.report}/acknowledge`, { method: 'POST', json: {} });
  assert.equal(acknowledged.body.data.status, 'ACKNOWLEDGED');
  const resolvedReport = await request(`/delivery-exceptions/${ids.report}/resolve`, { method: 'POST', json: {} });
  assert.equal(resolvedReport.body.data.status, 'RESOLVED');
  assert.equal(storage.tables().dsvOperationalNotification.find((row) => row.id === ids.notification).businessStatus, 'RESOLVED');
  assert.equal(storage.tables().routePlan[0].status, 'READY');
  assert.equal(storage.tables().routePlan[0].routeStops[0].deliveryStop.status, 'PENDING');
  assert.equal(storage.tables().dsvExecutionContext[0].startedAt, null);
  assert.deepEqual((await request(`/delivery-exceptions/${ids.report}/resolve`, { method: 'POST', json: {} })).body.data, resolvedReport.body.data);
}));

test('source map command replays identical input and refuses changed input or implicit new execution', { skip: !enabled }, async () => withHttp(async ({ request, storage }) => {
  const body = { commandId: ids.command, effectiveAt: '2026-10-07T00:20:00Z', executionContextId: ids.context, mapping: 'SAME_EXECUTION', routePlanId: ids.route };
  const first = await request('/executions/map', { method: 'POST', json: body });
  assert.equal(first.status, 200);
  assert.equal(first.body.data.outcome, 'ACCEPT');
  const refreshed = await request(`/executions/${ids.context}`);
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.body.data.context.reminderDueAt, '2026-10-07T00:40:00.000Z');
  assert.equal(refreshed.body.data.context.reminderOrdinal, 1);
  const after = structuredClone(storage.tables());
  const replay = await request('/executions/map', { method: 'POST', json: body });
  assert.equal(replay.body.data.outcome, 'REPLAY');
  assert.deepEqual(storage.tables(), after);
  assert.equal((await request('/executions/map', { method: 'POST', json: { ...body, effectiveAt: '2026-10-07T00:21:00Z' } })).status, 409);
  assert.equal((await request('/executions/map', { method: 'POST', json: { commandId: ids.report, effectiveAt: body.effectiveAt, mapping: 'NEW_EXECUTION', routePlanId: ids.route } })).status, 409);
  assert.equal((await request('/executions/map', { method: 'POST', role: 'reader', json: body })).status, 403);
  assert.equal(storage.tables().dsvExecutionContext.length, 1);
}));

test('source vehicle selection enforces replay, payload identity and overlapping interval conflict', { skip: !enabled }, async () => withHttp(async ({ request, storage }) => {
  const body = { commandId: ids.command, executionContextId: ids.context, validFrom: '2026-10-07T00:20:00Z', validUntil: '2026-10-07T01:20:00Z', vehicleId: ids.vehicle };
  assert.equal((await request('/executions/select', { method: 'POST', json: body })).body.data.outcome, 'ACCEPT');
  assert.equal((await request('/executions/select', { method: 'POST', json: body })).body.data.outcome, 'REPLAY');
  assert.equal((await request('/executions/select', { method: 'POST', json: { ...body, validUntil: '2026-10-07T02:20:00Z' } })).status, 409);
  assert.equal((await request('/executions/select', { method: 'POST', json: { ...body, commandId: ids.report } })).status, 409);
  assert.equal((await request('/executions/select', { method: 'POST', json: { ...body, validUntil: body.validFrom } })).status, 400);
  assert.equal(storage.tables().dsvExecutionSelection.length, 1);
}));

test('source creates a new execution only for explicit mapping of an unmapped synthetic route', { skip: !enabled }, async () => withHttp(async ({ request, storage }) => {
  const newRoute = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const tables = storage.tables();
  tables.routePlan.push({ ...structuredClone(tables.routePlan[0]), id: newRoute });
  tables.routeGroupingChildVersion.push({ ...structuredClone(tables.routeGroupingChildVersion[0]), id: ids.stop, routePlanId: newRoute });
  const body = { commandId: ids.command, effectiveAt: '2026-10-07T00:20:00Z', mapping: 'NEW_EXECUTION', routePlanId: newRoute };
  const created = await request('/executions/map', { method: 'POST', json: body });
  assert.equal(created.status, 200);
  assert.equal(created.body.data.outcome, 'ACCEPT');
  assert.notEqual(created.body.data.executionContextId, ids.context);
  assert.equal(tables.dsvExecutionContext.length, 2);
  assert.equal(tables.dsvExecutionContext[1].notificationMode, 'OFF');
  assert.equal(tables.dsvExecutionContext[1].reminderStatus, 'AWAITING_DEPARTURE');
  const detail = await request(`/executions/${created.body.data.executionContextId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.context.reminderDueAt, null);
  assert.equal(detail.body.data.context.reminderOrdinal, 0);
  const replay = await request('/executions/map', { method: 'POST', json: body });
  assert.equal(replay.body.data.outcome, 'REPLAY');
  assert.equal(replay.body.data.executionContextId, created.body.data.executionContextId);
  assert.equal(storage.tables().dsvExecutionContext.length, 2);
}));

test('source simultaneous report transitions are idempotent within the synthetic transaction port', { skip: !enabled }, async () => withHttp(async ({ request, storage }) => {
  const results = await Promise.all([
    request(`/delivery-exceptions/${ids.report}/acknowledge`, { method: 'POST', json: {} }),
    request(`/delivery-exceptions/${ids.report}/resolve`, { method: 'POST', json: {} }),
    request(`/delivery-exceptions/${ids.report}/resolve`, { method: 'POST', json: {} }),
  ]);
  assert.ok(results.every((result) => result.status === 200));
  assert.equal(storage.tables().dsvDeliveryException[0].status, 'RESOLVED');
  assert.equal(storage.calls.filter((call) => call.model === 'dsvDeliveryException' && call.action === 'update').length, 2);
  assert.equal(storage.tables().routePlan[0].status, 'READY');
  assert.equal(storage.tables().routePlan[0].routeStops[0].deliveryStop.status, 'PENDING');
}));

test('source detail truncation, page cursors and notification expiry remain explicit', { skip: !enabled }, async () => withHttp(async ({ request, storage }) => {
  const tables = storage.tables();
  const original = tables.dsvDeliveryException[0];
  tables.dsvDeliveryException.push({ ...original, id: ids.account, createdAt: new Date(+original.createdAt - 1) });
  const page = await request('/delivery-exceptions?limit=1');
  assert.equal(page.body.data.items.length, 1);
  assert.ok(page.body.data.nextCursor);
  const next = await request(`/delivery-exceptions?limit=1&cursor=${encodeURIComponent(page.body.data.nextCursor)}`);
  assert.equal(next.body.data.items[0].id, ids.account);
  const event = tables.dsvGeofenceEvent[0];
  for (let index = 0; index < 101; index += 1) tables.dsvGeofenceEvent.push({ ...event, id: `synthetic-event-${index}` });
  const detail = await request(`/executions/${ids.context}`);
  assert.equal(detail.body.data.geofenceEvidence.limit, 100);
  assert.equal(detail.body.data.geofenceEvidence.items.length, 100);
  assert.equal(detail.body.data.geofenceEvidence.truncated, true);
  tables.dsvOperationalNotification.find((row) => row.id === ids.notification).expiresAt = new Date(0);
  assert.equal((await request(`/notifications/${ids.notification}/resolve`)).status, 404);
  assert.equal(storage.tables().dsvDeliveryException[0].status, 'OPEN');
}));
