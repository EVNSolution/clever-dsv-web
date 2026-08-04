import type { ManagementAssignmentRelation } from './model';

export type ManagementDriver = {
  id: string;
  name: string;
  phone?: string;
  age: number;
  gender: string;
  career: string;
  zone: string;
  score: string;
  traits: string[];
};

export type ManagementVehicle = {
  id: string;
  plate: string;
  type: string;
  note: string;
  distanceTodayKm?: number | null;
  ignitionOn?: boolean | null;
  speedKph?: number | null;
  telematicsCapabilities?: string[];
  telematicsSerialNumber?: string;
  temperatureA?: number | null;
  temperatureB?: number | null;
  temperatureObservedAt?: string | null;
  temperatureStale?: boolean | null;
  vehicleLatitude?: number | null;
  vehicleLongitude?: number | null;
  vehiclePositionObservedAt?: string | null;
  vehiclePositionStale?: boolean | null;
};

export type ManagementAssignment = ManagementAssignmentRelation;

export type ManagementCustomer = {
  id: string;
  name: string;
  billingCode: string;
  orderCount?: number;
};

export type ManagementDestination = {
  id: string;
  customerId: string;
  name: string;
  address: string;
  sameAsId?: string;
};

export type ManagementCondition = {
  id: string;
  code: string;
  name: string;
  description: string;
  temperature: string;
  vehicle: string;
  proof: string;
};

export type ManagementData = {
  drivers: ManagementDriver[];
  vehicles: ManagementVehicle[];
  assignments: ManagementAssignment[];
  customers: ManagementCustomer[];
  destinations: ManagementDestination[];
  conditions: ManagementCondition[];
};

const storageKey = 'clever.management.data.v3';
const legacyStorageKeys = ['clever.management.data.v2', 'clever.management.data.v1'];

const seed: ManagementData = {
  drivers: [],
  vehicles: [],
  assignments: [],
  customers: [],
  destinations: [],
  conditions: [
    { id: 'condition-ambient', code: 'AMBIENT', name: '상온 운송', description: '상온 조건으로 운송합니다.', temperature: '실온', vehicle: '윙바디 또는 일반 화물', proof: 'POD' },
    { id: 'condition-cold', code: 'COLD', name: '냉장 운송', description: '냉장 상태를 유지하여 운송합니다.', temperature: '2–8℃', vehicle: '냉장탑차', proof: '온도기록, 인수증' },
    { id: 'condition-ts03', code: 'TS03', name: '특수 운송 03', description: '계약서에 정의된 TS03 운송 조건을 적용합니다.', temperature: '', vehicle: '', proof: '' },
  ],
};

// Backend handoff: replace this localStorage boundary only after the management API contract is approved.
export function loadManagementData(): ManagementData {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    const migrated = legacyStorageKeys
      .map((key) => window.localStorage.getItem(key))
      .map(migrateLegacyManagementData)
      .find((data): data is ManagementData => data !== null);
    if (migrated) {
      window.localStorage.setItem(storageKey, JSON.stringify(migrated));
      return migrated;
    }
    return structuredClone(seed);
  }
  try {
    const stored = JSON.parse(raw) as Partial<ManagementData> | null;
    if (stored && ['drivers', 'vehicles', 'assignments', 'customers', 'destinations', 'conditions'].every((key) => Array.isArray(stored[key as keyof ManagementData]))) {
      return {
        ...(stored as ManagementData),
        conditions: (stored.conditions ?? []).map((condition) => ({
          ...condition,
          description: typeof condition.description === 'string' ? condition.description : '',
          proof: typeof condition.proof === 'string' ? condition.proof : '',
          temperature: typeof condition.temperature === 'string' ? condition.temperature : '',
          vehicle: typeof condition.vehicle === 'string' ? condition.vehicle : '',
        })),
      };
    }
  } catch {
    // Keep the last unreadable value available for manual recovery.
  }
  window.localStorage.setItem(`${storageKey}.invalid`, raw);
  return structuredClone(seed);
}

function migrateLegacyManagementData(raw: string | null): ManagementData | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Partial<ManagementData> | null;
    if (!stored || !Array.isArray(stored.conditions)) return null;
    return {
      drivers: [],
      vehicles: [],
      assignments: [],
      customers: [],
      destinations: [],
      conditions: stored.conditions,
    };
  } catch {
    return null;
  }
}

export function saveManagementData(data: ManagementData): void {
  window.localStorage.setItem(storageKey, JSON.stringify(data));
}

export function managementId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function findUnregisteredConditionCodes(
  values: string[],
  registered: ManagementCondition[],
): string[] {
  const registeredCodes = new Set(registered.map((condition) => condition.code.trim()));
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .filter((code) => !registeredCodes.has(code));
}

export function addressSimilarity(left: string, right: string): number {
  const leftTokens = addressTokens(left);
  const rightTokens = addressTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  if ([...leftTokens].join(' ') === [...rightTokens].join(' ')) return 1;
  return jaccard(leftTokens, rightTokens);
}

function addressTokens(address: string): Set<string> {
  return new Set(normalizeAddress(address).match(/[가-힣a-z]+|\d+(?:-\d+)?/g) ?? []);
}

function normalizeAddress(address: string): string {
  // ponytail: this is a duplicate suggestion only; manual linking remains authoritative until an address service exists.
  return address.normalize('NFKC').toLowerCase()
    .replace(/서울특별시/g, '서울')
    .replace(/부산광역시/g, '부산')
    .replace(/대구광역시/g, '대구')
    .replace(/인천광역시/g, '인천')
    .replace(/광주광역시/g, '광주')
    .replace(/대전광역시/g, '대전')
    .replace(/울산광역시/g, '울산')
    .replace(/세종특별자치시/g, '세종')
    .replace(/[^가-힣a-z0-9-]+/g, ' ')
    .trim();
}

function jaccard(left: Set<string>, right: Set<string>): number {
  const union = new Set([...left, ...right]);
  const intersection = [...left].filter((token) => right.has(token));
  return union.size ? intersection.length / union.size : 0;
}
