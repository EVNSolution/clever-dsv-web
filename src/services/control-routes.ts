import { requestV1ReadJson } from '../api/client';

export type ControlRouteCoordinate = [longitude: number, latitude: number];
export type ControlRouteResult = {
  coordinates: ControlRouteCoordinate[];
  legDurationsSeconds: Array<number | null>;
};

type ControlRoutesResponse = {
  routes: Array<{
    coordinates: ControlRouteCoordinate[];
    generatedAt: string | null;
    geometryStatus: 'fresh' | 'missing' | 'stale' | 'unavailable';
    legDurationsSeconds: Array<number | null>;
    routePlanId: string;
  }>;
  serviceDate: string;
};

export async function loadControlRoutes(
  serviceDate: string,
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, ControlRouteResult>> {
  const query = new URLSearchParams({ serviceDate });
  const response = await requestV1ReadJson<unknown>(`control/routes?${query.toString()}`, { signal });
  const parsed = readControlRoutesResponse(response);
  return new Map(parsed.routes.flatMap((route) => (
    route.geometryStatus === 'fresh' && route.coordinates.length > 1
      ? [[route.routePlanId, {
          coordinates: route.coordinates,
          legDurationsSeconds: route.legDurationsSeconds,
        }] as const]
      : []
  )));
}

function readControlRoutesResponse(value: unknown): ControlRoutesResponse {
  if (!isObject(value) || !Array.isArray(value.routes) || typeof value.serviceDate !== 'string') {
    throw new Error('관제 경로 응답 형식이 올바르지 않습니다.');
  }
  const routes = value.routes.map(readControlRoute);
  return { routes, serviceDate: value.serviceDate };
}

function readControlRoute(value: unknown): ControlRoutesResponse['routes'][number] {
  if (
    !isObject(value)
    || typeof value.routePlanId !== 'string'
    || !isGeometryStatus(value.geometryStatus)
    || !(value.generatedAt === null || typeof value.generatedAt === 'string')
    || !Array.isArray(value.coordinates)
    || !Array.isArray(value.legDurationsSeconds)
  ) throw new Error('관제 경로 항목 형식이 올바르지 않습니다.');
  const coordinates = value.coordinates.map((coordinate) => {
    if (
      !Array.isArray(coordinate)
      || coordinate.length !== 2
      || !coordinate.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
    ) throw new Error('관제 경로 좌표 형식이 올바르지 않습니다.');
    return [coordinate[0], coordinate[1]] as ControlRouteCoordinate;
  });
  const legDurationsSeconds = value.legDurationsSeconds.map((duration) => {
    if (duration === null) return null;
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) {
      throw new Error('관제 경로 소요시간 형식이 올바르지 않습니다.');
    }
    return duration;
  });
  return {
    coordinates,
    generatedAt: value.generatedAt,
    geometryStatus: value.geometryStatus,
    legDurationsSeconds,
    routePlanId: value.routePlanId,
  };
}

function isGeometryStatus(value: unknown): value is ControlRoutesResponse['routes'][number]['geometryStatus'] {
  return value === 'fresh' || value === 'missing' || value === 'stale' || value === 'unavailable';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
