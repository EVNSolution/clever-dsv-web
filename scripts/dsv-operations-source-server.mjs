// Test-only HTTP server. Routes and DTO services come from the pinned server source.
// Prisma storage, SQL locks, legacy bootstrap and provider ports remain synthetic.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const serverCommit = 'af9b4b43b40a5c6c5cba7bc83587217b2bbe25ab';
export const fixtureIds = {
  account: '11111111-1111-4111-8111-111111111111',
  child: '22222222-2222-4222-8222-222222222222',
  command: '33333333-3333-4333-8333-333333333333',
  context: '44444444-4444-4444-8444-444444444444',
  driver: '55555555-5555-4555-8555-555555555555',
  notification: '66666666-6666-4666-8666-666666666666',
  shop: '77777777-7777-4777-8777-777777777777',
  stop: '88888888-8888-4888-8888-888888888888',
  vehicle: '99999999-9999-4999-8999-999999999999',
  actor: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  report: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  route: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  warning: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  foreignShop: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
};
export const fixtureServiceDate = '2026-10-07';

const sourceDigests = {
  'routes/dsv-execution.routes.ts': 'afd2573a0b4a05f23438da567822721115dfab0cba597501dc243b26d532b6b3',
  'routes/admin-ui-session.ts': '6bb696c906745e97e1e8dbfc9f6de2a8a1b65be59b59ba783c6f22461e1315b1',
  'modules/dsv/dsv-execution-api.service.ts': '762f199bcbd8bd1fa4c9bb1e50abbc7c5c62a6e0455fe71d9b8d1108a76871bd',
  'modules/dsv/dsv-execution-commands.service.ts': 'e0e06146077b8db395ff69228307bfe7b16a3c9c2ff4910ad04567f0fd4ff18b',
  'modules/dsv/dsv-execution-context.service.ts': '0e7f6df486de3c7d26f39899de4932b3186a5dc4b6d806027194dda68391744f',
  'modules/dsv/dsv-execution-context.types.ts': 'd7f822754a9d7131a80bf2661b085101b4198a9387fd14e4a2b82e9eb85a2ceb',
  'modules/dsv/dsv-operational-driver-notification.service.ts': '7879b2784030a91d14a8c9322f0e948ab9f91ee1322b58f2d4563c27e0b12cc9',
  'modules/dsv/dsv-operational-driver-notification.provider.ts': '97531dc1cf35ba4f1b0eb0a07a8acfe0e4ea6547094dd7fb46387edfa399f79a',
  'modules/dsv/dsv-principal.ts': '54e465a7585753a93295995e7e85eed1d8adbc4b00275ec7e684463a299a1667',
};
const sourceLoaders = new Map();

async function loadSource(sourceDirectory) {
  if (!sourceDirectory) throw new Error('Set DSV_OPERATIONS_SERVER_SOURCE to an exported pinned server source directory.');
  const source = resolve(sourceDirectory);
  assert.equal(readFileSync(resolve(source, '.dsv-operations-source-commit'), 'utf8').trim(), serverCommit, 'Wrong server source commit');
  const src = resolve(source, 'apps/delivery-api/src');
  for (const [file, digest] of Object.entries(sourceDigests)) {
    assert.equal(createHash('sha256').update(readFileSync(resolve(src, file))).digest('hex'), digest, `Pinned source changed: ${file}`);
  }
  const requireSource = createRequire(resolve(source, 'apps/delivery-api/package.json'));
  const { register } = await import(pathToFileURL(requireSource.resolve('tsx/esm/api')).href);
  // One loader namespace preserves instanceof identity between routes and services.
  if (!sourceLoaders.has(source)) {
    sourceLoaders.set(source, register({ namespace: `dsv-source-${createHash('sha256').update(source).digest('hex')}`, tsconfig: false }));
  }
  const loader = sourceLoaders.get(source);
  const imports = await Promise.all([
    import(pathToFileURL(requireSource.resolve('fastify')).href),
    ...[
      'routes/dsv-execution.routes.ts', 'routes/admin-ui-session.ts',
      'modules/dsv/dsv-execution-api.service.ts', 'modules/dsv/dsv-execution-commands.service.ts',
      'modules/dsv/dsv-operational-driver-notification.service.ts', 'modules/dsv/dsv-principal.ts',
    ].map((file) => loader.import(pathToFileURL(resolve(src, file)).href, import.meta.url)),
  ]);
  return Object.assign({ Fastify: imports[0].default }, ...imports.slice(1));
}

// Only predicates used by these source services are supported. Unsupported storage fails.
function matches(row, where = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return expected.some((branch) => matches(row, branch));
    if (key === 'AND') return expected.every((branch) => matches(row, branch));
    if (key.includes('_')) return matches(row, expected);
    const actual = row[key];
    if (expected === null || typeof expected !== 'object' || expected instanceof Date) {
      return actual instanceof Date && expected instanceof Date ? +actual === +expected : actual === expected;
    }
    const operators = Object.keys(expected);
    if (operators.some((operator) => ['in', 'not', 'lt', 'lte', 'gt', 'gte'].includes(operator))) {
      return operators.every((operator) => {
        if (operator === 'in') return expected.in.includes(actual);
        if (operator === 'not') return actual !== expected.not;
        if (operator === 'lt') return actual < expected.lt;
        if (operator === 'lte') return actual <= expected.lte;
        if (operator === 'gt') return actual > expected.gt;
        if (operator === 'gte') return actual >= expected.gte;
        throw new Error(`Unsupported fixture predicate: ${operator}`);
      });
    }
    return actual !== undefined && actual !== null && matches(actual, expected);
  });
}

function createStorage() {
  const ids = fixtureIds;
  const at = new Date(`${fixtureServiceDate}T00:10:00Z`);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const content = {
    depot: { latitude: 37.33, longitude: 126.94 },
    stops: [{ address: { address1: '합성 배송지', address2: null, countryCode: 'KR', postalCode: '12345' }, destinationId: ids.stop, id: ids.stop, latitude: 37.4, longitude: 127, orderId: ids.stop, quantity: 2, sequence: 1, status: 'PENDING' }],
  };
  const contentFingerprint = createHash('sha256').update(JSON.stringify({
    depot: { latitude: 37.33, longitude: 126.94 },
  })).digest('hex'); // A different fingerprint lets the source map service verify a content transition.
  const context = {
    assignmentEpoch: 4n, closedAt: null, contentFingerprint, contentSnapshot: content,
    departureObservedAt: at, driverId: ids.driver, effectiveAt: at, id: ids.context,
    liveEligibleAt: null, monitorEndAt: new Date(`${fixtureServiceDate}T09:00:00Z`),
    monitorStartAt: at, notificationMode: 'OFF', policy: null, recipientAccountId: ids.account,
    reminderDueAt: new Date(`${fixtureServiceDate}T00:40:00Z`), reminderIncidentId: ids.warning,
    reminderOrdinal: 1, reminderStatus: 'WARNINGS_ACTIVE', routePlanId: ids.route,
    routeVersion: 3, serviceDate: new Date(`${fixtureServiceDate}T00:00:00Z`), shopId: ids.shop,
    startedAt: null, status: 'ACTIVE', vehicleId: ids.vehicle, warehouseNotifiedAt: at,
  };
  const notification = {
    assignmentEpoch: 4n, audience: 'OPS', businessStatus: 'OPEN', createdAt: at, dueAt: at,
    eventId: ids.report, executionContextId: ids.context, expiresAt, id: ids.notification,
    kind: 'N07', ordinal: 0, recipientAccountId: null, resolutionReason: null,
    resolvedAt: null, routeVersion: 3, shopId: ids.shop, targetStopId: ids.stop,
  };
  let tables = {
    dsvExecutionContext: [context],
    dsvDeliveryException: [{ acknowledgedAt: null, assignmentEpoch: 4n, createdAt: at, driverId: ids.driver, executionContextId: ids.context, explanation: '합성 자료: 수취인 부재로 관제 확인 요청', id: ids.report, reasonCode: 'RECIPIENT_ABSENT', resolvedAt: null, routeVersion: 3, shopId: ids.shop, status: 'OPEN', targetStopId: ids.stop }],
    dsvGeofenceEvent: [{ assignmentEpoch: 4n, confirmedAt: at, confirmedObservedAt: at, executionContextId: ids.context, firstObservedAt: at, id: ids.command, policyVersion: 'synthetic-shadow-v1', routeVersion: 3, shopId: ids.shop, sourceSampleId: ids.stop, targetKey: 'WAREHOUSE', transition: 'ARRIVAL', visitOrdinal: 1 }],
    dsvOperationalNotification: [notification, { ...notification, audience: 'DRIVER', eventId: null, id: ids.warning, kind: 'N05', ordinal: 1, recipientAccountId: ids.account, targetStopId: null }],
    dsvOperationalNotificationAttempt: [{ attemptCount: 2, completedAt: at, createdAt: at, id: ids.child, notificationId: ids.warning, shopId: ids.shop, status: 'SKIPPED' }],
    dsvOperationalNotificationAck: [], dsvExecutionCommand: [], dsvExecutionSelection: [],
    dsvExecutionRouteMapping: [{ executionContextId: ids.context, id: ids.command, routePlanId: ids.route, shopId: ids.shop, validFrom: at, validUntil: null }],
    routePlan: [{ assignmentGeneration: 9n, depotLatitude: 37.33, depotLongitude: 126.94, driverEvents: [], driverId: ids.driver, id: ids.route, planDate: context.serviceDate, routeGroupingChildVersions: [{ id: ids.child, driverId: ids.driver }], routeStops: [{ deliveryStopId: ids.stop, sequence: 1, deliveryStop: { ...content.stops[0].address, latitude: 37.4, longitude: 127, order: { destinationId: ids.stop, id: ids.stop, rawPayload: { dsv: { normalized: { shippedBoxes: 2 } } }, sellerOrderSourceKind: 'DSV_DISPATCH' }, status: 'PENDING' } }], shopId: ids.shop, status: 'READY', vehicleId: ids.vehicle }],
    routeGroupingChildVersion: [{ driverId: ids.driver, id: ids.child, publishedAt: at, routePlanId: ids.route, shopId: ids.shop, snapshot: { deliveryStopIds: [ids.stop] }, status: 'CURRENT', supersededAt: null }],
    driver: [{ account: { status: 'ACTIVE' }, accountId: ids.account, id: ids.driver, shopId: ids.shop, status: 'ACTIVE' }],
    driverAccount: [{ id: ids.account, status: 'ACTIVE' }],
    vehicle: [{ id: ids.vehicle, shopId: ids.shop, status: 'ACTIVE' }],
  };
  const calls = [];
  const prisma = {};
  for (const model of Object.keys(tables)) {
    const many = (args = {}) => {
      let rows = tables[model].filter((row) => matches(row, args.where));
      for (const order of [...(Array.isArray(args.orderBy) ? args.orderBy : args.orderBy ? [args.orderBy] : [])].reverse()) {
        const [key, direction] = Object.entries(order)[0];
        rows = [...rows].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (direction === 'desc' ? -1 : 1));
      }
      return structuredClone(rows.slice(0, args.take));
    };
    const update = ({ data, where }) => {
      const row = tables[model].find((candidate) => matches(candidate, where));
      assert.ok(row, `Fixture update missed ${model}`);
      Object.assign(row, structuredClone(data));
      calls.push({ model, action: 'update' });
      return structuredClone(row);
    };
    const create = ({ data }) => {
      const defaults = model === 'dsvExecutionContext' ? {
        closedAt: null, departureObservedAt: null, liveEligibleAt: null,
        monitorEndAt: null, monitorStartAt: null, policy: null, reminderDueAt: null,
        reminderIncidentId: null, reminderOrdinal: 0, startedAt: null, warehouseNotifiedAt: null,
      } : model === 'dsvOperationalNotification' ? {
        businessStatus: 'OPEN', createdAt: new Date(), eventId: null, ordinal: 0,
        resolutionReason: null, resolvedAt: null, targetStopId: null,
      } : {};
      const row = { id: randomUUID(), ...defaults, ...structuredClone(data) };
      tables[model].push(row);
      calls.push({ model, action: 'create' });
      return structuredClone(row);
    };
    prisma[model] = {
      findMany: async (args) => { calls.push({ model, action: 'read', where: args?.where }); return many(args); },
      findFirst: async (args) => { calls.push({ model, action: 'read', where: args?.where }); return many(args)[0] ?? null; },
      findUnique: async (args) => { calls.push({ model, action: 'read', where: args?.where }); return many(args)[0] ?? null; },
      create: async (args) => create(args), update: async (args) => update(args),
      updateMany: async ({ data, where }) => {
        const rows = tables[model].filter((row) => matches(row, where));
        for (const row of rows) update({ data, where: { id: row.id } });
        return { count: rows.length };
      },
      upsert: async (args) => {
        const row = many({ where: args.where })[0];
        return row ? update({ data: args.update, where: { id: row.id } }) : create({ data: args.create });
      },
    };
  }
  prisma.$queryRaw = async () => [{ locked: 1, id: ids.driver }]; // No PostgreSQL lock claim.
  let tail = Promise.resolve();
  prisma.$transaction = (callback) => {
    const operation = tail.then(async () => {
      const snapshot = structuredClone(tables);
      try { return await callback(prisma); } catch (error) { tables = snapshot; throw error; }
    });
    tail = operation.catch(() => {});
    return operation;
  };
  return { prisma, calls, tables: () => tables };
}

export async function createSourceServer({ sourceDirectory = process.env.DSV_OPERATIONS_SERVER_SOURCE } = {}) {
  const source = await loadSource(sourceDirectory);
  const storage = createStorage();
  const app = source.Fastify({ logger: false });
  const secret = 'synthetic-dsv-integration-session-secret-32-bytes';
  const cookieName = 'dsv_source_session';
  const roles = {
    admin: source.createDsvAdminPrincipal({ actorId: fixtureIds.actor, shopId: fixtureIds.shop, shopDomain: 'dsv-demo.local' }),
    reader: source.createDsvAdminPrincipal({ actorId: fixtureIds.actor, shopId: fixtureIds.shop, scopes: ['dsv:session:read', 'dsv:control:read'] }),
    denied: source.createDsvAdminPrincipal({ actorId: fixtureIds.actor, shopId: fixtureIds.shop, scopes: ['dsv:session:read'] }),
    foreign: source.createDsvAdminPrincipal({ actorId: fixtureIds.actor, shopId: fixtureIds.foreignShop }),
    customer: { principalType: 'CUSTOMER_USER', customerId: fixtureIds.actor, shopId: fixtureIds.shop, scopes: ['dsv:session:read'] },
  };
  const commands = new source.PrismaDsvExecutionCommandsService(storage.prisma, { recordDriverEventInTransaction: async () => { throw new Error('Driver event writes are outside this fixture'); } });
  const contexts = new source.PrismaDsvExecutionApiService(storage.prisma);
  const notifications = new source.PrismaDsvOperationalDriverNotificationService(storage.prisma, { send: async () => { throw new Error('No provider sending is allowed'); } });
  source.registerDsvExecutionRoutes(app, {
    admin: { cookieName, sessionSecret: secret, sessionResolver: { resolve: async (subject) => {
      if (!(subject in roles)) throw new Error('Unknown synthetic subject');
      return roles[subject];
    } } },
    commands, contexts, notifications, driverJwtSecret: secret,
    driverPrincipalResolver: { resolve: async () => { throw new Error('Driver authentication is outside this fixture'); } },
  });
  const createSession = (role = 'admin') => {
    assert.ok(role in roles);
    return source.createAdminWebSession({ cookieName, path: '/api/dsv/', secure: false, sessionSecret: secret, subject: role });
  };
  const legacy = (data) => ({ data, meta: { apiVersion: 'dsv.v1' }, requestId: 'synthetic-source-bootstrap' });
  app.get('/api/dsv/__fixture/health', async () => ({ serverCommit, fixture: 'source-routes-synthetic-storage' }));
  app.get('/api/dsv/__fixture/session/:role', async (request, reply) => {
    const signed = createSession(request.params.role);
    return reply.header('set-cookie', signed.cookieHeader).send({ csrfToken: signed.session.csrfToken });
  });
  app.get('/api/dsv/__fixture/state', async () => ({ reportStatus: storage.tables().dsvDeliveryException[0].status, routeStatus: storage.tables().routePlan[0].status, stopStatus: storage.tables().routePlan[0].routeStops[0].deliveryStop.status, ackCount: storage.tables().dsvOperationalNotificationAck.length }));
  app.get('/api/dsv/v1/session', async (request, reply) => {
    const session = source.verifyAdminWebSessionFromRequest({ cookieName, request, sessionSecret: secret });
    if (!session || !roles[session.subject]) return reply.code(401).send({ error: { code: 'UNAUTHORIZED' } });
    return legacy({ ...roles[session.subject], csrfToken: session.csrfToken, displayName: '소스 통합 합성 관리자' });
  });
  app.get('/api/dsv/auth/session', async (request, reply) => {
    const session = source.verifyAdminWebSessionFromRequest({ cookieName, request, sessionSecret: secret });
    if (!session) return reply.code(401).send({ error: { code: 'UNAUTHORIZED' } });
    return { data: { csrfToken: session.csrfToken } };
  });
  return { app, createSession, storage, serverCommit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { app } = await createSourceServer({ sourceDirectory: process.argv[2] ?? process.env.DSV_OPERATIONS_SERVER_SOURCE });
  const port = Number(process.env.DSV_OPERATIONS_SOURCE_PORT ?? 3007);
  await app.listen({ host: '127.0.0.1', port });
  console.log(`Pinned DSV source HTTP fixture listening on 127.0.0.1:${port}; commit=${serverCommit}; synthetic storage; no provider sending.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
}
