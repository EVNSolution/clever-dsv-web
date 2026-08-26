import { ApiError, requestLegacyJson } from '../api/client';
import { apiConfig } from '../api/config';

export type DriverAccountLinkReview = {
  accountId: string;
  accountName: string;
  accountPhoneLast4: string | null;
  createdAt: string;
  driverId: string;
  driverName: string;
  driverPhoneLast4: string | null;
  reason: 'NAME_MISMATCH' | 'PHONE_MISMATCH';
};

export async function loadDriverAccountLinkReviews(): Promise<DriverAccountLinkReview[]> {
  if (apiConfig.mode === 'mock') return [];
  try {
    const response = await requestLegacyJson<unknown>('driver-account-links/pending');
    if (!hasOnlyKeys(response, ['reviews']) || !Array.isArray(response.reviews)) throw new Error('앱 계정 연결 검토 응답 형식이 올바르지 않습니다.');
    return response.reviews.map(driverAccountLinkReviewFrom);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return [];
    throw error;
  }
}

export async function approveDriverAccountLink(review: Pick<DriverAccountLinkReview, 'accountId' | 'driverId'>): Promise<void> {
  await requestLegacyJson(`driver-account-links/${encodeURIComponent(review.driverId)}/approve`, {
    json: { accountId: review.accountId },
    method: 'POST',
  });
}

function driverAccountLinkReviewFrom(value: unknown): DriverAccountLinkReview {
  if (!hasOnlyKeys(value, [
    'accountId',
    'accountName',
    'accountPhoneLast4',
    'createdAt',
    'driverId',
    'driverName',
    'driverPhoneLast4',
    'reason',
  ])) throw new Error('앱 계정 연결 검토 응답 형식이 올바르지 않습니다.');
  const reason = value.reason;
  if (reason !== 'NAME_MISMATCH' && reason !== 'PHONE_MISMATCH') throw new Error('앱 계정 연결 검토 응답 형식이 올바르지 않습니다.');
  return {
    accountId: requiredString(value.accountId),
    accountName: requiredString(value.accountName),
    accountPhoneLast4: last4(value.accountPhoneLast4),
    createdAt: requiredString(value.createdAt),
    driverId: requiredString(value.driverId),
    driverName: requiredString(value.driverName),
    driverPhoneLast4: last4(value.driverPhoneLast4),
    reason,
  };
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('앱 계정 연결 검토 응답 형식이 올바르지 않습니다.');
  return value;
}

function last4(value: unknown): string | null {
  if (value === null) return null;
  const text = requiredString(value);
  if (!/^\d{4}$/u.test(text)) throw new Error('앱 계정 연결 검토 응답 형식이 올바르지 않습니다.');
  return text;
}

function hasOnlyKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).every((key) => keys.includes(key));
}
