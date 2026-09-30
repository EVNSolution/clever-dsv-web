import type { FeatureCollection, Point } from 'geojson';
import * as maplibregl from 'maplibre-gl';
import type { MapCanvasPoint } from '../MapCanvas';

const sourceId = 'operational-destinations';
const markerLayerId = 'operational-destination-markers';
const stopPinPath = 'M20 50C20 50 4 31.5 4 18C4 9.16 11.16 2 20 2s16 7.16 16 16c0 13.5-16 32-16 32Z';

export function updateDestinationMarkers(
  map: maplibregl.Map,
  points: MapCanvasPoint[],
  selectedIds: Set<string>,
  showEveryPoint: boolean,
  onSelect: (pointId: string) => void,
): void {
  registerMarkerImages(map, points);
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, { type: 'geojson', data: destinationFeatures([], new Set()) });
    map.addLayer({
      id: markerLayerId,
      type: 'symbol',
      source: sourceId,
      layout: {
        'icon-allow-overlap': false,
        'icon-anchor': 'bottom',
        'icon-ignore-placement': false,
        'icon-image': ['get', 'pinImage'],
        'icon-optional': false,
        'icon-padding': 2,
        'icon-size': 0.62,
        'symbol-sort-key': ['get', 'sortKey'],
      },
    });
    map.on('mouseenter', markerLayerId, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', markerLayerId, () => {
      map.getCanvas().style.cursor = '';
    });
    map.on('click', markerLayerId, (event) => {
      const pointId = event.features?.[0]?.properties?.pointId;
      if (typeof pointId === 'string') onSelect(pointId);
    });
  }
  const showEveryMarker = showEveryPoint || selectedIds.size > 0;
  map.setLayoutProperty(markerLayerId, 'icon-allow-overlap', showEveryMarker);
  map.setLayoutProperty(markerLayerId, 'icon-ignore-placement', showEveryMarker);
  (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(destinationFeatures(points, selectedIds));
}

function destinationFeatures(
  points: MapCanvasPoint[],
  selectedIds: Set<string>,
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => {
      const selected = selectedIds.has(point.id);
      const sortOrder = point.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const color = point.color ?? (point.tone === 'assigned' ? '#0066cc' : '#8e8e93');
      const label = point.label ?? '';
      return {
        type: 'Feature',
        properties: {
          color,
          label,
          pinImage: markerImageId(color, label),
          pointId: point.id,
          // With overlap enabled, higher sort keys render on top. Negating the
          // stop sequence therefore draws later stops first and stop 1 last.
          sortKey: selected ? -sortOrder : sortOrder,
        },
        geometry: {
          type: 'Point',
          coordinates: [point.longitude, point.latitude],
        },
      };
    }),
  };
}

function registerMarkerImages(map: maplibregl.Map, points: MapCanvasPoint[]): void {
  const markers = new Map<string, { color: string; label: string }>();
  for (const point of points) {
    const color = point.color ?? (point.tone === 'assigned' ? '#0066cc' : '#8e8e93');
    const label = point.label ?? '';
    markers.set(markerImageId(color, label), { color, label });
  }
  for (const [id, marker] of markers) {
    if (!map.hasImage(id)) {
      map.addImage(id, createStopPinImage(marker.color, marker.label), { pixelRatio: 2 });
    }
  }
}

function markerImageId(color: string, label: string): string {
  return `stop-pin-${color.replace('#', '').toLowerCase()}-${label || 'blank'}`;
}

function createStopPinImage(color: string, label: string): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 104;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  context.scale(2, 2);
  const path = new Path2D(stopPinPath);
  context.fillStyle = color;
  context.strokeStyle = '#ffffff';
  context.lineJoin = 'round';
  context.lineWidth = 3.2;
  context.shadowBlur = 4;
  context.shadowColor = `${color}66`;
  context.shadowOffsetY = 2;
  context.fill(path);
  context.shadowColor = 'transparent';
  context.stroke(path);
  if (label !== '') {
    const fontSize = label.length >= 3 ? 13 : label.length === 2 ? 16 : 17;
    context.fillStyle = '#ffffff';
    context.font = `700 ${fontSize}px Pretendard, sans-serif`;
    context.lineJoin = 'round';
    context.lineWidth = 1.4;
    context.strokeStyle = 'rgba(0, 0, 0, 0.32)';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.strokeText(label, 20, 18.5);
    context.fillText(label, 20, 18.5);
  }
  return context.getImageData(0, 0, canvas.width, canvas.height);
}
