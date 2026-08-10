import type { Feature, FeatureCollection, Geometry, LineString, Point } from 'geojson';
import maplibregl from 'maplibre-gl';
import type { DataDrivenPropertyValueSpecification, FilterSpecification } from 'maplibre-gl';
import type { MapCanvasRoute } from '../MapCanvas';

const sourceId = 'operational-routes';
const casingLayerId = 'operational-route-casing';
const routeLayerId = 'operational-route-lines';
const trailLayerId = 'operational-trail-lines';
const trailPointLayerId = 'operational-route-trail-points';
const destinationMarkerLayerId = 'operational-destination-markers';

const routeFilter: FilterSpecification = ['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'kind'], 'trail']];
const trailFilter: FilterSpecification = ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'kind'], 'trail']];
const trailLineWidth: DataDrivenPropertyValueSpecification<number> = ['interpolate', ['linear'], ['zoom'], 4, 5, 10, 4.5, 16, 4];
const seoulTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  timeZone: 'Asia/Seoul',
});

export function updateOperationalRoutes(
  map: maplibregl.Map,
  routes: MapCanvasRoute[],
): void {
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, { type: 'geojson', data: routeFeatures([]) });
    map.addLayer({
      id: casingLayerId,
      type: 'line',
      source: sourceId,
      filter: routeFilter,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        'line-sort-key': ['get', 'sortKey'],
      },
      paint: {
        'line-color': ['get', 'casingColor'],
        'line-opacity': ['case', ['get', 'selected'], 0.96, 1],
        'line-width': ['case', ['get', 'selected'], 4.6, 3.6],
        'line-dasharray': ['case', ['get', 'dashed'], ['literal', [2, 2]], ['literal', [1, 0]]],
      },
    }, map.getLayer(destinationMarkerLayerId) ? destinationMarkerLayerId : undefined);
    map.addLayer({
      id: routeLayerId,
      type: 'line',
      source: sourceId,
      filter: routeFilter,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        'line-sort-key': ['get', 'sortKey'],
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-opacity': ['case', ['get', 'selected'], 0.96, 1],
        'line-width': ['case', ['get', 'selected'], 2.6, 1.8],
        'line-dasharray': ['case', ['get', 'dashed'], ['literal', [2, 2]], ['literal', [1, 0]]],
      },
    }, map.getLayer(destinationMarkerLayerId) ? destinationMarkerLayerId : undefined);
    map.addLayer({
      id: trailLayerId,
      type: 'line',
      source: sourceId,
      filter: trailFilter,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        'line-sort-key': ['get', 'sortKey'],
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-opacity': 1,
        'line-width': trailLineWidth,
        'line-dasharray': ['literal', [1, 1.75]],
      },
    }, map.getLayer(destinationMarkerLayerId) ? destinationMarkerLayerId : undefined);
    map.addLayer({
      id: trailPointLayerId,
      type: 'circle',
      source: sourceId,
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-color': [
          'case',
          ['==', ['get', 'markerKind'], 'start'], '#111827',
          ['==', ['get', 'markerKind'], 'restart'], '#f59e0b',
          ['==', ['get', 'markerKind'], 'interrupted'], '#fff7ed',
          '#d92d20',
        ],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 5, 10, 4.5, 16, 4],
        'circle-stroke-color': [
          'case',
          ['==', ['get', 'markerKind'], 'start'], '#111827',
          ['==', ['get', 'markerKind'], 'restart'], '#f59e0b',
          ['==', ['get', 'markerKind'], 'interrupted'], '#f59e0b',
          '#d92d20',
        ],
        'circle-stroke-width': 2,
      },
    }, map.getLayer(destinationMarkerLayerId) ? destinationMarkerLayerId : undefined);
    bindTrailInterruptionPopup(map);
  }
  (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(routeFeatures(routes));
}

function routeFeatures(routes: MapCanvasRoute[]): FeatureCollection<Geometry> {
  return {
    type: 'FeatureCollection',
    features: routes.flatMap((route): Array<Feature<LineString | Point>> => {
      const features: Array<Feature<LineString | Point>> = [];
      if (route.coordinates.length > 1) features.push({
        type: 'Feature',
        properties: {
          casingColor: route.casingColor ?? '#ffffff',
          color: route.color,
          dashed: route.dashed === true,
          kind: route.kind ?? 'route',
          routeId: route.id,
          selected: route.selected === true,
          sortKey: (route.selected === true ? 100 : 0) + (route.sortOrder ?? 0),
        },
        geometry: {
          type: 'LineString',
          coordinates: route.coordinates,
        },
      });
      const start = route.startMarkerCoordinate ?? route.coordinates[0];
      if (start !== undefined && route.startMarker !== undefined) {
        features.push(pointFeature(route.id, start, route.startMarker, route.trailInterruption));
      }
      const end = route.coordinates.at(-1);
      if (end !== undefined && route.endMarker !== undefined) features.push(pointFeature(route.id, end, route.endMarker));
      return features;
    }),
  };
}

function pointFeature(
  routeId: string,
  coordinates: [number, number],
  markerKind: NonNullable<MapCanvasRoute['endMarker'] | MapCanvasRoute['startMarker']>,
  trailInterruption?: MapCanvasRoute['trailInterruption'],
): Feature<Point> {
  return {
    type: 'Feature',
    properties: {
      markerKind,
      routeId,
      ...(trailInterruption === undefined ? {} : trailInterruption),
    },
    geometry: { type: 'Point', coordinates },
  };
}

function bindTrailInterruptionPopup(map: maplibregl.Map): void {
  const popup = new maplibregl.Popup({
    className: 'control-trail-interruption-popup',
    closeButton: false,
    closeOnClick: false,
    offset: 10,
  });
  let pinnedRouteId: string | null = null;

  const readInterruption = (feature: maplibregl.MapGeoJSONFeature | undefined) => {
    if (feature?.geometry.type !== 'Point' || feature.properties.markerKind !== 'restart') return null;
    const interruptedAt = feature.properties.interruptedAt;
    const resolvedAt = feature.properties.resolvedAt;
    const routeId = feature.properties.routeId;
    if (typeof interruptedAt !== 'string' || typeof resolvedAt !== 'string' || typeof routeId !== 'string') return null;
    const interruptedMs = Date.parse(interruptedAt);
    const resolvedMs = Date.parse(resolvedAt);
    if (!Number.isFinite(interruptedMs) || !Number.isFinite(resolvedMs) || resolvedMs <= interruptedMs) return null;
    return {
      coordinates: feature.geometry.coordinates as [number, number],
      interruptedAt,
      interruptedMs,
      resolvedMs,
      routeId,
    };
  };

  const showPopup = (interruption: NonNullable<ReturnType<typeof readInterruption>>) => {
    const content = document.createElement('dl');
    content.className = 'control-trail-interruption-popup__content';
    content.append(
      popupRow('끊김 발생', seoulTimeFormatter.format(new Date(interruption.interruptedAt))),
      popupRow('해소까지', formatInterruptionDuration(interruption.resolvedMs - interruption.interruptedMs)),
    );
    popup.setLngLat(interruption.coordinates).setDOMContent(content).addTo(map);
  };

  map.on('mouseenter', trailPointLayerId, (event) => {
    const interruption = readInterruption(event.features?.[0]);
    map.getCanvas().style.cursor = interruption === null ? '' : 'pointer';
    if (interruption !== null && pinnedRouteId === null) showPopup(interruption);
  });
  map.on('mouseleave', trailPointLayerId, () => {
    map.getCanvas().style.cursor = '';
    if (pinnedRouteId === null) popup.remove();
  });
  map.on('click', trailPointLayerId, (event) => {
    const interruption = readInterruption(event.features?.[0]);
    if (interruption === null) return;
    pinnedRouteId = interruption.routeId;
    showPopup(interruption);
  });
  map.on('click', (event) => {
    const interruption = readInterruption(map.queryRenderedFeatures(event.point, { layers: [trailPointLayerId] })[0]);
    if (interruption !== null) return;
    pinnedRouteId = null;
    popup.remove();
  });
}

function popupRow(label: string, value: string): HTMLDivElement {
  const row = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  term.textContent = label;
  description.textContent = value;
  row.append(term, description);
  return row;
}

function formatInterruptionDuration(durationMs: number): string {
  const minutes = Math.max(1, Math.ceil(durationMs / 60_000));
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}시간` : `${hours}시간 ${remainingMinutes}분`;
}
