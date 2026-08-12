import { ApiError, requestJson, requestV1ReadJson } from '../api/client';
import { clearTransportSession, storeAuthToken, storeCsrfToken } from '../api/auth-session';
import { apiConfig } from '../api/config';

export type LoginCredentials = { id: string; password: string };
export type PrincipalRole = 'DSV_ADMIN' | 'CUSTOMER_USER';
export type Principal = {
  id: string;
  principalType: PrincipalRole;
  shopId: string;
  displayName: string | null;
  scopes: string[];
  customerId: string | null;
  driverId: string | null;
};
export type AdminInvitationValidation = {
  displayName: string | null;
  email: string;
  expiresAt: string;
};
export type CredentialChangeInput = {
  currentPassword: string;
  loginId?: string;
  password?: string;
};

type LoginResponse = { accessToken?: string; csrfToken?: string };
type SessionDto = {
  principalType: PrincipalRole;
  shopId: string;
  actorId?: string;
  displayName?: string;
  scopes: string[];
  customerId?: string;
  driverId?: string;
};

export async function login(credentials: LoginCredentials): Promise<void> {
  if (apiConfig.mode === 'mock') {
    storeAuthToken(`dev-token-${Date.now()}`);
    return;
  }
  clearTransportSession();
  try {
    const session = await requestJson<LoginResponse>('auth/login', { method: 'POST', json: { ...credentials, shopDomain: apiConfig.shopDomain } });
    storeTransportSession(session);
  } catch (error) {
    clearTransportSession();
    throw error;
  }
}

export async function validateAdminInvitation(token: string): Promise<AdminInvitationValidation> {
  const response = await requestJson<unknown>('admin/auth/invitations/validate', {
    method: 'POST',
    json: { shopDomain: apiConfig.shopDomain, token },
  });
  return parseAdminInvitationValidation(response);
}

export async function completeAdminInvitation(input: { loginId: string; password: string; token: string }): Promise<void> {
  clearTransportSession();
  try {
    const session = await requestJson<LoginResponse>('admin/auth/complete', {
      method: 'POST',
      json: {
        shopDomain: apiConfig.shopDomain,
        token: input.token,
        loginId: input.loginId,
        password: input.password,
      },
    });
    storeTransportSession(session);
  } catch (error) {
    clearTransportSession();
    throw error;
  }
}

export async function updateCredentials(input: CredentialChangeInput): Promise<Principal> {
  const response = await requestJson<unknown>('auth/credentials', { method: 'PATCH', json: input });
  const session = sessionDtoFrom(response);
  storeTransportSession(session);
  return restoreSession();
}

export async function logout(): Promise<void> {
  if (apiConfig.mode === 'mock') {
    clearTransportSession();
    return;
  }
  try {
    await requestJson<{ loggedOut: boolean }>('auth/logout', { method: 'POST' });
  } finally {
    clearTransportSession();
  }
}

export async function restoreSession(): Promise<Principal> {
  if (apiConfig.mode === 'mock') return { id: 'mock-admin', principalType: 'DSV_ADMIN', shopId: 'mock-shop', displayName: null, scopes: ['dsv:settings:read', 'dsv:settings:write', 'dsv:accounts:read', 'dsv:accounts:write'], customerId: 'mock-customer', driverId: null };
  const session = await requestV1ReadJson<SessionDto>('session', { cache: 'no-store' });
  storeTransportSession(session);
  return principalFromSession(session);
}

export function hasRole(principal: Principal, role: PrincipalRole): boolean {
  return principal.principalType === role;
}

function storeTransportSession(session: unknown): void {
  if (!isObject(session)) return;
  if (typeof session.accessToken === 'string' && session.accessToken) storeAuthToken(session.accessToken);
  if (typeof session.csrfToken === 'string' && session.csrfToken) storeCsrfToken(session.csrfToken);
}

function principalFromSession(session: SessionDto): Principal {
  const principalType = principalTypeFrom(session);
  const shopId = stringField(session, ['shopId']);
  const actorId = stringField(session, ['actorId']);
  const displayName = stringField(session, ['displayName']);
  const customerId = stringField(session, ['customerId']);
  const driverId = stringField(session, ['driverId']);
  const scopes = arrayField(session, ['scopes']);
  if (!principalType || !shopId || !Array.isArray(session.scopes) || scopes.length !== session.scopes.length) {
    throw new ApiError(502, '세션 API 응답 형식이 올바르지 않습니다.', session);
  }
  if (principalType === 'DSV_ADMIN' && !actorId) {
    throw new ApiError(502, '세션 API 응답 형식이 올바르지 않습니다.', session);
  }
  const principalId = principalType === 'CUSTOMER_USER' ? customerId ?? shopId : actorId;
  if (!principalId) {
    throw new ApiError(502, '세션 API 응답 형식이 올바르지 않습니다.', session);
  }
  return {
    id: principalId,
    principalType,
    shopId,
    displayName,
    scopes,
    customerId,
    driverId,
  };
}

function parseAdminInvitationValidation(value: unknown): AdminInvitationValidation {
  if (!isObject(value)) throw new ApiError(502, '초대 응답 형식이 올바르지 않습니다.', value);
  const email = stringField(value, ['email']);
  const expiresAt = stringField(value, ['expiresAt']);
  if (!email || !expiresAt) throw new ApiError(502, '초대 응답 형식이 올바르지 않습니다.', value);
  return {
    displayName: stringField(value, ['displayName']),
    email,
    expiresAt,
  };
}

function sessionDtoFrom(value: unknown): SessionDto {
  const candidate = isObject(value) && isObject(value.session) ? value.session : value;
  if (!isObject(candidate)) throw new ApiError(502, '세션 API 응답 형식이 올바르지 않습니다.', value);
  return candidate as SessionDto;
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
