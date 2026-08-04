import {
  requestV1AssignmentCommandJson,
  requestV1ReadJson,
  requestV1TimeConstraintCommandJson,
} from '../api/client';

export type DispatchAssignmentStatus = 'ASSIGNED' | 'UNASSIGNED';
export type DispatchEtaStatus = 'FAILED' | 'NOT_REQUIRED' | 'PENDING' | 'READY' | 'STALE';
export type DispatchSpecialInstructionReviewStatus = 'CLEARED' | 'CONFIRMED' | 'NOT_APPLICABLE' | 'UNCONFIRMED';
export type DispatchRouteConstraintStatus = 'NOT_APPLICABLE' | 'NOT_EVALUATED' | 'PENDING_RECALCULATION' | 'UNCONFIRMED';

export type DispatchTimeConstraint = {
  auditEventId: string;
  confirmedAt: string;
  confirmedBy?: string;
  status: 'CONFIRMED';
  timeWindowEnd: string;
  timeWindowStart: string;
};

export type DispatchTimeConstraintRecalculation = {
  reason: 'ASSIGNED_ROUTE_TIME_CONSTRAINT_CLEARED' | 'ASSIGNED_ROUTE_TIME_CONSTRAINT_CONFIRMED' | 'SCHEDULER_UNAVAILABLE' | 'TIME_CONSTRAINT_CLEARED' | 'UNASSIGNED_ORDER';
  retryable: boolean;
  routePlanId: string | null;
  status: 'FAILED_TO_SCHEDULE' | 'NOT_REQUIRED' | 'SCHEDULED';
};

export type DispatchTimeConstraintCommandResult = {
  auditEventId: string;
  clearedAt?: string;
  clearedBy?: string;
  commandId: string;
  deliveryStopId: string;
  rawNote: string | null;
  recalculation: DispatchTimeConstraintRecalculation;
  reviewStatus: DispatchSpecialInstructionReviewStatus;
  routeConstraintStatus: DispatchRouteConstraintStatus;
  sellerOrderId: string;
  sellerOrderKey: string;
  timeConstraint: DispatchTimeConstraint | null;
};

export type DispatchListItem = {
  actualCompletedAt: string | null;
  assignmentStatus: DispatchAssignmentStatus;
  conditionCode: string | null;
  customerId: string;
  destinationAddress: string | null;
  destinationDisplayName: string | null;
  destinationId: string;
  deliveryStopId: string | null;
  driverId: string | null;
  estimatedArrivalAt: string | null;
  etaStatus: DispatchEtaStatus;
  latitude: number | null;
  longitude: number | null;
  rawNote: string | null;
  reviewStatus: DispatchSpecialInstructionReviewStatus | null;
  routePlanId: string | null;
  routeConstraintStatus: DispatchRouteConstraintStatus | null;
  routeStopSequence: number | null;
  routeVersionId: string | null;
  sellerOrderId: string;
  sellerOrderKey: string;
  shippedBoxes: number | null;
  timeConstraint: DispatchTimeConstraint | null;
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
  conditionCode?: string;
  customerId: string;
  destinationAddress?: string;
  destinationDisplayName?: string;
  destinationId: string;
  deliveryStopId?: string;
  driverId?: string;
  estimatedArrivalAt?: string;
  etaStatus: DispatchEtaStatus;
  latitude?: number;
  longitude?: number;
  rawNote?: string;
  reviewStatus?: DispatchSpecialInstructionReviewStatus;
  routePlanId?: string;
  routeConstraintStatus?: DispatchRouteConstraintStatus;
  routeStopSequence?: number;
  routeVersionId?: string;
  sellerOrderId: string;
  sellerOrderKey: string;
  shippedBoxes?: number;
  timeConstraint?: DispatchTimeConstraint | null;
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

export type DispatchBatchDeleteResult = {
  commandId: string;
  deletedSellerOrderIds: string[];
  receiptId: string;
};

export const MAX_DISPATCH_ASSIGNMENT_COUNT = 100;
export const MAX_DISPATCH_DELETE_COUNT = 100;

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
  if (input.orders.length === 0) throw new Error('배정할 배송을 선택하세요.');
  if (input.orders.length > MAX_DISPATCH_ASSIGNMENT_COUNT) {
    throw new Error(`배송 배정은 한 번에 최대 ${MAX_DISPATCH_ASSIGNMENT_COUNT}건까지 가능합니다.`);
  }
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

export async function unassignDispatchOrders(orders: DispatchListItem[]): Promise<DispatchBatchAssignmentResult> {
  if (orders.length === 0) throw new Error('배정을 해제할 배송을 선택하세요.');
  if (orders.length > MAX_DISPATCH_ASSIGNMENT_COUNT) {
    throw new Error(`배정 해제는 한 번에 최대 ${MAX_DISPATCH_ASSIGNMENT_COUNT}건까지 가능합니다.`);
  }
  const data = await requestV1AssignmentCommandJson<unknown>('seller-order-assignments/unassign', {
    json: {
      items: orders.map((order) => ({
        commandId: crypto.randomUUID(),
        expectedVersion: order.routeVersionId ?? 'UNASSIGNED',
        sellerOrderId: order.sellerOrderId,
      })),
      reason: '관리자 배정 해제',
    },
    method: 'POST',
  });
  return batchAssignmentResult(data);
}

export async function deleteDispatchOrders(orders: DispatchListItem[], reason?: string): Promise<DispatchBatchDeleteResult> {
  if (orders.length === 0) throw new Error('삭제할 배송을 선택하세요.');
  if (orders.length > MAX_DISPATCH_DELETE_COUNT) {
    throw new Error(`배송 삭제는 한 번에 최대 ${MAX_DISPATCH_DELETE_COUNT}건까지 가능합니다.`);
  }
  const data = await requestV1AssignmentCommandJson<unknown>('seller-order-deletions', {
    json: {
      commandId: crypto.randomUUID(),
      items: orders.map((order) => ({
        expectedVersion: order.routeVersionId ?? 'UNASSIGNED',
        sellerOrderId: order.sellerOrderId,
      })),
      ...(reason === undefined ? {} : { reason }),
    },
    method: 'POST',
  });
  return batchDeleteResult(data);
}

export async function confirmDispatchTimeConstraint(
  order: DispatchListItem,
  input: { timeWindowEnd: string; timeWindowStart: string },
): Promise<DispatchTimeConstraintCommandResult> {
  if (order.deliveryStopId === null) throw new Error('시간 제약을 변경할 배송지 ID가 없습니다.');
  const data = await requestV1TimeConstraintCommandJson<unknown>(
    `seller-orders/${encodeURIComponent(order.sellerOrderId)}/time-constraint/confirm`,
    {
      json: {
        commandId: crypto.randomUUID(),
        deliveryStopId: order.deliveryStopId,
        expectedVersion: order.routeVersionId ?? 'UNASSIGNED',
        timeWindowEnd: input.timeWindowEnd,
        timeWindowStart: input.timeWindowStart,
      },
      method: 'POST',
    },
  );
  return timeConstraintCommandResult(data);
}

export async function clearDispatchTimeConstraint(order: DispatchListItem, reason?: string): Promise<DispatchTimeConstraintCommandResult> {
  if (order.deliveryStopId === null) throw new Error('시간 제약을 변경할 배송지 ID가 없습니다.');
  const trimmedReason = reason?.trim();
  const data = await requestV1TimeConstraintCommandJson<unknown>(
    `seller-orders/${encodeURIComponent(order.sellerOrderId)}/time-constraint/clear`,
    {
      json: {
        commandId: crypto.randomUUID(),
        deliveryStopId: order.deliveryStopId,
        expectedVersion: order.routeVersionId ?? 'UNASSIGNED',
        ...(trimmedReason ? { reason: trimmedReason } : {}),
      },
      method: 'POST',
    },
  );
  return timeConstraintCommandResult(data);
}

function dispatchResponse(data: unknown): { items: unknown[]; page?: DispatchListPage } {
  if (!hasOnlyKeys(data, ['items', 'page']) || !Array.isArray(data.items)) throw new Error('배차 목록 응답 형식이 올바르지 않습니다.');
  return {
    items: data.items,
    page: dispatchPage(data.page),
  };
}

function batchDeleteResult(value: unknown): DispatchBatchDeleteResult {
  if (!hasOnlyKeys(value, ['commandId', 'deletedSellerOrderIds', 'receiptId'])
    || typeof value.commandId !== 'string'
    || !Array.isArray(value.deletedSellerOrderIds)
    || value.deletedSellerOrderIds.some((sellerOrderId) => typeof sellerOrderId !== 'string')
    || typeof value.receiptId !== 'string') {
    throw new Error('배송 삭제 응답 형식이 올바르지 않습니다.');
  }
  return {
    commandId: value.commandId,
    deletedSellerOrderIds: value.deletedSellerOrderIds as string[],
    receiptId: value.receiptId,
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
    conditionCode: dispatch.conditionCode ?? null,
    customerId: dispatch.customerId,
    destinationAddress: dispatch.destinationAddress ?? null,
    destinationDisplayName: dispatch.destinationDisplayName ?? null,
    destinationId: dispatch.destinationId,
    deliveryStopId: dispatch.deliveryStopId ?? null,
    driverId: dispatch.driverId ?? null,
    estimatedArrivalAt: dispatch.estimatedArrivalAt ?? null,
    etaStatus: dispatch.etaStatus,
    latitude: dispatch.latitude ?? null,
    longitude: dispatch.longitude ?? null,
    rawNote: dispatch.rawNote ?? null,
    reviewStatus: dispatch.reviewStatus ?? null,
    routePlanId: dispatch.routePlanId ?? null,
    routeConstraintStatus: dispatch.routeConstraintStatus ?? null,
    routeStopSequence: dispatch.routeStopSequence ?? null,
    routeVersionId: dispatch.routeVersionId ?? null,
    sellerOrderId: dispatch.sellerOrderId,
    sellerOrderKey: dispatch.sellerOrderKey,
    shippedBoxes: dispatch.shippedBoxes ?? null,
    timeConstraint: dispatch.timeConstraint ?? null,
    vehicleId: dispatch.vehicleId ?? null,
  };
}

function rawDispatch(value: unknown): RawDispatch {
  if (!hasOnlyKeys(value, [
    'actualCompletedAt',
    'conditionCode',
    'sellerOrderId',
    'sellerOrderKey',
    'shippedBoxes',
    'customerId',
    'destinationId',
    'deliveryStopId',
    'destinationDisplayName',
    'destinationAddress',
    'driverId',
    'vehicleId',
    'latitude',
    'longitude',
    'rawNote',
    'reviewStatus',
    'assignmentStatus',
    'etaStatus',
    'estimatedArrivalAt',
    'routePlanId',
    'routeConstraintStatus',
    'routeStopSequence',
    'routeVersionId',
    'timeConstraint',
  ])) {
    throw new Error('배차 항목 응답 형식이 올바르지 않습니다.');
  }
  for (const field of ['sellerOrderId', 'sellerOrderKey', 'customerId', 'destinationId', 'assignmentStatus', 'etaStatus'] as const) {
    if (typeof value[field] !== 'string' || value[field].trim() === '') throw new Error(`배차 항목의 ${field} 필드가 올바르지 않습니다.`);
  }
  if (!['ASSIGNED', 'UNASSIGNED'].includes(value.assignmentStatus as string)) throw new Error('배차 항목의 assignmentStatus 필드가 올바르지 않습니다.');
  if (!['FAILED', 'NOT_REQUIRED', 'PENDING', 'READY', 'STALE'].includes(value.etaStatus as string)) throw new Error('배차 항목의 etaStatus 필드가 올바르지 않습니다.');
  for (const field of ['actualCompletedAt', 'deliveryStopId', 'destinationDisplayName', 'destinationAddress', 'driverId', 'vehicleId', 'estimatedArrivalAt', 'routePlanId', 'rawNote', 'routeVersionId'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'string') throw new Error(`배차 항목의 ${field} 필드가 올바르지 않습니다.`);
  }
  if (value.conditionCode !== undefined && (typeof value.conditionCode !== 'string' || value.conditionCode.trim() === '')) {
    throw new Error('배차 항목의 conditionCode 필드가 올바르지 않습니다.');
  }
  if (value.shippedBoxes !== undefined && (!Number.isInteger(value.shippedBoxes) || (value.shippedBoxes as number) < 1)) {
    throw new Error('배차 항목의 shippedBoxes 필드가 올바르지 않습니다.');
  }
  if (value.reviewStatus !== undefined && !isReviewStatus(value.reviewStatus)) throw new Error('배차 항목의 reviewStatus 필드가 올바르지 않습니다.');
  if (value.routeConstraintStatus !== undefined && !isRouteConstraintStatus(value.routeConstraintStatus)) throw new Error('배차 항목의 routeConstraintStatus 필드가 올바르지 않습니다.');
  if (value.timeConstraint !== undefined && value.timeConstraint !== null) parseTimeConstraint(value.timeConstraint);
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

function timeConstraintCommandResult(value: unknown): DispatchTimeConstraintCommandResult {
  if (!hasOnlyKeys(value, [
    'auditEventId',
    'clearedAt',
    'clearedBy',
    'commandId',
    'deliveryStopId',
    'rawNote',
    'recalculation',
    'reviewStatus',
    'routeConstraintStatus',
    'sellerOrderId',
    'sellerOrderKey',
    'timeConstraint',
  ])
    || typeof value.auditEventId !== 'string'
    || typeof value.commandId !== 'string'
    || typeof value.deliveryStopId !== 'string'
    || (value.rawNote !== null && typeof value.rawNote !== 'string')
    || !isReviewStatus(value.reviewStatus)
    || !isRouteConstraintStatus(value.routeConstraintStatus)
    || typeof value.sellerOrderId !== 'string'
    || typeof value.sellerOrderKey !== 'string'
    || (value.clearedAt !== undefined && typeof value.clearedAt !== 'string')
    || (value.clearedBy !== undefined && typeof value.clearedBy !== 'string')) {
    throw new Error('시간 제약 명령 응답 형식이 올바르지 않습니다.');
  }
  return {
    auditEventId: value.auditEventId,
    ...(value.clearedAt === undefined ? {} : { clearedAt: value.clearedAt }),
    ...(value.clearedBy === undefined ? {} : { clearedBy: value.clearedBy }),
    commandId: value.commandId,
    deliveryStopId: value.deliveryStopId,
    rawNote: value.rawNote,
    recalculation: parseRecalculation(value.recalculation),
    reviewStatus: value.reviewStatus,
    routeConstraintStatus: value.routeConstraintStatus,
    sellerOrderId: value.sellerOrderId,
    sellerOrderKey: value.sellerOrderKey,
    timeConstraint: value.timeConstraint === null ? null : parseTimeConstraint(value.timeConstraint),
  };
}

function parseTimeConstraint(value: unknown): DispatchTimeConstraint {
  if (!hasOnlyKeys(value, ['auditEventId', 'confirmedAt', 'confirmedBy', 'status', 'timeWindowEnd', 'timeWindowStart'])
    || typeof value.auditEventId !== 'string'
    || typeof value.confirmedAt !== 'string'
    || (value.confirmedBy !== undefined && typeof value.confirmedBy !== 'string')
    || value.status !== 'CONFIRMED'
    || !isTimeOnly(value.timeWindowEnd)
    || !isTimeOnly(value.timeWindowStart)) {
    throw new Error('시간 제약 응답 형식이 올바르지 않습니다.');
  }
  return {
    auditEventId: value.auditEventId,
    confirmedAt: value.confirmedAt,
    ...(value.confirmedBy === undefined ? {} : { confirmedBy: value.confirmedBy }),
    status: value.status,
    timeWindowEnd: value.timeWindowEnd,
    timeWindowStart: value.timeWindowStart,
  };
}

function parseRecalculation(value: unknown): DispatchTimeConstraintRecalculation {
  if (!hasOnlyKeys(value, ['reason', 'retryable', 'routePlanId', 'status'])
    || ![
      'ASSIGNED_ROUTE_TIME_CONSTRAINT_CLEARED',
      'ASSIGNED_ROUTE_TIME_CONSTRAINT_CONFIRMED',
      'SCHEDULER_UNAVAILABLE',
      'TIME_CONSTRAINT_CLEARED',
      'UNASSIGNED_ORDER',
    ].includes(value.reason as string)
    || typeof value.retryable !== 'boolean'
    || (value.routePlanId !== null && typeof value.routePlanId !== 'string')
    || !['FAILED_TO_SCHEDULE', 'NOT_REQUIRED', 'SCHEDULED'].includes(value.status as string)) {
    throw new Error('시간 제약 재계산 응답 형식이 올바르지 않습니다.');
  }
  return value as DispatchTimeConstraintRecalculation;
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

function isReviewStatus(value: unknown): value is DispatchSpecialInstructionReviewStatus {
  return value === 'CLEARED' || value === 'CONFIRMED' || value === 'NOT_APPLICABLE' || value === 'UNCONFIRMED';
}

function isRouteConstraintStatus(value: unknown): value is DispatchRouteConstraintStatus {
  return value === 'NOT_APPLICABLE' || value === 'NOT_EVALUATED' || value === 'PENDING_RECALCULATION' || value === 'UNCONFIRMED';
}

function isTimeOnly(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/u.test(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).every((key) => keys.includes(key));
}
