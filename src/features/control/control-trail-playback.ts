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
  if (!history.sessions.some((session) => session.segments.some((segment) => segment.samples.length > 0))) return undefined;
  const startMs = Date.parse(`${history.serviceDate}T00:00:00+09:00`);
  if (!Number.isFinite(startMs)) return undefined;
  return { startMs, endMs: startMs + 24 * 60 * 60_000 };
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

export function visibleTrailRawLines(
  samples: VehicleGpsTrailSample[],
  geometry: VehicleGpsTrailRoadMatchedGeometry | null | undefined,
  cursorMs: number | undefined,
): Array<Array<[longitude: number, latitude: number]>> {
  const visibleSamples = samples.filter((sample) => cursorMs === undefined || Date.parse(sample.observedAt) <= cursorMs);
  if (visibleSamples.length === 0) return [];
  if (visibleTrailGeometryLines(geometry, cursorMs) === undefined) {
    return [visibleSamples.map((sample) => [sample.longitude, sample.latitude] as [number, number])];
  }
  const matchedTimes = new Map<number, number>();
  for (const anchor of geometry?.anchors ?? []) {
    const observedAt = Date.parse(anchor.observedAt);
    if (cursorMs !== undefined && observedAt > cursorMs) continue;
    matchedTimes.set(observedAt, (matchedTimes.get(observedAt) ?? 0) + 1);
  }
  const unmatchedIndexes = visibleSamples.flatMap((sample, index) => {
    const observedAt = Date.parse(sample.observedAt);
    const remaining = matchedTimes.get(observedAt) ?? 0;
    if (remaining === 0) return [index];
    matchedTimes.set(observedAt, remaining - 1);
    return [];
  });
  const runs: Array<{ end: number; start: number }> = [];
  for (const index of unmatchedIndexes) {
    const current = runs.at(-1);
    if (current !== undefined && index === current.end + 1) current.end = index;
    else runs.push({ start: index, end: index });
  }
  return runs.map((run) => visibleSamples
    .slice(Math.max(0, run.start - 1), Math.min(visibleSamples.length, run.end + 2))
    .map((sample) => [sample.longitude, sample.latitude] as [number, number]));
}
