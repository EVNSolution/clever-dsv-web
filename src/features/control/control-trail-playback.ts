import type {
  VehicleGpsTrailHistory,
  VehicleGpsTrailRoadMatchedGeometry,
  VehicleGpsTrailSample,
} from '../../services/control';

export type ControlTrailBounds = {
  endMs: number;
  startMs: number;
};

export type VisibleTrailGeometryLine = {
  coordinates: VehicleGpsTrailRoadMatchedGeometry['coordinates'][number];
  lineIndex: number;
};

export function controlTrailBounds(history?: VehicleGpsTrailHistory): ControlTrailBounds | undefined {
  if (history === undefined) return undefined;
  const times = history.sessions.flatMap((session) => session.segments.flatMap((segment) =>
    segment.samples.map((sample) => Date.parse(sample.observedAt))
  )).filter(Number.isFinite);
  if (times.length === 0) return undefined;
  return { startMs: Math.min(...times), endMs: Math.max(...times) };
}

export function controlTrailSampleAt(
  history: VehicleGpsTrailHistory | undefined,
  cursorMs: number | undefined,
): VehicleGpsTrailSample | undefined {
  if (history === undefined || cursorMs === undefined) return undefined;
  return history.sessions
    .flatMap((session) => session.segments.flatMap((segment) => segment.samples))
    .filter((sample) => Date.parse(sample.observedAt) <= cursorMs)
    .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))[0];
}

export function visibleTrailGeometryLines(
  geometry: VehicleGpsTrailRoadMatchedGeometry | null | undefined,
  cursorMs: number | undefined,
): VisibleTrailGeometryLine[] | undefined {
  if (geometry === null || geometry === undefined) return undefined;
  if (geometry.anchors === undefined || geometry.anchors.length < 2) return undefined;
  const anchorsByLine = new Map<number, NonNullable<VehicleGpsTrailRoadMatchedGeometry['anchors']>>();
  for (const anchor of geometry.anchors) {
    anchorsByLine.set(anchor.lineIndex, [...(anchorsByLine.get(anchor.lineIndex) ?? []), anchor]);
  }
  if (geometry.coordinates.some((_, lineIndex) => (anchorsByLine.get(lineIndex)?.length ?? 0) < 2)) return undefined;
  const allLines = (): VisibleTrailGeometryLine[] => geometry.coordinates.map((coordinates, lineIndex) => ({ coordinates, lineIndex }));
  if (cursorMs === undefined) return allLines();
  return geometry.coordinates.flatMap((line, lineIndex) => {
    const anchors = [...(anchorsByLine.get(lineIndex) ?? [])].sort((left, right) => {
      const timeOrder = Date.parse(left.observedAt) - Date.parse(right.observedAt);
      return timeOrder === 0 ? left.coordinateIndex - right.coordinateIndex : timeOrder;
    });
    const firstAnchor = anchors[0];
    if (firstAnchor === undefined || Date.parse(firstAnchor.observedAt) > cursorMs) return [];
    const lastVisibleAnchor = [...anchors].reverse().find((anchor) => Date.parse(anchor.observedAt) <= cursorMs);
    if (lastVisibleAnchor === undefined) return [];
    const endIndex = Math.min(line.length - 1, lastVisibleAnchor.coordinateIndex);
    return [{ coordinates: line.slice(0, endIndex + 1), lineIndex }];
  });
}
