import { requestLegacyJson } from '../api/client';
import { apiConfig } from '../api/config';
import { saveLastDispatchImport } from '../demo/dispatch-import-storage';
import { loadManagementData, managementId, saveManagementData } from '../dev-db/management';

export type DispatchImportRow = {
  address: string;
  addressResolutionStatus?: 'ADDRESS_ONLY' | 'AMBIGUOUS' | 'NOT_FOUND' | 'RESOLVED' | 'UNAVAILABLE';
  addressSuggestions?: DispatchAddressSuggestion[];
  conditionCode: string;
  customerCode: string;
  detailAddress?: string | null;
  destinationName: string;
  driverName: string;
  jibunAddress?: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  postalCode?: string | null;
  rawAddress?: string;
  rowNumber: number;
  sellerOrderKey: string;
  shippedBoxes: number;
  vehiclePlate: string;
};

export type DispatchAddressSuggestion = {
  address: string;
  detailAddress: string | null;
  jibunAddress: string | null;
  latitude: number;
  longitude: number;
  providerPlaceId: string | null;
  recommended: boolean;
  score: number;
  title: string;
};

export type DispatchImportInput = {
  fileName: string;
  planDate: string;
  rows: DispatchImportRow[];
};

export type DispatchFileParseResult = {
  error: string;
  planDate: string | null;
  rows: DispatchImportRow[];
  sheet: {
    cells: string[][];
    name: string;
  };
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
  normalized?: Omit<DispatchImportRow, 'conditionCode' | 'rowNumber'> & {
    conditionComparisonKey: string;
    planDate: string;
    sourceKind: string;
  };
  status: 'READY' | 'NEEDS_REVIEW';
  vehicleId: string | null;
};

export type DispatchImportPreview = {
  canCommit: boolean;
  conditionCandidates: string[];
  fileName: string;
  planDate: string;
  rows: DispatchImportPreviewRow[];
  summary: {
    errorRows: number;
    readyRows: number;
    reviewRows: number;
    totalRows: number;
    updateCandidateRows?: number;
  };
};

export type DispatchImportView = {
  createdAt: string;
  fileName: string;
  id: string;
  planDate: string;
  rowCount: number;
  rows: DispatchImportPreviewRow[];
  sourceHash?: string;
  status: 'APPLIED' | 'APPLYING' | 'FAILED' | 'NEEDS_REVIEW' | 'READY' | 'STAGED';
};

type XlsxModule = typeof import('xlsx');

const requiredHeaders = ['배송처', 'condition', 'shippedbox', '주소', 'customer', 'SellerOrderKey'] as const;
const planDateHeaders = ['배차일', '배차일자', '배송일', '배송일자'] as const;
let xlsxModulePromise: Promise<XlsxModule> | null = null;

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

export function parseDispatchSource(source: string, sheetName = 'CSV', fileName = ''): DispatchFileParseResult {
  const normalizedSource = source.replace(/^\uFEFF/u, '');
  const cells = parseCsvTable(normalizedSource).filter((row) => row.some((cell) => cell.trim() !== ''));
  let planDate = inferPlanDateFromFileName(fileName);
  try {
    planDate = inferPlanDate(cells, fileName);
  } catch (error) {
    return {
      error: parseErrorMessage(error),
      planDate,
      rows: [],
      sheet: { cells, name: sheetName },
    };
  }
  try {
    return { error: '', planDate, rows: parseDispatchCsv(normalizedSource), sheet: { cells, name: sheetName } };
  } catch (error) {
    return { error: parseErrorMessage(error), planDate, rows: [], sheet: { cells, name: sheetName } };
  }
}

export function parseDispatchSheet(cells: string[][], sheetName = 'CSV', fileName = ''): DispatchFileParseResult {
  return parseDispatchSource(cells.map((row) => row.map(csvCell).join(',')).join('\n'), sheetName, fileName);
}

export async function parseDispatchFile(file: File): Promise<DispatchFileParseResult> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv') return parseDispatchSource(await file.text(), 'CSV', file.name);
  if (extension === 'xlsx') {
    const XLSX = await loadXlsxModule();
    const workbook = XLSX.read(await file.arrayBuffer());
    const firstSheetName = workbook.SheetNames[0];
    if (firstSheetName === undefined) throw new Error('XLSX 파일에 시트가 없습니다.');
    const firstSheet = workbook.Sheets[firstSheetName];
    if (firstSheet === undefined) throw new Error('XLSX 첫 번째 시트를 읽을 수 없습니다.');
    const cells = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
      dateNF: 'yyyy-mm-dd',
      defval: '',
      header: 1,
      raw: false,
    }).map((row) => row.map((cell) => String(cell ?? '')));
    return parseDispatchSheet(cells, firstSheetName, file.name);
  }
  throw new Error('CSV 또는 XLSX 파일만 업로드할 수 있습니다.');
}

export function preloadDispatchFileParser(): void {
  void loadXlsxModule().catch(() => undefined);
}

function loadXlsxModule(): Promise<XlsxModule> {
  xlsxModulePromise ??= import('xlsx').catch((error: unknown) => {
    xlsxModulePromise = null;
    throw error;
  });
  return xlsxModulePromise;
}

function inferPlanDate(cells: string[][], fileName: string): string | null {
  const header = cells[0]?.map((cell) => cell.trim()) ?? [];
  const dateColumn = header.findIndex((name) => planDateHeaders.some((candidate) => candidate === name));
  if (dateColumn < 0) return inferPlanDateFromFileName(fileName);
  const values = cells.slice(1)
    .map((row) => row[dateColumn]?.trim() ?? '')
    .filter((value) => value !== '');
  if (values.length === 0) return inferPlanDateFromFileName(fileName);
  const dates = new Set(values.map((value) => normalizePlanDate(value)));
  if (dates.has(null)) throw new Error('배차일 형식을 확인하세요. YYYY-MM-DD 형식으로 입력해야 합니다.');
  const uniqueDates = [...dates].filter((date): date is string => date !== null);
  if (uniqueDates.length > 1) throw new Error(`배차일 값이 여러 날짜로 섞여 있습니다: ${uniqueDates.join(', ')}`);
  return uniqueDates[0] ?? inferPlanDateFromFileName(fileName);
}

function inferPlanDateFromFileName(fileName: string): string | null {
  const baseName = fileName.replace(/\.[^.]+$/u, '');
  const candidates = [...baseName.matchAll(/(?:^|[^0-9])((?:19|20)\d{6}|\d{6})(?=$|[^0-9])/gu)];
  for (const candidate of candidates.reverse()) {
    const normalized = normalizePlanDate(candidate[1] ?? '');
    if (normalized !== null) return normalized;
  }
  return null;
}

function normalizePlanDate(value: string): string | null {
  const normalized = value.trim()
    .replace(/[년/.]/gu, '-')
    .replace(/월/gu, '-')
    .replace(/일/gu, '')
    .replace(/\s+/gu, '')
    .replace(/-+$/gu, '');
  let year: number;
  let month: number;
  let day: number;
  if (/^\d{8}$/u.test(normalized)) {
    year = Number(normalized.slice(0, 4));
    month = Number(normalized.slice(4, 6));
    day = Number(normalized.slice(6, 8));
  } else if (/^\d{6}$/u.test(normalized)) {
    year = 2000 + Number(normalized.slice(0, 2));
    month = Number(normalized.slice(2, 4));
    day = Number(normalized.slice(4, 6));
  } else {
    const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/u);
    if (match === null) return null;
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '배차 파일을 해석할 수 없습니다.';
}

function csvCell(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
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
    const dispatchImport = response.dispatchImport;
    if (dispatchImport.sourceHash === undefined || dispatchImport.sourceHash === '') {
      throw new Error('배차 업로드 적용에 필요한 sourceHash가 없습니다.');
    }
    const commandId = crypto.randomUUID();
    await requestLegacyJson<{ applyResult: { status: 'APPLIED' } }>(
      `dispatch-imports/${encodeURIComponent(dispatchImport.id)}/apply`,
      {
        headers: { 'Idempotency-Key': commandId },
        json: {
          commandId,
          expectedSourceHash: dispatchImport.sourceHash,
        },
        method: 'POST',
      },
    );
    return { ...dispatchImport, status: 'APPLIED' };
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
    status: preview.rows.some((row) => row.status === 'NEEDS_REVIEW') ? 'NEEDS_REVIEW' : 'APPLIED',
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

export async function registerDispatchDriver(name: string): Promise<void> {
  const normalizedName = name.trim();
  if (normalizedName === '') throw new Error('배송원 이름을 입력하세요.');
  if (apiConfig.mode === 'remote') {
    await requestLegacyJson<{ driver: unknown }>('drivers', {
      json: {
        age: 18,
        career: '미제공',
        gender: '미제공',
        name: normalizedName,
        score: '미제공',
        traits: [],
        zone: '미제공',
      },
      method: 'POST',
    });
    return;
  }
  const management = loadManagementData();
  if (management.drivers.some((driver) => driver.name === normalizedName)) return;
  saveManagementData({
    ...management,
    drivers: [...management.drivers, {
      age: 18,
      career: '미제공',
      gender: '미제공',
      id: managementId('driver'),
      name: normalizedName,
      score: '미제공',
      traits: [],
      zone: '미제공',
    }],
  });
}

export async function registerDispatchVehicle(plate: string): Promise<void> {
  const normalizedPlate = plate.trim();
  if (normalizedPlate === '') throw new Error('차량 번호를 입력하세요.');
  if (apiConfig.mode === 'remote') {
    await requestLegacyJson<{ vehicle: unknown }>('vehicles', {
      json: { note: '', plate: normalizedPlate, type: '미지정' },
      method: 'POST',
    });
    return;
  }
  const management = loadManagementData();
  if (management.vehicles.some((vehicle) => vehicle.plate === normalizedPlate)) return;
  saveManagementData({
    ...management,
    vehicles: [...management.vehicles, {
      id: managementId('vehicle'),
      note: '',
      plate: normalizedPlate,
      type: '미지정',
    }],
  });
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
      temperatureAlertEnabled: false,
      temperatureMaxC: null,
      temperatureMinC: null,
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
  const assignedResourceRows = input.rows.filter((row) => row.driverName !== '' && row.vehiclePlate !== '');
  const driverConflicts = conflictingMappings(assignedResourceRows, (row) => row.driverName, (row) => row.vehiclePlate);
  const vehicleConflicts = conflictingMappings(assignedResourceRows, (row) => row.vehiclePlate, (row) => row.driverName);
  const rows = input.rows.map((row): DispatchImportPreviewRow => {
    const issues: DispatchImportIssue[] = [];
    const hasDriverName = row.driverName !== '';
    const hasVehiclePlate = row.vehiclePlate !== '';
    const drivers = hasDriverName ? management.drivers.filter((driver) => driver.name === row.driverName) : [];
    const vehicles = hasDriverName && hasVehiclePlate
      ? management.vehicles.filter((vehicle) => vehicle.plate === row.vehiclePlate)
      : [];
    const assignedVehicleId = drivers.length === 1 && !hasVehiclePlate
      ? management.assignments.find((assignment) => assignment.driverId === drivers[0]?.id)?.vehicleId ?? null
      : vehicles.length === 1 ? vehicles[0]?.id ?? null : null;
    for (const [field, value] of [
      ['destinationName', row.destinationName],
      ['conditionCode', row.conditionCode], ['address', row.address], ['customerCode', row.customerCode],
      ['sellerOrderKey', row.sellerOrderKey],
    ] as const) if (!value) issues.push(errorIssue('REQUIRED', field, '필수 값입니다.'));
    if (!Number.isInteger(row.shippedBoxes) || row.shippedBoxes < 0) {
      issues.push(errorIssue('SHIPPED_BOXES_INVALID', 'shippedBoxes', '박스 수량은 0 이상의 정수여야 합니다.'));
    } else if (row.shippedBoxes === 0) {
      issues.push({
        code: 'SHIPPED_BOXES_ZERO',
        field: 'shippedBoxes',
        message: '같은 배송지의 다른 주문에 박스를 합산한 경우인지 확인하세요. 0박스로 업로드할 수 있습니다.',
        severity: 'review',
      });
    }
    if (hasDriverName && drivers.length === 0) issues.push(errorIssue('DRIVER_NOT_FOUND', 'driverName', '등록된 배송원을 찾을 수 없습니다.'));
    if (drivers.length > 1) issues.push(errorIssue('DRIVER_AMBIGUOUS', 'driverName', '같은 이름의 배송원이 둘 이상입니다.'));
    if (hasDriverName && hasVehiclePlate && vehicles.length === 0) issues.push(errorIssue('VEHICLE_NOT_FOUND', 'vehiclePlate', '등록된 차량 번호를 찾을 수 없습니다.'));
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
      vehicleId: assignedVehicleId,
    };
  });
  const errorRows = rows.filter((row) => row.issues.some((issue) => issue.severity === 'error')).length;
  const reviewRows = rows.filter((row) => row.issues.some((issue) => issue.severity === 'review')).length;
  return {
    canCommit: errorRows === 0,
    conditionCandidates,
    fileName: input.fileName,
    planDate: input.planDate,
    rows,
    summary: { errorRows, readyRows: rows.length - errorRows, reviewRows, totalRows: rows.length },
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
