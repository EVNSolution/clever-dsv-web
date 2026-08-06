import { ApiError, requestV1ReadJson } from '../api/client';

export type ControlSummary = {
  assignedCount: number;
  failedEtaCount: number;
  pendingEtaCount: number;
  readyEtaCount: number;
  serviceDate: string;
  totalDispatchCount: number;
  unassignedCount: number;
};

export type VehicleTemperatureSample = {
  observedAt: string;
  temperatureA: number | null;
  temperatureB: number | null;
};

export type VehicleTemperatureHistory = {
  samples: VehicleTemperatureSample[];
  vehicleId: string;
};

export type VehicleGpsTrailSample = {
  distanceTodayKm: number | null;
  ignitionOn: boolean | null;
  latitude: number;
  longitude: number;
  observedAt: string;
  speedKph: number | null;
};

export type VehicleGpsTrailHistory = {
  serviceDate: string;
  sessions: Array<{
    completedAt: string | null;
    completionEventId: string | null;
    endpoint: {
      endedAt: string | null;
      reason: 'DEPOT_RETURNED' | 'LAST_VALID_SAMPLE' | 'NO_SAMPLES' | 'RESTARTED' | 'ROUTE_COMPLETED' | 'ROUTE_PAUSED';
    };
    restart: { restartedAt: string; restartEventId: string | null } | null;
    routePlanId: string;
    segments: Array<{ samples: VehicleGpsTrailSample[] }>;
    sessionIndex: number;
    startedAt: string;
    startEventId: string | null;
    startSource: 'PLANNED_DEPARTURE' | 'ROUTE_STARTED';
  }>;
  timezone: string;
  vehicleId: string;
};

const controlSummaryFields: Array<keyof ControlSummary> = [
  'serviceDate',
  'totalDispatchCount',
  'assignedCount',
  'unassignedCount',
  'pendingEtaCount',
  'failedEtaCount',
  'readyEtaCount',
];

export async function loadControlSummary(serviceDate?: string, signal?: AbortSignal): Promise<ControlSummary> {
  const query = new URLSearchParams();
  if (serviceDate !== undefined) query.set('serviceDate', serviceDate);
  const suffix = query.size === 0 ? '' : `?${query.toString()}`;
  return adaptControlSummary(await requestV1ReadJson<unknown>(`control${suffix}`, { signal }));
}

export async function loadVehicleTemperatureHistory(vehicleId: string, signal?: AbortSignal): Promise<VehicleTemperatureHistory> {
  return adaptVehicleTemperatureHistory(await requestV1ReadJson<unknown>(`vehicles/${encodeURIComponent(vehicleId)}/temperature-history`, { signal }));
}

export async function loadVehicleGpsTrailHistory(
  vehicleId: string,
  serviceDate: string,
  signal?: AbortSignal,
): Promise<VehicleGpsTrailHistory> {
  const query = new URLSearchParams({ serviceDate });
  return adaptVehicleGpsTrailHistory(await requestV1ReadJson<unknown>(
    `vehicles/${encodeURIComponent(vehicleId)}/gps-trail-history?${query.toString()}`,
    { signal },
  ));
}

function adaptControlSummary(data: unknown): ControlSummary {
  if (!isObject(data)) throw invalidControlSummary(data);
  const keys = Object.keys(data);
  if (keys.length !== controlSummaryFields.length || !controlSummaryFields.every((field) => keys.includes(field))) throw invalidControlSummary(data);
  if (typeof data.serviceDate !== 'string' || data.serviceDate.trim() === '') throw invalidControlSummary(data);
  for (const field of controlSummaryFields) {
    if (field === 'serviceDate') continue;
    if (!isNonNegativeInteger(data[field])) throw invalidControlSummary(data);
  }
  return {
    serviceDate: data.serviceDate,
    totalDispatchCount: data.totalDispatchCount as number,
    assignedCount: data.assignedCount as number,
    unassignedCount: data.unassignedCount as number,
    pendingEtaCount: data.pendingEtaCount as number,
    failedEtaCount: data.failedEtaCount as number,
    readyEtaCount: data.readyEtaCount as number,
  };
}

function invalidControlSummary(body: unknown): ApiError {
  return new ApiError(502, '관제 요약 API 응답 형식이 올바르지 않습니다.', body);
}

function adaptVehicleTemperatureHistory(data: unknown): VehicleTemperatureHistory {
  if (!isObject(data) || !hasOnlyKeys(data, ['vehicleId', 'samples']) || typeof data.vehicleId !== 'string' || data.vehicleId.trim() === '' || !Array.isArray(data.samples)) {
    throw invalidVehicleTemperatureHistory(data);
  }
  return {
    vehicleId: data.vehicleId,
    samples: data.samples.map((sample) => {
      if (
        !isObject(sample)
        || !hasOnlyKeys(sample, ['observedAt', 'temperatureA', 'temperatureB'])
        || typeof sample.observedAt !== 'string'
        || Number.isNaN(Date.parse(sample.observedAt))
        || !isNullableFiniteNumber(sample.temperatureA)
        || !isNullableFiniteNumber(sample.temperatureB)
      ) {
        throw invalidVehicleTemperatureHistory(data);
      }
      return {
        observedAt: sample.observedAt,
        temperatureA: sample.temperatureA,
        temperatureB: sample.temperatureB,
      };
    }),
  };
}

function invalidVehicleTemperatureHistory(body: unknown): ApiError {
  return new ApiError(502, '차량 온도 이력 API 응답 형식이 올바르지 않습니다.', body);
}

function adaptVehicleGpsTrailHistory(data: unknown): VehicleGpsTrailHistory {
  if (
    !isObject(data)
    || !hasExactKeys(data, ['serviceDate', 'sessions', 'timezone', 'vehicleId'])
    || typeof data.serviceDate !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/u.test(data.serviceDate)
    || !Array.isArray(data.sessions)
    || typeof data.timezone !== 'string'
    || data.timezone.trim() === ''
    || typeof data.vehicleId !== 'string'
    || data.vehicleId.trim() === ''
  ) throw invalidVehicleGpsTrailHistory(data);

  const sessions = data.sessions.map((session) => {
    if (
      !isObject(session)
      || !hasExactKeys(session, [
        'completedAt', 'completionEventId', 'endpoint', 'restart', 'routePlanId', 'segments',
        'sessionIndex', 'startedAt', 'startEventId', 'startSource',
      ])
      || !isNullableDateTime(session.completedAt)
      || !isNullableString(session.completionEventId)
      || !isObject(session.endpoint)
      || !hasExactKeys(session.endpoint, ['endedAt', 'reason'])
      || !isNullableDateTime(session.endpoint.endedAt)
      || !isGpsTrailEndpointReason(session.endpoint.reason)
      || !isNullableGpsTrailRestart(session.restart)
      || typeof session.routePlanId !== 'string'
      || session.routePlanId.trim() === ''
      || !Array.isArray(session.segments)
      || !isNonNegativeInteger(session.sessionIndex)
      || !isDateTime(session.startedAt)
      || !isNullableString(session.startEventId)
      || (session.startSource !== 'PLANNED_DEPARTURE' && session.startSource !== 'ROUTE_STARTED')
    ) throw invalidVehicleGpsTrailHistory(data);
    return {
      completedAt: session.completedAt,
      completionEventId: session.completionEventId,
      endpoint: { endedAt: session.endpoint.endedAt, reason: session.endpoint.reason },
      restart: session.restart,
      routePlanId: session.routePlanId,
      segments: session.segments.map((segment) => {
        if (!isObject(segment) || !hasExactKeys(segment, ['samples']) || !Array.isArray(segment.samples)) {
          throw invalidVehicleGpsTrailHistory(data);
        }
        return { samples: segment.samples.map((sample) => adaptVehicleGpsTrailSample(sample, data)) };
      }),
      sessionIndex: session.sessionIndex,
      startedAt: session.startedAt,
      startEventId: session.startEventId,
      startSource: session.startSource as 'PLANNED_DEPARTURE' | 'ROUTE_STARTED',
    };
  });
  return { serviceDate: data.serviceDate, sessions, timezone: data.timezone, vehicleId: data.vehicleId };
}

function adaptVehicleGpsTrailSample(sample: unknown, body: unknown): VehicleGpsTrailSample {
  if (
    !isObject(sample)
    || !hasExactKeys(sample, ['distanceTodayKm', 'ignitionOn', 'latitude', 'longitude', 'observedAt', 'speedKph'])
    || !isNullableFiniteNumber(sample.distanceTodayKm)
    || (sample.ignitionOn !== null && typeof sample.ignitionOn !== 'boolean')
    || !isFiniteNumber(sample.latitude)
    || !isFiniteNumber(sample.longitude)
    || !isDateTime(sample.observedAt)
    || !isNullableFiniteNumber(sample.speedKph)
  ) throw invalidVehicleGpsTrailHistory(body);
  return {
    distanceTodayKm: sample.distanceTodayKm,
    ignitionOn: sample.ignitionOn,
    latitude: sample.latitude,
    longitude: sample.longitude,
    observedAt: sample.observedAt,
    speedKph: sample.speedKph,
  };
}

function invalidVehicleGpsTrailHistory(body: unknown): ApiError {
  return new ApiError(502, '차량 위치 이력 API 응답 형식이 올바르지 않습니다.', body);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).every((key) => keys.includes(key));
}

function hasExactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isDateTime(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
    && !Number.isNaN(Date.parse(value));
}

function isNullableDateTime(value: unknown): value is string | null {
  return value === null || isDateTime(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableGpsTrailRestart(value: unknown): value is VehicleGpsTrailHistory['sessions'][number]['restart'] {
  return value === null || (
    isObject(value)
    && hasExactKeys(value, ['restartedAt', 'restartEventId'])
    && isDateTime(value.restartedAt)
    && isNullableString(value.restartEventId)
  );
}

function isGpsTrailEndpointReason(value: unknown): value is VehicleGpsTrailHistory['sessions'][number]['endpoint']['reason'] {
  return value === 'DEPOT_RETURNED'
    || value === 'LAST_VALID_SAMPLE'
    || value === 'NO_SAMPLES'
    || value === 'RESTARTED'
    || value === 'ROUTE_COMPLETED'
    || value === 'ROUTE_PAUSED';
}
