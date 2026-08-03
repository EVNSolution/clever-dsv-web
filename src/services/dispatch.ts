import { requestV1AssignmentCommandJson, requestV1ReadJson } from '../api/client';

export type DispatchAssignmentStatus = 'ASSIGNED' | 'UNASSIGNED';
export type DispatchEtaStatus = 'FAILED' | 'NOT_REQUIRED' | 'PENDING' | 'READY' | 'STALE';

export type DispatchListItem = {
  actualCompletedAt: string | null;
  assignmentStatus: DispatchAssignmentStatus;
  customerId: string;
  destinationAddress: string | null;
  destinationDisplayName: string | null;
  destinationId: string;
  driverId: string | null;
  estimatedArrivalAt: string | null;
  etaStatus: DispatchEtaStatus;
  latitude: number | null;
  longitude: number | null;
  routePlanId: string | null;
  routeStopSequence: number | null;
  routeVersionId: string | null;
  sellerOrderId: string;
  sellerOrderKey: string;
  vehicleId: string | null;
};

export type DispatchListPage = {
  hasMore?: boolean;
  nextCursor?: string;
};

export type DispatchListView = {
  page?: DispatchListPage;
  rows: DispatchListItem[];
  summary: {
    assigned: number;
    etaAttention: number;
    total: number;
    unassigned: number;
  };
};

export type DispatchSearch = {
  destinationName: string;
  orderNumber: string;
};

type RawDispatch = {
  actualCompletedAt?: string;
  assignmentStatus: DispatchAssignmentStatus;
  customerId: string;
  destinationAddress?: string;
  destinationDisplayName?: string;
  destinationId: string;
  driverId?: string;
  estimatedArrivalAt?: string;
  etaStatus: DispatchEtaStatus;
  latitude?: number;
  longitude?: number;
  routePlanId?: string;
  routeStopSequence?: number;
  routeVersionId?: string;
  sellerOrderId: string;
  sellerOrderKey: string;
  vehicleId?: string;
};

export type DispatchAssignmentResult = {
  assignmentStatus: DispatchAssignmentStatus;
  newRouteVersionId: string;
  routePlanId: string | null;
  sellerOrderId: string;
};

export type DispatchBatchAssignmentResult = {
  assignmentResults: DispatchAssignmentResult[];
  routePlanId: string | null;
};

export async function loadDispatchList(
  serviceDate: string,
  search: Partial<DispatchSearch> = {},
  signal?: AbortSignal,
): Promise<DispatchListView> {
  const rows: DispatchListItem[] = [];
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ limit: '100', serviceDate });
    const destinationName = search.destinationName?.trim();
    const orderNumber = search.orderNumber?.trim();
    if (destinationName) query.set('destinationName', destinationName);
    if (orderNumber) query.set('orderNumber', orderNumber);
    if (cursor !== undefined) query.set('cursor', cursor);
    const data = await requestV1ReadJson<unknown>(`dispatches?${query.toString()}`, { signal });
    const response = dispatchResponse(data);
    rows.push(...response.items.map(toDispatchListItem));
    cursor = response.page?.hasMore === true ? response.page.nextCursor : undefined;
    if (response.page?.hasMore === true && cursor === undefined) throw new Error('배차 목록 페이지 정보가 올바르지 않습니다.');
  } while (cursor !== undefined);
  return {
    rows,
    summary: {
      assigned: rows.filter((row) => row.assignmentStatus === 'ASSIGNED').length,
      etaAttention: rows.filter((row) => row.etaStatus === 'FAILED' || row.etaStatus === 'STALE').length,
      total: rows.length,
      unassigned: rows.filter((row) => row.assignmentStatus === 'UNASSIGNED').length,
    },
  };
}

export async function reassignDispatchOrder(input: {
  driverId: string;
  order: DispatchListItem;
  routePlanId?: string;
  vehicleId: string;
}): Promise<DispatchAssignmentResult> {
  const data = await requestV1AssignmentCommandJson<unknown>(
    `seller-orders/${encodeURIComponent(input.order.sellerOrderId)}/assignment/reassign`,
    {
      json: {
        commandId: crypto.randomUUID(),
        expectedVersion: input.order.routeVersionId ?? 'UNASSIGNED',
        reason: '관리자 배정',
        targetDriverId: input.driverId,
        ...(input.routePlanId === undefined ? {} : { targetRoutePlanId: input.routePlanId }),
        targetVehicleId: input.vehicleId,
      },
      method: 'POST',
    },
  );
  return assignmentResult(data);
}

export async function reassignDispatchOrders(input: {
  driverId: string;
  orders: DispatchListItem[];
  routePlanId?: string;
  vehicleId: string;
}): Promise<DispatchBatchAssignmentResult> {
  const data = await requestV1AssignmentCommandJson<unknown>('seller-order-assignments/reassign', {
    json: {
      items: input.orders.map((order) => ({
        commandId: crypto.randomUUID(),
        expectedVersion: order.routeVersionId ?? 'UNASSIGNED',
        sellerOrderId: order.sellerOrderId,
      })),
      reason: '관리자 배정',
      targetDriverId: input.driverId,
      ...(input.routePlanId === undefined ? {} : { targetRoutePlanId: input.routePlanId }),
      targetVehicleId: input.vehicleId,
    },
    method: 'POST',
  });
  return batchAssignmentResult(data);
}

export async function unassignDispatchOrder(order: DispatchListItem): Promise<DispatchAssignmentResult> {
  const data = await requestV1AssignmentCommandJson<unknown>(
    `seller-orders/${encodeURIComponent(order.sellerOrderId)}/assignment/unassign`,
    {
      json: {
        commandId: crypto.randomUUID(),
        expectedVersion: order.routeVersionId ?? 'UNASSIGNED',
        reason: '관리자 배정 해제',
      },
      method: 'POST',
    },
  );
  return assignmentResult(data);
}

function dispatchResponse(data: unknown): { items: unknown[]; page?: DispatchListPage } {
  if (!hasOnlyKeys(data, ['items', 'page']) || !Array.isArray(data.items)) throw new Error('배차 목록 응답 형식이 올바르지 않습니다.');
  return {
    items: data.items,
    page: dispatchPage(data.page),
  };
}

function dispatchPage(value: unknown): DispatchListPage | undefined {
  if (value === undefined) return undefined;
  if (!hasOnlyKeys(value, ['hasMore', 'nextCursor'])) throw new Error('배차 목록 페이지 응답 형식이 올바르지 않습니다.');
  if (value.hasMore !== undefined && typeof value.hasMore !== 'boolean') throw new Error('배차 목록의 hasMore 필드가 올바르지 않습니다.');
  if (value.nextCursor !== undefined && typeof value.nextCursor !== 'string') throw new Error('배차 목록의 nextCursor 필드가 올바르지 않습니다.');
  return {
    hasMore: value.hasMore,
    nextCursor: value.nextCursor,
  };
}

function toDispatchListItem(raw: unknown): DispatchListItem {
  const dispatch = rawDispatch(raw);
  return {
    actualCompletedAt: dispatch.actualCompletedAt ?? null,
    assignmentStatus: dispatch.assignmentStatus,
    customerId: dispatch.customerId,
    destinationAddress: dispatch.destinationAddress ?? null,
    destinationDisplayName: dispatch.destinationDisplayName ?? null,
    destinationId: dispatch.destinationId,
    driverId: dispatch.driverId ?? null,
    estimatedArrivalAt: dispatch.estimatedArrivalAt ?? null,
    etaStatus: dispatch.etaStatus,
    latitude: dispatch.latitude ?? null,
    longitude: dispatch.longitude ?? null,
    routePlanId: dispatch.routePlanId ?? null,
    routeStopSequence: dispatch.routeStopSequence ?? null,
    routeVersionId: dispatch.routeVersionId ?? null,
    sellerOrderId: dispatch.sellerOrderId,
    sellerOrderKey: dispatch.sellerOrderKey,
    vehicleId: dispatch.vehicleId ?? null,
  };
}

function rawDispatch(value: unknown): RawDispatch {
  if (!hasOnlyKeys(value, [
    'actualCompletedAt',
    'sellerOrderId',
    'sellerOrderKey',
    'customerId',
    'destinationId',
    'destinationDisplayName',
    'destinationAddress',
    'driverId',
    'vehicleId',
    'latitude',
    'longitude',
    'assignmentStatus',
    'etaStatus',
    'estimatedArrivalAt',
    'routePlanId',
    'routeStopSequence',
    'routeVersionId',
  ])) {
    throw new Error('배차 항목 응답 형식이 올바르지 않습니다.');
  }
  for (const field of ['sellerOrderId', 'sellerOrderKey', 'customerId', 'destinationId', 'assignmentStatus', 'etaStatus'] as const) {
    if (typeof value[field] !== 'string' || value[field].trim() === '') throw new Error(`배차 항목의 ${field} 필드가 올바르지 않습니다.`);
  }
  if (!['ASSIGNED', 'UNASSIGNED'].includes(value.assignmentStatus as string)) throw new Error('배차 항목의 assignmentStatus 필드가 올바르지 않습니다.');
  if (!['FAILED', 'NOT_REQUIRED', 'PENDING', 'READY', 'STALE'].includes(value.etaStatus as string)) throw new Error('배차 항목의 etaStatus 필드가 올바르지 않습니다.');
  for (const field of ['actualCompletedAt', 'destinationDisplayName', 'destinationAddress', 'driverId', 'vehicleId', 'estimatedArrivalAt', 'routePlanId', 'routeVersionId'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'string') throw new Error(`배차 항목의 ${field} 필드가 올바르지 않습니다.`);
  }
  for (const field of ['latitude', 'longitude'] as const) {
    if (value[field] !== undefined && (typeof value[field] !== 'number' || !Number.isFinite(value[field]))) {
      throw new Error(`배차 항목의 ${field} 필드가 올바르지 않습니다.`);
    }
  }
  if (value.routeStopSequence !== undefined
    && (!Number.isInteger(value.routeStopSequence) || (value.routeStopSequence as number) < 1)) {
    throw new Error('배차 항목의 routeStopSequence 필드가 올바르지 않습니다.');
  }
  return value as RawDispatch;
}

function assignmentResult(value: unknown): DispatchAssignmentResult {
  if (!hasOnlyKeys(value, ['assignmentResult'])) throw new Error('배정 명령 응답 형식이 올바르지 않습니다.');
  return parseAssignmentResult(value.assignmentResult);
}

function batchAssignmentResult(value: unknown): DispatchBatchAssignmentResult {
  if (!hasOnlyKeys(value, ['assignmentResults', 'routePlanId']) || !Array.isArray(value.assignmentResults)) {
    throw new Error('일괄 배정 명령 응답 형식이 올바르지 않습니다.');
  }
  if (value.routePlanId !== null && typeof value.routePlanId !== 'string') {
    throw new Error('일괄 배정 명령 결과가 올바르지 않습니다.');
  }
  return {
    assignmentResults: value.assignmentResults.map(parseAssignmentResult),
    routePlanId: value.routePlanId,
  };
}

function parseAssignmentResult(value: unknown): DispatchAssignmentResult {
  if (!hasOnlyKeys(value, [
    'assignmentStatus',
    'auditEventId',
    'commandId',
    'etaStatus',
    'newRouteVersionId',
    'previousRouteVersionId',
    'receiptId',
    'routePlanId',
    'sellerOrderId',
  ])) throw new Error('배정 명령 응답 형식이 올바르지 않습니다.');
  if ((value.assignmentStatus !== 'ASSIGNED' && value.assignmentStatus !== 'UNASSIGNED')
    || typeof value.newRouteVersionId !== 'string'
    || typeof value.sellerOrderId !== 'string'
    || (value.routePlanId !== null && typeof value.routePlanId !== 'string')) {
    throw new Error('배정 명령 결과가 올바르지 않습니다.');
  }
  return {
    assignmentStatus: value.assignmentStatus,
    newRouteVersionId: value.newRouteVersionId,
    routePlanId: value.routePlanId,
    sellerOrderId: value.sellerOrderId,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).every((key) => keys.includes(key));
}
