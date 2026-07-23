import { requestLegacyJson } from '../api/client';
import { apiConfig } from '../api/config';
import { loadDemoAdminSettings, saveDemoAdminSettings } from '../demo/settings-storage';

export type AdminSettings = {
  loadingStartTime: string;
  plannedDepartureTime: string;
  temperatureLimit: number;
  etaDelayMinutes: number;
  gpsSilenceSeconds: number;
  dwellMinutes: number;
  showTemperatureAlerts: boolean;
  forwardDelayAlerts: boolean;
  recordMissingProof: boolean;
};

export type OperationalSettings = AdminSettings;

export const defaultAdminSettings: AdminSettings = {
  loadingStartTime: '07:30',
  plannedDepartureTime: '08:30',
  temperatureLimit: 8,
  etaDelayMinutes: 10,
  gpsSilenceSeconds: 30,
  dwellMinutes: 5,
  showTemperatureAlerts: true,
  forwardDelayAlerts: true,
  recordMissingProof: true,
};

export function loadAdminSettings(): AdminSettings {
  if (apiConfig.mode !== 'mock') throw new Error('로컬 설정은 mock 모드에서만 불러올 수 있습니다.');
  return loadDemoAdminSettings(defaultAdminSettings);
}

export function saveAdminSettings(settings: AdminSettings): void {
  if (apiConfig.mode !== 'mock') throw new Error('로컬 설정은 mock 모드에서만 저장할 수 있습니다.');
  saveDemoAdminSettings(settings);
}

export async function loadRemoteOperationalSettings(): Promise<OperationalSettings> {
  if (apiConfig.mode === 'mock') throw new Error('원격 설정은 remote 모드에서만 불러올 수 있습니다.');
  const settings = await requestLegacyJson<unknown>('settings/operations');
  return operationalSettingsFrom(settings);
}

export async function saveRemoteOperationalSettings(
  settings: Partial<OperationalSettings>,
): Promise<void> {
  if (apiConfig.mode === 'mock') throw new Error('원격 설정은 remote 모드에서만 저장할 수 있습니다.');
  const payload = operationalSettingsPatchFrom(settings);
  const saved = await requestLegacyJson<unknown>('settings/operations', {
    method: 'PATCH',
    json: payload,
  });
  operationalSettingsFrom(saved);
}

function operationalSettingsFrom(value: unknown): OperationalSettings {
  if (!value || typeof value !== 'object') {
    throw new Error('원격 설정 응답 형식이 올바르지 않습니다.');
  }
  const loadingStartTime = Reflect.get(value, 'loadingStartTime');
  const plannedDepartureTime = Reflect.get(value, 'plannedDepartureTime');
  const temperatureLimit = Reflect.get(value, 'temperatureLimit');
  const etaDelayMinutes = Reflect.get(value, 'etaDelayMinutes');
  const gpsSilenceSeconds = Reflect.get(value, 'gpsSilenceSeconds');
  const dwellMinutes = Reflect.get(value, 'dwellMinutes');
  const showTemperatureAlerts = Reflect.get(value, 'showTemperatureAlerts');
  const forwardDelayAlerts = Reflect.get(value, 'forwardDelayAlerts');
  const recordMissingProof = Reflect.get(value, 'recordMissingProof');
  if (
    !validTime(loadingStartTime) ||
    !validTime(plannedDepartureTime) ||
    !validNumber(temperatureLimit, -50, 50) ||
    !validInteger(etaDelayMinutes, 1, 240) ||
    !validInteger(gpsSilenceSeconds, 5, 3600) ||
    !validInteger(dwellMinutes, 0, 240) ||
    typeof showTemperatureAlerts !== 'boolean' ||
    typeof forwardDelayAlerts !== 'boolean' ||
    typeof recordMissingProof !== 'boolean'
  ) {
    throw new Error('원격 설정 응답 형식이 올바르지 않습니다.');
  }
  return {
    loadingStartTime,
    plannedDepartureTime,
    temperatureLimit,
    etaDelayMinutes,
    gpsSilenceSeconds,
    dwellMinutes,
    showTemperatureAlerts,
    forwardDelayAlerts,
    recordMissingProof,
  };
}

function operationalSettingsPatchFrom(
  settings: Partial<OperationalSettings>,
): Partial<OperationalSettings> {
  const entries = Object.entries(settings);
  if (entries.length === 0) throw new Error('저장할 설정 값이 없습니다.');
  const allowed = new Set<keyof OperationalSettings>([
    'loadingStartTime',
    'plannedDepartureTime',
    'temperatureLimit',
    'etaDelayMinutes',
    'gpsSilenceSeconds',
    'dwellMinutes',
    'showTemperatureAlerts',
    'forwardDelayAlerts',
    'recordMissingProof',
  ]);
  if (entries.some(([key]) => !allowed.has(key as keyof OperationalSettings))) {
    throw new Error('저장할 설정 값의 형식이 올바르지 않습니다.');
  }
  if (
    (settings.loadingStartTime !== undefined && !validTime(settings.loadingStartTime)) ||
    (settings.plannedDepartureTime !== undefined && !validTime(settings.plannedDepartureTime)) ||
    (settings.temperatureLimit !== undefined && !validNumber(settings.temperatureLimit, -50, 50)) ||
    (settings.etaDelayMinutes !== undefined && !validInteger(settings.etaDelayMinutes, 1, 240)) ||
    (settings.gpsSilenceSeconds !== undefined && !validInteger(settings.gpsSilenceSeconds, 5, 3600)) ||
    (settings.dwellMinutes !== undefined && !validInteger(settings.dwellMinutes, 0, 240)) ||
    (settings.showTemperatureAlerts !== undefined && typeof settings.showTemperatureAlerts !== 'boolean') ||
    (settings.forwardDelayAlerts !== undefined && typeof settings.forwardDelayAlerts !== 'boolean') ||
    (settings.recordMissingProof !== undefined && typeof settings.recordMissingProof !== 'boolean')
  ) {
    throw new Error('저장할 설정 값의 형식이 올바르지 않습니다.');
  }
  return settings;
}

function validTime(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value);
}

function validInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function validNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
