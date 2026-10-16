/**
 * The service window the server computed for a vehicle trail: from its stay at the center to its last stop.
 * `endedAt` is null while a stop is not reached yet. The server never returns another source value.
 */
export type VehicleGpsServiceWindow = {
  endedAt: string | null;
  endSource: 'STOP_ARRIVED' | 'STOP_RESULT' | null;
  startedAt: string;
  startSource: 'CENTER_STAY';
};

const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const windowKeys = ['endedAt', 'endSource', 'startedAt', 'startSource'];

function isDateTime(value: unknown): value is string {
  return typeof value === 'string' && dateTimePattern.test(value) && !Number.isNaN(Date.parse(value));
}

/** Exactly the four keys, a UTC start, a UTC or null end, and only the source values the server documents. */
export function isVehicleGpsServiceWindow(value: unknown): value is VehicleGpsServiceWindow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== windowKeys.length || !windowKeys.every((key) => keys.includes(key))) return false;
  const window = value as Record<string, unknown>;
  return isDateTime(window.startedAt)
    && (window.endedAt === null || isDateTime(window.endedAt))
    && window.startSource === 'CENTER_STAY'
    && (window.endSource === null || window.endSource === 'STOP_ARRIVED' || window.endSource === 'STOP_RESULT');
}
