import { requestV1ReadJson } from '../api/client';

export type DispatchAssignmentStatus = 'ASSIGNED' | 'UNASSIGNED';
export type DispatchEtaStatus = 'FAILED' | 'NOT_REQUIRED' | 'PENDING' | 'READY' | 'STALE';

export type DispatchListItem = {
  assignmentStatus: DispatchAssignmentStatus;
  customerId: string;
  destinationId: string;
  estimatedArrivalAt: string | null;
  etaStatus: DispatchEtaStatus;
  routePlanId: string | null;
  routeVersionId: string | null;
  sellerOrderId: string;
  sellerOrderKey: string;
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

type RawDispatch = {
  assignmentStatus: DispatchAssignmentStatus;
  customerId: string;
  destinationId: string;
  estimatedArrivalAt?: string;
  etaStatus: DispatchEtaStatus;
  routePlanId?: string;
  routeVersionId?: string;
  sellerOrderId: string;
  sellerOrderKey: string;
};

export async function loadDispatchList(signal?: AbortSignal): Promise<DispatchListView> {
  const data = await requestV1ReadJson<unknown>('dispatches', { signal });
  const response = dispatchResponse(data);
  const rows = response.items.map(toDispatchListItem);
  return {
    page: response.page,
    rows,
    summary: {
      assigned: rows.filter((row) => row.assignmentStatus === 'ASSIGNED').length,
      etaAttention: rows.filter((row) => row.etaStatus === 'FAILED' || row.etaStatus === 'STALE').length,
      total: rows.length,
      unassigned: rows.filter((row) => row.assignmentStatus === 'UNASSIGNED').length,
    },
  };
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
    assignmentStatus: dispatch.assignmentStatus,
    customerId: dispatch.customerId,
    destinationId: dispatch.destinationId,
    estimatedArrivalAt: dispatch.estimatedArrivalAt ?? null,
    etaStatus: dispatch.etaStatus,
    routePlanId: dispatch.routePlanId ?? null,
    routeVersionId: dispatch.routeVersionId ?? null,
    sellerOrderId: dispatch.sellerOrderId,
    sellerOrderKey: dispatch.sellerOrderKey,
  };
}

function rawDispatch(value: unknown): RawDispatch {
  if (!hasOnlyKeys(value, ['sellerOrderId', 'sellerOrderKey', 'customerId', 'destinationId', 'assignmentStatus', 'etaStatus', 'estimatedArrivalAt', 'routePlanId', 'routeVersionId'])) {
    throw new Error('배차 항목 응답 형식이 올바르지 않습니다.');
  }
  for (const field of ['sellerOrderId', 'sellerOrderKey', 'customerId', 'destinationId', 'assignmentStatus', 'etaStatus'] as const) {
    if (typeof value[field] !== 'string' || value[field].trim() === '') throw new Error(`배차 항목의 ${field} 필드가 올바르지 않습니다.`);
  }
  if (!['ASSIGNED', 'UNASSIGNED'].includes(value.assignmentStatus as string)) throw new Error('배차 항목의 assignmentStatus 필드가 올바르지 않습니다.');
  if (!['FAILED', 'NOT_REQUIRED', 'PENDING', 'READY', 'STALE'].includes(value.etaStatus as string)) throw new Error('배차 항목의 etaStatus 필드가 올바르지 않습니다.');
  for (const field of ['estimatedArrivalAt', 'routePlanId', 'routeVersionId'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'string') throw new Error(`배차 항목의 ${field} 필드가 올바르지 않습니다.`);
  }
  return value as RawDispatch;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).every((key) => keys.includes(key));
}
