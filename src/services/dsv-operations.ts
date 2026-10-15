import { ApiError, DsvOperationsError, requestDsvOperationsJson } from '../api/client';
import { operationsEnabled } from '../config/dsv-operations';

export type StatusCounts = Record<string, number>;
export type ExecutionContext = {
  assignmentEpoch: string;
  closedAt: string | null;
  departureObservedAt: string | null;
  driverId: string | null;
  endReason: string | null;
  executionContextId: string;
  monitorEndAt: string | null;
  monitorStartAt: string | null;
  notificationMode: string;
  reminderDueAt: string | null;
  reminderIncidentId: string | null;
  reminderOrdinal: number;
  reminderStatus: string;
  routePlanId: string;
  routeVersion: number;
  serviceDate: string;
  startedAt: string | null;
  status: string;
  vehicleId: string | null;
  warehouseNotifiedAt: string | null;
};
export type ExecutionListItem = ExecutionContext & {
  assignmentGeneration: string | null;
  expectedRouteVersionId: string | null;
  notificationSummary: { byBusinessStatus: StatusCounts; byKind: StatusCounts; total: number };
  missingStartDelivery: {
    attemptRecordsByStatus: StatusCounts;
    businessByStatus: StatusCounts;
    warningCount: number;
    workerAttemptCount: number;
  };
  operationalSummaryTruncated: boolean;
};
export type ExecutionList = { items: ExecutionListItem[]; limit: number };
export type GeofenceEvidence = {
  assignmentEpoch: string;
  boundary: { targetKey: string; transition: string; visitOrdinal: number };
  confirmedAt: string;
  confirmedObservedAt: string;
  firstObservedAt: string;
  id: string;
  policyVersion: string;
  routeVersion: number;
  sourceSampleId: string;
};
export type ExecutionNotification = {
  assignmentEpoch: string;
  attemptRecordsByStatus: StatusCounts;
  businessStatus: string;
  createdAt: string;
  dueAt: string;
  expiresAt: string;
  id: string;
  kind: string;
  lastCompletedAt: string | null;
  ordinal: number;
  resolutionReason: string | null;
  resolvedAt: string | null;
  routeVersion: number;
  workerAttemptCount: number;
};
export type DeliveryExceptionSummary = {
  acknowledgedAt: string | null;
  createdAt: string;
  id: string;
  reasonCode: string;
  resolvedAt: string | null;
  status: string;
  targetStopId: string;
};
export type ExecutionDetail = {
  context: ExecutionContext & { effectiveAt: string; liveEligibleAt: string | null };
  deliveryExceptions: { byStatus: StatusCounts; items: DeliveryExceptionSummary[]; limit: number; truncated: boolean };
  geofenceEvidence: { items: GeofenceEvidence[]; limit: number; truncated: boolean };
  notifications: {
    attemptRecordsByStatus: StatusCounts;
    attemptsTruncated: boolean;
    byBusinessStatus: StatusCounts;
    byKind: StatusCounts;
    items: ExecutionNotification[];
    limit: number;
    truncated: boolean;
    workerAttemptCount: number;
  };
};
export type OperationsNotification = {
  ackedAt: string | null;
  businessStatus: string;
  createdAt: string;
  expiresAt: string;
  id: string;
  kind: string;
  summary: { body: string; title: string };
};
export type NotificationResolution = {
  notificationId: string;
  destination: {
    executionContextId: string;
    reportId: string;
    targetStopId: string;
    type: 'OPERATIONS_EXCEPTION';
  };
};
export type DeliveryException = DeliveryExceptionSummary & {
  assignmentEpoch: string;
  driverId: string;
  executionContextId: string;
  explanation: string | null;
  routeVersion: number;
};
export type OperationsPage<T> = { items: T[]; nextCursor: string | null };
export type MappingCommand = {
  commandId: string;
  effectiveAt: string;
  routePlanId: string;
} & ({ mapping: 'NEW_EXECUTION' } | { mapping: 'SAME_EXECUTION'; executionContextId: string });
export type MappingResult = {
  assignmentEpoch: string | null;
  executionContextId: string | null;
  notificationKinds: string[];
  outcome: string;
  routePlanId: string;
  routeVersion: number | null;
};
export type SelectionCommand = {
  commandId: string;
  executionContextId: string;
  validFrom: string;
  validUntil: string;
  vehicleId: string;
};
export type SelectionResult = { executionContextId: string; outcome: string; vehicleId: string };

export async function loadExecutions(serviceDate: string, signal?: AbortSignal): Promise<ExecutionList> {
  const data = await operationsRequest(`operations/executions?${new URLSearchParams({ serviceDate })}`, { signal });
  const result = parseExecutionList(data);
  if (result.items.some((item) => item.serviceDate !== serviceDate)) throw invalidDto();
  return result;
}

export async function loadExecution(id: string, signal?: AbortSignal): Promise<ExecutionDetail> {
  const result = parseExecutionDetail(await operationsRequest(`operations/executions/${id}`, { signal }));
  if (!sameIdentifier(result.context.executionContextId, id)) throw invalidDto();
  return result;
}

export async function loadOperationsNotifications(cursor: string | null = null, signal?: AbortSignal, limit = 30): Promise<OperationsPage<OperationsNotification>> {
  const result = parseNotificationPage(await operationsRequest(pagePath('notifications', cursor, limit), { signal }));
  if (result.items.length > limit) throw invalidDto();
  return result;
}

export async function resolveOperationsNotification(id: string, signal?: AbortSignal): Promise<NotificationResolution> {
  const result = parseNotificationResolution(await operationsRequest(`operations/notifications/${id}/resolve`, { signal }));
  if (!sameIdentifier(result.notificationId, id)) throw invalidDto();
  return result;
}

export async function ackOperationsNotification(id: string, ackKind: 'READ' | 'OPENED', signal?: AbortSignal): Promise<{ ackedAt: string; notificationId: string }> {
  const result = checked<{ ackedAt: string; notificationId: string }>(
    await operationsRequest(`operations/notifications/${id}/acks`, { method: 'POST', json: { ackKind }, signal }),
    { ackedAt: instant, notificationId: identifier },
  );
  if (!sameIdentifier(result.notificationId, id)) throw invalidDto();
  return result;
}

export async function loadDeliveryExceptions(cursor: string | null = null, signal?: AbortSignal, limit = 30): Promise<OperationsPage<DeliveryException>> {
  const result = parseDeliveryExceptionPage(await operationsRequest(pagePath('delivery-exceptions', cursor, limit), { signal }));
  if (result.items.length > limit) throw invalidDto();
  return result;
}

export async function loadDeliveryException(id: string, signal?: AbortSignal): Promise<DeliveryException> {
  return reportFor(id, await operationsRequest(`operations/delivery-exceptions/${id}`, { signal }));
}

export async function acknowledgeDeliveryException(id: string, signal?: AbortSignal): Promise<DeliveryException> {
  return reportFor(id, await operationsRequest(`operations/delivery-exceptions/${id}/acknowledge`, { method: 'POST', json: {}, signal }));
}

export async function resolveDeliveryException(id: string, signal?: AbortSignal): Promise<DeliveryException> {
  return reportFor(id, await operationsRequest(`operations/delivery-exceptions/${id}/resolve`, { method: 'POST', json: {}, signal }));
}

export async function mapExecution(input: MappingCommand, signal?: AbortSignal): Promise<MappingResult> {
  const result = parseMappingResult(await operationsRequest('operations/executions/map', { method: 'POST', json: input, signal }));
  if (!sameIdentifier(result.routePlanId, input.routePlanId)
    || (input.mapping === 'SAME_EXECUTION' && result.executionContextId !== null && !sameIdentifier(result.executionContextId, input.executionContextId))) throw invalidDto();
  return result;
}

export async function selectExecution(input: SelectionCommand, signal?: AbortSignal): Promise<SelectionResult> {
  const result = parseSelectionResult(await operationsRequest('operations/executions/select', { method: 'POST', json: input, signal }));
  if (!sameIdentifier(result.executionContextId, input.executionContextId) || !sameIdentifier(result.vehicleId, input.vehicleId)) throw invalidDto();
  return result;
}

function operationsRequest(path: string, init: Parameters<typeof requestDsvOperationsJson>[1]): Promise<unknown> {
  if (!operationsEnabled) throw new DsvOperationsError(503, 'FEATURE_DISABLED', '회차 기능이 비활성 상태입니다.');
  return requestDsvOperationsJson<unknown>(path, init);
}

function pagePath(resource: 'notifications' | 'delivery-exceptions', cursor: string | null, limit: number): string {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor !== null) query.set('cursor', cursor);
  return `operations/${resource}?${query}`;
}

function reportFor(id: string, value: unknown): DeliveryException {
  const report = parseDeliveryException(value);
  if (!sameIdentifier(report.id, id)) throw invalidDto();
  return report;
}

export function operationErrorMessage(error: unknown): string {
  if (error instanceof DsvOperationsError && error.code === 'FEATURE_DISABLED') return error.message;
  if (error instanceof ApiError) {
    switch (error.status) {
      case 0: return '운영 API에 연결하지 못했습니다.';
      case 401: return '로그인이 만료되었습니다. 다시 로그인하세요.';
      case 403: return '현재 계정의 권한 또는 보안 토큰을 확인하세요. 다시 로그인한 뒤 다시 시도하세요.';
      case 404: return '대상을 찾을 수 없습니다. 만료되었거나 현재 권한으로 열 수 없습니다.';
      case 409: return '서버 상태가 변경되었거나 명령이 충돌했습니다. 최신 상태를 확인하세요.';
      case 503: return '운영 API가 아직 지원되지 않거나 서버 의존성이 준비되지 않았습니다.';
      default: return error instanceof DsvOperationsError && error.code === 'INVALID_RESPONSE'
        ? '운영 API 응답 형식이 올바르지 않습니다.' : `운영 API 요청에 실패했습니다. (${error.status})`;
    }
  }
  return '운영 API 요청에 실패했습니다. 연결 상태를 확인하세요.';
}

type Validator = (value: unknown) => boolean;
type Shape = Record<string, Validator>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const text: Validator = (value) => typeof value === 'string' && value.trim() !== '';
const identifier: Validator = (value) => typeof value === 'string' && uuid.test(value);
const count: Validator = (value) => Number.isSafeInteger(value) && Number(value) >= 0;
const positive: Validator = (value) => Number.isSafeInteger(value) && Number(value) >= 1;
const boolean: Validator = (value) => typeof value === 'boolean';
const epoch: Validator = (value) => typeof value === 'string' && /^[1-9]\d{0,18}$/u.test(value) && BigInt(value) <= 9_223_372_036_854_775_807n;
const instant: Validator = (value) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const date: Validator = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) && !value.startsWith('0000-')
  && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
const cursor: Validator = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,300}$/u.test(value);
const nullable = (validate: Validator): Validator => (value) => value === null || validate(value);
const array = (validate: Validator, maximum: number): Validator => (value) => Array.isArray(value) && value.length <= maximum && value.every(validate);
const shape = (fields: Shape): Validator => (value) => isObject(value)
  && Object.keys(value).length === Object.keys(fields).length
  && Object.entries(fields).every(([key, validate]) => Object.hasOwn(value, key) && validate(value[key]));
const counts: Validator = (value) => isObject(value) && Object.entries(value).every(([key, entry]) => key.trim() !== '' && count(entry));

const contextFields: Shape = {
  assignmentEpoch: epoch,
  closedAt: nullable(instant),
  departureObservedAt: nullable(instant),
  driverId: nullable(identifier),
  endReason: nullable(text),
  executionContextId: identifier,
  monitorEndAt: nullable(instant),
  monitorStartAt: nullable(instant),
  notificationMode: text,
  reminderDueAt: nullable(instant),
  reminderIncidentId: nullable(identifier),
  reminderOrdinal: count,
  reminderStatus: text,
  routePlanId: identifier,
  routeVersion: positive,
  serviceDate: date,
  startedAt: nullable(instant),
  status: text,
  vehicleId: nullable(identifier),
  warehouseNotifiedAt: nullable(instant),
};
const listItemFields: Shape = {
  ...contextFields,
  assignmentGeneration: nullable(epoch),
  expectedRouteVersionId: nullable(identifier),
  notificationSummary: shape({ byBusinessStatus: counts, byKind: counts, total: count }),
  missingStartDelivery: shape({ attemptRecordsByStatus: counts, businessByStatus: counts, warningCount: count, workerAttemptCount: count }),
  operationalSummaryTruncated: boolean,
};
const reportSummaryFields: Shape = {
  acknowledgedAt: nullable(instant), createdAt: instant, id: identifier, reasonCode: text,
  resolvedAt: nullable(instant), status: text, targetStopId: identifier,
};
const reportFields: Shape = {
  ...reportSummaryFields,
  assignmentEpoch: epoch, driverId: identifier, executionContextId: identifier, explanation: nullable(text), routeVersion: positive,
};
const notificationFields: Shape = {
  assignmentEpoch: epoch, attemptRecordsByStatus: counts, businessStatus: text, createdAt: instant, dueAt: instant,
  expiresAt: instant, id: identifier, kind: text, lastCompletedAt: nullable(instant), ordinal: count,
  resolutionReason: nullable(text), resolvedAt: nullable(instant), routeVersion: positive, workerAttemptCount: count,
};
const evidenceFields: Shape = {
  assignmentEpoch: epoch, boundary: shape({ targetKey: text, transition: text, visitOrdinal: count }),
  confirmedAt: instant, confirmedObservedAt: instant, firstObservedAt: instant, id: identifier,
  policyVersion: text, routeVersion: positive, sourceSampleId: identifier,
};
const inboxFields: Shape = {
  ackedAt: nullable(instant), businessStatus: text, createdAt: instant, expiresAt: instant,
  id: identifier, kind: text, summary: shape({ body: text, title: text }),
};

export function parseExecutionList(value: unknown): ExecutionList {
  const result = checked<ExecutionList>(value, { items: array(shape(listItemFields), 100), limit: positive });
  if (result.limit !== 100 || duplicateIds(result.items.map((item) => item.executionContextId))) throw invalidDto();
  return result;
}

export function parseExecutionDetail(value: unknown): ExecutionDetail {
  const result = checked<ExecutionDetail>(value, {
    context: shape({ ...contextFields, effectiveAt: instant, liveEligibleAt: nullable(instant) }),
    deliveryExceptions: shape({ byStatus: counts, items: array(shape(reportSummaryFields), 100), limit: positive, truncated: boolean }),
    geofenceEvidence: shape({ items: array(shape(evidenceFields), 100), limit: positive, truncated: boolean }),
    notifications: shape({
      attemptRecordsByStatus: counts, attemptsTruncated: boolean, byBusinessStatus: counts, byKind: counts,
      items: array(shape(notificationFields), 100), limit: positive, truncated: boolean, workerAttemptCount: count,
    }),
  });
  if ([result.deliveryExceptions, result.geofenceEvidence, result.notifications].some((section) => section.limit !== 100 || duplicateIds(section.items.map((item) => item.id)))) throw invalidDto();
  return result;
}

export function parseDeliveryException(value: unknown): DeliveryException {
  return checked<DeliveryException>(value, reportFields);
}

export function parseDeliveryExceptionPage(value: unknown): OperationsPage<DeliveryException> {
  const result = checked<OperationsPage<DeliveryException>>(value, { items: array(shape(reportFields), 100), nextCursor: nullable(cursor) });
  if (duplicateIds(result.items.map((item) => item.id))) throw invalidDto();
  return result;
}

export function parseNotificationPage(value: unknown): OperationsPage<OperationsNotification> {
  const result = checked<OperationsPage<OperationsNotification>>(value, { items: array(shape(inboxFields), 100), nextCursor: nullable(cursor) });
  if (duplicateIds(result.items.map((item) => item.id))) throw invalidDto();
  return result;
}

export function parseNotificationResolution(value: unknown): NotificationResolution {
  return checked<NotificationResolution>(value, {
    notificationId: identifier,
    destination: shape({ type: (type) => type === 'OPERATIONS_EXCEPTION', executionContextId: identifier, reportId: identifier, targetStopId: identifier }),
  });
}

export function parseMappingResult(value: unknown): MappingResult {
  const result = checked<MappingResult>(value, {
    assignmentEpoch: nullable(epoch), executionContextId: nullable(identifier), notificationKinds: array(text, 32),
    outcome: text, routePlanId: identifier, routeVersion: nullable(positive),
  });
  if ((result.outcome === 'ACCEPT'
    && (result.assignmentEpoch === null || result.executionContextId === null || result.routeVersion === null))
    || (['MAPPING_REQUIRED', 'SKIPPED_NON_DSV', 'SKIPPED_UNAVAILABLE'].includes(result.outcome)
      && (result.assignmentEpoch !== null || result.executionContextId !== null || result.routeVersion !== null || result.notificationKinds.length !== 0))) throw invalidDto();
  return result;
}

export function parseSelectionResult(value: unknown): SelectionResult {
  return checked<SelectionResult>(value, { executionContextId: identifier, outcome: text, vehicleId: identifier });
}

function checked<T>(value: unknown, fields: Shape): T {
  if (!shape(fields)(value)) throw invalidDto();
  return value as T;
}

function sameIdentifier(left: string, right: string): boolean { return left.toLowerCase() === right.toLowerCase(); }
function duplicateIds(ids: string[]): boolean { return new Set(ids.map((id) => id.toLowerCase())).size !== ids.length; }
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function invalidDto(): DsvOperationsError {
  return new DsvOperationsError(502, 'INVALID_RESPONSE', '운영 API 응답 형식이 올바르지 않습니다.');
}
