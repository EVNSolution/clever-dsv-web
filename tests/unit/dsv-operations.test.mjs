import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { detail, envelope, execution, failure, ids, instant, notification, report, v1Envelope } from '../e2e/fixtures/dsv-operations.js';

const require = createRequire(import.meta.url);
const { transpileModule, ModuleKind, ScriptTarget } = require('typescript');
function compile(source) {
  const output = transpileModule(source, { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}
const clientSource = (await readFile(new URL('../../src/api/client.ts', import.meta.url), 'utf8'))
  .replace("import { apiConfig } from './config';", "const apiConfig = { legacyBaseUrl: '/api/dsv', v1BaseUrl: '/api/dsv/v1' };")
  .replace("import { expireTransportSession, readAuthToken, readCsrfToken, storeCsrfToken } from './auth-session';", `
    let testCsrf = 'synthetic-csrf';
    let expired = 0;
    const readAuthToken = () => null;
    const readCsrfToken = () => testCsrf;
    const storeCsrfToken = (token) => { testCsrf = token; };
    const expireTransportSession = () => { expired += 1; testCsrf = null; };
    export const testExpiredCount = () => expired;
    export const resetTestSession = () => { expired = 0; testCsrf = 'synthetic-csrf'; };
  `);
const client = await compile(clientSource);
let responseBody;
let requestLog;
const serviceSource = (await readFile(new URL('../../src/services/dsv-operations.ts', import.meta.url), 'utf8'))
  .replace("import { ApiError, DsvOperationsError, requestDsvOperationsJson } from '../api/client';", `
    export class ApiError extends Error { constructor(status,message,body) { super(message); this.status=status; this.body=body; } }
    export class DsvOperationsError extends ApiError { constructor(status,code,message) { super(status,message); this.code=code; } }
    const requestDsvOperationsJson = async (path,init) => globalThis.__operationsTestResponse(path,init);
  `)
  .replace("import { operationsEnabled } from '../config/dsv-operations';", 'const operationsEnabled = true;');
const service = await compile(serviceSource);
globalThis.__operationsTestResponse = async (path, init) => { requestLog = { path, init }; return responseBody; };

const invalid = (error) => error.status === 502 && error.code === 'INVALID_RESPONSE';
test('accepts exact server execution summaries and retains unknown state and bounds', () => {
  const value = { items: [execution({ status: 'FUTURE_STATE', notificationMode: 'FUTURE_MODE', operationalSummaryTruncated: true })], limit: 100 };
  assert.deepEqual(service.parseExecutionList(value), value);
  const expanded = detail();
  expanded.geofenceEvidence.truncated = true;
  expanded.notifications.attemptsTruncated = true;
  assert.deepEqual(service.parseExecutionDetail(expanded), expanded);
});

test('rejects missing, extra or duplicate DTO fields and symbolic identities', () => {
  const variants = [
    { items: [execution({ executionContextId: 'symbolic-context' })], limit: 100 },
    { items: [execution({ assignmentEpoch: '09' })], limit: 100 },
    { items: [execution({ assignmentEpoch: '9223372036854775808' })], limit: 100 },
    { items: [execution({ routeVersion: 0 })], limit: 100 },
    { items: [execution({ startedAt: '2026-10-07T00:00:00Z' })], limit: 100 },
    { items: [execution({ serviceDate: '2026-02-30' })], limit: 100 },
    { items: [execution({ invented: 'future endpoint' })], limit: 100 },
    { items: [execution(), execution()], limit: 100 },
    { items: [execution()], limit: 101 },
    { items: Array.from({ length: 101 }, () => execution()), limit: 100 },
  ];
  for (const value of variants) assert.throws(() => service.parseExecutionList(value), invalid);
  const missing = execution(); delete missing.driverId;
  assert.throws(() => service.parseExecutionList({ items: [missing], limit: 100 }), invalid);
  const extraCoordinates = detail(); extraCoordinates.geofenceEvidence.items[0].latitude = 37;
  assert.throws(() => service.parseExecutionDetail(extraCoordinates), invalid);
});

test('treats worker attempts as a separate exact field and rejects unsafe counts', () => {
  const value = detail();
  assert.equal(service.parseExecutionDetail(value).notifications.items.find((item) => item.kind === 'N05').workerAttemptCount, 7);
  for (const count of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '7']) {
    const invalidCount = detail(); invalidCount.notifications.workerAttemptCount = count;
    assert.throws(() => service.parseExecutionDetail(invalidCount), invalid);
  }
});

test('accepts report state independently of notification acknowledgement state', () => {
  const acknowledged = report({ status: 'ACKNOWLEDGED', acknowledgedAt: instant });
  assert.deepEqual(service.parseDeliveryException(acknowledged), acknowledged);
  const inbox = { items: [notification({ ackedAt: instant, businessStatus: 'OPEN' })], nextCursor: null };
  assert.equal(service.parseNotificationPage(inbox).items[0].businessStatus, 'OPEN');
  assert.throws(() => service.parseDeliveryException({ ...acknowledged, orderStatus: 'FAILED' }), invalid);
  assert.throws(() => service.parseNotificationPage({ ...inbox, nextCursor: '../../tenant' }), invalid);
});

test('only accepts an exact operations report resolver destination', () => {
  const value = { notificationId: ids.notificationA, destination: { executionContextId: ids.executionA, reportId: ids.reportA, targetStopId: ids.stopA, type: 'OPERATIONS_EXCEPTION' } };
  assert.deepEqual(service.parseNotificationResolution(value), value);
  for (const destination of [
    { type: 'EXECUTION', executionContextId: ids.executionA, routePlanId: ids.routeA },
    { ...value.destination, type: 'ASSIGNMENT_RELEASED' },
    { ...value.destination, url: 'https://external.example/report' },
    { ...value.destination, targetStopId: 'symbolic-stop' },
  ]) assert.throws(() => service.parseNotificationResolution({ ...value, destination }), invalid);
});

test('rejects requested identity or date mismatches before presenting service data', async () => {
  responseBody = { items: [execution({ serviceDate: '2026-10-08' })], limit: 100 };
  await assert.rejects(service.loadExecutions('2026-10-07'), invalid);
  responseBody = detail();
  await assert.rejects(service.loadExecution(ids.executionB), invalid);
  responseBody = report();
  await assert.rejects(service.loadDeliveryException(ids.reportB), invalid);
  responseBody = { notificationId: ids.notificationB, destination: { executionContextId: ids.executionA, reportId: ids.reportA, targetStopId: ids.stopA, type: 'OPERATIONS_EXCEPTION' } };
  await assert.rejects(service.resolveOperationsNotification(ids.notificationA), invalid);
  responseBody = { items: [notification(), notification({ id: ids.notificationB })], nextCursor: null };
  await assert.rejects(service.loadOperationsNotifications(null, undefined, 1), invalid);
});

test('rejects mismatched map or select receipts without rewriting the command input', async () => {
  const input = { commandId: ids.child, routePlanId: ids.routeB, effectiveAt: instant, mapping: 'SAME_EXECUTION', executionContextId: ids.executionA };
  responseBody = { assignmentEpoch: '9', executionContextId: ids.executionB, notificationKinds: [], outcome: 'ACCEPT', routePlanId: ids.routeB, routeVersion: 3 };
  await assert.rejects(service.mapExecution(input), invalid);
  assert.deepEqual(requestLog.init.json, input);
  responseBody = { executionContextId: ids.executionA, outcome: 'ACCEPT', vehicleId: ids.driver };
  await assert.rejects(service.selectExecution({ commandId: ids.child, executionContextId: ids.executionA, validFrom: instant, validUntil: '2026-10-07T01:00:00.000Z', vehicleId: ids.vehicle }), invalid);
});

function mockFetch(resolve) {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return resolve({ url, init, calls }); };
  return calls;
}
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('keeps additive envelopes exclusive while legacy v1 remains strict', async () => {
  client.resetTestSession();
  let body = envelope({ items: [], limit: 100 });
  mockFetch(() => jsonResponse(body));
  assert.deepEqual(await client.requestDsvOperationsJson('operations/executions?serviceDate=2026-10-07'), body.data);
  await assert.rejects(client.requestV1ReadJson('session'), (error) => error.status === 502);
  for (const bad of [v1Envelope({ items: [], limit: 100 }), { ...envelope({}), extra: true }, { data: {}, error: {} }, { data: null, error: null }]) {
    body = bad;
    await assert.rejects(client.requestDsvOperationsJson('operations/executions'), invalid);
  }
  body = v1Envelope({ principalType: 'DSV_ADMIN' });
  assert.deepEqual(await client.requestV1ReadJson('session'), body.data);
});

test('rejects paths, authority overrides, query duplicates and writes outside the narrow allowlist', async () => {
  const calls = mockFetch(() => jsonResponse(envelope({})));
  const inputs = [
    ['operational-notifications', {}], ['operations/policy', {}], ['/operations/executions', {}],
    ['operations/executions?shopId=other-tenant', {}], ['operations/executions?serviceDate=2026-10-07&serviceDate=2026-10-08', {}],
    ['operations/notifications?cursor=../../../report', {}], ['operations/notifications?limit=101', {}],
    ['operations/executions?serviceDate=2026-02-30', {}], [`operations/executions/${ids.executionA}?tenantId=x`, {}],
    ['operations/executions', { method: 'POST', json: {} }], ['operations/executions', { json: {} }],
    [`operations/delivery-exceptions/${ids.reportA}/resolve`, { method: 'POST', json: { orderStatus: 'FAILED' } }],
    [`operations/notifications/${ids.notificationA}/acks`, { method: 'POST', json: { ackKind: 'RESOLVED' } }],
    ['operations/executions/map', { method: 'POST', json: { commandId: ids.child, effectiveAt: instant, routePlanId: ids.routeA, mapping: 'NEW_EXECUTION', executionContextId: ids.executionA } }],
    ['operations/executions/select', { method: 'POST', json: { commandId: ids.child, executionContextId: ids.executionA, vehicleId: ids.vehicle, validFrom: instant, validUntil: instant } }],
  ];
  for (const [path, init] of inputs) await assert.rejects(client.requestDsvOperationsJson(path, init), (error) => error.status === 400);
  assert.deepEqual(calls, []);
});

test('preserves cookies, CSRF, no-store and exact immutable payload through the one CSRF refresh', async () => {
  client.resetTestSession();
  const payload = { commandId: ids.child, routePlanId: ids.routeB, effectiveAt: instant, mapping: 'NEW_EXECUTION' };
  const calls = mockFetch(({ url, calls }) => {
    if (calls.length === 1) { payload.routePlanId = ids.routeA; return jsonResponse(failure(403, 'FORBIDDEN').body, 403); }
    if (url.endsWith('/auth/session')) return jsonResponse(envelope({ csrfToken: 'renewed-csrf' }));
    return jsonResponse(envelope({ outcome: 'REPLAY' }));
  });
  await client.requestDsvOperationsJson('operations/executions/map', { method: 'POST', json: payload });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].init.body, calls[2].init.body);
  assert.equal(JSON.parse(calls[0].init.body).routePlanId, ids.routeB);
  assert.equal(calls[0].init.headers['X-CSRF-Token'], 'synthetic-csrf');
  assert.equal(calls[2].init.headers['X-CSRF-Token'], 'renewed-csrf');
  assert.equal(calls[2].init.credentials, 'include');
  assert.equal(calls[2].init.cache, 'no-store');
});

test('expires sessions on 401, keeps real HTTP errors and distinguishes unavailable transport', async () => {
  client.resetTestSession();
  mockFetch(() => jsonResponse(failure(401, 'UNAUTHORIZED').body, 401));
  await assert.rejects(client.requestDsvOperationsJson('operations/executions'), (error) => error.status === 401 && error.code === 'UNAUTHORIZED');
  assert.equal(client.testExpiredCount(), 1);
  mockFetch(() => new Response('<html>not deployed</html>', { status: 404, headers: { 'content-type': 'text/html' } }));
  await assert.rejects(client.requestDsvOperationsJson('operations/executions'), (error) => error.status === 404 && error.code === 'INVALID_RESPONSE');
  mockFetch(() => { throw new TypeError('connection failed'); });
  await assert.rejects(client.requestDsvOperationsJson('operations/executions'), (error) => error.status === 0 && error.code === 'NETWORK_ERROR');
  const abort = new DOMException('cancelled', 'AbortError');
  mockFetch(() => { throw abort; });
  await assert.rejects(client.requestDsvOperationsJson('operations/executions'), (error) => error === abort);
});
