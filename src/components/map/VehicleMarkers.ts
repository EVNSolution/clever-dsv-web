import type { FeatureCollection, Point } from 'geojson';
import maplibregl from 'maplibre-gl';
import type { MapCanvasVehiclePoint } from '../MapCanvas';

const sourceId = 'operational-vehicles';
const markerLayerId = 'operational-vehicle-markers';
const markerImageId = 'vehicle-marker-default';
const markerAssetUrl = '/map/vehicle-marker-default.svg';

let markerImagePromise: Promise<HTMLImageElement> | undefined;

export async function updateVehicleMarkers(
  map: maplibregl.Map,
  vehicles: MapCanvasVehiclePoint[],
): Promise<void> {
  await registerMarkerImage(map);
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, { type: 'geojson', data: vehicleFeatures([]) });
    map.addLayer({
      id: markerLayerId,
      type: 'symbol',
      source: sourceId,
      layout: {
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-image': markerImageId,
        'icon-offset': [30, 0],
        'icon-size': 1,
        'text-allow-overlap': true,
        'text-anchor': 'left',
        'text-field': ['get', 'label'],
        'text-ignore-placement': true,
        'text-offset': [3.1, 0],
        'text-size': 11,
      },
      paint: {
        'text-color': '#1d1d1f',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
      },
    });
  }
  (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(vehicleFeatures(vehicles));
}

function vehicleFeatures(vehicles: MapCanvasVehiclePoint[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: vehicles.map((vehicle) => ({
      type: 'Feature',
      properties: {
        label: vehicle.label,
        vehicleId: vehicle.id,
      },
      geometry: {
        type: 'Point',
        coordinates: [vehicle.longitude, vehicle.latitude],
      },
    })),
  };
}

async function registerMarkerImage(map: maplibregl.Map): Promise<void> {
  if (map.hasImage(markerImageId)) return;
  const image = await loadMarkerImage();
  if (!map.hasImage(markerImageId)) map.addImage(markerImageId, image);
}

function loadMarkerImage(): Promise<HTMLImageElement> {
  markerImagePromise ??= new Promise((resolve, reject) => {
    const image = new Image(64, 64);
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error('Vehicle marker asset failed to load')), { once: true });
    image.src = markerAssetUrl;
  });
  return markerImagePromise;
}
