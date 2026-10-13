import type { MapCanvasCoordinate } from '../../components/MapCanvas';
import type { VehicleGpsDailyRoute } from '../../services/control';

export type ControlTrailLine = {
  coordinates: MapCanvasCoordinate[];
  uncertain: boolean;
};

export type InferredTunnelCandidateLine = {
  coordinates: MapCanvasCoordinate[];
  corridorId: string;
};

export function inferredTunnelCandidateLines(
  dailyRoute: VehicleGpsDailyRoute,
  cursorMs?: number,
): InferredTunnelCandidateLine[] {
  return dailyRoute.bridges.flatMap((bridge) => {
    const candidate = bridge.inferredTunnel;
    if (
      candidate === undefined
      || (cursorMs !== undefined && Date.parse(candidate.confirmedByObservedAt) > cursorMs)
    ) return [];
    return [{ coordinates: candidate.coordinates, corridorId: candidate.corridorId }];
  });
}

export function dailyRouteTrailLines(dailyRoute: VehicleGpsDailyRoute, cursorMs?: number): ControlTrailLine[] {
  const bridgeReasons = new Map(dailyRoute.bridges.map((bridge) => [
    `${bridge.fromObservedAt}|${bridge.toObservedAt}`,
    bridge.reason,
  ]));
  const lines: ControlTrailLine[] = [];
  let current: MapCanvasCoordinate[] = [];
  let currentUncertain = false;
  const finish = () => {
    if (current.length > 1 && !current.every((coordinate) => sameCoordinate(coordinate, current[0]!))) {
      lines.push({ coordinates: current, uncertain: currentUncertain });
    }
    current = [];
  };

  for (let index = 1; index < dailyRoute.anchors.length; index += 1) {
    const from = dailyRoute.anchors[index - 1]!;
    const to = dailyRoute.anchors[index]!;
    if (cursorMs !== undefined && Date.parse(to.observedAt) > cursorMs) break;
    const bridgeReason = bridgeReasons.get(`${from.observedAt}|${to.observedAt}`);
    if (bridgeReason === 'GPS_GAP' || bridgeReason === 'IMPLAUSIBLE_JUMP') {
      finish();
      continue;
    }
    const coordinates = bridgeReason === 'NO_MATCH'
      ? [dailyRoute.coordinates[from.coordinateIndex]!, dailyRoute.coordinates[to.coordinateIndex]!]
      : dailyRoute.coordinates.slice(from.coordinateIndex, to.coordinateIndex + 1);
    if (coordinates.length < 2) continue;
    if (bridgeReason === 'NO_MATCH' && sameCoordinate(coordinates[0]!, coordinates[1]!)) continue;
    if (current.length > 0 && currentUncertain === (bridgeReason === 'NO_MATCH') && sameCoordinate(current.at(-1)!, coordinates[0]!)) {
      current.push(...coordinates.slice(1));
    } else {
      finish();
      current = coordinates;
      currentUncertain = bridgeReason === 'NO_MATCH';
    }
  }
  finish();
  return lines;
}

function sameCoordinate(left: MapCanvasCoordinate, right: MapCanvasCoordinate): boolean {
  return left[0] === right[0] && left[1] === right[1];
}
