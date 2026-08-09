import { requestV1ReadJson } from '../api/client';

export type CustomerDeliveryEvent = {
  occurredAt: string;
  type: string;
};

export type CustomerDeliveryMessageSummary = {
  audience: 'CUSTOMER';
  authorId?: string;
  authorType: string;
  body: string;
  createdAt: string;
  messageId: string;
};

export type CustomerDeliveryItem = {
  actualCompletedAt?: string;
  latestCustomerMessage?: CustomerDeliveryMessageSummary;
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

export type CustomerDeliveryRoute = {
  coordinates: Array<[longitude: number, latitude: number]>;
  vehicleId: string;
};

export type CustomerDeliveryTrail = {
  segments: Array<{
    coordinates: Array<[longitude: number, latitude: number]>;
  }>;
  vehicleId: string;
};

export type CustomerDepartureLocation = {
  address?: string;
  latitude: number;
  longitude: number;
};

export type RemoteCustomerDeliveries = {
  customerDisplayName?: string;
  deliveries: CustomerDeliveryItem[];
  departureLocation?: CustomerDepartureLocation;
  emptyReason?: string;
  page?: CustomerDeliveryPageInfo;
  routes: CustomerDeliveryRoute[];
  trails: CustomerDeliveryTrail[];
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
  const routes = new Map<string, CustomerDeliveryRoute>();
  const trails = new Map<string, CustomerDeliveryTrail>();
  let cursor: string | undefined;
  let customerDisplayName: string | undefined;
  let departureLocation: CustomerDepartureLocation | undefined;
  let emptyReason: string | undefined;
  let page: CustomerDeliveryPageInfo | undefined;
  do {
    const query = new URLSearchParams({ includeGpsTrails: 'true', limit: '100' });
    if (options.serviceDate !== undefined) query.set('serviceDate', options.serviceDate);
    if (cursor !== undefined) query.set('cursor', cursor);
    const data = await requestV1ReadJson<unknown>(`customer/deliveries?${query.toString()}`, { signal: options.signal });
    const response = customerDeliveriesResponse(data);
    deliveries.push(...response.items.map(customerDeliveryFrom));
    for (const route of response.routes.map(customerDeliveryRouteFrom)) routes.set(route.vehicleId, route);
    for (const trail of response.trails.map(customerDeliveryTrailFrom)) trails.set(trail.vehicleId, trail);
    customerDisplayName ??= response.customerDisplayName;
    departureLocation ??= response.departureLocation;
    emptyReason = response.emptyReason;
    page = response.page;
    cursor = page?.hasMore === true ? page.nextCursor : undefined;
    if (page?.hasMore === true && cursor === undefined) throw new Error('고객 배송 조회 페이지 정보가 올바르지 않습니다.');
  } while (cursor !== undefined);
  return { customerDisplayName, deliveries, departureLocation, emptyReason, page, routes: [...routes.values()], trails: [...trails.values()] };
}

async function loadAdminCustomerDeliveries(
  options: CustomerDeliveryLoadOptions & { adminCustomerId?: string },
): Promise<RemoteCustomerDeliveries> {
  const customerId = options.adminCustomerId?.trim();
  if (!customerId) throw new Error('조회할 고객사를 선택해야 합니다.');
  const deliveries: CustomerDeliveryItem[] = [];
  const routes = new Map<string, CustomerDeliveryRoute>();
  const trails = new Map<string, CustomerDeliveryTrail>();
  let cursor: string | undefined;
  let customerDisplayName: string | undefined;
  let departureLocation: CustomerDepartureLocation | undefined;
  let emptyReason: string | undefined;
  let page: CustomerDeliveryPageInfo | undefined;
  do {
    const query = new URLSearchParams({
      customerId,
      includeGpsTrails: 'true',
      limit: '100',
    });
    if (options.serviceDate !== undefined) query.set('serviceDate', options.serviceDate);
    if (cursor !== undefined) query.set('cursor', cursor);
    const data = await requestV1ReadJson<unknown>(`customers/deliveries?${query.toString()}`, { signal: options.signal });
    const response = customerDeliveriesResponse(data);
    deliveries.push(...response.items.map(customerDeliveryFrom));
    for (const route of response.routes.map(customerDeliveryRouteFrom)) routes.set(route.vehicleId, route);
    for (const trail of response.trails.map(customerDeliveryTrailFrom)) trails.set(trail.vehicleId, trail);
    customerDisplayName ??= response.customerDisplayName;
    departureLocation ??= response.departureLocation;
    emptyReason = response.emptyReason;
    page = response.page;
    cursor = page?.hasMore === true ? page.nextCursor : undefined;
    if (page?.hasMore === true && cursor === undefined) throw new Error('고객사 배송 조회 페이지 정보가 올바르지 않습니다.');
  } while (cursor !== undefined);
  return { customerDisplayName, deliveries, departureLocation, emptyReason, page, routes: [...routes.values()], trails: [...trails.values()] };
}

function customerDeliveriesResponse(data: unknown): {
  customerDisplayName?: string;
  departureLocation?: CustomerDepartureLocation;
  emptyReason?: string;
  items: unknown[];
  page?: CustomerDeliveryPageInfo;
  routes: unknown[];
  trails: unknown[];
} {
  if (!hasOnlyKeys(data, ['customerDisplayName', 'departureLocation', 'items', 'page', 'emptyReason', 'routes', 'trails']) || !Array.isArray(data.items)) {
    throw new Error('고객 배송 조회 응답 형식이 올바르지 않습니다.');
  }
  if (data.routes !== undefined && !Array.isArray(data.routes)) throw new Error('고객 배송 경로 응답 형식이 올바르지 않습니다.');
  if (data.trails !== undefined && !Array.isArray(data.trails)) throw new Error('고객 차량 자취 응답 형식이 올바르지 않습니다.');
  return {
    customerDisplayName: optionalString(data, 'customerDisplayName'),
    departureLocation: customerDepartureLocationFrom(data.departureLocation),
    emptyReason: optionalString(data, 'emptyReason'),
    items: data.items,
    page: pageInfoFrom(data.page),
    routes: data.routes ?? [],
    trails: data.trails ?? [],
  };
}

function customerDepartureLocationFrom(value: unknown): CustomerDepartureLocation | undefined {
  if (value === undefined) return undefined;
  if (!hasOnlyKeys(value, ['address', 'latitude', 'longitude'])) throw new Error('고객 배송 출발 위치 응답 형식이 올바르지 않습니다.');
  return {
    address: optionalString(value, 'address'),
    latitude: requiredNumber(value, 'latitude'),
    longitude: requiredNumber(value, 'longitude'),
  };
}

function customerDeliveryRouteFrom(value: unknown): CustomerDeliveryRoute {
  if (!hasOnlyKeys(value, ['coordinates', 'vehicleId'])) throw new Error('고객 배송 경로 응답 형식이 올바르지 않습니다.');
  const coordinates = requiredArray(value, 'coordinates').map((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length !== 2) throw new Error('고객 배송 경로 좌표 형식이 올바르지 않습니다.');
    const [longitude, latitude] = coordinate;
    if (typeof longitude !== 'number' || !Number.isFinite(longitude) || typeof latitude !== 'number' || !Number.isFinite(latitude)) {
      throw new Error('고객 배송 경로 좌표 형식이 올바르지 않습니다.');
    }
    return [longitude, latitude] as [number, number];
  });
  if (coordinates.length < 2) throw new Error('고객 배송 경로 좌표가 부족합니다.');
  return {
    coordinates,
    vehicleId: requiredString(value, 'vehicleId'),
  };
}

function customerDeliveryTrailFrom(value: unknown): CustomerDeliveryTrail {
  if (!hasOnlyKeys(value, ['segments', 'vehicleId'])) throw new Error('고객 차량 자취 응답 형식이 올바르지 않습니다.');
  return {
    segments: requiredArray(value, 'segments').map((segment) => {
      if (!hasOnlyKeys(segment, ['coordinates'])) throw new Error('고객 차량 자취 구간 형식이 올바르지 않습니다.');
      const coordinates = requiredArray(segment, 'coordinates').map(customerMapCoordinateFrom);
      if (coordinates.length < 2) throw new Error('고객 차량 자취 좌표가 부족합니다.');
      return { coordinates };
    }),
    vehicleId: requiredString(value, 'vehicleId'),
  };
}

function customerMapCoordinateFrom(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) throw new Error('고객 지도 좌표 형식이 올바르지 않습니다.');
  const [longitude, latitude] = value;
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || typeof latitude !== 'number' || !Number.isFinite(latitude)) {
    throw new Error('고객 지도 좌표 형식이 올바르지 않습니다.');
  }
  return [longitude, latitude];
}

function customerDeliveryFrom(value: unknown): CustomerDeliveryItem {
  if (!hasOnlyKeys(value, [
    'deliveryStatus',
    'latestCustomerMessage',
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
    latestCustomerMessage: customerDeliveryMessageSummaryFrom(value.latestCustomerMessage),
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

function customerDeliveryMessageSummaryFrom(value: unknown): CustomerDeliveryMessageSummary | undefined {
  if (value === undefined) return undefined;
  if (!hasOnlyKeys(value, ['audience', 'authorId', 'authorType', 'body', 'createdAt', 'messageId', 'readByDriverAt']) || value.audience !== 'CUSTOMER') {
    throw new Error('고객 배송 메모 응답 형식이 올바르지 않습니다.');
  }
  return {
    audience: 'CUSTOMER',
    authorId: optionalString(value, 'authorId'),
    authorType: requiredString(value, 'authorType'),
    body: requiredString(value, 'body'),
    createdAt: requiredString(value, 'createdAt'),
    messageId: requiredString(value, 'messageId'),
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

function requiredNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key];
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
