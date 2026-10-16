import type { DispatchEventSummary, DispatchListItem } from '../../services/dispatch';
import type { MapCanvasCoordinate } from '../../components/MapCanvas';

export type ControlProgressStatus = 'completed' | 'current' | 'failed' | 'planned';

export const CONTROL_PROGRESS_COLORS: Record<ControlProgressStatus, string> = {
  completed: '#8e8e93',
  current: '#1f8b4c',
  failed: '#d92d20',
  planned: '#0066cc',
};

/** The map pin's badge: a check for a finished stop, an x for a failed one, none while it is still ahead. */
export function controlPinStatus(status: ControlProgressStatus): 'completed' | 'failed' | undefined {
  return status === 'completed' || status === 'failed' ? status : undefined;
}

export type ControlProgressDestination<T> = T & {
  progressStatus: ControlProgressStatus;
};

export type ControlRouteProgressStop = {
  coordinate: MapCanvasCoordinate;
  progressStatus: ControlProgressStatus;
};

export type ControlRouteProgressSegment = {
  coordinates: MapCanvasCoordinate[];
  status: Exclude<ControlProgressStatus, 'failed'>;
};

const completedEventTypes = new Set(['STOP_ARRIVED', 'STOP_DELIVERED']);
const stopEventTypes = new Set(['STOP_ARRIVED', 'STOP_DELIVERED', 'STOP_FAILED']);

export function assignControlDestinationProgress<T extends { orders: DispatchListItem[] }>(
  destinations: T[],
): Array<ControlProgressDestination<T>> {
  const outcomes = destinations.map(destinationOutcome);
  const currentIndex = outcomes.findIndex((outcome) => !outcome.processed);
  return destinations.map((destination, index) => ({
    ...destination,
    progressStatus: outcomes[index]?.failed === true
      ? 'failed'
      : outcomes[index]?.processed === true
        ? 'completed'
        : index === currentIndex
          ? 'current'
          : 'planned',
  }));
}

export function splitControlRouteByProgress(input: {
  coordinates: MapCanvasCoordinate[];
  stops: ControlRouteProgressStop[];
  vehiclePosition?: MapCanvasCoordinate;
}): ControlRouteProgressSegment[] {
  if (input.coordinates.length < 2) return [];
  const distances = cumulativeDistances(input.coordinates);
  const routeLength = distances.at(-1) ?? 0;
  if (routeLength <= 0) return [];

  let minimumStopDistance = 0;
  const projectedStops = input.stops.map((stop) => {
    const projection = projectCoordinate(input.coordinates, distances, stop.coordinate, minimumStopDistance, routeLength);
    minimumStopDistance = projection.distance;
    return { ...stop, routeDistance: projection.distance };
  });
  const currentIndex = projectedStops.findIndex((stop) => stop.progressStatus === 'current');
  if (currentIndex < 0) {
    return [{ coordinates: input.coordinates.map(copyCoordinate), status: 'completed' }];
  }

  const previousStopDistance = currentIndex === 0
    ? 0
    : projectedStops[currentIndex - 1]?.routeDistance ?? 0;
  // The vehicle may already be past unmarked stops, so it is placed anywhere from the last completed stop onward
  // and the green leg runs to the first stop still ahead of it; the predicted route is never drawn behind the vehicle.
  const vehicleDistance = input.vehiclePosition === undefined
    ? previousStopDistance
    : projectCoordinate(
        input.coordinates,
        distances,
        input.vehiclePosition,
        previousStopDistance,
        routeLength,
      ).distance;
  const nextStopDistance = projectedStops
    .slice(currentIndex)
    .find((stop) => stop.routeDistance > vehicleDistance)?.routeDistance;

  return [
    routeSegment(input.coordinates, distances, 0, vehicleDistance, 'completed'),
    nextStopDistance === undefined
      ? null
      : routeSegment(input.coordinates, distances, vehicleDistance, nextStopDistance, 'current'),
    routeSegment(input.coordinates, distances, nextStopDistance ?? vehicleDistance, routeLength, 'planned'),
  ].filter((segment): segment is ControlRouteProgressSegment => segment !== null);
}

function destinationOutcome(destination: { orders: DispatchListItem[] }): { failed: boolean; processed: boolean } {
  const outcomes = destination.orders.map((order) => latestStopEvent(order.eventSummary));
  const failed = outcomes.some((event) => event?.type === 'STOP_FAILED');
  return {
    failed,
    processed: failed || (outcomes.length > 0 && outcomes.every((event) => event !== null && completedEventTypes.has(event.type))),
  };
}

function latestStopEvent(events: DispatchEventSummary[]): DispatchEventSummary | null {
  return events.reduce<DispatchEventSummary | null>((latest, event) => {
    if (!stopEventTypes.has(event.type)) return latest;
    if (latest === null) return event;
    return new Date(event.occurredAt).getTime() >= new Date(latest.occurredAt).getTime() ? event : latest;
  }, null);
}

function routeSegment(
  coordinates: MapCanvasCoordinate[],
  distances: number[],
  start: number,
  end: number,
  status: ControlRouteProgressSegment['status'],
): ControlRouteProgressSegment | null {
  if (end - start < 0.01) return null;
  return { coordinates: sliceRoute(coordinates, distances, start, end), status };
}

function cumulativeDistances(coordinates: MapCanvasCoordinate[]): number[] {
  const distances = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    distances.push((distances[index - 1] ?? 0) + coordinateDistance(coordinates[index - 1], coordinates[index]));
  }
  return distances;
}

function projectCoordinate(
  coordinates: MapCanvasCoordinate[],
  distances: number[],
  target: MapCanvasCoordinate,
  minimumDistance: number,
  maximumDistance: number,
): { coordinate: MapCanvasCoordinate; distance: number } {
  let best = {
    coordinate: coordinateAtDistance(coordinates, distances, minimumDistance),
    distance: minimumDistance,
    squaredDistance: Number.POSITIVE_INFINITY,
  };
  for (let index = 1; index < coordinates.length; index += 1) {
    const segmentStartDistance = distances[index - 1] ?? 0;
    const segmentEndDistance = distances[index] ?? segmentStartDistance;
    if (segmentEndDistance < minimumDistance || segmentStartDistance > maximumDistance) continue;
    const segmentLength = segmentEndDistance - segmentStartDistance;
    if (segmentLength <= 0) continue;
    const lower = Math.max(0, (minimumDistance - segmentStartDistance) / segmentLength);
    const upper = Math.min(1, (maximumDistance - segmentStartDistance) / segmentLength);
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const latitudeScale = Math.cos((((start[1] + end[1] + target[1]) / 3) * Math.PI) / 180);
    const dx = (end[0] - start[0]) * latitudeScale;
    const dy = end[1] - start[1];
    const targetX = (target[0] - start[0]) * latitudeScale;
    const targetY = target[1] - start[1];
    const denominator = dx * dx + dy * dy;
    const rawFraction = denominator === 0 ? lower : (targetX * dx + targetY * dy) / denominator;
    const fraction = Math.max(lower, Math.min(upper, rawFraction));
    const coordinate: MapCanvasCoordinate = [
      start[0] + (end[0] - start[0]) * fraction,
      start[1] + (end[1] - start[1]) * fraction,
    ];
    const squaredDistance = scaledSquaredDistance(coordinate, target, latitudeScale);
    if (squaredDistance < best.squaredDistance) {
      best = {
        coordinate,
        distance: segmentStartDistance + segmentLength * fraction,
        squaredDistance,
      };
    }
  }
  return { coordinate: best.coordinate, distance: best.distance };
}

function sliceRoute(
  coordinates: MapCanvasCoordinate[],
  distances: number[],
  start: number,
  end: number,
): MapCanvasCoordinate[] {
  const sliced = [coordinateAtDistance(coordinates, distances, start)];
  for (let index = 1; index < coordinates.length - 1; index += 1) {
    const distance = distances[index] ?? 0;
    if (distance > start && distance < end) sliced.push(copyCoordinate(coordinates[index]));
  }
  sliced.push(coordinateAtDistance(coordinates, distances, end));
  return sliced.filter((coordinate, index) => index === 0 || !sameCoordinate(coordinate, sliced[index - 1]));
}

function coordinateAtDistance(
  coordinates: MapCanvasCoordinate[],
  distances: number[],
  targetDistance: number,
): MapCanvasCoordinate {
  const routeLength = distances.at(-1) ?? 0;
  const clamped = Math.max(0, Math.min(routeLength, targetDistance));
  for (let index = 1; index < distances.length; index += 1) {
    const startDistance = distances[index - 1] ?? 0;
    const endDistance = distances[index] ?? startDistance;
    if (clamped > endDistance) continue;
    const fraction = endDistance === startDistance ? 0 : (clamped - startDistance) / (endDistance - startDistance);
    const start = coordinates[index - 1];
    const end = coordinates[index];
    return [
      start[0] + (end[0] - start[0]) * fraction,
      start[1] + (end[1] - start[1]) * fraction,
    ];
  }
  return copyCoordinate(coordinates.at(-1) ?? coordinates[0]);
}

function coordinateDistance(left: MapCanvasCoordinate, right: MapCanvasCoordinate): number {
  const latitudeScale = Math.cos((((left[1] + right[1]) / 2) * Math.PI) / 180);
  const longitudeMeters = (right[0] - left[0]) * latitudeScale * 111_320;
  const latitudeMeters = (right[1] - left[1]) * 110_540;
  return Math.hypot(longitudeMeters, latitudeMeters);
}

function scaledSquaredDistance(left: MapCanvasCoordinate, right: MapCanvasCoordinate, longitudeScale: number): number {
  const dx = (right[0] - left[0]) * longitudeScale;
  const dy = right[1] - left[1];
  return dx * dx + dy * dy;
}

function sameCoordinate(left: MapCanvasCoordinate, right: MapCanvasCoordinate | undefined): boolean {
  return right !== undefined && Math.abs(left[0] - right[0]) < 1e-10 && Math.abs(left[1] - right[1]) < 1e-10;
}

function copyCoordinate(coordinate: MapCanvasCoordinate): MapCanvasCoordinate {
  return [coordinate[0], coordinate[1]];
}
