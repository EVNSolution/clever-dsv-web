import { ApiError, requestLegacyJson, requestV1ReadJson } from '../api/client';
import { apiConfig } from '../api/config';
import { cargoFor, controlDemoVehicles, routeStops } from '../demo/selectors/route';

export type DeliveryStopSelection = {
  deliveryStopId: string;
  stopNo: number;
  vehicleId: string;
};

export type DeliveryStopContext = {
  deliveryStopId: string;
  destination: {
    address: string;
    destinationId: string;
    name: string;
  };
  items: Array<{
    name: string;
    orderItemId: string;
    quantity: number;
    sku: string | null;
    temperatureBand: 'ambient' | 'cold' | 'frozen' | null;
  }>;
  tips: Array<{
    body: string;
    category: 'access' | 'parking' | 'handoff' | 'proof' | 'temperature' | 'safety' | 'other';
    revision: number;
    severity: 'info' | 'warning';
    tipId: string;
    title: string;
  }>;
};

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

const demoTips: Record<string, DeliveryStopContext['tips']> = {
  강남역: [{ body: '도착 10분 전 담당자에게 연락하고 후문 하역장으로 진입합니다.', category: 'access', revision: 1, severity: 'warning', tipId: 'demo-tip-gangnam', title: '후문 하역장 이용' }],
  서울성모병원: [{ body: '거래명세표와 냉장품 인수증을 함께 확인합니다.', category: 'proof', revision: 1, severity: 'info', tipId: 'demo-tip-seoul', title: '인수증 확인' }],
  서울아산병원: [{ body: '지하 주차장 진입 전 차량 높이를 확인합니다.', category: 'parking', revision: 1, severity: 'warning', tipId: 'demo-tip-asan', title: '차량 높이 제한' }],
};

export function deliveryStopIdFor(vehicleId: string, stopNo: number): string {
  return `demo:${vehicleId}:${stopNo}`;
}

export function currentDeliveryStopFor(vehicleId: string): DeliveryStopSelection {
  const vehicle = controlDemoVehicles.find((item) => item.id === vehicleId) ?? controlDemoVehicles[0];
  const stopNo = Math.min(vehicle.done + 1, routeStops[vehicle.route].length);
  return { deliveryStopId: deliveryStopIdFor(vehicle.id, stopNo), stopNo, vehicleId: vehicle.id };
}

export async function loadDeliveryStopContext(selection: DeliveryStopSelection, signal?: AbortSignal): Promise<DeliveryStopContext> {
  if (apiConfig.mode === 'remote') {
    return requestLegacyJson<DeliveryStopContext>(`control/delivery-stops/${encodeURIComponent(selection.deliveryStopId)}/context`, { signal });
  }
  const vehicle = controlDemoVehicles.find((item) => item.id === selection.vehicleId);
  if (!vehicle) throw new Error('선택한 차량을 찾을 수 없습니다.');
  const name = routeStops[vehicle.route][selection.stopNo - 1];
  if (!name) throw new Error('선택한 배송지를 찾을 수 없습니다.');
  return {
    deliveryStopId: selection.deliveryStopId,
    destination: { address: `${name} 배송지`, destinationId: `demo-destination:${vehicle.route}:${selection.stopNo}`, name },
    items: cargoFor(selection.stopNo).map((item, index) => ({
      name: item.name,
      orderItemId: `demo-item:${selection.deliveryStopId}:${index}`,
      quantity: item.qty,
      sku: null,
      temperatureBand: null,
    })),
    tips: demoTips[name] ?? [],
  };
}

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
