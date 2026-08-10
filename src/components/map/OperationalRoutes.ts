import type { Feature, FeatureCollection, Geometry, LineString, Point } from 'geojson';
import maplibregl from 'maplibre-gl';
import type { DataDrivenPropertyValueSpecification, FilterSpecification } from 'maplibre-gl';
import type { MapCanvasRoute } from '../MapCanvas';

const sourceId = 'operational-routes';
const casingLayerId = 'operational-route-casing';
const routeLayerId = 'operational-route-lines';
const trailCasingLayerId = 'operational-trail-casing';
const trailLayerId = 'operational-trail-lines';
const trailPointLayerId = 'operational-route-trail-points';
const destinationMarkerLayerId = 'operational-destination-markers';

const routeFilter: FilterSpecification = ['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'kind'], 'trail']];
const trailFilter: FilterSpecification = ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'kind'], 'trail']];
const trailCasingWidth: DataDrivenPropertyValueSpecification<number> = ['interpolate', ['linear'], ['zoom'], 4, 9, 10, 8, 16, 7];
const trailLineWidth: DataDrivenPropertyValueSpecification<number> = ['interpolate', ['linear'], ['zoom'], 4, 5, 10, 4.5, 16, 4];

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
      id: trailCasingLayerId,
      type: 'line',
      source: sourceId,
      filter: trailFilter,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        'line-sort-key': ['get', 'sortKey'],
      },
      paint: {
        'line-color': ['get', 'casingColor'],
        'line-opacity': 1,
        'line-width': trailCasingWidth,
        'line-dasharray': ['literal', [2, 2]],
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
        'line-dasharray': ['literal', [2, 2]],
      },
    }, map.getLayer(destinationMarkerLayerId) ? destinationMarkerLayerId : undefined);
    map.addLayer({
      id: trailPointLayerId,
      type: 'circle',
      source: sourceId,
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-color': ['case', ['==', ['get', 'markerKind'], 'interrupted'], '#ffffff', '#d92d20'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 5, 10, 4.5, 16, 4],
        'circle-stroke-color': '#d92d20',
        'circle-stroke-width': 2,
      },
    }, map.getLayer(destinationMarkerLayerId) ? destinationMarkerLayerId : undefined);
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
      const start = route.coordinates[0];
      if (start !== undefined && route.startMarker !== undefined) features.push(pointFeature(route.id, start, route.startMarker));
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
): Feature<Point> {
  return {
    type: 'Feature',
    properties: { markerKind, routeId },
    geometry: { type: 'Point', coordinates },
  };
}
