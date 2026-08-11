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
  const times = history.sessions.flatMap((session) => session.segments.flatMap((segment) => [
      ...segment.samples.map((sample) => Date.parse(sample.observedAt)),
      ...(segment.trailMarker === null || segment.trailMarker === undefined
        ? []
        : [Date.parse(segment.trailMarker.observedAt)]),
    ])).filter(Number.isFinite);
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
  geometry: VehicleGpsTrailRoadMatchedGeometry,
  cursorMs: number | undefined,
): VisibleTrailGeometryLine[] {
  const allLines = (): VisibleTrailGeometryLine[] => geometry.coordinates.map((coordinates, lineIndex) => ({ coordinates, lineIndex }));
  if (cursorMs === undefined) return allLines();
  if (geometry.anchors === undefined || geometry.anchors.length === 0) return [];
  const latestAnchorMs = Math.max(...geometry.anchors.map((anchor) => Date.parse(anchor.observedAt)).filter(Number.isFinite));
  if (Number.isFinite(latestAnchorMs) && cursorMs >= latestAnchorMs) return allLines();
  return geometry.coordinates.flatMap((line, lineIndex) => {
    const anchors = geometry.anchors
      ?.filter((anchor) => anchor.lineIndex === lineIndex)
      .sort((left, right) => left.coordinateIndex - right.coordinateIndex) ?? [];
    if (anchors.length === 0 || Date.parse(anchors[0].observedAt) > cursorMs) return [];
    const lastVisibleAnchor = [...anchors].reverse().find((anchor) => Date.parse(anchor.observedAt) <= cursorMs);
    if (lastVisibleAnchor === undefined) return [];
    const endIndex = Math.min(line.length - 1, lastVisibleAnchor.coordinateIndex);
    return endIndex < 1 ? [] : [{ coordinates: line.slice(0, endIndex + 1), lineIndex }];
  });
}
