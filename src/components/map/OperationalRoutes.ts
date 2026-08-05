import type { FeatureCollection, LineString } from 'geojson';
import maplibregl from 'maplibre-gl';
import type { MapCanvasRoute } from '../MapCanvas';

const sourceId = 'operational-routes';
const casingLayerId = 'operational-route-casing';
const routeLayerId = 'operational-route-lines';
const destinationMarkerLayerId = 'operational-destination-markers';

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
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        'line-sort-key': ['get', 'sortKey'],
      },
      paint: {
        'line-color': ['get', 'casingColor'],
        'line-opacity': ['case', ['get', 'selected'], 0.96, 0.82],
        'line-width': ['case', ['get', 'selected'], 4.6, 3.6],
      },
    }, map.getLayer(destinationMarkerLayerId) ? destinationMarkerLayerId : undefined);
    map.addLayer({
      id: routeLayerId,
      type: 'line',
      source: sourceId,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        'line-sort-key': ['get', 'sortKey'],
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-opacity': ['case', ['get', 'selected'], 0.96, 0.74],
        'line-width': ['case', ['get', 'selected'], 2.6, 1.8],
      },
    }, map.getLayer(destinationMarkerLayerId) ? destinationMarkerLayerId : undefined);
  }
  (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(routeFeatures(routes));
}

function routeFeatures(routes: MapCanvasRoute[]): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: routes
      .filter((route) => route.coordinates.length > 1)
      .map((route) => ({
        type: 'Feature',
        properties: {
          casingColor: route.casingColor ?? '#ffffff',
          color: route.color,
          routeId: route.id,
          selected: route.selected === true,
          sortKey: (route.selected === true ? 100 : 0) + (route.sortOrder ?? 0),
        },
        geometry: {
          type: 'LineString',
          coordinates: route.coordinates,
        },
      })),
  };
}
