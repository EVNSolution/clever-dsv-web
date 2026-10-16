import type { VehicleGpsDailyRoute, VehicleGpsTrailHistory } from '../../services/control';

// The center is the settings 출발 위치. Over 30 days of raw GPS the nearest approach on a working day was at most
// 67 m, and the nearest on any other day was 2,703 m. 300 m keeps a margin over GPS error and stays far from both.
export const CONTROL_CENTER_RADIUS_M = 300;

export type ControlTrailWindow = {
  /** Open when the vehicle still has stops left, so the trail shows up to its latest point. */
  endMs?: number;
  startMs: number;
};

type Geometry = NonNullable<VehicleGpsTrailHistory['sessions'][number]['segments'][number]['roadMatchedGeometry']>;

const EARTH_RADIUS_M = 6_371_000;

function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (to.latitude - from.latitude) * rad;
  const dLon = (to.longitude - from.longitude) * rad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(from.latitude * rad) * Math.cos(to.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * The vehicle has to wait at the center this long before it counts as arrived. A drive past the center is not an
 * arrival. Every working day in 30 days of raw GPS had one stay of 13 minutes or more at the center, and none had a
 * shorter stay, so 10 minutes keeps all of them and still skips a pass-by, which takes about a minute.
 */
export const CONTROL_CENTER_MIN_WAIT_MINUTES = 10;

/**
 * When the vehicle arrived at the center: the start of its first stay inside the radius that lasted at least the
 * waiting time, so the wait itself is part of what is shown. Undefined when it never waited there.
 */
export function centerArrivalMs(
  history: VehicleGpsTrailHistory,
  center: { latitude: number; longitude: number },
  radiusMeters = CONTROL_CENTER_RADIUS_M,
  minWaitMinutes = CONTROL_CENTER_MIN_WAIT_MINUTES,
): number | undefined {
  const points: Array<{ inside: boolean; time: number }> = [];
  const add = (observedAt: string, latitude: number, longitude: number) => {
    const time = Date.parse(observedAt);
    if (Number.isFinite(time)) points.push({ inside: distanceMeters(center, { latitude, longitude }) <= radiusMeters, time });
  };
  for (const session of history.sessions) {
    for (const segment of session.segments) {
      for (const sample of segment.samples) add(sample.observedAt, sample.latitude, sample.longitude);
    }
  }
  const daily = history.dailyRoute;
  if (daily !== null) {
    for (const anchor of daily.anchors) {
      const coordinate = daily.coordinates[anchor.coordinateIndex];
      if (coordinate !== undefined) add(anchor.observedAt, coordinate[1], coordinate[0]);
    }
  }
  points.sort((left, right) => left.time - right.time);
  let stayStart: number | undefined;
  let lastInside: number | undefined;
  for (const point of points) {
    if (point.inside) {
      stayStart ??= point.time;
      lastInside = point.time;
      continue;
    }
    // The stay ends at the first point outside the radius, so a stay with sparse points still counts its whole wait.
    if (stayStart !== undefined && point.time - stayStart >= minWaitMinutes * 60_000) return stayStart;
    stayStart = undefined;
    lastInside = undefined;
  }
  // A stay that is still going at the latest point.
  if (stayStart !== undefined && lastInside !== undefined && lastInside - stayStart >= minWaitMinutes * 60_000) return stayStart;
  return undefined;
}

/**
 * The time the vehicle arrived at its last stop. The route ends there: DSV vehicles do not have to return to the
 * center. A stop counts as reached by its arrival event, or by a delivered or failed event when no arrival was
 * recorded. Undefined while any stop is not reached yet, so a vehicle still on its way keeps an open end.
 */
export function lastStopArrivedMs(
  orders: ReadonlyArray<{ eventSummary: ReadonlyArray<{ occurredAt: string; type: string }> }>,
): number | undefined {
  let last: number | undefined;
  for (const order of orders) {
    const earliest = (types: readonly string[]): number | undefined => {
      let found: number | undefined;
      for (const event of order.eventSummary) {
        if (!types.includes(event.type)) continue;
        const time = Date.parse(event.occurredAt);
        if (Number.isFinite(time) && (found === undefined || time < found)) found = time;
      }
      return found;
    };
    const reached = earliest(['STOP_ARRIVED']) ?? earliest(['STOP_DELIVERED', 'STOP_FAILED']);
    if (reached === undefined) return undefined;
    if (last === undefined || reached > last) last = reached;
  }
  return last;
}

/**
 * When each vehicle finished its route, as an ISO time: the arrival at its last stop. A vehicle with a stop not
 * reached yet is absent, so a vehicle on its way is never listed as finished.
 */
export function vehicleRouteCompletions(
  orders: ReadonlyArray<{
    assignmentStatus: string;
    eventSummary: ReadonlyArray<{ occurredAt: string; type: string }>;
    vehicleId: string | null;
  }>,
): Map<string, string> {
  const byVehicle = new Map<string, typeof orders[number][]>();
  for (const order of orders) {
    if (order.assignmentStatus !== 'ASSIGNED' || order.vehicleId === null) continue;
    byVehicle.set(order.vehicleId, [...(byVehicle.get(order.vehicleId) ?? []), order]);
  }
  const completions = new Map<string, string>();
  for (const [vehicleId, vehicleOrders] of byVehicle) {
    const finishedMs = lastStopArrivedMs(vehicleOrders);
    if (finishedMs !== undefined) completions.set(vehicleId, new Date(finishedMs).toISOString());
  }
  return completions;
}

/** A copy of the history with only the points inside the window. The rest stays on the server and is not shown. */
export function trimTrailHistory(history: VehicleGpsTrailHistory, window: ControlTrailWindow): VehicleGpsTrailHistory {
  const inside = (observedAt: string): boolean => {
    const time = Date.parse(observedAt);
    return Number.isFinite(time) && time >= window.startMs && (window.endMs === undefined || time <= window.endMs);
  };
  const sessions = history.sessions.flatMap((session) => {
    const segments = session.segments.flatMap((segment) => {
      const samples = segment.samples.filter((sample) => inside(sample.observedAt));
      if (samples.length === 0) return [];
      const roadMatchedGeometry = segment.roadMatchedGeometry == null
        ? segment.roadMatchedGeometry
        : trimGeometry(segment.roadMatchedGeometry, inside);
      const trailMarker = segment.trailMarker != null && !inside(segment.trailMarker.observedAt)
        ? null
        : segment.trailMarker;
      return [{
        ...segment,
        ...(roadMatchedGeometry === undefined ? {} : { roadMatchedGeometry }),
        ...(trailMarker === undefined ? {} : { trailMarker }),
        samples,
      }];
    });
    return segments.length === 0 ? [] : [{ ...session, segments }];
  });
  return { ...history, dailyRoute: trimDailyRoute(history.dailyRoute, inside), sessions };
}

function trimGeometry(geometry: Geometry, inside: (observedAt: string) => boolean): Geometry | null {
  if (geometry.anchors === undefined) return geometry;
  const kept = geometry.anchors.filter((anchor) => inside(anchor.observedAt));
  const coordinates: Geometry['coordinates'] = [];
  const anchors: NonNullable<Geometry['anchors']> = [];
  geometry.coordinates.forEach((line, lineIndex) => {
    const own = kept.filter((anchor) => anchor.lineIndex === lineIndex);
    if (own.length < 2) return;
    const from = Math.min(...own.map((anchor) => anchor.coordinateIndex));
    const to = Math.max(...own.map((anchor) => anchor.coordinateIndex));
    const sliced = line.slice(from, to + 1);
    if (sliced.length < 2) return;
    for (const anchor of own) {
      anchors.push({ ...anchor, coordinateIndex: anchor.coordinateIndex - from, lineIndex: coordinates.length });
    }
    coordinates.push(sliced);
  });
  return coordinates.length === 0 ? null : { ...geometry, anchors, coordinates };
}

function trimDailyRoute(
  route: VehicleGpsDailyRoute | null,
  inside: (observedAt: string) => boolean,
): VehicleGpsDailyRoute | null {
  if (route === null) return null;
  const kept = route.anchors.filter((anchor) => inside(anchor.observedAt));
  if (kept.length < 2) return null;
  const from = Math.min(...kept.map((anchor) => anchor.coordinateIndex));
  const to = Math.max(...kept.map((anchor) => anchor.coordinateIndex));
  return {
    ...route,
    anchors: kept.map((anchor) => ({ ...anchor, coordinateIndex: anchor.coordinateIndex - from })),
    bridges: route.bridges.filter((bridge) => inside(bridge.fromObservedAt) && inside(bridge.toObservedAt)),
    coordinates: route.coordinates.slice(from, to + 1),
  };
}
