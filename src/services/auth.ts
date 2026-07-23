import { ApiError, requestJson, requestV1ReadJson } from '../api/client';
import { apiConfig } from '../api/config';

export type LoginCredentials = { id: string; password: string };
export type PrincipalRole = 'DSV_ADMIN' | 'CUSTOMER_USER';
export type Principal = {
  id: string;
  principalType: PrincipalRole;
  shopId: string;
  scopes: string[];
  customerId: string | null;
  driverId: string | null;
};

type LoginResponse = { accessToken?: string; csrfToken?: string };
type SessionDto = {
  csrfToken: string;
  principalType: PrincipalRole;
  shopId: string;
  scopes: string[];
  customerId?: string;
  driverId?: string;
};

export async function login(credentials: LoginCredentials): Promise<void> {
  if (apiConfig.mode === 'mock') {
    window.sessionStorage.setItem('clever.auth.token', `dev-token-${Date.now()}`);
    return;
  }
  const session = await requestJson<LoginResponse>('auth/login', { method: 'POST', json: { ...credentials, shopDomain: apiConfig.shopDomain } });
  storeTransportSession(session);
}

export async function restoreSession(): Promise<Principal> {
  if (apiConfig.mode === 'mock') return { id: 'mock-admin', principalType: 'DSV_ADMIN', shopId: 'mock-shop', scopes: [], customerId: 'mock-customer', driverId: null };
  const session = await requestV1ReadJson<SessionDto>('session');
  storeTransportSession(session);
  return principalFromSession(session);
}

export function hasRole(principal: Principal, role: PrincipalRole): boolean {
  return principal.principalType === role;
}

function storeTransportSession(session: unknown): void {
  if (!isObject(session)) return;
  if (typeof session.accessToken === 'string' && session.accessToken) window.sessionStorage.setItem('clever.auth.token', session.accessToken);
  if (typeof session.csrfToken === 'string' && session.csrfToken) window.sessionStorage.setItem('clever.auth.csrf', session.csrfToken);
}

function principalFromSession(session: SessionDto): Principal {
  const principalType = principalTypeFrom(session);
  const csrfToken = stringField(session, ['csrfToken']);
  const shopId = stringField(session, ['shopId']);
  const customerId = stringField(session, ['customerId']);
  const driverId = stringField(session, ['driverId']);
  const scopes = arrayField(session, ['scopes']);
  if (!csrfToken || !principalType || !shopId || !Array.isArray(session.scopes) || scopes.length !== session.scopes.length) {
    throw new ApiError(502, '세션 API 응답 형식이 올바르지 않습니다.', session);
  }
  return {
    id: principalType === 'CUSTOMER_USER' ? customerId ?? shopId : shopId,
    principalType,
    shopId,
    scopes,
    customerId,
    driverId,
  };
}

function principalTypeFrom(session: unknown): PrincipalRole | null {
  const principalType = stringField(session, ['principalType']);
  return principalType === 'DSV_ADMIN' || principalType === 'CUSTOMER_USER' ? principalType : null;
}

function arrayField(source: unknown, keys: string[]): string[] {
  if (!isObject(source)) return [];
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
  }
  return [];
}

function stringField(source: unknown, keys: string[]): string | null {
  if (!isObject(source)) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
