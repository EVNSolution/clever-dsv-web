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
  rawNote?: string;
  reviewStatus?: 'CLEARED' | 'CONFIRMED' | 'NOT_APPLICABLE' | 'UNCONFIRMED';
  routeConstraintStatus?: 'NOT_APPLICABLE' | 'NOT_EVALUATED' | 'PENDING_RECALCULATION' | 'UNCONFIRMED';
  timeConstraint?: {
    auditEventId: string;
    confirmedAt: string;
    confirmedBy?: string;
    status: 'CONFIRMED';
    timeWindowEnd: string;
    timeWindowStart: string;
  };
};

export type RecordsPageInfo = {
  currentPage: number;
  hasMore: boolean;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type RemoteRecords = {
  records: DeliverySummary[];
  page: RecordsPageInfo;
};

export async function loadRemoteRecords({
  page = 1,
  serviceDate,
  signal,
}: {
  page?: number;
  serviceDate?: string;
  signal?: AbortSignal;
} = {}): Promise<RemoteRecords> {
  const query = new URLSearchParams({ limit: '50', page: String(page) });
  if (serviceDate !== undefined) query.set('serviceDate', serviceDate);
  const data = await requestV1ReadJson<unknown>(`records?${query}`, { signal });
  if (!hasOnlyKeys(data, ['items', 'page']) || !Array.isArray(data.items)) {
    throw new Error('배송 이력 응답 형식이 올바르지 않습니다.');
  }
  return {
    records: data.items.map(deliverySummaryFrom),
    page: pageInfoFrom(data.page, page, data.items.length),
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
    'rawNote',
    'reviewStatus',
    'routeConstraintStatus',
    'timeConstraint',
  ])) {
    throw new Error('배송 요약 응답 형식이 올바르지 않습니다.');
  }
  const eventSummary = requiredArray(value, 'eventSummary').map(eventSummaryFrom);
  return {
    sellerOrderId: requiredString(value, 'sellerOrderId'),
    sellerOrderKey: requiredString(value, 'sellerOrderKey'),
    destinationAddress: optionalString(value, 'destinationAddress'),
    destinationDisplayName: requiredString(value, 'destinationDisplayName'),
    deliveryStatus: effectiveDeliveryStatus(requiredString(value, 'deliveryStatus'), eventSummary),
    etaStatus: requiredString(value, 'etaStatus'),
    estimatedArrivalAt: optionalString(value, 'estimatedArrivalAt'),
    proofStatus: requiredString(value, 'proofStatus'),
    proofs: requiredArray(value, 'proofs').map(proofFrom),
    eventSummary,
    rawNote: optionalString(value, 'rawNote'),
    reviewStatus: optionalEnum(value, 'reviewStatus', ['CLEARED', 'CONFIRMED', 'NOT_APPLICABLE', 'UNCONFIRMED']),
    routeConstraintStatus: optionalEnum(value, 'routeConstraintStatus', ['NOT_APPLICABLE', 'NOT_EVALUATED', 'PENDING_RECALCULATION', 'UNCONFIRMED']),
    timeConstraint: optionalTimeConstraint(value.timeConstraint),
  };
}

function effectiveDeliveryStatus(current: string, events: DeliveryEventSummary[]): string {
  const latestTerminalEvent = [...events]
    .filter(({ type }) => type === 'STOP_DELIVERED' || type === 'STOP_FAILED')
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))[0];
  if (latestTerminalEvent?.type === 'STOP_DELIVERED') return 'DELIVERED';
  if (latestTerminalEvent?.type === 'STOP_FAILED') return 'FAILED';
  return current;
}

function optionalTimeConstraint(value: unknown): DeliverySummary['timeConstraint'] {
  if (value === undefined) return undefined;
  if (!hasOnlyKeys(value, ['auditEventId', 'confirmedAt', 'confirmedBy', 'status', 'timeWindowEnd', 'timeWindowStart'])
    || value.status !== 'CONFIRMED') {
    throw new Error('시간 제약 응답 형식이 올바르지 않습니다.');
  }
  return {
    auditEventId: requiredString(value, 'auditEventId'),
    confirmedAt: requiredString(value, 'confirmedAt'),
    confirmedBy: optionalString(value, 'confirmedBy'),
    status: value.status,
    timeWindowEnd: requiredString(value, 'timeWindowEnd'),
    timeWindowStart: requiredString(value, 'timeWindowStart'),
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

function pageInfoFrom(value: unknown, requestedPage: number, itemCount: number): RecordsPageInfo {
  if (!hasOnlyKeys(value, ['currentPage', 'hasMore', 'nextCursor', 'pageSize', 'totalItems', 'totalPages'])) {
    throw new Error('페이지 응답 형식이 올바르지 않습니다.');
  }
  const hasMore = requiredBoolean(value, 'hasMore');
  return {
    currentPage: optionalNumber(value, 'currentPage') ?? requestedPage,
    hasMore,
    pageSize: optionalNumber(value, 'pageSize') ?? 50,
    totalItems: optionalNumber(value, 'totalItems') ?? ((requestedPage - 1) * 50 + itemCount + (hasMore ? 1 : 0)),
    totalPages: optionalNumber(value, 'totalPages') ?? (requestedPage + (hasMore ? 1 : 0)),
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

function requiredBoolean(source: Record<string, unknown>, key: string): boolean {
  const value = source[key];
  if (typeof value !== 'boolean') throw new Error(`${key} 필드 형식이 올바르지 않습니다.`);
  return value;
}

function optionalEnum<const T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`${key} 필드 형식이 올바르지 않습니다.`);
  return value as T;
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
