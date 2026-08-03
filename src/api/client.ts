import { apiConfig } from './config';
import { expireTransportSession, readAuthToken, readCsrfToken, storeCsrfToken } from './auth-session';

type JsonRequestInit = Omit<RequestInit, 'body'> & { json?: unknown };

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
  { method: 'GET', pattern: /^map\/profile$/u },
  { method: 'GET', pattern: /^control$/u },
  { method: 'GET', pattern: /^control\/routes$/u },
  { method: 'GET', pattern: /^dispatches$/u },
  { method: 'GET', pattern: /^records$/u },
  { method: 'GET', pattern: /^drivers$/u },
  { method: 'GET', pattern: /^vehicles$/u },
  { method: 'GET', pattern: /^customers$/u },
  { method: 'GET', pattern: /^destinations$/u },
  { method: 'GET', pattern: /^conditions$/u },
  { method: 'GET', pattern: /^customer\/deliveries$/u },
];

const assignmentCommandAllowlist: Array<{ method: string; pattern: RegExp }> = [
  { method: 'POST', pattern: /^seller-order-assignments\/reassign$/u },
  { method: 'POST', pattern: /^seller-order-assignments\/unassign$/u },
  { method: 'POST', pattern: /^seller-orders\/[^/]+\/assignment\/unassign$/u },
  { method: 'POST', pattern: /^seller-orders\/[^/]+\/assignment\/reassign$/u },
];

export async function requestV1ReadJson<ResponseBody>(path: string, init: JsonRequestInit = {}): Promise<ResponseBody> {
  const target = requestTarget(path, init.method);
  assertAllowed('v1 read', target, v1ReadAllowlist);
  const response = await fetchJson(apiConfig.v1BaseUrl, path, { ...init, method: target.method });
  if (response.status === 401) expireTransportSession();
  const body = await readV1ResponseBody(response);
  if (!response.ok) throw strictV1Error(response.status, body);
  return strictV1Data<ResponseBody>(body);
}

export async function requestV1AssignmentCommandJson<ResponseBody>(path: string, init: JsonRequestInit = {}): Promise<ResponseBody> {
  const target = requestTarget(path, init.method);
  assertAllowed('v1 assignment command', target, assignmentCommandAllowlist);
  let response = await fetchJson(apiConfig.v1BaseUrl, path, { ...init, method: target.method });
  if (response.status === 401) expireTransportSession();
  let body = await readAssignmentCommandResponseBody(response);
  if (isCsrfFailure(response.status, body) && await refreshCsrfToken()) {
    response = await fetchJson(apiConfig.v1BaseUrl, path, { ...init, method: target.method });
    if (response.status === 401) expireTransportSession();
    body = await readAssignmentCommandResponseBody(response);
  }
  if (!response.ok) throw legacyAssignmentCommandError(response.status, body);
  return legacyAssignmentCommandData<ResponseBody>(body);
}

export async function requestLegacyJson<ResponseBody>(path: string, init: JsonRequestInit = {}): Promise<ResponseBody> {
  const target = requestTarget(path, init.method);
  assertAllowed('legacy API', target, legacyAllowlist);
  let response = await fetchJson(apiConfig.legacyBaseUrl, path, { ...init, method: target.method });
  if (response.status === 401) expireTransportSession();
  let body = await readResponseBody(response);
  if (isCsrfFailure(response.status, body) && await refreshCsrfToken()) {
    response = await fetchJson(apiConfig.legacyBaseUrl, path, { ...init, method: target.method });
    if (response.status === 401) expireTransportSession();
    body = await readResponseBody(response);
  }
  if (!response.ok) throw new ApiError(response.status, errorMessage(body, response.status), body);
  return legacyData<ResponseBody>(body);
}

export const requestJson = requestLegacyJson;

function assertAllowed(boundary: string, target: RequestTarget, allowlist: Array<{ method: string; pattern: RegExp }>): void {
  if (!allowlist.some((entry) => entry.method === target.method && entry.pattern.test(target.path))) throw disallowedRequest(boundary, target);
}

function disallowedRequest(boundary: string, target: RequestTarget): ApiError {
  return new ApiError(400, `${boundary} allowlist 밖의 API 요청입니다: ${target.method} /${target.path}`);
}

async function fetchJson(baseUrl: string, path: string, { json, headers, ...init }: JsonRequestInit): Promise<Response> {
  const token = readAuthToken();
  const csrfToken = readCsrfToken();
  const method = methodFor(init.method);
  return fetch(`${baseUrl}/${path.replace(/^\/+/, '')}`, {
    ...init,
    body: json === undefined ? undefined : JSON.stringify(json),
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(csrfToken && !['GET', 'HEAD'].includes(method) ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    method,
  });
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
