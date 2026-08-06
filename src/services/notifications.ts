import { requestV1ReadJson } from '../api/client';
import { apiConfig } from '../api/config';

export type NotificationSeverity = 'critical' | 'info' | 'success' | 'warning';

export type NotificationItem = {
  changeRequestId?: string;
  createdAt: string;
  description: string;
  id: string;
  kind: string;
  recoverable: boolean;
  sellerOrderId?: string;
  severity: NotificationSeverity;
  title: string;
};

type OperationalNotificationsResponse = {
  items: unknown[];
};

export const notificationItems: readonly NotificationItem[] = [];

const readStateKey = 'clever.notification.readIds';

export async function loadOperationalNotifications(signal?: AbortSignal): Promise<NotificationItem[]> {
  if (apiConfig.mode === 'mock') return [];
  const data = await requestV1ReadJson<unknown>('operational-notifications', { signal });
  return operationalNotificationsResponse(data).items.map(notificationItemFrom);
}

export function loadReadNotificationIds(): string[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(readStateKey) ?? '[]');
    return Array.isArray(stored) ? uniqueStrings(stored) : [];
  } catch {
    return [];
  }
}

export function saveReadNotificationIds(ids: string[]): void {
  window.localStorage.setItem(readStateKey, JSON.stringify(uniqueStrings(ids)));
}

function operationalNotificationsResponse(data: unknown): OperationalNotificationsResponse {
  if (!hasOnlyKeys(data, ['items']) || !Array.isArray(data.items)) throw new Error('운영 알림 응답 형식이 올바르지 않습니다.');
  return { items: data.items };
}

function notificationItemFrom(value: unknown): NotificationItem {
  if (!hasOnlyKeys(value, [
    'changeRequestId',
    'createdAt',
    'description',
    'id',
    'kind',
    'recoverable',
    'sellerOrderId',
    'severity',
    'title',
  ])) throw new Error('운영 알림 항목 응답 형식이 올바르지 않습니다.');
  const severity = requiredSeverity(value, 'severity');
  return {
    changeRequestId: optionalString(value, 'changeRequestId'),
    createdAt: requiredString(value, 'createdAt'),
    description: requiredString(value, 'description'),
    id: requiredString(value, 'id'),
    kind: requiredString(value, 'kind'),
    recoverable: requiredBoolean(value, 'recoverable'),
    sellerOrderId: optionalString(value, 'sellerOrderId'),
    severity,
    title: requiredString(value, 'title'),
  };
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.filter((id): id is string => typeof id === 'string' && id.trim() !== ''))];
}

function requiredString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.trim() === '') throw new Error('운영 알림 항목 응답 형식이 올바르지 않습니다.');
  return value;
}

function optionalString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.trim() === '') throw new Error('운영 알림 항목 응답 형식이 올바르지 않습니다.');
  return value;
}

function requiredBoolean(source: Record<string, unknown>, key: string): boolean {
  const value = source[key];
  if (typeof value !== 'boolean') throw new Error('운영 알림 항목 응답 형식이 올바르지 않습니다.');
  return value;
}

function requiredSeverity(source: Record<string, unknown>, key: string): NotificationSeverity {
  const value = source[key];
  if (value !== 'critical' && value !== 'info' && value !== 'success' && value !== 'warning') {
    throw new Error('운영 알림 심각도 응답 형식이 올바르지 않습니다.');
  }
  return value;
}

function hasOnlyKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).every((key) => keys.includes(key));
}
