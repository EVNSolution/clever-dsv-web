import { ApiError, requestV1ReadJson } from '../api/client';
import { isVehicleGpsServiceWindow, type VehicleGpsServiceWindow } from './control-service-window';

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

export type VehicleGpsTrailRoadMatchedGeometry = {
  anchors?: Array<{
    coordinateIndex: number;
    lineIndex: number;
    observedAt: string;
  }>;
  coordinates: Array<Array<[longitude: number, latitude: number]>>;
  type: 'MultiLineString';
};

export type VehicleGpsTrailMarker = {
  kind: 'RESTART' | 'START';
  latitude: number;
  longitude: number;
  observedAt: string;
};

export type VehicleGpsDailyRoute = {
  anchors: Array<{
    coordinateIndex: number;
    observedAt: string;
  }>;
  bridges: Array<{
    fromObservedAt: string;
    inferredTunnel?: {
      confirmedByObservedAt: string;
      coordinates: Array<[longitude: number, latitude: number]>;
      corridorId: string;
      fromObservedAt: string;
      source: 'CURATED_OSM_TUNNEL_CORRIDOR' | 'OSRM_TUNNEL_ROUTE';
      toObservedAt: string;
      type: 'LineString';
    };
    reason: 'GPS_GAP' | 'IMPLAUSIBLE_JUMP' | 'NO_MATCH';
    toObservedAt: string;
  }>;
  coordinates: Array<[longitude: number, latitude: number]>;
  sourceSampleCount: number;
  type: 'LineString';
};

export type VehicleGpsTrailHistory = {
  dailyRoute: VehicleGpsDailyRoute | null;
  serviceDate: string;
  /** An object: the server already cut the history to it. Null: no center arrival was found, so it is whole. Absent: the server did not send it. */
  serviceWindow?: VehicleGpsServiceWindow | null;
  sessions: Array<{
    completedAt: string | null;
    completionEventId: string | null;
    endpoint: {
      endedAt: string | null;
      reason: 'DEPOT_RETURNED' | 'LAST_VALID_SAMPLE' | 'NO_SAMPLES' | 'RESTARTED' | 'ROUTE_COMPLETED' | 'ROUTE_PAUSED';
    };
    restart: { restartedAt: string; restartEventId: string | null } | null;
    routePlanId: string;
    segments: Array<{
      roadMatchedGeometry?: VehicleGpsTrailRoadMatchedGeometry | null;
      samples: VehicleGpsTrailSample[];
      trailMarker?: VehicleGpsTrailMarker | null;
    }>;
    sessionIndex: number;
    startedAt: string;
    startEventId: string | null;
    startSource: 'DEPOT_ARRIVAL' | 'PLANNED_DEPARTURE' | 'ROUTE_STARTED';
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
  const query = new URLSearchParams({ serviceDate, includeDailyRoute: 'true', window: 'service' });
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

const gpsTrailHistoryKeys = ['dailyRoute', 'serviceDate', 'sessions', 'timezone', 'vehicleId'];

function adaptVehicleGpsTrailHistory(data: unknown): VehicleGpsTrailHistory {
  if (
    !isObject(data)
    || !hasOnlyKeys(data, [...gpsTrailHistoryKeys, 'serviceWindow'])
    || !gpsTrailHistoryKeys.every((key) => key in data)
    || (data.serviceWindow !== undefined && data.serviceWindow !== null && !isVehicleGpsServiceWindow(data.serviceWindow))
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
      || (session.startSource !== 'DEPOT_ARRIVAL' && session.startSource !== 'PLANNED_DEPARTURE' && session.startSource !== 'ROUTE_STARTED')
    ) throw invalidVehicleGpsTrailHistory(data);
    return {
      completedAt: session.completedAt,
      completionEventId: session.completionEventId,
      endpoint: { endedAt: session.endpoint.endedAt, reason: session.endpoint.reason },
      restart: session.restart,
      routePlanId: session.routePlanId,
      segments: session.segments.map((segment) => {
        if (
          !isObject(segment)
          || !hasOnlyKeys(segment, ['samples', 'roadMatchedGeometry', 'trailMarker'])
          || !Object.hasOwn(segment, 'samples')
          || !Array.isArray(segment.samples)
        ) {
          throw invalidVehicleGpsTrailHistory(data);
        }
        return {
          samples: segment.samples.map((sample) => adaptVehicleGpsTrailSample(sample, data)),
          ...(segment.roadMatchedGeometry === undefined
            ? {}
            : { roadMatchedGeometry: adaptVehicleGpsTrailRoadMatchedGeometry(segment.roadMatchedGeometry, data) }),
          ...(segment.trailMarker === undefined
            ? {}
            : { trailMarker: adaptVehicleGpsTrailMarker(segment.trailMarker, data) }),
        };
      }),
      sessionIndex: session.sessionIndex,
      startedAt: session.startedAt,
      startEventId: session.startEventId,
      startSource: session.startSource as 'DEPOT_ARRIVAL' | 'PLANNED_DEPARTURE' | 'ROUTE_STARTED',
    };
  });
  return {
    dailyRoute: adaptVehicleGpsDailyRoute(data.dailyRoute, data),
    serviceDate: data.serviceDate,
    ...(data.serviceWindow === undefined ? {} : { serviceWindow: data.serviceWindow }),
    sessions,
    timezone: data.timezone,
    vehicleId: data.vehicleId,
  };
}

function adaptVehicleGpsDailyRoute(value: unknown, body: unknown): VehicleGpsDailyRoute | null {
  if (value === null) return null;
  if (
    !isObject(value)
    || !hasExactKeys(value, ['anchors', 'bridges', 'coordinates', 'sourceSampleCount', 'type'])
    || value.type !== 'LineString'
    || !Array.isArray(value.coordinates)
    || value.coordinates.length < 2
    || !Array.isArray(value.anchors)
    || !Array.isArray(value.bridges)
    || !isNonNegativeInteger(value.sourceSampleCount)
  ) throw invalidVehicleGpsTrailHistory(body);

  const coordinates = value.coordinates.map((coordinate) => {
    if (
      !Array.isArray(coordinate)
      || coordinate.length !== 2
      || !isFiniteNumber(coordinate[0])
      || !isFiniteNumber(coordinate[1])
      || Math.abs(coordinate[0]) > 180
      || Math.abs(coordinate[1]) > 90
    ) throw invalidVehicleGpsTrailHistory(body);
    return [coordinate[0], coordinate[1]] as [number, number];
  });
  const anchors = value.anchors.map((anchor) => {
    if (
      !isObject(anchor)
      || !hasExactKeys(anchor, ['coordinateIndex', 'observedAt'])
      || !isNonNegativeInteger(anchor.coordinateIndex)
      || coordinates[anchor.coordinateIndex] === undefined
      || !isDateTime(anchor.observedAt)
    ) throw invalidVehicleGpsTrailHistory(body);
    return { coordinateIndex: anchor.coordinateIndex, observedAt: anchor.observedAt };
  });
  if (
    anchors.length !== value.sourceSampleCount
    || anchors.some((anchor, index) => index > 0 && (
      anchor.coordinateIndex < anchors[index - 1]!.coordinateIndex
      || Date.parse(anchor.observedAt) <= Date.parse(anchors[index - 1]!.observedAt)
    ))
  ) throw invalidVehicleGpsTrailHistory(body);
  const anchorObservedAt = new Set(anchors.map((anchor) => anchor.observedAt));
  const bridges = value.bridges.map((bridge) => {
    if (
      !isObject(bridge)
      || !hasOnlyKeys(bridge, ['fromObservedAt', 'inferredTunnel', 'reason', 'toObservedAt'])
      || !Object.hasOwn(bridge, 'fromObservedAt')
      || !Object.hasOwn(bridge, 'reason')
      || !Object.hasOwn(bridge, 'toObservedAt')
      || !isDateTime(bridge.fromObservedAt)
      || (bridge.reason !== 'GPS_GAP' && bridge.reason !== 'IMPLAUSIBLE_JUMP' && bridge.reason !== 'NO_MATCH')
      || !isDateTime(bridge.toObservedAt)
    ) throw invalidVehicleGpsTrailHistory(body);
    const inferredTunnel = bridge.inferredTunnel === undefined
      ? undefined
      : adaptVehicleGpsInferredTunnel(bridge.inferredTunnel, body);
    if (
      inferredTunnel !== undefined
      && (
        bridge.reason !== 'IMPLAUSIBLE_JUMP'
        || !anchorObservedAt.has(inferredTunnel.fromObservedAt)
        || !anchorObservedAt.has(inferredTunnel.confirmedByObservedAt)
        || Date.parse(inferredTunnel.fromObservedAt) > Date.parse(bridge.fromObservedAt)
        || inferredTunnel.toObservedAt !== bridge.toObservedAt
        || Date.parse(inferredTunnel.confirmedByObservedAt) <= Date.parse(bridge.toObservedAt)
      )
    ) throw invalidVehicleGpsTrailHistory(body);
    return {
      fromObservedAt: bridge.fromObservedAt,
      ...(inferredTunnel === undefined ? {} : { inferredTunnel }),
      reason: bridge.reason as 'GPS_GAP' | 'IMPLAUSIBLE_JUMP' | 'NO_MATCH',
      toObservedAt: bridge.toObservedAt,
    };
  });
  const adjacentAnchors = new Set(anchors.slice(1).map((anchor, index) => `${anchors[index]!.observedAt}|${anchor.observedAt}`));
  if (bridges.some((bridge) => !adjacentAnchors.has(`${bridge.fromObservedAt}|${bridge.toObservedAt}`))) {
    throw invalidVehicleGpsTrailHistory(body);
  }
  return {
    anchors,
    bridges,
    coordinates,
    sourceSampleCount: value.sourceSampleCount,
    type: 'LineString',
  };
}

function adaptVehicleGpsInferredTunnel(
  value: unknown,
  body: unknown,
): NonNullable<VehicleGpsDailyRoute['bridges'][number]['inferredTunnel']> {
  if (
    !isObject(value)
    || !hasExactKeys(value, [
      'confirmedByObservedAt', 'coordinates', 'corridorId', 'fromObservedAt',
      'source', 'toObservedAt', 'type',
    ])
    || value.type !== 'LineString'
    || !Array.isArray(value.coordinates)
    || value.coordinates.length < 2
    || typeof value.corridorId !== 'string'
    || value.corridorId.trim() === ''
    || !isDateTime(value.fromObservedAt)
    || !isDateTime(value.toObservedAt)
    || !isDateTime(value.confirmedByObservedAt)
    || (value.source !== 'CURATED_OSM_TUNNEL_CORRIDOR' && value.source !== 'OSRM_TUNNEL_ROUTE')
  ) throw invalidVehicleGpsTrailHistory(body);
  const coordinates = value.coordinates.map((coordinate) => {
    if (
      !Array.isArray(coordinate)
      || coordinate.length !== 2
      || !isFiniteNumber(coordinate[0])
      || !isFiniteNumber(coordinate[1])
      || Math.abs(coordinate[0]) > 180
      || Math.abs(coordinate[1]) > 90
    ) throw invalidVehicleGpsTrailHistory(body);
    return [coordinate[0], coordinate[1]] as [number, number];
  });
  return {
    confirmedByObservedAt: value.confirmedByObservedAt,
    coordinates,
    corridorId: value.corridorId,
    fromObservedAt: value.fromObservedAt,
    source: value.source,
    toObservedAt: value.toObservedAt,
    type: 'LineString',
  };
}

function adaptVehicleGpsTrailRoadMatchedGeometry(
  value: unknown,
  body: unknown,
): VehicleGpsTrailRoadMatchedGeometry | null {
  if (value === null) return null;
  if (!isObject(value) || !hasOnlyKeys(value, ['anchors', 'coordinates', 'type']) || value.type !== 'MultiLineString' || !Array.isArray(value.coordinates)) {
    throw invalidVehicleGpsTrailHistory(body);
  }
  const coordinates = value.coordinates.map((line) => {
    if (!Array.isArray(line) || line.length < 2) throw invalidVehicleGpsTrailHistory(body);
    return line.map((coordinate) => {
      if (!Array.isArray(coordinate) || coordinate.length !== 2 || !isFiniteNumber(coordinate[0]) || !isFiniteNumber(coordinate[1])) {
        throw invalidVehicleGpsTrailHistory(body);
      }
      return [coordinate[0], coordinate[1]] as [number, number];
    });
  });
  const anchors = value.anchors === undefined
    ? undefined
    : adaptVehicleGpsTrailAnchors(value.anchors, coordinates, body);
  return { ...(anchors === undefined ? {} : { anchors }), coordinates, type: 'MultiLineString' };
}

function adaptVehicleGpsTrailAnchors(
  value: unknown,
  coordinates: VehicleGpsTrailRoadMatchedGeometry['coordinates'],
  body: unknown,
): NonNullable<VehicleGpsTrailRoadMatchedGeometry['anchors']> {
  if (!Array.isArray(value)) throw invalidVehicleGpsTrailHistory(body);
  return value.map((anchor) => {
    if (
      !isObject(anchor)
      || !hasExactKeys(anchor, ['coordinateIndex', 'lineIndex', 'observedAt'])
      || !isNonNegativeInteger(anchor.coordinateIndex)
      || !isNonNegativeInteger(anchor.lineIndex)
      || !isDateTime(anchor.observedAt)
      || coordinates[anchor.lineIndex]?.[anchor.coordinateIndex] === undefined
    ) throw invalidVehicleGpsTrailHistory(body);
    return {
      coordinateIndex: anchor.coordinateIndex,
      lineIndex: anchor.lineIndex,
      observedAt: anchor.observedAt,
    };
  });
}

function adaptVehicleGpsTrailMarker(value: unknown, body: unknown): VehicleGpsTrailMarker | null {
  if (value === null) return null;
  if (
    !isObject(value)
    || !hasExactKeys(value, ['kind', 'latitude', 'longitude', 'observedAt'])
    || (value.kind !== 'START' && value.kind !== 'RESTART')
    || !isFiniteNumber(value.latitude)
    || !isFiniteNumber(value.longitude)
    || !isDateTime(value.observedAt)
  ) throw invalidVehicleGpsTrailHistory(body);
  return {
    kind: value.kind,
    latitude: value.latitude,
    longitude: value.longitude,
    observedAt: value.observedAt,
  };
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
