import { requestLegacyJson } from '../api/client';
import { apiConfig } from '../api/config';
import { saveLastDispatchImport } from '../demo/dispatch-import-storage';
import { loadManagementData, managementId, saveManagementData } from '../dev-db/management';

export type DispatchImportRow = {
  address: string;
  conditionCode: string;
  customerCode: string;
  destinationName: string;
  driverName: string;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  rowNumber: number;
  sellerOrderKey: string;
  shippedBoxes: number;
  vehiclePlate: string;
};

export type DispatchImportInput = {
  fileName: string;
  planDate: string;
  rows: DispatchImportRow[];
};

export type DispatchImportIssue = {
  code: string;
  field: keyof DispatchImportRow | 'row';
  message: string;
  severity: 'error' | 'review';
};

export type DispatchImportPreviewRow = DispatchImportRow & {
  driverId: string | null;
  issues: DispatchImportIssue[];
  status: 'READY' | 'NEEDS_REVIEW';
  vehicleId: string | null;
};

export type DispatchImportPreview = {
  canCommit: boolean;
  conditionCandidates: string[];
  fileName: string;
  planDate: string;
  rows: DispatchImportPreviewRow[];
  summary: { errorRows: number; readyRows: number; reviewRows: number; totalRows: number };
};

export type DispatchImportView = {
  createdAt: string;
  fileName: string;
  id: string;
  planDate: string;
  rowCount: number;
  rows: DispatchImportPreviewRow[];
  status: 'READY' | 'NEEDS_REVIEW';
};

const requiredHeaders = ['driver', 'vehicle', '배송처', 'condition', 'shippedbox', '주소', 'customer', 'SellerOrderKey'] as const;

export function parseDispatchCsv(source: string): DispatchImportRow[] {
  const table = parseCsvTable(source.replace(/^\uFEFF/u, ''));
  const header = table[0]?.map((cell) => cell.trim()) ?? [];
  const index = new Map(header.map((name, column) => [name, column]));
  const missing = requiredHeaders.filter((name) => !index.has(name));
  if (missing.length > 0) throw new Error(`필수 열이 없습니다: ${missing.join(', ')}`);
  const rows = table.slice(1).filter((cells) => cells.some((cell) => cell.trim() !== ''));
  if (rows.length === 0) throw new Error('업로드할 배차 행이 없습니다.');
  if (rows.length > 500) throw new Error('한 번에 최대 500행까지 업로드할 수 있습니다.');
  return rows.map((cells, rowIndex) => {
    const shippedBoxes = numberCell(cells, index, 'shippedbox');
    const latitude = optionalNumberCell(cells, index, 'latitude');
    const longitude = optionalNumberCell(cells, index, 'longitude');
    return {
      address: textCell(cells, index, '주소'),
      conditionCode: textCell(cells, index, 'condition'),
      customerCode: textCell(cells, index, 'customer'),
      destinationName: textCell(cells, index, '배송처'),
      driverName: textCell(cells, index, 'driver'),
      latitude,
      longitude,
      notes: optionalTextCell(cells, index, '특이사항'),
      rowNumber: rowIndex + 2,
      sellerOrderKey: textCell(cells, index, 'SellerOrderKey'),
      shippedBoxes,
      vehiclePlate: textCell(cells, index, 'vehicle'),
    };
  });
}

export async function previewDispatchImport(input: DispatchImportInput): Promise<DispatchImportPreview> {
  if (apiConfig.mode === 'remote') {
    const preview = await requestLegacyJson<unknown>('dispatch-imports/preview', { json: input, method: 'POST' });
    return adaptRemotePreview(preview);
  }
  return previewLocally(input);
}

export async function commitDispatchImport(input: DispatchImportInput): Promise<DispatchImportView> {
  if (apiConfig.mode === 'remote') {
    const response = await requestLegacyJson<{ dispatchImport: DispatchImportView }>('dispatch-imports', { json: input, method: 'POST' });
    return response.dispatchImport;
  }
  const preview = previewLocally(input);
  if (!preview.canCommit) throw new Error('사전 검사 오류를 먼저 수정해야 합니다.');
  const result: DispatchImportView = {
    createdAt: new Date().toISOString(),
    fileName: input.fileName,
    id: `mock-${crypto.randomUUID()}`,
    planDate: input.planDate,
    rowCount: input.rows.length,
    rows: preview.rows,
    status: preview.rows.some((row) => row.status === 'NEEDS_REVIEW') ? 'NEEDS_REVIEW' : 'READY',
  };
  saveLastDispatchImport(result);
  return result;
}

export async function registerTransportCondition(input: { code: string; description: string; name: string }): Promise<void> {
  if (apiConfig.mode === 'remote') {
    await requestLegacyJson<{ condition: unknown }>('conditions', { json: input, method: 'POST' });
    return;
  }
  persistMockTransportCondition(input);
}

function persistMockTransportCondition(input: { code: string; description: string; name: string }): void {
  const management = loadManagementData();
  if (management.conditions.some((condition) => condition.code === input.code)) return;
  saveManagementData({
    ...management,
    conditions: [...management.conditions, {
      id: managementId('condition'),
      code: input.code,
      description: input.description,
      name: input.name,
      proof: '',
      temperature: '',
      vehicle: '',
    }],
  });
}

function adaptRemotePreview(value: unknown): DispatchImportPreview {
  if (!isObject(value) || !Array.isArray(value.conditionCandidates)) throw invalidRemoteConditionCandidates();
  return {
    ...value,
    conditionCandidates: value.conditionCandidates.map(remoteConditionRawValue),
  } as DispatchImportPreview;
}

function remoteConditionRawValue(value: unknown): string {
  if (
    !hasOnlyKeys(value, ['comparisonKey', 'rawValue', 'rowNumbers'])
    || typeof value.comparisonKey !== 'string'
    || value.comparisonKey.trim() === ''
    || typeof value.rawValue !== 'string'
    || value.rawValue.trim() === ''
    || !Array.isArray(value.rowNumbers)
    || value.rowNumbers.length === 0
    || !value.rowNumbers.every((rowNumber) => Number.isInteger(rowNumber) && rowNumber > 0)
  ) throw invalidRemoteConditionCandidates();
  return value.rawValue;
}

function invalidRemoteConditionCandidates(): Error {
  return new Error('배차 사전 검사 conditionCandidates 응답 계약이 올바르지 않습니다.');
}

function previewLocally(input: DispatchImportInput): DispatchImportPreview {
  const management = loadManagementData();
  const registeredConditions = new Set(management.conditions.map((condition) => condition.code));
  const conditionCandidates = unique(input.rows.map((row) => row.conditionCode)).filter((code) => !registeredConditions.has(code));
  const duplicateOrders = duplicateValues(input.rows.map((row) => row.sellerOrderKey));
  const driverConflicts = conflictingMappings(input.rows, (row) => row.driverName, (row) => row.vehiclePlate);
  const vehicleConflicts = conflictingMappings(input.rows, (row) => row.vehiclePlate, (row) => row.driverName);
  const rows = input.rows.map((row): DispatchImportPreviewRow => {
    const issues: DispatchImportIssue[] = [];
    const drivers = management.drivers.filter((driver) => driver.name === row.driverName);
    const vehicles = management.vehicles.filter((vehicle) => vehicle.plate === row.vehiclePlate);
    for (const [field, value] of [
      ['driverName', row.driverName], ['vehiclePlate', row.vehiclePlate], ['destinationName', row.destinationName],
      ['conditionCode', row.conditionCode], ['address', row.address], ['customerCode', row.customerCode],
      ['sellerOrderKey', row.sellerOrderKey],
    ] as const) if (!value) issues.push(errorIssue('REQUIRED', field, '필수 값입니다.'));
    if (!Number.isInteger(row.shippedBoxes) || row.shippedBoxes <= 0) issues.push(errorIssue('SHIPPED_BOXES_INVALID', 'shippedBoxes', '박스 수량은 1 이상의 정수여야 합니다.'));
    if (drivers.length === 0) issues.push(errorIssue('DRIVER_NOT_FOUND', 'driverName', '등록된 배송원을 찾을 수 없습니다.'));
    if (drivers.length > 1) issues.push(errorIssue('DRIVER_AMBIGUOUS', 'driverName', '같은 이름의 배송원이 둘 이상입니다.'));
    if (vehicles.length === 0) issues.push(errorIssue('VEHICLE_NOT_FOUND', 'vehiclePlate', '등록된 차량 번호를 찾을 수 없습니다.'));
    if (duplicateOrders.has(row.sellerOrderKey)) issues.push(errorIssue('SELLER_ORDER_DUPLICATED', 'sellerOrderKey', '파일 안에서 SellerOrderKey가 중복됩니다.'));
    if (driverConflicts.has(row.driverName)) issues.push(errorIssue('DRIVER_VEHICLE_CONFLICT', 'vehiclePlate', '한 배송원에게 여러 차량이 지정되었습니다.'));
    if (vehicleConflicts.has(row.vehiclePlate)) issues.push(errorIssue('VEHICLE_DRIVER_CONFLICT', 'driverName', '한 차량에 여러 배송원이 지정되었습니다.'));
    if (!registeredConditions.has(row.conditionCode)) issues.push(errorIssue('CONDITION_UNREGISTERED', 'conditionCode', '운송조건을 먼저 등록해야 합니다.'));
    if (row.latitude === null && row.longitude === null) issues.push({ code: 'LOCATION_NOT_RESOLVED', field: 'row', message: '주소 좌표 확인이 필요합니다.', severity: 'review' });
    if ((row.latitude === null) !== (row.longitude === null)) issues.push(errorIssue('LOCATION_INCOMPLETE', 'row', '위도와 경도는 함께 입력해야 합니다.'));
    return {
      ...row,
      driverId: drivers.length === 1 ? drivers[0]?.id ?? null : null,
      issues,
      status: issues.length === 0 ? 'READY' : 'NEEDS_REVIEW',
      vehicleId: vehicles.length === 1 ? vehicles[0]?.id ?? null : null,
    };
  });
  const errorRows = rows.filter((row) => row.issues.some((issue) => issue.severity === 'error')).length;
  const reviewRows = rows.filter((row) => row.issues.length > 0 && row.issues.every((issue) => issue.severity === 'review')).length;
  return {
    canCommit: errorRows === 0,
    conditionCandidates,
    fileName: input.fileName,
    planDate: input.planDate,
    rows,
    summary: { errorRows, readyRows: rows.length - errorRows - reviewRows, reviewRows, totalRows: rows.length },
  };
}

function parseCsvTable(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"' && cell === '') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/u, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('CSV 따옴표가 닫히지 않았습니다.');
  if (cell !== '' || row.length > 0) {
    row.push(cell.replace(/\r$/u, ''));
    rows.push(row);
  }
  return rows;
}

function textCell(cells: string[], index: Map<string, number>, name: string): string {
  const column = index.get(name);
  return (column === undefined ? '' : cells[column] ?? '').trim().normalize('NFKC');
}

function optionalTextCell(cells: string[], index: Map<string, number>, name: string): string | null {
  return textCell(cells, index, name) || null;
}

function numberCell(cells: string[], index: Map<string, number>, name: string): number {
  const raw = textCell(cells, index, name);
  const value = Number(raw);
  if (raw === '' || !Number.isFinite(value)) throw new Error(`${name} 열은 숫자여야 합니다.`);
  return value;
}

function optionalNumberCell(cells: string[], index: Map<string, number>, name: string): number | null {
  const raw = textCell(cells, index, name);
  if (raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} 열은 숫자여야 합니다.`);
  return value;
}

function errorIssue(code: string, field: DispatchImportIssue['field'], message: string): DispatchImportIssue {
  return { code, field, message, severity: 'error' };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function duplicateValues(values: string[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return duplicates;
}

function conflictingMappings<T>(rows: T[], key: (row: T) => string, value: (row: T) => string): Set<string> {
  const mappings = new Map<string, Set<string>>();
  for (const row of rows) {
    const current = mappings.get(key(row)) ?? new Set<string>();
    current.add(value(row));
    mappings.set(key(row), current);
  }
  return new Set([...mappings].filter(([, values]) => values.size > 1).map(([entry]) => entry));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).every((key) => keys.includes(key));
}
