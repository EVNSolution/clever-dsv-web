import { ApiError, requestLegacyJson } from '../api/client';
import { apiConfig } from '../api/config';

export type DriverPasswordResetLink = { expiresAt: string; method: 'ADMIN_LINK'; setupUrl: string };

// Keep raw response bodies and server messages out of UI errors and telemetry.
export class DriverPasswordResetError extends Error {
  constructor(public readonly status: number) {
    super(status === 401 ? '링크가 만료되었거나 사용할 수 없습니다. 관리자에게 새 링크를 요청해 주세요.'
      : status === 403 ? '비밀번호 초기화 권한이 없습니다.'
      : status === 404 ? '초기화할 활성 앱 계정을 찾을 수 없습니다. 배송원 계정 연결 상태를 확인해 주세요.'
      : status === 409 ? '현재 비밀번호와 다른 비밀번호를 입력해 주세요.'
      : status === 400 ? '입력 내용을 확인해 주세요. 비밀번호는 12~128자로 대문자, 소문자, 숫자, 특수문자를 포함해야 합니다.'
      : status === 429 ? '요청 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.'
      : status === 503 ? '비밀번호 초기화 기능을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.'
      : '초기화 요청을 확인하지 못했습니다. 상태를 확인한 뒤 다시 시도해 주세요.');
    this.name = 'DriverPasswordResetError';
  }
}

export async function issueDriverPasswordReset(driverId: string, signal?: AbortSignal): Promise<DriverPasswordResetLink> {
  try {
    const result = await requestLegacyJson<unknown>(`drivers/${encodeURIComponent(driverId)}/password-reset-link`, {
      method: 'POST', json: {}, cache: 'no-store', signal,
    });
    if (!object(result) || !object(result.passwordReset)) throw new DriverPasswordResetError(502);
    const reset = result.passwordReset;
    if (!validExpiry(reset) || typeof reset.setupUrl !== 'string') throw new DriverPasswordResetError(502);
    const url = new URL(reset.setupUrl);
    if (url.origin !== window.location.origin || url.pathname !== '/driver/password-reset'
      || url.search !== '' || url.username !== '' || url.password !== ''
      || !/^#token=[A-Za-z0-9_-]{43}$/u.test(url.hash)) throw new DriverPasswordResetError(502);
    return { expiresAt: reset.expiresAt, method: reset.method, setupUrl: reset.setupUrl };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw new Error('관리자 세션이 만료되었습니다. 다시 로그인해 주세요.');
    throw sanitized(error);
  }
}

export async function validateDriverPasswordReset(token: string, signal?: AbortSignal): Promise<Omit<DriverPasswordResetLink, 'setupUrl'>> {
  const result = await publicResetRequest('validate', { token }, signal);
  if (!object(result) || result.valid !== true || !validExpiry(result)) throw new DriverPasswordResetError(502);
  return { expiresAt: result.expiresAt, method: result.method };
}

export async function completeDriverPasswordReset(token: string, password: string, signal?: AbortSignal): Promise<void> {
  const result = await publicResetRequest('complete', { token, password }, signal);
  if (!object(result) || result.completed !== true) throw new DriverPasswordResetError(502);
}

async function publicResetRequest(action: 'validate' | 'complete', json: { token: string; password?: string }, signal?: AbortSignal): Promise<unknown> {
  try {
    const response = await fetch(`${apiConfig.legacyBaseUrl}/driver/auth/password-reset/${action}`, {
      method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(json),
    });
    if (!response.ok) throw new DriverPasswordResetError(response.status);
    const result: unknown = await response.json();
    if (!object(result) || result.error !== null || !object(result.data)) throw new DriverPasswordResetError(502);
    return result.data;
  } catch (error) {
    throw sanitized(error);
  }
}

function sanitized(error: unknown): Error {
  if (error instanceof DriverPasswordResetError) return error;
  return new DriverPasswordResetError(error instanceof ApiError ? error.status : 0);
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validExpiry(value: Record<string, unknown>): value is Record<string, unknown> & { expiresAt: string; method: 'ADMIN_LINK' } {
  return value.method === 'ADMIN_LINK' && typeof value.expiresAt === 'string' && Number.isFinite(Date.parse(value.expiresAt));
}
