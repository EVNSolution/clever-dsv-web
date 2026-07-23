import { requestV1ReadJson } from '../api/client';
import { deliverySummaryFrom } from './records';
import type { DeliverySummary, RecordsPageInfo } from './records';

export type RemoteCustomerDeliveries = {
  deliveries: DeliverySummary[];
  emptyReason?: string;
  page?: RecordsPageInfo;
};

export async function loadRemoteCustomerDeliveries(signal?: AbortSignal): Promise<RemoteCustomerDeliveries> {
  const data = await requestV1ReadJson<unknown>('customer/deliveries', { signal });
  if (!hasOnlyKeys(data, ['items', 'page', 'emptyReason']) || !Array.isArray(data.items)) {
    throw new Error('고객 배송 조회 응답 형식이 올바르지 않습니다.');
  }
  return {
    deliveries: data.items.map(deliverySummaryFrom),
    emptyReason: optionalString(data, 'emptyReason'),
    page: pageInfoFrom(data.page),
  };
}

function pageInfoFrom(value: unknown): RecordsPageInfo | undefined {
  if (value === undefined) return undefined;
  if (!hasOnlyKeys(value, ['hasMore', 'nextCursor'])) throw new Error('페이지 응답 형식이 올바르지 않습니다.');
  return {
    hasMore: optionalBoolean(value, 'hasMore'),
    nextCursor: optionalString(value, 'nextCursor'),
  };
}

function optionalString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${key} 필드 형식이 올바르지 않습니다.`);
  return value;
}

function optionalBoolean(source: Record<string, unknown>, key: string): boolean | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error(`${key} 필드 형식이 올바르지 않습니다.`);
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).every((key) => keys.includes(key));
}
