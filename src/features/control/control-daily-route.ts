import type { MapCanvasCoordinate } from '../../components/MapCanvas';
import type { VehicleGpsDailyRoute } from '../../services/control';

export type ActualFirstLegLine = {
  coordinates: MapCanvasCoordinate[];
  uncertain: boolean;
};

export function actualFirstLegLines(input: {
  completedAt: string;
  dailyRoute: VehicleGpsDailyRoute | null | undefined;
  destination: MapCanvasCoordinate;
  origin: MapCanvasCoordinate;
  startedAt: string;
}): ActualFirstLegLine[] {
  const { completedAt, dailyRoute, destination, origin, startedAt } = input;
  if (dailyRoute === null || dailyRoute === undefined) return [];
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(completedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
  const anchors = dailyRoute.anchors.filter((anchor) => {
    const observedAt = Date.parse(anchor.observedAt);
    return observedAt >= startMs && observedAt <= endMs;
  });
  if (anchors.length < 2) return [];

  const bridgeKeys = new Set(dailyRoute.bridges.map((bridge) => `${bridge.fromObservedAt}|${bridge.toObservedAt}`));
  const lines: ActualFirstLegLine[] = [];
  const append = (coordinates: MapCanvasCoordinate[], uncertain: boolean) => {
    if (coordinates.length < 2 || coordinates.every((coordinate) => sameCoordinate(coordinate, coordinates[0]!))) return;
    const previous = lines.at(-1);
    if (previous?.uncertain === uncertain && sameCoordinate(previous.coordinates.at(-1)!, coordinates[0]!)) {
      previous.coordinates.push(...coordinates.slice(1));
    } else {
      lines.push({ coordinates, uncertain });
    }
  };

  const first = dailyRoute.coordinates[anchors[0]!.coordinateIndex];
  const last = dailyRoute.coordinates[anchors.at(-1)!.coordinateIndex];
  if (first === undefined || last === undefined) return [];
  if (!sameCoordinate(origin, first)) append([origin, first], true);
  for (let index = 1; index < anchors.length; index += 1) {
    const from = anchors[index - 1]!;
    const to = anchors[index]!;
    append(
      dailyRoute.coordinates.slice(from.coordinateIndex, to.coordinateIndex + 1),
      bridgeKeys.has(`${from.observedAt}|${to.observedAt}`),
    );
  }
  if (!sameCoordinate(last, destination)) append([last, destination], true);
  return lines;
}

function sameCoordinate(left: MapCanvasCoordinate, right: MapCanvasCoordinate): boolean {
  return left[0] === right[0] && left[1] === right[1];
}
