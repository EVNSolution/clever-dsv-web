import { requestLegacyJson } from '../api/client';
import { apiConfig } from '../api/config';

export type AdminAccountStatus = 'ACTIVE' | 'DISABLED';

export type AdminAccount = {
  createdAt: string;
  displayName: string | null;
  failedLoginAttempts: number;
  id: string;
  lastAuthenticatedAt: string | null;
  lockedUntil: string | null;
  loginId: string;
  scopes: string[];
  status: AdminAccountStatus;
  updatedAt: string;
};

export type AdminAccountCredential = {
  account: AdminAccount;
  temporaryPassword: string;
};

export async function loadAdminAccounts(): Promise<AdminAccount[]> {
  if (apiConfig.mode === 'mock') return [];
  const response = await requestLegacyJson<unknown>('admin-accounts');
  const accounts = objectField(response, 'accounts');
  if (!Array.isArray(accounts)) throw new Error('운영 계정 응답 형식이 올바르지 않습니다.');
  return accounts.map(parseAdminAccount);
}

export async function createAdminAccount(input: { displayName: string; loginId: string }): Promise<AdminAccountCredential> {
  const response = await requestLegacyJson<unknown>('admin-accounts', { method: 'POST', json: input });
  return parseCredential(response);
}

export async function resetAdminAccountPassword(accountId: string): Promise<AdminAccountCredential> {
  const response = await requestLegacyJson<unknown>(`admin-accounts/${encodeURIComponent(accountId)}/password-reset`, { method: 'POST' });
  return parseCredential(response);
}

export async function setAdminAccountStatus(accountId: string, status: AdminAccountStatus): Promise<AdminAccount> {
  const response = await requestLegacyJson<unknown>(`admin-accounts/${encodeURIComponent(accountId)}/status`, { method: 'PATCH', json: { status } });
  return parseAdminAccount(objectField(response, 'account'));
}

function parseCredential(value: unknown): AdminAccountCredential {
  const temporaryPassword = objectField(value, 'temporaryPassword');
  if (typeof temporaryPassword !== 'string' || temporaryPassword === '') throw new Error('임시 비밀번호 응답 형식이 올바르지 않습니다.');
  return { account: parseAdminAccount(objectField(value, 'account')), temporaryPassword };
}

function parseAdminAccount(value: unknown): AdminAccount {
  if (!isObject(value)) throw new Error('운영 계정 응답 형식이 올바르지 않습니다.');
  const account: AdminAccount = {
    createdAt: requiredString(value.createdAt),
    displayName: nullableString(value.displayName),
    failedLoginAttempts: requiredNumber(value.failedLoginAttempts),
    id: requiredString(value.id),
    lastAuthenticatedAt: nullableString(value.lastAuthenticatedAt),
    lockedUntil: nullableString(value.lockedUntil),
    loginId: requiredString(value.loginId),
    scopes: stringArray(value.scopes),
    status: statusValue(value.status),
    updatedAt: requiredString(value.updatedAt),
  };
  return account;
}

function objectField(value: unknown, key: string): unknown {
  return isObject(value) ? value[key] : undefined;
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value === '') throw new Error('운영 계정 응답 형식이 올바르지 않습니다.');
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  return requiredString(value);
}

function requiredNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('운영 계정 응답 형식이 올바르지 않습니다.');
  return value;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) throw new Error('운영 계정 응답 형식이 올바르지 않습니다.');
  return value;
}

function statusValue(value: unknown): AdminAccountStatus {
  if (value !== 'ACTIVE' && value !== 'DISABLED') throw new Error('운영 계정 응답 형식이 올바르지 않습니다.');
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
