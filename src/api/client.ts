import { apiConfig } from './config';
import { expireTransportSession, readAuthToken, readCsrfToken, storeCsrfToken } from './auth-session';

export type DsvDispatchResource = 'customers' | 'destinations' | 'dispatches' | 'drivers' | 'vehicles';
export type DsvDispatchAttempt = {
  attemptId: string;
  loadId: string;
};
export type DsvDispatchResponseMetadata = {
  apiVersion?: 'dsv.v1' | 'invalid' | 'missing';
  contentType?: 'application/json' | 'text/html' | 'other' | 'missing';
  httpStatus?: number;
  responseRequestId?: string;
};
export type DsvDispatchFailureMetadata = DsvDispatchResponseMetadata & {
  errorCode: 'CONTENT_TYPE_ERROR' | 'HTTP_ERROR' | 'JSON_PARSE_ERROR' | 'LIST_PARSER_INVALID' | 'NETWORK_ERROR' | 'UNEXPECTED_ERROR' | 'V1_ENVELOPE_INVALID';
  failedResource: DsvDispatchResource;
  failureStage: 'content_type' | 'envelope' | 'http' | 'json' | 'parser' | 'transport' | 'unexpected';
};
export type DsvDispatchReadContext = {
  attempt: DsvDispatchAttempt;
  resource: DsvDispatchResource;
  response?: DsvDispatchResponseMetadata;
};

type JsonRequestInit = Omit<RequestInit, 'body'> & {
  dsvDispatchRead?: DsvDispatchReadContext;
  json?: unknown;
};

type RequestTarget = {
  method: string;
  path: string;
};

type LegacyEnvelope<ResponseBody> = {
  data?: ResponseBody;
  error?: unknown;
};

type V1Envelope<ResponseBody> = {
  data: ResponseBody;
  meta: { apiVersion: 'dsv.v1' };
  requestId: string;
};

type V1ErrorBody = {
  error: {
    code: string;
    details?: Record<string, unknown>;
    message: string;
    requestId: string;
  };
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class DsvDispatchLoadError extends Error {
  constructor(
    message: string,
    public readonly diagnostic: DsvDispatchFailureMetadata,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DsvDispatchLoadError';
  }
}

const legacyAllowlist: Array<{ method: string; pattern: RegExp }> = [
  { method: 'POST', pattern: /^auth\/login$/u },
  { method: 'POST', pattern: /^auth\/logout$/u },
  { method: 'GET', pattern: /^auth\/session$/u },
  { method: 'POST', pattern: /^dispatch-imports\/preview$/u },
  { method: 'POST', pattern: /^dispatch-imports$/u },
  { method: 'POST', pattern: /^dispatch-imports\/[^/]+\/apply$/u },
  { method: 'POST', pattern: /^conditions$/u },
  { method: 'PATCH', pattern: /^conditions\/[^/]+$/u },
  { method: 'DELETE', pattern: /^conditions\/[^/]+$/u },
  { method: 'GET', pattern: /^settings\/operations$/u },
  { method: 'PATCH', pattern: /^settings\/operations$/u },
  { method: 'POST', pattern: /^settings\/operations\/geocode$/u },
  { method: 'GET', pattern: /^manual-email$/u },
  { method: 'POST', pattern: /^manual-email$/u },
  { method: 'GET', pattern: /^admin-accounts$/u },
  { method: 'GET', pattern: /^driver-inquiries$/u },
  { method: 'GET', pattern: /^driver-inquiries\/[^/]+$/u },
  { method: 'POST', pattern: /^admin-accounts\/invitations$/u },
  { method: 'PATCH', pattern: /^admin-accounts\/[^/]+\/status$/u },
  { method: 'DELETE', pattern: /^admin-accounts\/[^/]+\/session$/u },
  { method: 'DELETE', pattern: /^admin-accounts\/[^/]+$/u },
  { method: 'POST', pattern: /^admin\/auth\/invitations\/validate$/u },
  { method: 'POST', pattern: /^admin\/auth\/complete$/u },
  { method: 'PATCH', pattern: /^auth\/credentials$/u },
  { method: 'GET', pattern: /^customers\/[^/]+\/accounts$/u },
  { method: 'POST', pattern: /^customers\/[^/]+\/accounts\/invitations$/u },
  { method: 'POST', pattern: /^customer-accounts\/[^/]+\/reinvite$/u },
  { method: 'POST', pattern: /^customer-accounts\/[^/]+\/password-reset$/u },
  { method: 'PATCH', pattern: /^customer-accounts\/[^/]+\/status$/u },
  { method: 'DELETE', pattern: /^customer-accounts\/[^/]+$/u },
  { method: 'POST', pattern: /^customer\/auth\/invitations\/validate$/u },
  { method: 'POST', pattern: /^customer\/auth\/complete$/u },
  { method: 'POST', pattern: /^customer\/auth\/login$/u },
  { method: 'GET', pattern: /^driver-account-links\/pending$/u },
  { method: 'POST', pattern: /^driver-account-links\/[^/]+\/approve$/u },
  { method: 'POST', pattern: /^drivers\/[^/]+\/password-reset-link$/u },
  { method: 'GET', pattern: /^drivers\/[^/]+\/account$/u },
  { method: 'POST', pattern: /^drivers$/u },
  { method: 'PATCH', pattern: /^drivers\/[^/]+$/u },
  { method: 'DELETE', pattern: /^drivers\/[^/]+$/u },
  { method: 'POST', pattern: /^vehicles$/u },
  { method: 'PATCH', pattern: /^vehicles\/[^/]+$/u },
  { method: 'DELETE', pattern: /^vehicles\/[^/]+$/u },
  { method: 'POST', pattern: /^vehicles\/[^/]+\/drivers$/u },
  { method: 'DELETE', pattern: /^vehicles\/[^/]+\/drivers\/[^/]+$/u },
  { method: 'GET', pattern: /^control\/delivery-stops\/[^/]+\/context$/u },
];

const v1ReadAllowlist: Array<{ method: string; pattern: RegExp }> = [
  { method: 'GET', pattern: /^session$/u },
  { method: 'POST', pattern: /^session\/logout$/u },
  { method: 'GET', pattern: /^map\/profile$/u },
  { method: 'GET', pattern: /^control$/u },
  { method: 'GET', pattern: /^control\/routes$/u },
  { method: 'GET', pattern: /^dispatches$/u },
  { method: 'GET', pattern: /^records$/u },
  { method: 'GET', pattern: /^drivers$/u },
  { method: 'GET', pattern: /^vehicles$/u },
  { method: 'GET', pattern: /^vehicles\/[^/]+\/gps-trail-history$/u },
  { method: 'GET', pattern: /^vehicles\/[^/]+\/temperature-history$/u },
  { method: 'GET', pattern: /^customers$/u },
  { method: 'GET', pattern: /^destinations$/u },
  { method: 'GET', pattern: /^conditions$/u },
  { method: 'GET', pattern: /^customer\/deliveries$/u },
  { method: 'GET', pattern: /^customers\/deliveries$/u },
  { method: 'GET', pattern: /^operational-notifications$/u },
];

const assignmentCommandAllowlist: Array<{ method: string; pattern: RegExp }> = [
  { method: 'POST', pattern: /^seller-order-assignments\/reassign$/u },
  { method: 'POST', pattern: /^seller-order-assignments\/unassign$/u },
  { method: 'POST', pattern: /^seller-order-deletions$/u },
  { method: 'POST', pattern: /^seller-orders\/[^/]+\/assignment\/unassign$/u },
  { method: 'POST', pattern: /^seller-orders\/[^/]+\/assignment\/reassign$/u },
];

const timeConstraintCommandAllowlist: Array<{ method: string; pattern: RegExp }> = [
  { method: 'POST', pattern: /^seller-orders\/[^/]+\/time-constraint\/confirm$/u },
  { method: 'POST', pattern: /^seller-orders\/[^/]+\/time-constraint\/clear$/u },
];

const dispatchOperationCommandAllowlist: Array<{ method: string; pattern: RegExp }> = [
  { method: 'POST', pattern: /^seller-orders\/[^/]+\/active-removal\/request$/u },
  { method: 'POST', pattern: /^seller-orders\/[^/]+\/messages$/u },
  { method: 'POST', pattern: /^seller-orders\/[^/]+\/recover-unassigned$/u },
  { method: 'POST', pattern: /^dispatch-change-requests\/[^/]+\/cancel$/u },
];

const customerCommandAllowlist: Array<{ method: string; pattern: RegExp }> = [
  { method: 'PATCH', pattern: /^customers\/[^/]+\/notification-settings$/u },
];

type DsvOperationsRequestInit = {
  json?: unknown;
  method?: 'GET' | 'POST';
  signal?: AbortSignal;
};

export class DsvOperationsError extends ApiError {
  constructor(status: number, public readonly code: string, message: string, body?: unknown) {
    super(status, message, body);
    this.name = 'DsvOperationsError';
  }
}

const operationsUuidSource = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const operationsUuid = new RegExp(`^${operationsUuidSource}$`, 'iu');
const operationsAllowlist = [
  { method: 'GET', pattern: /^operations\/executions$/u, query: ['serviceDate'] },
  { method: 'GET', pattern: new RegExp(`^operations/executions/${operationsUuidSource}$`, 'iu'), query: [] },
  { method: 'POST', pattern: /^operations\/executions\/(?:map|select)$/u, query: [] },
  { method: 'GET', pattern: /^operations\/(?:notifications|delivery-exceptions)$/u, query: ['cursor', 'limit'] },
  { method: 'GET', pattern: new RegExp(`^operations/notifications/${operationsUuidSource}/resolve$`, 'iu'), query: [] },
  { method: 'POST', pattern: new RegExp(`^operations/notifications/${operationsUuidSource}/acks$`, 'iu'), query: [] },
  { method: 'GET', pattern: new RegExp(`^operations/delivery-exceptions/${operationsUuidSource}$`, 'iu'), query: [] },
  { method: 'POST', pattern: new RegExp(`^operations/delivery-exceptions/${operationsUuidSource}/(?:acknowledge|resolve)$`, 'iu'), query: [] },
];

/** This envelope is exclusive to the additive operations routes. */
export async function requestDsvOperationsJson<ResponseBody>(path: string, init: DsvOperationsRequestInit = {}): Promise<ResponseBody> {
  const target = requestTarget(path, init.method);
  assertOperationsRequest(path, target, init.json);
  // Retain one immutable payload through the existing CSRF refresh retry.
  const request: JsonRequestInit = {
    cache: 'no-store', method: target.method, signal: init.signal,
    ...(init.json === undefined ? {} : { json: JSON.parse(JSON.stringify(init.json)) as unknown }),
  };
  let response: Response;
  let body: unknown;
  try {
    response = await fetchJson(apiConfig.v1BaseUrl, path, request);
    if (response.status === 401) expireTransportSession();
    body = await readOperationsResponseBody(response);
    // The additive server uses the same FORBIDDEN response for CSRF and scope failure.
    // Refresh once; the retried command retains its input and still requires server permission.
    const forbidden = strictOperationsError(response.status, body);
    if (target.method === 'POST' && response.status === 403 && forbidden.code === 'FORBIDDEN'
      && (forbidden.message === 'FORBIDDEN' || forbidden.message === 'Invalid CSRF token')
      && await refreshCsrfToken()) {
      response = await fetchJson(apiConfig.v1BaseUrl, path, request);
      if (response.status === 401) expireTransportSession();
      body = await readOperationsResponseBody(response);
    }
  } catch (error) {
    if (error instanceof ApiError || isAbortError(error)) throw error;
    throw new DsvOperationsError(0, 'NETWORK_ERROR', '운영 API에 연결하지 못했습니다.');
  }
  if (!response.ok) throw strictOperationsError(response.status, body);
  if (!isExactObject(body, ['data', 'error']) || body.error !== null || body.data === null || body.data === undefined) {
    throw new DsvOperationsError(502, 'INVALID_RESPONSE', '운영 API 응답 형식이 올바르지 않습니다.');
  }
  return body.data as ResponseBody;
}

function assertOperationsRequest(path: string, target: RequestTarget, json: unknown): void {
  const entry = operationsAllowlist.find((allowed) => allowed.method === target.method && allowed.pattern.test(target.path));
  if (entry === undefined || path.startsWith('/') || path.includes('#')) throw disallowedRequest('operations', target);
  const query = new URLSearchParams(path.split('?')[1] ?? '');
  const keys = [...query.keys()];
  if (path.split('?').length > 2 || keys.some((key) => !entry.query.includes(key)) || new Set(keys).size !== keys.length) {
    throw disallowedRequest('operations query', target);
  }
  for (const [key, value] of query) {
    if ((key === 'serviceDate' && !validOperationsDate(value))
      || (key === 'cursor' && !/^[A-Za-z0-9_-]{1,300}$/u.test(value))
      || (key === 'limit' && (!/^\d+$/u.test(value) || Number(value) < 1 || Number(value) > 100))) {
      throw disallowedRequest('operations query', target);
    }
  }
  if (target.method === 'GET') {
    if (json !== undefined) throw disallowedRequest('operations body', target);
    return;
  }
  const body = json;
  const isUuid = (value: unknown): boolean => typeof value === 'string' && operationsUuid.test(value);
  let valid = false;
  if (target.path === 'operations/executions/map' && isJsonObject(body)) {
    const required = ['commandId', 'effectiveAt', 'mapping', 'routePlanId'];
    valid = isExactObject(body, body.mapping === 'SAME_EXECUTION' ? [...required, 'executionContextId'] : required)
      && isUuid(body.commandId) && isUuid(body.routePlanId) && validOperationsInstant(body.effectiveAt)
      && (body.mapping === 'NEW_EXECUTION' || (body.mapping === 'SAME_EXECUTION' && isUuid(body.executionContextId)));
  } else if (target.path === 'operations/executions/select' && isExactObject(body, ['commandId', 'executionContextId', 'validFrom', 'validUntil', 'vehicleId'])) {
    valid = isUuid(body.commandId) && isUuid(body.executionContextId) && isUuid(body.vehicleId)
      && validOperationsInstant(body.validFrom) && validOperationsInstant(body.validUntil)
      && Date.parse(body.validUntil as string) > Date.parse(body.validFrom as string);
  } else if (target.path.endsWith('/acks') && isExactObject(body, ['ackKind'])) {
    valid = body.ackKind === 'READ' || body.ackKind === 'OPENED';
  } else if (/\/(?:acknowledge|resolve)$/u.test(target.path)) {
    valid = isExactObject(body, []);
  }
  if (!valid) throw disallowedRequest('operations body', target);
}

function validOperationsDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && !value.startsWith('0000-')
    && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function validOperationsInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) return false;
  return Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z'));
}

async function readOperationsResponseBody(response: Response): Promise<unknown> {
  if (normalizedContentType(response.headers.get('content-type')) !== 'application/json') {
    throw new DsvOperationsError(response.ok ? 502 : response.status, 'INVALID_RESPONSE', '운영 API가 JSON 응답을 반환하지 않았습니다.');
  }
  try {
    return await readResponseBody(response);
  } catch (error) {
    if (isAbortError(error) || !(error instanceof ApiError)) throw error;
    throw new DsvOperationsError(response.ok ? 502 : response.status, 'INVALID_RESPONSE', '운영 API JSON 응답 형식이 올바르지 않습니다.');
  }
}

function strictOperationsError(status: number, body: unknown): DsvOperationsError {
  if (!isExactObject(body, ['data', 'error']) || body.data !== null || !isExactObject(body.error, ['code', 'message'])
    || typeof body.error.code !== 'string' || body.error.code.trim() === ''
    || typeof body.error.message !== 'string' || body.error.message.trim() === '') {
    return new DsvOperationsError(status, 'INVALID_RESPONSE', '운영 API 오류 응답 형식이 올바르지 않습니다.');
  }
  return new DsvOperationsError(status, body.error.code, body.error.message, body);
}

export async function requestV1ReadJson<ResponseBody>(path: string, init: JsonRequestInit = {}): Promise<ResponseBody> {
  const target = requestTarget(path, init.method);
  assertAllowed('v1 read', target, v1ReadAllowlist);
  const dispatchRead = verifiedDsvDispatchRead(target, init.dsvDispatchRead);
  let response: Response;
  try {
    response = await fetchJson(apiConfig.v1BaseUrl, path, { ...init, method: target.method });
  } catch (error) {
    if (dispatchRead === undefined || isAbortError(error)) throw error;
    throw dispatchLoadError(error, dispatchRead, {
      errorCode: 'NETWORK_ERROR',
      failureStage: 'transport',
    });
  }
  if (response.status === 401) expireTransportSession();
  if (dispatchRead !== undefined) return readInstrumentedV1Response<ResponseBody>(response, dispatchRead);
  const body = await readV1ResponseBody(response);
  if (!response.ok) throw strictV1Error(response.status, body);
  return strictV1Data<ResponseBody>(body);
}

export function markDsvDispatchParserFailure(error: unknown, context: DsvDispatchReadContext): DsvDispatchLoadError {
  if (error instanceof DsvDispatchLoadError) return error;
  return dispatchLoadError(error, context, {
    ...context.response,
    errorCode: 'LIST_PARSER_INVALID',
    failureStage: 'parser',
  });
}

export function dsvDispatchFailureMetadata(error: unknown): DsvDispatchFailureMetadata | null {
  return error instanceof DsvDispatchLoadError ? error.diagnostic : null;
}

export async function requestV1AssignmentCommandJson<ResponseBody>(path: string, init: JsonRequestInit = {}): Promise<ResponseBody> {
  const target = requestTarget(path, init.method);
  assertAllowed('v1 assignment command', target, assignmentCommandAllowlist);
  const { body, response } = await fetchV1CommandResponse(path, init, target, readAssignmentCommandResponseBody);
  if (!response.ok) throw legacyAssignmentCommandError(response.status, body);
  return legacyAssignmentCommandData<ResponseBody>(body);
}

export async function requestV1TimeConstraintCommandJson<ResponseBody>(path: string, init: JsonRequestInit = {}): Promise<ResponseBody> {
  const target = requestTarget(path, init.method);
  assertAllowed('v1 time constraint command', target, timeConstraintCommandAllowlist);
  const { body, response } = await fetchV1CommandResponse(path, init, target, readV1ResponseBody);
  if (!response.ok) throw strictV1Error(response.status, body);
  return strictV1Data<ResponseBody>(body);
}

export async function requestV1DispatchOperationCommandJson<ResponseBody>(path: string, init: JsonRequestInit = {}): Promise<ResponseBody> {
  const target = requestTarget(path, init.method);
  assertAllowed('v1 dispatch operation command', target, dispatchOperationCommandAllowlist);
  const { body, response } = await fetchV1CommandResponse(path, init, target, readV1ResponseBody);
  if (!response.ok) throw strictV1Error(response.status, body);
  return strictV1Data<ResponseBody>(body);
}

export async function requestV1CustomerCommandJson<ResponseBody>(path: string, init: JsonRequestInit = {}): Promise<ResponseBody> {
  const target = requestTarget(path, init.method);
  assertAllowed('v1 customer command', target, customerCommandAllowlist);
  const { body, response } = await fetchV1CommandResponse(path, init, target, readV1ResponseBody);
  if (!response.ok) throw strictV1Error(response.status, body);
  return strictV1Data<ResponseBody>(body);
}

export async function requestLegacyJson<ResponseBody>(path: string, init: JsonRequestInit = {}): Promise<ResponseBody> {
  const target = requestTarget(path, init.method);
  assertAllowed('legacy API', target, legacyAllowlist);
  let response = await fetchJson(apiConfig.legacyBaseUrl, path, { ...init, method: target.method });
  if (response.status === 401 && !isPublicAuthPath(target.path)) expireTransportSession();
  let body = await readResponseBody(response);
  if (isCsrfFailure(response.status, body) && await refreshCsrfToken()) {
    response = await fetchJson(apiConfig.legacyBaseUrl, path, { ...init, method: target.method });
    if (response.status === 401 && !isPublicAuthPath(target.path)) expireTransportSession();
    body = await readResponseBody(response);
  }
  if (!response.ok) throw new ApiError(response.status, errorMessage(body, response.status), body);
  return legacyData<ResponseBody>(body);
}

function isPublicAuthPath(path: string): boolean {
  return /^(?:customer|admin)\/auth\/(?:invitations\/validate|complete|login)$/u.test(path);
}

export const requestJson = requestLegacyJson;

function assertAllowed(boundary: string, target: RequestTarget, allowlist: Array<{ method: string; pattern: RegExp }>): void {
  if (!allowlist.some((entry) => entry.method === target.method && entry.pattern.test(target.path))) throw disallowedRequest(boundary, target);
}

function disallowedRequest(boundary: string, target: RequestTarget): ApiError {
  return new ApiError(400, `${boundary} allowlist 밖의 API 요청입니다: ${target.method} /${target.path}`);
}

async function fetchV1CommandResponse(
  path: string,
  init: JsonRequestInit,
  target: RequestTarget,
  readBody: (response: Response) => Promise<unknown>,
): Promise<{ body: unknown; response: Response }> {
  let response = await fetchJson(apiConfig.v1BaseUrl, path, { ...init, method: target.method });
  if (response.status === 401) expireTransportSession();
  let body = await readBody(response);
  if (isCsrfFailure(response.status, body) && await refreshCsrfToken()) {
    response = await fetchJson(apiConfig.v1BaseUrl, path, { ...init, method: target.method });
    if (response.status === 401) expireTransportSession();
    body = await readBody(response);
  }
  return { body, response };
}

async function fetchJson(baseUrl: string, path: string, { dsvDispatchRead, json, headers, ...init }: JsonRequestInit): Promise<Response> {
  const token = readAuthToken();
  const csrfToken = readCsrfToken();
  const method = methodFor(init.method);
  const dispatchHeaders: Record<string, string> = dsvDispatchRead === undefined ? {} : {
    'X-Caller-Surface': 'dsv-dispatch',
    'X-DSV-Attempt-Id': dsvDispatchRead.attempt.attemptId,
    'X-DSV-Load-Id': dsvDispatchRead.attempt.loadId,
  };
  return fetch(`${baseUrl}/${path.replace(/^\/+/, '')}`, {
    ...init,
    body: json === undefined ? undefined : JSON.stringify(json),
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(csrfToken && !['GET', 'HEAD'].includes(method) ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...dispatchHeaders,
      ...headers,
    },
    method,
  });
}

function verifiedDsvDispatchRead(target: RequestTarget, context: DsvDispatchReadContext | undefined): DsvDispatchReadContext | undefined {
  if (context === undefined) return undefined;
  if (target.method !== 'GET' || target.path !== context.resource) {
    throw new ApiError(400, `DSV 배차 진단 범위 밖의 API 요청입니다: ${target.method} /${target.path}`);
  }
  return context;
}

async function readInstrumentedV1Response<ResponseBody>(response: Response, context: DsvDispatchReadContext): Promise<ResponseBody> {
  const baseMetadata = responseMetadata(response);
  context.response = baseMetadata;
  if (!response.ok) {
    const body = await readJsonIfAvailable(response, baseMetadata.contentType);
    const metadata = { ...baseMetadata, ...bodyMetadata(body, response) };
    context.response = metadata;
    const apiError = strictV1Error(response.status, body);
    throw dispatchLoadError(apiError, context, {
      ...metadata,
      errorCode: 'HTTP_ERROR',
      failureStage: 'http',
    });
  }
  if (baseMetadata.contentType !== 'application/json') {
    throw dispatchLoadError(new ApiError(502, 'API v1 응답 Content-Type이 올바르지 않습니다.'), context, {
      ...baseMetadata,
      errorCode: 'CONTENT_TYPE_ERROR',
      failureStage: 'content_type',
    });
  }
  let body: unknown;
  try {
    const text = response.status === 204 ? '' : await response.text();
    if (!text) body = undefined;
    else {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        throw dispatchLoadError(new ApiError(502, 'API가 올바른 JSON을 반환하지 않았습니다.'), context, {
          ...baseMetadata,
          errorCode: 'JSON_PARSE_ERROR',
          failureStage: 'json',
        });
      }
    }
  } catch (error) {
    if (error instanceof DsvDispatchLoadError || isAbortError(error)) throw error;
    throw dispatchLoadError(error, context, {
      ...baseMetadata,
      errorCode: 'NETWORK_ERROR',
      failureStage: 'transport',
    });
  }
  const metadata = { ...baseMetadata, ...bodyMetadata(body, response) };
  context.response = metadata;
  try {
    return strictV1Data<ResponseBody>(body);
  } catch (error) {
    throw dispatchLoadError(error, context, {
      ...metadata,
      errorCode: 'V1_ENVELOPE_INVALID',
      failureStage: 'envelope',
    });
  }
}

async function readJsonIfAvailable(response: Response, contentType: DsvDispatchResponseMetadata['contentType']): Promise<unknown> {
  if (response.status === 204 || contentType !== 'application/json') return undefined;
  try {
    return await readResponseBody(response);
  } catch {
    return undefined;
  }
}

function responseMetadata(response: Response): DsvDispatchResponseMetadata {
  return {
    contentType: normalizedContentType(response.headers.get('content-type')),
    httpStatus: response.status,
    ...(safeIdentifier(response.headers.get('x-request-id')) === undefined
      ? {}
      : { responseRequestId: safeIdentifier(response.headers.get('x-request-id')) }),
  };
}

function bodyMetadata(body: unknown, response: Response): DsvDispatchResponseMetadata {
  const meta = isObject(body) && isObject(body.meta) ? body.meta : undefined;
  const apiVersion = meta === undefined || !Object.hasOwn(meta, 'apiVersion')
    ? 'missing'
    : meta.apiVersion === 'dsv.v1' ? 'dsv.v1' : 'invalid';
  const bodyRequestId = isObject(body) && typeof body.requestId === 'string'
    ? body.requestId
    : isObject(body) && isObject(body.error) && typeof body.error.requestId === 'string'
      ? body.error.requestId
      : undefined;
  const responseRequestId = safeIdentifier(bodyRequestId) ?? safeIdentifier(response.headers.get('x-request-id'));
  return {
    apiVersion,
    ...(responseRequestId === undefined ? {} : { responseRequestId }),
  };
}

function normalizedContentType(value: string | null): DsvDispatchResponseMetadata['contentType'] {
  if (value === null || value.trim() === '') return 'missing';
  const mediaType = value.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType === 'application/json' || mediaType?.endsWith('+json')) return 'application/json';
  if (mediaType === 'text/html') return 'text/html';
  return 'other';
}

function safeIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,120}$/u.test(value) ? value : undefined;
}

function dispatchLoadError(
  error: unknown,
  context: DsvDispatchReadContext,
  metadata: Omit<DsvDispatchFailureMetadata, 'failedResource'>,
): DsvDispatchLoadError {
  const message = error instanceof Error ? error.message : '배차 목록 요청에 실패했습니다.';
  return new DsvDispatchLoadError(message, { ...metadata, failedResource: context.resource }, { cause: error });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function refreshCsrfToken(): Promise<boolean> {
  try {
    const response = await fetchJson(apiConfig.legacyBaseUrl, 'auth/session', { method: 'GET' });
    if (response.status === 401) expireTransportSession();
    const body = await readResponseBody(response);
    if (!response.ok) return false;
    const session = legacyData<{ csrfToken?: unknown }>(body);
    if (typeof session.csrfToken !== 'string' || session.csrfToken === '') return false;
    storeCsrfToken(session.csrfToken);
    return true;
  } catch {
    return false;
  }
}

function isCsrfFailure(status: number, body: unknown): boolean {
  return status === 403
    && isObject(body)
    && isObject(body.error)
    && body.error.code === 'FORBIDDEN'
    && body.error.message === 'Invalid CSRF token';
}

function strictV1Data<ResponseBody>(body: unknown): ResponseBody {
  if (!isExactObject(body, ['data', 'meta', 'requestId']) || !isExactObject(body.meta, ['apiVersion'])
    || body.meta.apiVersion !== 'dsv.v1' || typeof body.requestId !== 'string' || body.requestId.trim() === '') {
    throw new ApiError(502, 'API v1 응답 형식이 올바르지 않습니다.', body);
  }
  return (body as V1Envelope<ResponseBody>).data;
}

function strictV1Error(status: number, body: unknown): ApiError {
  if (!isExactObject(body, ['error']) || !isV1Error(body.error)) {
    return new ApiError(502, 'API v1 오류 응답 형식이 올바르지 않습니다.', body);
  }
  return new ApiError(status, (body as V1ErrorBody).error.message, body);
}

function isV1Error(value: unknown): value is V1ErrorBody['error'] {
  if (!isJsonObject(value)) return false;
  const keys = Object.keys(value);
  const requiredKeys = ['code', 'message', 'requestId'];
  const allowedKeys = [...requiredKeys, 'details'];
  return requiredKeys.every((key) => keys.includes(key))
    && keys.every((key) => allowedKeys.includes(key))
    && typeof value.code === 'string'
    && typeof value.message === 'string'
    && typeof value.requestId === 'string'
    && (!('details' in value) || isJsonObject(value.details));
}

function legacyAssignmentCommandData<ResponseBody>(body: unknown): ResponseBody {
  if (!isLegacyEnvelope<ResponseBody>(body)) throw invalidAssignmentCommandEnvelope(body);
  if (body.error !== null && body.error !== undefined) {
    if (!isObject(body.error) || typeof body.error.message !== 'string') throw invalidAssignmentCommandEnvelope(body);
    throw new ApiError(502, body.error.message, body);
  }
  return body.data as ResponseBody;
}

function legacyAssignmentCommandError(status: number, body: unknown): ApiError {
  if (!isLegacyEnvelope(body) || !isObject(body.error) || typeof body.error.message !== 'string') return invalidAssignmentCommandEnvelope(body);
  return new ApiError(status, body.error.message, body);
}

function invalidAssignmentCommandEnvelope(body: unknown): ApiError {
  return new ApiError(502, 'v1 배정 명령 API 응답 형식이 올바르지 않습니다.', body);
}

function legacyData<ResponseBody>(body: unknown): ResponseBody {
  if (isLegacyEnvelope<ResponseBody>(body)) {
    if (body.error !== null && body.error !== undefined) throw new ApiError(502, errorMessage(body, 502), body);
    return body.data as ResponseBody;
  }
  return body as ResponseBody;
}

function isLegacyEnvelope<ResponseBody>(body: unknown): body is LegacyEnvelope<ResponseBody> {
  return isObject(body) && 'data' in body && 'error' in body;
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(response.status, 'API가 올바른 JSON을 반환하지 않았습니다.', text);
  }
}

async function readV1ResponseBody(response: Response): Promise<unknown> {
  try {
    return await readResponseBody(response);
  } catch (error) {
    const body = error instanceof ApiError ? error.body : undefined;
    throw new ApiError(502, response.ok ? 'API v1 응답 형식이 올바르지 않습니다.' : 'API v1 오류 응답 형식이 올바르지 않습니다.', body);
  }
}

async function readAssignmentCommandResponseBody(response: Response): Promise<unknown> {
  try {
    return await readResponseBody(response);
  } catch (error) {
    const body = error instanceof ApiError ? error.body : undefined;
    throw invalidAssignmentCommandEnvelope(body);
  }
}

function errorMessage(body: unknown, status: number): string {
  if (isObject(body) && isObject(body.error) && typeof body.error.message === 'string') return body.error.message;
  if (isObject(body) && typeof body.message === 'string') return body.message;
  return `API 요청에 실패했습니다. (${status})`;
}

function requestTarget(path: string, method?: string): RequestTarget {
  return { method: methodFor(method), path: pathOnly(path) };
}

function methodFor(method?: string): string {
  return (method ?? 'GET').toUpperCase();
}

function pathOnly(path: string): string {
  return path.replace(/^\/+/, '').split(/[?#]/u, 1)[0] ?? '';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return isObject(value) && !Array.isArray(value);
}

function isExactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key));
}
