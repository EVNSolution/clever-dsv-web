import { ApiError, requestLegacyJson, requestV1ReadJson } from '../api/client';
import { apiConfig } from '../api/config';
import type { ManagementCondition, ManagementData, ManagementDriver, ManagementVehicle } from '../demo/management';
import { loadManagementData, saveManagementData } from '../demo/management';

type V1ListPage<TItem> = {
  items: TItem[];
  page?: {
    hasMore?: boolean;
    nextCursor?: string;
  };
};

type V1DriverListItem = {
  displayName: string;
  driverId: string;
  phone?: string;
  status?: string;
};

type V1VehicleListItem = {
  displayName: string;
  driverAssignments?: V1VehicleDriverAssignment[];
  status?: string;
  vehicleId: string;
  vehiclePlate?: string;
};

type V1VehicleDriverAssignment = {
  assignmentId: string;
  driverId: string;
};

type V1CustomerListItem = {
  customerId: string;
  displayName: string;
  externalCustomerCode?: string;
  status?: string;
};

type V1DestinationListItem = {
  address?: string;
  destinationId: string;
  displayName: string;
};

type V1ConditionListItem = {
  conditionId: string;
  name: string;
  status?: string;
};

export const emptyManagementData: ManagementData = {
  assignments: [],
  conditions: [],
  customers: [],
  destinations: [],
  drivers: [],
  vehicles: [],
};

export async function loadManagementSnapshot(): Promise<ManagementData> {
  if (apiConfig.mode === 'mock') return loadManagementData();
  return loadRemoteManagementSnapshot();
}

export async function persistManagementChange(previous: ManagementData, next: ManagementData): Promise<ManagementData> {
  if (apiConfig.mode === 'mock') {
    saveManagementData(next);
    return next;
  }

  const operation = resourceOperation(previous, next);
  if (operation === null) throw new ApiError(400, '이 항목은 원격 관리 API에서 아직 변경할 수 없습니다.');
  await operation();
  return loadRemoteManagementSnapshot();
}

function resourceOperation(previous: ManagementData, next: ManagementData): (() => Promise<unknown>) | null {
  const removedDriver = previous.drivers.find((driver) => !next.drivers.some((item) => item.id === driver.id));
  if (removedDriver) return () => requestLegacyJson(`drivers/${removedDriver.id}`, { method: 'DELETE' });
  const removedVehicle = previous.vehicles.find((vehicle) => !next.vehicles.some((item) => item.id === vehicle.id));
  if (removedVehicle) return () => requestLegacyJson(`vehicles/${removedVehicle.id}`, { method: 'DELETE' });

  const addedDriver = next.drivers.find((driver) => !previous.drivers.some((item) => item.id === driver.id));
  if (addedDriver) return () => requestLegacyJson<{ driver: ManagementDriver }>('drivers', { json: driverPayload(addedDriver), method: 'POST' });
  const changedDriver = next.drivers.find((driver) => {
    const current = previous.drivers.find((item) => item.id === driver.id);
    return current !== undefined && JSON.stringify(current) !== JSON.stringify(driver);
  });
  if (changedDriver) return () => requestLegacyJson<{ driver: ManagementDriver }>(`drivers/${changedDriver.id}`, { json: driverPayload(changedDriver), method: 'PATCH' });

  const addedVehicle = next.vehicles.find((vehicle) => !previous.vehicles.some((item) => item.id === vehicle.id));
  if (addedVehicle) return () => requestLegacyJson<{ vehicle: ManagementVehicle }>('vehicles', { json: vehiclePayload(addedVehicle), method: 'POST' });
  const changedVehicle = next.vehicles.find((vehicle) => {
    const current = previous.vehicles.find((item) => item.id === vehicle.id);
    return current !== undefined && JSON.stringify(current) !== JSON.stringify(vehicle);
  });
  if (changedVehicle) return () => requestLegacyJson<{ vehicle: ManagementVehicle }>(`vehicles/${changedVehicle.id}`, { json: vehiclePayload(changedVehicle), method: 'PATCH' });

  const addedAssignment = next.assignments.find((assignment) => !previous.assignments.some((item) => item.id === assignment.id));
  if (addedAssignment) return () => requestLegacyJson(`vehicles/${addedAssignment.vehicleId}/drivers`, { json: { driverId: addedAssignment.driverId }, method: 'POST' });
  const removedAssignment = previous.assignments.find((assignment) => !next.assignments.some((item) => item.id === assignment.id));
  if (removedAssignment) return () => requestLegacyJson(`vehicles/${removedAssignment.vehicleId}/drivers/${removedAssignment.id}`, { method: 'DELETE' });

  const addedCondition = next.conditions.find((condition) => !previous.conditions.some((item) => item.id === condition.id));
  if (addedCondition) return () => requestLegacyJson<{ condition: ManagementCondition }>('conditions', { json: conditionPayload(addedCondition), method: 'POST' });
  return null;
}

async function loadRemoteManagementSnapshot(): Promise<ManagementData> {
  const [drivers, vehicles, customers, destinations, conditions] = await Promise.all([
    readV1List('drivers', isV1DriverListItem),
    readV1List('vehicles', isV1VehicleListItem),
    readV1List('customers', isV1CustomerListItem),
    readV1List('destinations', isV1DestinationListItem),
    readV1List('conditions', isV1ConditionListItem),
  ]);
  return {
    assignments: vehicles.flatMap((vehicle) => (vehicle.driverAssignments ?? []).map((assignment) => ({
      driverId: assignment.driverId,
      id: assignment.assignmentId,
      kind: '기본 배정' as const,
      vehicleId: vehicle.vehicleId,
    }))),
    conditions: conditions.map(conditionViewModel),
    customers: customers.map(customerViewModel),
    destinations: destinations.map(destinationViewModel),
    drivers: drivers.map(driverViewModel),
    vehicles: vehicles.map(vehicleViewModel),
  };
}

async function readV1List<TItem>(endpoint: string, isItem: (value: unknown) => value is TItem): Promise<TItem[]> {
  const items: TItem[] = [];
  let cursor: string | undefined;
  do {
    const path = cursor === undefined
      ? `${endpoint}?limit=100`
      : `${endpoint}?limit=100&cursor=${encodeURIComponent(cursor)}`;
    const page = await requestV1ReadJson<V1ListPage<unknown>>(path);
    if (!isV1ListPage(page, isItem)) throw new ApiError(502, 'API v1 관리 목록 형식이 올바르지 않습니다.', page);
    items.push(...page.items);
    cursor = page.page?.hasMore === true ? page.page.nextCursor : undefined;
    if (page.page?.hasMore === true && !cursor) throw new ApiError(502, 'API v1 관리 목록 커서가 올바르지 않습니다.', page);
  } while (cursor !== undefined);
  return items;
}

function driverViewModel(driver: V1DriverListItem): ManagementDriver {
  return {
    age: 0,
    career: '',
    gender: '',
    id: driver.driverId,
    name: driver.displayName,
    score: driver.status ?? '',
    traits: driver.phone ? [`연락처 ${driver.phone}`] : [],
    zone: '',
  };
}

function vehicleViewModel(vehicle: V1VehicleListItem): ManagementVehicle {
  return {
    id: vehicle.vehicleId,
    note: '',
    plate: vehicle.vehiclePlate ?? '',
    type: vehicle.displayName,
  };
}

function customerViewModel(customer: V1CustomerListItem): ManagementData['customers'][number] {
  return {
    billingCode: customer.externalCustomerCode ?? '',
    id: customer.customerId,
    name: customer.displayName,
  };
}

function destinationViewModel(destination: V1DestinationListItem): ManagementData['destinations'][number] {
  return {
    address: destination.address ?? '',
    customerId: '',
    id: destination.destinationId,
    name: destination.displayName,
  };
}

function conditionViewModel(condition: V1ConditionListItem): ManagementCondition {
  return {
    code: '',
    description: '',
    id: condition.conditionId,
    name: condition.name,
    proof: '',
    temperature: '',
    vehicle: '',
  };
}

function isV1ListPage<TItem>(value: unknown, isItem: (item: unknown) => item is TItem): value is V1ListPage<TItem> {
  if (!hasOnlyKeys(value, ['items', 'page']) || !Array.isArray(value.items)) return false;
  if (!value.items.every(isItem)) return false;
  if (value.page === undefined) return true;
  return hasOnlyKeys(value.page, ['hasMore', 'nextCursor'])
    && (value.page.hasMore === undefined || typeof value.page.hasMore === 'boolean')
    && (value.page.nextCursor === undefined || typeof value.page.nextCursor === 'string');
}

function isV1DriverListItem(value: unknown): value is V1DriverListItem {
  return hasOnlyKeys(value, ['displayName', 'driverId', 'phone', 'status'])
    && isNonEmptyString(value.driverId)
    && isNonEmptyString(value.displayName)
    && isOptionalString(value.phone)
    && isOptionalString(value.status);
}

function isV1VehicleListItem(value: unknown): value is V1VehicleListItem {
  return hasOnlyKeys(value, ['displayName', 'driverAssignments', 'status', 'vehicleId', 'vehiclePlate'])
    && isNonEmptyString(value.vehicleId)
    && isNonEmptyString(value.displayName)
    && (value.driverAssignments === undefined
      || (Array.isArray(value.driverAssignments) && value.driverAssignments.every(isV1VehicleDriverAssignment)))
    && isOptionalString(value.status)
    && isOptionalString(value.vehiclePlate);
}

function isV1VehicleDriverAssignment(value: unknown): value is V1VehicleDriverAssignment {
  return hasOnlyKeys(value, ['assignmentId', 'driverId'])
    && isNonEmptyString(value.assignmentId)
    && isNonEmptyString(value.driverId);
}

function isV1CustomerListItem(value: unknown): value is V1CustomerListItem {
  return hasOnlyKeys(value, ['customerId', 'displayName', 'externalCustomerCode', 'status'])
    && isNonEmptyString(value.customerId)
    && isNonEmptyString(value.displayName)
    && isOptionalString(value.externalCustomerCode)
    && isOptionalString(value.status);
}

function isV1DestinationListItem(value: unknown): value is V1DestinationListItem {
  return hasOnlyKeys(value, ['address', 'destinationId', 'displayName'])
    && isNonEmptyString(value.destinationId)
    && isNonEmptyString(value.displayName)
    && isOptionalString(value.address);
}

function isV1ConditionListItem(value: unknown): value is V1ConditionListItem {
  return hasOnlyKeys(value, ['conditionId', 'name', 'status'])
    && isNonEmptyString(value.conditionId)
    && isNonEmptyString(value.name)
    && isOptionalString(value.status);
}

function hasOnlyKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).every((key) => keys.includes(key));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function driverPayload(driver: ManagementDriver): Omit<ManagementDriver, 'id'> {
  const { id: _id, ...payload } = driver;
  return payload;
}

function vehiclePayload(vehicle: ManagementVehicle): Omit<ManagementVehicle, 'id'> {
  const { id: _id, ...payload } = vehicle;
  return payload;
}

function conditionPayload(condition: ManagementCondition): Omit<ManagementCondition, 'id'> {
  const { id: _id, ...payload } = condition;
  return payload;
}
