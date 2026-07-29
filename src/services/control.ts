import { ApiError, requestV1ReadJson } from '../api/client';

export type ControlSummary = {
  assignedCount: number;
  failedEtaCount: number;
  pendingEtaCount: number;
  readyEtaCount: number;
  serviceDate: string;
  totalDispatchCount: number;
  unassignedCount: number;
};

const controlSummaryFields: Array<keyof ControlSummary> = [
  'serviceDate',
  'totalDispatchCount',
  'assignedCount',
  'unassignedCount',
  'pendingEtaCount',
  'failedEtaCount',
  'readyEtaCount',
];

export async function loadControlSummary(signal?: AbortSignal): Promise<ControlSummary> {
  return adaptControlSummary(await requestV1ReadJson<unknown>('control', { signal }));
}

function adaptControlSummary(data: unknown): ControlSummary {
  if (!isObject(data)) throw invalidControlSummary(data);
  const keys = Object.keys(data);
  if (keys.length !== controlSummaryFields.length || !controlSummaryFields.every((field) => keys.includes(field))) throw invalidControlSummary(data);
  if (typeof data.serviceDate !== 'string' || data.serviceDate.trim() === '') throw invalidControlSummary(data);
  for (const field of controlSummaryFields) {
    if (field === 'serviceDate') continue;
    if (!isNonNegativeInteger(data[field])) throw invalidControlSummary(data);
  }
  return {
    serviceDate: data.serviceDate,
    totalDispatchCount: data.totalDispatchCount as number,
    assignedCount: data.assignedCount as number,
    unassignedCount: data.unassignedCount as number,
    pendingEtaCount: data.pendingEtaCount as number,
    failedEtaCount: data.failedEtaCount as number,
    readyEtaCount: data.readyEtaCount as number,
  };
}

function invalidControlSummary(body: unknown): ApiError {
  return new ApiError(502, '관제 요약 API 응답 형식이 올바르지 않습니다.', body);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
