import type { FeatureCollection, Point } from 'geojson';
import maplibregl from 'maplibre-gl';
import type { MapCanvasVehiclePoint } from '../MapCanvas';

const sourceId = 'operational-vehicles';
const markerLayerId = 'operational-vehicle-markers';
const labelLayerId = 'operational-vehicle-labels';
const markerColor = '#c3c6bf';
const markerPixelRatio = 2;
const vehicleIconPath = 'M20 8H17V4H3C1.9 4 1 4.9 1 6V17H3C3 18.66 4.34 20 6 20C7.66 20 9 18.66 9 17H15C15 18.66 16.34 20 18 20C19.66 20 21 18.66 21 17H23V12L20 8ZM19.5 9.5L21.46 12H17V9.5H19.5ZM6 18C5.45 18 5 17.55 5 17C5 16.45 5.45 16 6 16C6.55 16 7 16.45 7 17C7 17.55 6.55 18 6 18ZM8.22 15C7.67 14.39 6.89 14 6 14C5.11 14 4.33 14.39 3.78 15H3V6H15V15H8.22ZM18 18C17.45 18 17 17.55 17 17C17 16.45 17.45 16 18 16C18.55 16 19 16.45 19 17C19 17.55 18.55 18 18 18Z';

export async function updateVehicleMarkers(
  map: maplibregl.Map,
  vehicles: MapCanvasVehiclePoint[],
  onVehicleSelect?: (vehicleId: string, coordinate: [number, number]) => void,
): Promise<void> {
  for (const vehicle of vehicles) registerMarkerImage(map, vehicle.color);
  registerMarkerImage(map);
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, { type: 'geojson', data: vehicleFeatures([]) });
    map.addLayer({
      id: markerLayerId,
      type: 'symbol',
      source: sourceId,
      layout: {
        'icon-allow-overlap': true,
        'icon-anchor': 'center',
        'icon-ignore-placement': true,
        'icon-image': ['get', 'markerImageId'],
        'icon-size': 1,
      },
    });
    map.addLayer({
      id: labelLayerId,
      type: 'symbol',
      source: sourceId,
      layout: {
        'text-allow-overlap': true,
        'text-anchor': 'bottom',
        'text-field': ['get', 'label'],
        'text-ignore-placement': true,
        'text-justify': 'center',
        'text-offset': [0, -1.08],
        'text-size': 12,
      },
      paint: {
        'text-color': '#1d1d1f',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2.2,
      },
    });
    map.on('click', markerLayerId, (event) => {
      const feature = event.features?.[0];
      const vehicleId = feature?.properties?.vehicleId;
      if (typeof vehicleId !== 'string' || feature?.geometry.type !== 'Point') return;
      const [longitude, latitude] = feature.geometry.coordinates;
      if (typeof longitude !== 'number' || typeof latitude !== 'number') return;
      onVehicleSelect?.(vehicleId, [longitude, latitude]);
    });
    map.on('mouseenter', markerLayerId, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', markerLayerId, () => { map.getCanvas().style.cursor = ''; });
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
        markerImageId: markerImageId(vehicle.color),
        vehicleId: vehicle.id,
      },
      geometry: {
        type: 'Point',
        coordinates: [vehicle.longitude, vehicle.latitude],
      },
    })),
  };
}

function registerMarkerImage(map: maplibregl.Map, color?: string): void {
  const imageId = markerImageId(color);
  if (map.hasImage(imageId)) return;
  map.addImage(imageId, createVehicleMarkerImage(validMarkerColor(color)), { pixelRatio: markerPixelRatio });
}

function markerImageId(color?: string): string {
  return color === undefined ? 'vehicle-marker-default' : `vehicle-marker-${validMarkerColor(color).slice(1).toLowerCase()}`;
}

function validMarkerColor(color?: string): string {
  return typeof color === 'string' && /^#[0-9a-f]{6}$/iu.test(color) ? color : markerColor;
}

function createVehicleMarkerImage(color: string): ImageData {
  const size = 64 * markerPixelRatio;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  context.scale(markerPixelRatio, markerPixelRatio);

  context.save();
  context.shadowBlur = 6;
  context.shadowColor = 'rgba(0, 0, 0, 0.18)';
  context.shadowOffsetY = 2;
  context.fillStyle = color;
  context.strokeStyle = '#ffffff';
  context.lineWidth = 2;
  context.beginPath();
  context.arc(32, 32, 18, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();

  context.save();
  context.translate(20, 20);
  context.fillStyle = '#000000';
  context.fill(new Path2D(vehicleIconPath));
  context.restore();

  return context.getImageData(0, 0, size, size);
}
