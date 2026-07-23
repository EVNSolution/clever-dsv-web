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

export type OperationalSettings = Pick<AdminSettings, 'loadingStartTime' | 'plannedDepartureTime'>;

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
  settings: OperationalSettings,
): Promise<void> {
  if (apiConfig.mode === 'mock') throw new Error('원격 설정은 remote 모드에서만 저장할 수 있습니다.');
  const payload = operationalSettingsFrom(settings);
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
  if ((loadingStartTime !== null && !validTime(loadingStartTime)) || (plannedDepartureTime !== null && !validTime(plannedDepartureTime))) {
    throw new Error('원격 설정 응답 형식이 올바르지 않습니다.');
  }
  return {
    loadingStartTime: loadingStartTime ?? defaultAdminSettings.loadingStartTime,
    plannedDepartureTime: plannedDepartureTime ?? defaultAdminSettings.plannedDepartureTime,
  };
}

function validTime(value: unknown, allowEmpty = false): value is string {
  return typeof value === 'string' && ((allowEmpty && value === '') || /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value));
}
