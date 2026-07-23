import type { Coordinate } from '../demo/model';

const osrmCachePrefix = 'clever.osrm.route.v3';

export type RouteEstimate = { coordinates: Coordinate[]; legDurations: number[]; dropoffs: Coordinate[] };

export async function fetchOsrmRoute(endpoint: string, coordinates: Coordinate[], signal: AbortSignal): Promise<RouteEstimate | null> {
  const coordinatePath = coordinates.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const response = await fetch(`${endpoint}/route/v1/driving/${coordinatePath}?overview=full&geometries=geojson`, { signal, cache: 'no-store' });
  if (!response.ok) return null;
  const json = await response.json() as { routes?: { geometry?: { coordinates?: Coordinate[] }; legs?: { duration?: number }[] }[]; waypoints?: { location?: Coordinate }[] };
  const route = json.routes?.[0];
  if (!route?.geometry?.coordinates) return null;
  const snapped = json.waypoints?.map((waypoint) => waypoint.location).filter((coordinate): coordinate is Coordinate => isCoordinate(coordinate));
  return {
    coordinates: route.geometry.coordinates,
    legDurations: normalizeLegDurations(route.legs?.map((leg) => leg.duration), coordinates),
    dropoffs: snapped?.length === coordinates.length ? snapped.slice(1) : coordinates.slice(1),
  };
}

export function readCachedRoute(endpoint: string, route: string): RouteEstimate | null {
  try {
    const cached: unknown = JSON.parse(window.localStorage.getItem(`${osrmCachePrefix}.${route}.${endpoint}`) ?? 'null');
    if (!cached || typeof cached !== 'object' || !('coordinates' in cached) || !('legDurations' in cached) || !Array.isArray(cached.coordinates) || !Array.isArray(cached.legDurations)) return null;
    if (!cached.coordinates.every((coordinate) => Array.isArray(coordinate) && coordinate.length === 2 && coordinate.every(Number.isFinite)) || !cached.legDurations.every(Number.isFinite)) return null;
    const dropoffs = 'dropoffs' in cached && Array.isArray(cached.dropoffs) && cached.dropoffs.every(isCoordinate) ? cached.dropoffs as Coordinate[] : [];
    return { coordinates: cached.coordinates as Coordinate[], legDurations: cached.legDurations as number[], dropoffs };
  } catch {
    return null;
  }
}

export function writeCachedRoute(endpoint: string, route: string, estimate: RouteEstimate): void {
  try {
    window.localStorage.setItem(`${osrmCachePrefix}.${route}.${endpoint}`, JSON.stringify({ ...estimate, updatedAt: Date.now() }));
    window.dispatchEvent(new CustomEvent('clever:route-estimate'));
  } catch {
    // A valid network route still renders when browser storage is unavailable.
  }
}

export function fallbackRouteEstimate(waypoints: Coordinate[]): RouteEstimate {
  return { coordinates: waypoints, legDurations: normalizeLegDurations(undefined, waypoints), dropoffs: waypoints.slice(1) };
}

function isCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

function normalizeLegDurations(durations: (number | undefined)[] | undefined, waypoints: Coordinate[]): number[] {
  if (durations?.length === waypoints.length - 1 && durations.every((duration) => Number.isFinite(duration))) return durations as number[];
  return waypoints.slice(1).map((coordinate, index) => distanceKilometers(waypoints[index], coordinate) / 30 * 3600);
}

function distanceKilometers([leftLng, leftLat]: Coordinate, [rightLng, rightLat]: Coordinate): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (rightLat - leftLat) * radians;
  const longitudeDelta = (rightLng - leftLng) * radians;
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(leftLat * radians) * Math.cos(rightLat * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
