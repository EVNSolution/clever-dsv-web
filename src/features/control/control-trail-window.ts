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

/** The first time a GPS point of the vehicle is inside the center radius. Undefined when it never is. */
export function centerArrivalMs(
  history: VehicleGpsTrailHistory,
  center: { latitude: number; longitude: number },
  radiusMeters = CONTROL_CENTER_RADIUS_M,
): number | undefined {
  let first: number | undefined;
  const consider = (observedAt: string, latitude: number, longitude: number) => {
    const time = Date.parse(observedAt);
    if (!Number.isFinite(time) || (first !== undefined && time >= first)) return;
    if (distanceMeters(center, { latitude, longitude }) <= radiusMeters) first = time;
  };
  for (const session of history.sessions) {
    for (const segment of session.segments) {
      for (const sample of segment.samples) consider(sample.observedAt, sample.latitude, sample.longitude);
    }
  }
  const daily = history.dailyRoute;
  if (daily !== null) {
    for (const anchor of daily.anchors) {
      const coordinate = daily.coordinates[anchor.coordinateIndex];
      if (coordinate !== undefined) consider(anchor.observedAt, coordinate[1], coordinate[0]);
    }
  }
  return first;
}

/**
 * The time the last stop of the vehicle finished. Undefined while any stop has no delivered or failed event yet,
 * so a vehicle still on its way keeps an open end.
 */
export function lastDeliveryFinishedMs(
  orders: ReadonlyArray<{ eventSummary: ReadonlyArray<{ occurredAt: string; type: string }> }>,
): number | undefined {
  let last: number | undefined;
  for (const order of orders) {
    let finished: number | undefined;
    for (const event of order.eventSummary) {
      if (event.type !== 'STOP_DELIVERED' && event.type !== 'STOP_FAILED') continue;
      const time = Date.parse(event.occurredAt);
      if (Number.isFinite(time) && (finished === undefined || time > finished)) finished = time;
    }
    if (finished === undefined) return undefined;
    if (last === undefined || finished > last) last = finished;
  }
  return last;
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
