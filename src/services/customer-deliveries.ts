import { requestV1ReadJson } from '../api/client';

export type CustomerDeliveryEvent = {
  occurredAt: string;
  type: string;
};

export type CustomerDeliveryItem = {
  actualCompletedAt?: string;
  deliveryStatus: string;
  destinationAddress?: string;
  destinationDisplayName: string;
  destinationId: string;
  estimatedArrivalAt?: string;
  etaStatus: string;
  eventSummary: CustomerDeliveryEvent[];
  latitude?: number;
  longitude?: number;
  proofStatus: string;
  sellerOrderId: string;
  sellerOrderKey: string;
  shippedBoxes: number;
  vehicleDisplayName?: string;
  vehicleId?: string;
  vehicleLatitude?: number;
  vehicleLongitude?: number;
};

export type RemoteCustomerDeliveries = {
  deliveries: CustomerDeliveryItem[];
  emptyReason?: string;
  page?: CustomerDeliveryPageInfo;
};

type CustomerDeliveryPageInfo = {
  hasMore?: boolean;
  nextCursor?: string;
};

type CustomerDeliveryLoadOptions = {
  adminCustomerId?: string;
  serviceDate?: string;
  signal?: AbortSignal;
};

export async function loadRemoteCustomerDeliveries(
  options: CustomerDeliveryLoadOptions = {},
): Promise<RemoteCustomerDeliveries> {
  if (options.adminCustomerId !== undefined) return loadAdminCustomerDeliveries(options);
  return loadCustomerScopedDeliveries(options);
}

async function loadCustomerScopedDeliveries(
  options: CustomerDeliveryLoadOptions,
): Promise<RemoteCustomerDeliveries> {
  const deliveries: CustomerDeliveryItem[] = [];
  let cursor: string | undefined;
  let emptyReason: string | undefined;
  let page: CustomerDeliveryPageInfo | undefined;
  do {
    const query = new URLSearchParams({ limit: '100' });
    if (options.serviceDate !== undefined) query.set('serviceDate', options.serviceDate);
    if (cursor !== undefined) query.set('cursor', cursor);
    const data = await requestV1ReadJson<unknown>(`customer/deliveries?${query.toString()}`, { signal: options.signal });
    const response = customerDeliveriesResponse(data);
    deliveries.push(...response.items.map(customerDeliveryFrom));
    emptyReason = response.emptyReason;
    page = response.page;
    cursor = page?.hasMore === true ? page.nextCursor : undefined;
    if (page?.hasMore === true && cursor === undefined) throw new Error('고객 배송 조회 페이지 정보가 올바르지 않습니다.');
  } while (cursor !== undefined);
  return { deliveries, emptyReason, page };
}

async function loadAdminCustomerDeliveries(
  options: CustomerDeliveryLoadOptions & { adminCustomerId?: string },
): Promise<RemoteCustomerDeliveries> {
  const customerId = options.adminCustomerId?.trim();
  if (!customerId) throw new Error('조회할 제조사를 선택해야 합니다.');
  const deliveries: CustomerDeliveryItem[] = [];
  let cursor: string | undefined;
  let emptyReason: string | undefined;
  let page: CustomerDeliveryPageInfo | undefined;
  do {
    const query = new URLSearchParams({
      customerId,
      limit: '100',
    });
    if (options.serviceDate !== undefined) query.set('serviceDate', options.serviceDate);
    if (cursor !== undefined) query.set('cursor', cursor);
    const data = await requestV1ReadJson<unknown>(`customers/deliveries?${query.toString()}`, { signal: options.signal });
    const response = customerDeliveriesResponse(data);
    deliveries.push(...response.items.map(customerDeliveryFrom));
    emptyReason = response.emptyReason;
    page = response.page;
    cursor = page?.hasMore === true ? page.nextCursor : undefined;
    if (page?.hasMore === true && cursor === undefined) throw new Error('제조사 배송 조회 페이지 정보가 올바르지 않습니다.');
  } while (cursor !== undefined);
  return { deliveries, emptyReason, page };
}

function customerDeliveriesResponse(data: unknown): {
  emptyReason?: string;
  items: unknown[];
  page?: CustomerDeliveryPageInfo;
} {
  if (!hasOnlyKeys(data, ['items', 'page', 'emptyReason']) || !Array.isArray(data.items)) {
    throw new Error('고객 배송 조회 응답 형식이 올바르지 않습니다.');
  }
  return {
    emptyReason: optionalString(data, 'emptyReason'),
    items: data.items,
    page: pageInfoFrom(data.page),
  };
}

function customerDeliveryFrom(value: unknown): CustomerDeliveryItem {
  if (!hasOnlyKeys(value, [
    'deliveryStatus',
    'destinationAddress',
    'destinationDisplayName',
    'destinationId',
    'estimatedArrivalAt',
    'etaStatus',
    'eventSummary',
    'latitude',
    'longitude',
    'proofStatus',
    'sellerOrderId',
    'sellerOrderKey',
    'shippedBoxes',
    'vehicleDisplayName',
    'vehicleId',
    'vehicleLatitude',
    'vehicleLongitude',
  ])) throw new Error('고객 배송 항목 응답 형식이 올바르지 않습니다.');
  const events = requiredArray(value, 'eventSummary').map(customerDeliveryEventFrom);
  return {
    actualCompletedAt: events.find((event) => event.type === 'STOP_DELIVERED')?.occurredAt,
    deliveryStatus: requiredString(value, 'deliveryStatus'),
    destinationAddress: optionalString(value, 'destinationAddress'),
    destinationDisplayName: requiredString(value, 'destinationDisplayName'),
    destinationId: requiredString(value, 'destinationId'),
    estimatedArrivalAt: optionalString(value, 'estimatedArrivalAt'),
    etaStatus: requiredString(value, 'etaStatus'),
    eventSummary: events,
    latitude: optionalNumber(value, 'latitude'),
    longitude: optionalNumber(value, 'longitude'),
    proofStatus: requiredString(value, 'proofStatus'),
    sellerOrderId: requiredString(value, 'sellerOrderId'),
    sellerOrderKey: requiredString(value, 'sellerOrderKey'),
    shippedBoxes: requiredPositiveInteger(value, 'shippedBoxes'),
    vehicleDisplayName: optionalString(value, 'vehicleDisplayName'),
    vehicleId: optionalString(value, 'vehicleId'),
    vehicleLatitude: optionalNumber(value, 'vehicleLatitude'),
    vehicleLongitude: optionalNumber(value, 'vehicleLongitude'),
  };
}

function customerDeliveryEventFrom(value: unknown): CustomerDeliveryEvent {
  if (!hasOnlyKeys(value, ['type', 'occurredAt'])) throw new Error('고객 배송 이벤트 응답 형식이 올바르지 않습니다.');
  return {
    occurredAt: requiredString(value, 'occurredAt'),
    type: requiredString(value, 'type'),
  };
}

function pageInfoFrom(value: unknown): CustomerDeliveryPageInfo | undefined {
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

function optionalNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} 필드 형식이 올바르지 않습니다.`);
  return value;
}

function requiredPositiveInteger(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw new Error(`${key} 필드 형식이 올바르지 않습니다.`);
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
