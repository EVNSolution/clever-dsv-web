import { requestLegacyJson } from '../api/client';
import { clearTransportSession, storeAuthToken, storeCsrfToken } from '../api/auth-session';
import { apiConfig } from '../api/config';

export type CustomerAccountStatus = 'INVITED' | 'ACTIVE' | 'DISABLED' | 'EXPIRED';
export type CustomerAccountInvitePurpose = 'SIGNUP' | 'PASSWORD_RESET';

export type CustomerAccount = {
  displayName: string | null;
  email: string | null;
  id: string;
  invitedAt: string | null;
  inviteExpiresAt: string | null;
  lastAuthenticatedAt: string | null;
  loginId: string | null;
  status: CustomerAccountStatus;
};

export type CustomerInvitationValidation = {
  customerName: string | null;
  displayName: string | null;
  email: string | null;
  expiresAt: string;
  loginId: string | null;
  purpose: CustomerAccountInvitePurpose;
};

type SessionTokens = { accessToken?: string; csrfToken?: string };

export async function loadCustomerAccounts(customerId: string): Promise<CustomerAccount[]> {
  if (apiConfig.mode === 'mock') return [];
  const response = await requestLegacyJson<unknown>(`customers/${encodeURIComponent(customerId)}/accounts`);
  const accounts = objectField(response, 'accounts');
  if (!Array.isArray(accounts)) throw new Error('고객 계정 응답 형식이 올바르지 않습니다.');
  return accounts.map(parseCustomerAccount);
}

export async function inviteCustomerAccount(customerId: string, input: { displayName: string; email: string }): Promise<CustomerAccount> {
  const response = await requestLegacyJson<unknown>(`customers/${encodeURIComponent(customerId)}/accounts/invitations`, {
    method: 'POST',
    json: {
      email: input.email,
      ...(input.displayName ? { displayName: input.displayName } : {}),
    },
  });
  return parseCustomerAccount(objectField(response, 'account'));
}

export async function reinviteCustomerAccount(accountId: string): Promise<CustomerAccount> {
  const response = await requestLegacyJson<unknown>(`customer-accounts/${encodeURIComponent(accountId)}/reinvite`, { method: 'POST' });
  return parseCustomerAccount(objectField(response, 'account'));
}

export async function sendCustomerAccountPasswordReset(accountId: string): Promise<CustomerAccount> {
  const response = await requestLegacyJson<unknown>(`customer-accounts/${encodeURIComponent(accountId)}/password-reset`, { method: 'POST' });
  return parseCustomerAccount(objectField(response, 'account'));
}

export async function setCustomerAccountStatus(accountId: string, status: 'ACTIVE' | 'DISABLED'): Promise<CustomerAccount> {
  const response = await requestLegacyJson<unknown>(`customer-accounts/${encodeURIComponent(accountId)}/status`, { method: 'PATCH', json: { status } });
  return parseCustomerAccount(objectField(response, 'account'));
}

export async function validateCustomerInvitation(token: string): Promise<CustomerInvitationValidation> {
  const response = await requestLegacyJson<unknown>('customer/auth/invitations/validate', {
    method: 'POST',
    json: { token, shopDomain: apiConfig.shopDomain },
  });
  return parseInvitationValidation(response);
}

export async function completeCustomerInvitation(input: { loginId?: string; password: string; token: string }): Promise<void> {
  clearTransportSession();
  try {
    const session = await requestLegacyJson<SessionTokens>('customer/auth/complete', {
      method: 'POST',
      json: {
        token: input.token,
        shopDomain: apiConfig.shopDomain,
        password: input.password,
        ...(input.loginId ? { loginId: input.loginId } : {}),
      },
    });
    storeTransportSession(session);
  } catch (error) {
    clearTransportSession();
    throw error;
  }
}

export async function loginCustomerAccount(input: { id: string; password: string }): Promise<void> {
  clearTransportSession();
  try {
    const session = await requestLegacyJson<SessionTokens>('customer/auth/login', {
      method: 'POST',
      json: { id: input.id, password: input.password, shopDomain: apiConfig.shopDomain },
    });
    storeTransportSession(session);
  } catch (error) {
    clearTransportSession();
    throw error;
  }
}

function storeTransportSession(session: unknown): void {
  if (!isObject(session) || typeof session.csrfToken !== 'string' || session.csrfToken === '') {
    throw new Error('고객 세션 응답 형식이 올바르지 않습니다.');
  }
  if (typeof session.accessToken === 'string' && session.accessToken) storeAuthToken(session.accessToken);
  storeCsrfToken(session.csrfToken);
}

function parseCustomerAccount(value: unknown): CustomerAccount {
  if (!isObject(value)) throw new Error('고객 계정 응답 형식이 올바르지 않습니다.');
  return {
    displayName: nullableString(value.displayName),
    email: nullableString(value.email),
    id: requiredString(value.id),
    invitedAt: nullableString(value.invitedAt),
    inviteExpiresAt: nullableString(value.inviteExpiresAt),
    lastAuthenticatedAt: nullableString(value.lastAuthenticatedAt),
    loginId: nullableString(value.loginId),
    status: accountStatus(value.status),
  };
}

function parseInvitationValidation(value: unknown): CustomerInvitationValidation {
  if (!isObject(value)) throw new Error('초대 응답 형식이 올바르지 않습니다.');
  return {
    customerName: nullableString(value.customerName),
    displayName: nullableString(value.displayName),
    email: nullableString(value.email),
    expiresAt: requiredString(value.expiresAt),
    loginId: nullableString(value.loginId),
    purpose: invitePurpose(value.purpose),
  };
}

function objectField(value: unknown, key: string): unknown {
  return isObject(value) ? value[key] : undefined;
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('고객 계정 응답 형식이 올바르지 않습니다.');
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return requiredString(value);
}

function accountStatus(value: unknown): CustomerAccountStatus {
  if (value === 'INVITED' || value === 'ACTIVE' || value === 'DISABLED' || value === 'EXPIRED') return value;
  throw new Error('고객 계정 응답 형식이 올바르지 않습니다.');
}

function invitePurpose(value: unknown): CustomerAccountInvitePurpose {
  if (value === 'SIGNUP' || value === 'PASSWORD_RESET') return value;
  throw new Error('초대 응답 형식이 올바르지 않습니다.');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
