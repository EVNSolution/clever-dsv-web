import type { AdminSettings } from '../services/settings';

const settingsKey = 'clever.admin.settings';

export function loadDemoAdminSettings(defaultSettings: AdminSettings): AdminSettings {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(settingsKey) ?? 'null');
    if (!stored || typeof stored !== 'object') return defaultSettings;
    const merged = { ...defaultSettings, ...stored } as AdminSettings;
    return {
      ...merged,
      ...(validLocation(merged)
        ? {}
        : {
            departureAddress: defaultSettings.departureAddress,
            departureLatitude: defaultSettings.departureLatitude,
            departureLongitude: defaultSettings.departureLongitude,
          }),
      loadingStartTime: validTime(merged.loadingStartTime, true) ? merged.loadingStartTime : defaultSettings.loadingStartTime,
      plannedDepartureTime: validTime(merged.plannedDepartureTime) ? merged.plannedDepartureTime : defaultSettings.plannedDepartureTime,
    };
  } catch {
    return defaultSettings;
  }
}

export function saveDemoAdminSettings(settings: AdminSettings): void {
  window.localStorage.setItem(settingsKey, JSON.stringify(settings));
}

function validLocation(settings: AdminSettings): boolean {
  if (settings.departureAddress === '' && settings.departureLatitude === null && settings.departureLongitude === null) return true;
  return settings.departureAddress.trim() !== ''
    && validCoordinate(settings.departureLatitude, -90, 90)
    && validCoordinate(settings.departureLongitude, -180, 180);
}

function validCoordinate(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function validTime(value: unknown, allowEmpty = false): value is string {
  return typeof value === 'string' && ((allowEmpty && value === '') || /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value));
}
