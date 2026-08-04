import { ApiError, requestLegacyJson, requestV1ReadJson } from '../api/client';
import { apiConfig } from '../api/config';
import type { ManagementCondition, ManagementData, ManagementDriver, ManagementVehicle } from '../demo/management';
import { loadManagementData, saveManagementData } from '../demo/management';

type V1ListPage<TItem> = {
  items: TItem[];
  page: {
    hasMore?: boolean;
    nextCursor?: string;
  };
};

type V1DriverListItem = {
  age?: number;
  career?: string;
  displayName: string;
  driverId: string;
  gender?: string;
  phone?: string;
  score?: string;
  status?: string;
  traits?: string[];
  zone?: string;
};

type V1VehicleListItem = {
  displayName: string;
  driverAssignments: V1VehicleDriverAssignment[];
  note?: string;
  status?: string;
  telematicsCapabilities?: string[];
  telematicsSerialNumber?: string;
  type?: string;
  vehicleId: string;
  vehicleLatitude?: number;
  vehicleLongitude?: number;
  vehiclePlate?: string;
  vehicleType?: string;
};

type V1VehicleDriverAssignment = {
  assignmentId: string;
  driverId: string;
};

type V1CustomerListItem = {
  customerId: string;
  displayName: string;
  externalCustomerCode?: string;
  orderCount: number;
  status?: string;
};

type V1DestinationListItem = {
  address?: string;
  destinationId: string;
  displayName: string;
};

type V1ConditionListItem = {
  code: string;
  conditionId: string;
  description: string;
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

export type DriverSignupInvite = {
  expiresAt: string;
  signupUrl: string;
};

export async function issueDriverSignupInvite(): Promise<DriverSignupInvite> {
  const response = await requestLegacyJson<{ invite: unknown }>('drivers/signup-invite', { method: 'POST' });
  if (!isObject(response.invite)) throw new ApiError(502, '배송원 초대 응답 형식이 올바르지 않습니다.', response);
  const { expiresAt, signupUrl } = response.invite;
  if (
    typeof expiresAt !== 'string'
    || Number.isNaN(Date.parse(expiresAt))
    || typeof signupUrl !== 'string'
    || !/^clever-driver:\/\/signup\?token=[A-Za-z0-9_-]{43}$/u.test(signupUrl)
  ) {
    throw new ApiError(502, '배송원 초대 응답 형식이 올바르지 않습니다.', response);
  }
  return { expiresAt, signupUrl };
}

export async function loadManagementSnapshot(): Promise<ManagementData> {
  if (apiConfig.mode === 'mock') return loadManagementData();
  return loadRemoteManagementSnapshot();
}

export async function loadControlManagementSnapshot(): Promise<ManagementData> {
  if (apiConfig.mode === 'mock') return loadManagementData();
  const [vehicles, customers] = await Promise.all([
    readV1List('vehicles', isV1VehicleListItem),
    readV1List('customers', isV1CustomerListItem),
  ]);
  return {
    ...emptyManagementData,
    assignments: vehicles.flatMap(assignmentRelationForVehicle),
    customers: customers.map(customerViewModel),
    vehicles: vehicles.map(vehicleViewModel),
  };
}

export async function loadDispatchReferenceSnapshot(): Promise<ManagementData> {
  if (apiConfig.mode === 'mock') return loadManagementData();
  const [drivers, vehicles, customers, destinations] = await Promise.all([
    readV1List('drivers', isV1DriverListItem),
    readV1List('vehicles', isV1VehicleListItem),
    readV1List('customers', isV1CustomerListItem),
    readV1List('destinations', isV1DestinationListItem),
  ]);
  return {
    ...emptyManagementData,
    assignments: vehicles.flatMap(assignmentRelationForVehicle),
    customers: customers.map(customerViewModel),
    destinations: destinations.map(destinationViewModel),
    drivers: drivers.map(driverViewModel),
    vehicles: vehicles.map(vehicleViewModel),
  };
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
  const removedCondition = previous.conditions.find((condition) => !next.conditions.some((item) => item.id === condition.id));
  if (removedCondition) return () => requestLegacyJson(`conditions/${removedCondition.id}`, { method: 'DELETE' });

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
  if (addedCondition) return () => requestLegacyJson<{ condition: ManagementCondition }>('conditions', { json: conditionWritePayload(addedCondition), method: 'POST' });
  const changedCondition = next.conditions.find((condition) => {
    const current = previous.conditions.find((item) => item.id === condition.id);
    return current !== undefined && JSON.stringify(current) !== JSON.stringify(condition);
  });
  if (changedCondition) return () => requestLegacyJson<{ condition: ManagementCondition }>(`conditions/${changedCondition.id}`, { json: conditionWritePayload(changedCondition), method: 'PATCH' });
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
    ...emptyManagementData,
    assignments: vehicles.flatMap(assignmentRelationForVehicle),
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
    age: driver.age ?? 0,
    career: driver.career ?? '미제공',
    gender: driver.gender ?? '미제공',
    id: driver.driverId,
    name: driver.displayName,
    phone: driver.phone,
    score: driver.score ?? '미제공',
    traits: driver.traits ?? [],
    zone: driver.zone ?? '미제공',
  };
}

function vehicleViewModel(vehicle: V1VehicleListItem): ManagementVehicle {
  return {
    id: vehicle.vehicleId,
    note: vehicle.note ?? '',
    plate: vehicle.vehiclePlate ?? '',
    telematicsCapabilities: vehicle.telematicsCapabilities,
    telematicsSerialNumber: vehicle.telematicsSerialNumber,
    type: vehicle.type ?? (vehicle.vehicleType === 'OTHER' ? '' : (vehicle.vehicleType ?? vehicle.displayName)),
  };
}

function assignmentRelationForVehicle(vehicle: V1VehicleListItem): ManagementData['assignments'] {
  const assignment = vehicle.driverAssignments?.[0];
  return assignment === undefined ? [] : [{
    driverId: assignment.driverId,
    id: assignment.assignmentId,
    kind: '기본 배정',
    vehicleId: vehicle.vehicleId,
  }];
}

function customerViewModel(customer: V1CustomerListItem): ManagementData['customers'][number] {
  return {
    billingCode: customer.externalCustomerCode ?? '',
    id: customer.customerId,
    name: customer.displayName,
    orderCount: customer.orderCount,
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
    code: condition.code,
    description: condition.description,
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
  return hasOnlyKeys(value.page, ['hasMore', 'nextCursor'])
    && (value.page.hasMore === undefined || typeof value.page.hasMore === 'boolean')
    && (value.page.nextCursor === undefined || typeof value.page.nextCursor === 'string');
}

function isV1DriverListItem(value: unknown): value is V1DriverListItem {
  return hasOnlyKeys(value, ['age', 'career', 'displayName', 'driverId', 'gender', 'phone', 'score', 'status', 'traits', 'zone'])
    && isNonEmptyString(value.driverId)
    && isNonEmptyString(value.displayName)
    && (value.age === undefined || (typeof value.age === 'number' && Number.isInteger(value.age) && value.age >= 18 && value.age <= 100))
    && isOptionalString(value.career)
    && isOptionalString(value.gender)
    && isOptionalString(value.phone)
    && isOptionalString(value.score)
    && isOptionalString(value.status)
    && isOptionalStringArray(value.traits)
    && isOptionalString(value.zone);
}

function isV1VehicleListItem(value: unknown): value is V1VehicleListItem {
  return hasOnlyKeys(value, [
    'displayName',
    'driverAssignments',
    'note',
    'status',
    'telematicsCapabilities',
    'telematicsSerialNumber',
    'type',
    'vehicleId',
    'vehicleLatitude',
    'vehicleLongitude',
    'vehiclePlate',
    'vehicleType',
  ])
    && isNonEmptyString(value.vehicleId)
    && isNonEmptyString(value.displayName)
    && Array.isArray(value.driverAssignments)
    && value.driverAssignments.length <= 1
    && value.driverAssignments.every(isV1VehicleDriverAssignment)
    && isOptionalString(value.note)
    && isOptionalString(value.status)
    && isOptionalStringArray(value.telematicsCapabilities)
    && isOptionalString(value.telematicsSerialNumber)
    && isOptionalFiniteNumber(value.vehicleLatitude)
    && isOptionalFiniteNumber(value.vehicleLongitude)
    && isOptionalString(value.vehiclePlate)
    && isOptionalString(value.vehicleType)
    && isOptionalString(value.type);
}

function isV1VehicleDriverAssignment(value: unknown): value is V1VehicleDriverAssignment {
  return hasOnlyKeys(value, ['assignmentId', 'driverId'])
    && isNonEmptyString(value.assignmentId)
    && isNonEmptyString(value.driverId);
}

function isV1CustomerListItem(value: unknown): value is V1CustomerListItem {
  return hasOnlyKeys(value, ['customerId', 'displayName', 'externalCustomerCode', 'orderCount', 'status'])
    && isNonEmptyString(value.customerId)
    && isNonEmptyString(value.displayName)
    && isOptionalString(value.externalCustomerCode)
    && typeof value.orderCount === 'number'
    && Number.isInteger(value.orderCount)
    && value.orderCount >= 0
    && isOptionalString(value.status);
}

function isV1DestinationListItem(value: unknown): value is V1DestinationListItem {
  return hasOnlyKeys(value, ['address', 'destinationId', 'displayName'])
    && isNonEmptyString(value.destinationId)
    && isNonEmptyString(value.displayName)
    && isOptionalString(value.address);
}

function isV1ConditionListItem(value: unknown): value is V1ConditionListItem {
  return hasOnlyKeys(value, ['code', 'conditionId', 'description', 'name', 'status'])
    && isNonEmptyString(value.code)
    && isNonEmptyString(value.conditionId)
    && typeof value.description === 'string'
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

function isOptionalStringArray(value: unknown): value is string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

function driverPayload(driver: ManagementDriver): Omit<ManagementDriver, 'id'> {
  const { id: _id, ...payload } = driver;
  return payload;
}

function vehiclePayload(vehicle: ManagementVehicle): Pick<ManagementVehicle, 'note' | 'plate' | 'type'> {
  return {
    note: vehicle.note,
    plate: vehicle.plate,
    type: vehicle.type,
  };
}

function conditionWritePayload(condition: ManagementCondition): Pick<ManagementCondition, 'code' | 'description' | 'name'> {
  return {
    code: condition.code,
    description: condition.description,
    name: condition.name,
  };
}
