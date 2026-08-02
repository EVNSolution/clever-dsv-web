import { requestV1ReadJson } from '../api/client';

export type DeliveryEventSummary = {
  driverDisplayName?: string;
  eventId: string;
  latitude?: number;
  longitude?: number;
  type: string;
  occurredAt: string;
};

export type DeliveryProof = {
  contentType: string;
  driverDisplayName?: string;
  kind: string;
  originalFilename?: string;
  proofId: string;
  sizeBytes: number;
  source: string;
  status: 'AVAILABLE' | 'EXPIRED';
  uploadedAt: string;
};

export type DeliverySummary = {
  sellerOrderId: string;
  sellerOrderKey: string;
  destinationAddress?: string;
  destinationDisplayName: string;
  deliveryStatus: string;
  etaStatus: string;
  estimatedArrivalAt?: string;
  proofStatus: string;
  proofs: DeliveryProof[];
  eventSummary: DeliveryEventSummary[];
};

export type RecordsPageInfo = {
  hasMore?: boolean;
  nextCursor?: string;
};

export type RemoteRecords = {
  records: DeliverySummary[];
  page?: RecordsPageInfo;
};

export async function loadRemoteRecords(signal?: AbortSignal): Promise<RemoteRecords> {
  const data = await requestV1ReadJson<unknown>('records', { signal });
  if (!hasOnlyKeys(data, ['items', 'page']) || !Array.isArray(data.items)) {
    throw new Error('배송 이력 응답 형식이 올바르지 않습니다.');
  }
  return {
    records: data.items.map(deliverySummaryFrom),
    page: pageInfoFrom(data.page),
  };
}

export function deliverySummaryFrom(value: unknown): DeliverySummary {
  if (!hasOnlyKeys(value, [
    'sellerOrderId',
    'sellerOrderKey',
    'destinationAddress',
    'destinationDisplayName',
    'deliveryStatus',
    'etaStatus',
    'estimatedArrivalAt',
    'proofStatus',
    'proofs',
    'eventSummary',
  ])) {
    throw new Error('배송 요약 응답 형식이 올바르지 않습니다.');
  }
  return {
    sellerOrderId: requiredString(value, 'sellerOrderId'),
    sellerOrderKey: requiredString(value, 'sellerOrderKey'),
    destinationAddress: optionalString(value, 'destinationAddress'),
    destinationDisplayName: requiredString(value, 'destinationDisplayName'),
    deliveryStatus: requiredString(value, 'deliveryStatus'),
    etaStatus: requiredString(value, 'etaStatus'),
    estimatedArrivalAt: optionalString(value, 'estimatedArrivalAt'),
    proofStatus: requiredString(value, 'proofStatus'),
    proofs: requiredArray(value, 'proofs').map(proofFrom),
    eventSummary: requiredArray(value, 'eventSummary').map(eventSummaryFrom),
  };
}

function eventSummaryFrom(value: unknown): DeliveryEventSummary {
  if (!hasOnlyKeys(value, ['driverDisplayName', 'eventId', 'latitude', 'longitude', 'type', 'occurredAt'])) {
    throw new Error('배송 이벤트 요약 응답 형식이 올바르지 않습니다.');
  }
  return {
    driverDisplayName: optionalString(value, 'driverDisplayName'),
    eventId: requiredString(value, 'eventId'),
    latitude: optionalNumber(value, 'latitude'),
    longitude: optionalNumber(value, 'longitude'),
    type: requiredString(value, 'type'),
    occurredAt: requiredString(value, 'occurredAt'),
  };
}

function proofFrom(value: unknown): DeliveryProof {
  if (!hasOnlyKeys(value, [
    'contentType',
    'driverDisplayName',
    'kind',
    'originalFilename',
    'proofId',
    'sizeBytes',
    'source',
    'status',
    'uploadedAt',
  ])) throw new Error('배송 증빙 응답 형식이 올바르지 않습니다.');
  const status = requiredString(value, 'status');
  if (status !== 'AVAILABLE' && status !== 'EXPIRED') throw new Error('배송 증빙 상태가 올바르지 않습니다.');
  return {
    contentType: requiredString(value, 'contentType'),
    driverDisplayName: optionalString(value, 'driverDisplayName'),
    kind: requiredString(value, 'kind'),
    originalFilename: optionalString(value, 'originalFilename'),
    proofId: requiredString(value, 'proofId'),
    sizeBytes: requiredNumber(value, 'sizeBytes'),
    source: requiredString(value, 'source'),
    status,
    uploadedAt: requiredString(value, 'uploadedAt'),
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

function requiredArray(source: Record<string, unknown>, key: string): unknown[] {
  const value = source[key];
  if (!Array.isArray(value)) throw new Error(`${key} 필드 형식이 올바르지 않습니다.`);
  return value;
}

function requiredString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${key} 필드가 필요합니다.`);
  return value;
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

function requiredNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} 필드 형식이 올바르지 않습니다.`);
  return value;
}

function optionalNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} 필드 형식이 올바르지 않습니다.`);
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).every((key) => keys.includes(key));
}
