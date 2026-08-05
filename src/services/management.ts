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
  distanceTodayKm?: number | null;
  driverAssignments: V1VehicleDriverAssignment[];
  ignitionOn?: boolean | null;
  note?: string;
  speedKph?: number | null;
  status?: string;
  telematicsCapabilities?: string[];
  telematicsSerialNumber?: string;
  temperatureA?: number | null;
  temperatureB?: number | null;
  temperatureObservedAt?: string | null;
  temperatureStale?: boolean | null;
  telemetryActivity?: 'ACTIVE' | 'DORMANT';
  type?: string;
  vehicleId: string;
  vehicleLatitude?: number | null;
  vehicleLongitude?: number | null;
  vehiclePositionObservedAt?: string | null;
  vehiclePositionStale?: boolean | null;
  vehicleStopped?: boolean | null;
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
  temperatureAlertEnabled?: boolean;
  temperatureMaxC?: number | null;
  temperatureMinC?: number | null;
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
  const [vehicles, customers, conditions] = await Promise.all([
    readV1List('vehicles', isV1VehicleListItem),
    readV1List('customers', isV1CustomerListItem),
    readV1List('conditions', isV1ConditionListItem),
  ]);
  return {
    ...emptyManagementData,
    assignments: vehicles.flatMap(assignmentRelationForVehicle),
    conditions: conditions.map(conditionViewModel),
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
  const mutationSnapshot = await operation();
  try {
    return await loadRemoteManagementSnapshot();
  } catch {
    return mutationSnapshot;
  }
}

function resourceOperation(previous: ManagementData, next: ManagementData): (() => Promise<ManagementData>) | null {
  const removedDriver = previous.drivers.find((driver) => !next.drivers.some((item) => item.id === driver.id));
  if (removedDriver) return async () => { await requestLegacyJson(`drivers/${removedDriver.id}`, { method: 'DELETE' }); return next; };
  const removedVehicle = previous.vehicles.find((vehicle) => !next.vehicles.some((item) => item.id === vehicle.id));
  if (removedVehicle) return async () => { await requestLegacyJson(`vehicles/${removedVehicle.id}`, { method: 'DELETE' }); return next; };
  const removedCondition = previous.conditions.find((condition) => !next.conditions.some((item) => item.id === condition.id));
  if (removedCondition) return async () => { await requestLegacyJson(`conditions/${removedCondition.id}`, { method: 'DELETE' }); return next; };

  const addedDriver = next.drivers.find((driver) => !previous.drivers.some((item) => item.id === driver.id));
  if (addedDriver) return async () => {
    const { driver } = await requestLegacyJson<{ driver: ManagementDriver }>('drivers', { json: driverPayload(addedDriver), method: 'POST' });
    return { ...next, drivers: replaceManagementItem(next.drivers, addedDriver.id, { ...addedDriver, ...driver }) };
  };
  const changedDriver = next.drivers.find((driver) => {
    const current = previous.drivers.find((item) => item.id === driver.id);
    return current !== undefined && JSON.stringify(current) !== JSON.stringify(driver);
  });
  if (changedDriver) return async () => {
    const { driver } = await requestLegacyJson<{ driver: ManagementDriver }>(`drivers/${changedDriver.id}`, { json: driverPayload(changedDriver), method: 'PATCH' });
    return { ...next, drivers: replaceManagementItem(next.drivers, changedDriver.id, { ...changedDriver, ...driver }) };
  };

  const addedVehicle = next.vehicles.find((vehicle) => !previous.vehicles.some((item) => item.id === vehicle.id));
  if (addedVehicle) return async () => {
    const { vehicle } = await requestLegacyJson<{ vehicle: ManagementVehicle }>('vehicles', { json: vehiclePayload(addedVehicle), method: 'POST' });
    return { ...next, vehicles: replaceManagementItem(next.vehicles, addedVehicle.id, { ...addedVehicle, ...vehicle }) };
  };
  const changedVehicle = next.vehicles.find((vehicle) => {
    const current = previous.vehicles.find((item) => item.id === vehicle.id);
    return current !== undefined && JSON.stringify(current) !== JSON.stringify(vehicle);
  });
  if (changedVehicle) return async () => {
    const { vehicle } = await requestLegacyJson<{ vehicle: ManagementVehicle }>(`vehicles/${changedVehicle.id}`, { json: vehiclePayload(changedVehicle), method: 'PATCH' });
    return { ...next, vehicles: replaceManagementItem(next.vehicles, changedVehicle.id, { ...changedVehicle, ...vehicle }) };
  };

  const addedAssignment = next.assignments.find((assignment) => !previous.assignments.some((item) => item.id === assignment.id));
  if (addedAssignment) return async () => {
    const { assignment } = await requestLegacyJson<{ assignment: ManagementData['assignments'][number] }>(`vehicles/${addedAssignment.vehicleId}/drivers`, { json: { driverId: addedAssignment.driverId }, method: 'POST' });
    return { ...next, assignments: replaceManagementItem(next.assignments, addedAssignment.id, assignment) };
  };
  const removedAssignment = previous.assignments.find((assignment) => !next.assignments.some((item) => item.id === assignment.id));
  if (removedAssignment) return async () => { await requestLegacyJson(`vehicles/${removedAssignment.vehicleId}/drivers/${removedAssignment.id}`, { method: 'DELETE' }); return next; };

  const addedCondition = next.conditions.find((condition) => !previous.conditions.some((item) => item.id === condition.id));
  if (addedCondition) return async () => {
    const { condition } = await requestLegacyJson<{ condition: ManagementCondition }>('conditions', { json: conditionWritePayload(addedCondition), method: 'POST' });
    return { ...next, conditions: replaceManagementItem(next.conditions, addedCondition.id, { ...addedCondition, ...condition }) };
  };
  const changedCondition = next.conditions.find((condition) => {
    const current = previous.conditions.find((item) => item.id === condition.id);
    return current !== undefined && JSON.stringify(current) !== JSON.stringify(condition);
  });
  if (changedCondition) return async () => {
    const { condition } = await requestLegacyJson<{ condition: ManagementCondition }>(`conditions/${changedCondition.id}`, { json: conditionWritePayload(changedCondition), method: 'PATCH' });
    return { ...next, conditions: replaceManagementItem(next.conditions, changedCondition.id, { ...changedCondition, ...condition }) };
  };
  return null;
}

function replaceManagementItem<TItem extends { id: string }>(items: TItem[], currentId: string, replacement: TItem): TItem[] {
  return items.map((item) => item.id === currentId ? replacement : item);
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
    distanceTodayKm: vehicle.distanceTodayKm,
    id: vehicle.vehicleId,
    ignitionOn: vehicle.ignitionOn,
    note: vehicle.note ?? '',
    plate: vehicle.vehiclePlate ?? '',
    speedKph: vehicle.speedKph,
    telematicsCapabilities: vehicle.telematicsCapabilities,
    telematicsSerialNumber: vehicle.telematicsSerialNumber,
    temperatureA: vehicle.temperatureA,
    temperatureB: vehicle.temperatureB,
    temperatureObservedAt: vehicle.temperatureObservedAt,
    temperatureStale: vehicle.temperatureStale,
    telemetryActivity: vehicle.telemetryActivity,
    type: vehicle.type ?? (vehicle.vehicleType === 'OTHER' ? '' : (vehicle.vehicleType ?? vehicle.displayName)),
    vehicleLatitude: vehicle.vehicleLatitude,
    vehicleLongitude: vehicle.vehicleLongitude,
    vehiclePositionObservedAt: vehicle.vehiclePositionObservedAt,
    vehiclePositionStale: vehicle.vehiclePositionStale,
    vehicleStopped: vehicle.vehicleStopped,
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
    temperatureAlertEnabled: condition.temperatureAlertEnabled ?? false,
    temperatureMaxC: condition.temperatureMaxC ?? null,
    temperatureMinC: condition.temperatureMinC ?? null,
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
    && (value.age === undefined || (typeof value.age === 'number' && Number.isInteger(value.age) && (value.age === 0 || (value.age >= 18 && value.age <= 100))))
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
    'distanceTodayKm',
    'driverAssignments',
    'ignitionOn',
    'note',
    'speedKph',
    'status',
    'telematicsCapabilities',
    'telematicsSerialNumber',
    'temperatureA',
    'temperatureB',
    'temperatureObservedAt',
    'temperatureStale',
    'telemetryActivity',
    'type',
    'vehicleId',
    'vehicleLatitude',
    'vehicleLongitude',
    'vehiclePositionObservedAt',
    'vehiclePositionStale',
    'vehicleStopped',
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
    && isOptionalNullableFiniteNumber(value.distanceTodayKm)
    && isOptionalNullableBoolean(value.ignitionOn)
    && isOptionalNullableFiniteNumber(value.speedKph)
    && isOptionalNullableFiniteNumber(value.temperatureA)
    && isOptionalNullableFiniteNumber(value.temperatureB)
    && isOptionalNullableDateTimeString(value.temperatureObservedAt)
    && isOptionalNullableBoolean(value.temperatureStale)
    && (value.telemetryActivity === undefined || value.telemetryActivity === 'ACTIVE' || value.telemetryActivity === 'DORMANT')
    && isOptionalNullableCoordinatePair(value.vehicleLatitude, value.vehicleLongitude)
    && isOptionalNullableDateTimeString(value.vehiclePositionObservedAt)
    && isOptionalNullableBoolean(value.vehiclePositionStale)
    && isOptionalNullableBoolean(value.vehicleStopped)
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
  return hasOnlyKeys(value, ['code', 'conditionId', 'description', 'name', 'status', 'temperatureAlertEnabled', 'temperatureMaxC', 'temperatureMinC'])
    && isNonEmptyString(value.code)
    && isNonEmptyString(value.conditionId)
    && typeof value.description === 'string'
    && isNonEmptyString(value.name)
    && isOptionalString(value.status)
    && (value.temperatureAlertEnabled === undefined || typeof value.temperatureAlertEnabled === 'boolean')
    && isOptionalNullableFiniteNumber(value.temperatureMaxC)
    && isOptionalNullableFiniteNumber(value.temperatureMinC);
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

function isOptionalNullableFiniteNumber(value: unknown): value is number | null | undefined {
  return value === null || isOptionalFiniteNumber(value);
}

function isOptionalNullableBoolean(value: unknown): value is boolean | null | undefined {
  return value === undefined || value === null || typeof value === 'boolean';
}

function isOptionalNullableCoordinatePair(latitude: unknown, longitude: unknown): boolean {
  const latitudeMissing = latitude === undefined || latitude === null;
  const longitudeMissing = longitude === undefined || longitude === null;
  if (latitudeMissing || longitudeMissing) return latitudeMissing && longitudeMissing;
  return typeof latitude === 'number'
    && Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90
    && typeof longitude === 'number'
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180;
}

function isOptionalNullableDateTimeString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value)));
}

function driverPayload(driver: ManagementDriver): Omit<ManagementDriver, 'id'> {
  const { id: _id, ...payload } = driver;
  return payload;
}

function vehiclePayload(vehicle: ManagementVehicle): Pick<ManagementVehicle, 'note' | 'plate' | 'telematicsSerialNumber' | 'type'> {
  return {
    note: vehicle.note,
    plate: vehicle.plate,
    telematicsSerialNumber: vehicle.telematicsSerialNumber ?? '',
    type: vehicle.type,
  };
}

function conditionWritePayload(condition: ManagementCondition): Pick<ManagementCondition, 'code' | 'description' | 'name' | 'temperatureAlertEnabled' | 'temperatureMaxC' | 'temperatureMinC'> {
  return {
    code: condition.code,
    description: condition.description,
    name: condition.name,
    temperatureAlertEnabled: condition.temperatureAlertEnabled,
    temperatureMaxC: condition.temperatureMaxC,
    temperatureMinC: condition.temperatureMinC,
  };
}
