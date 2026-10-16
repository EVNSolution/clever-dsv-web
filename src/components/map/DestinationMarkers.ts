import type { FeatureCollection, Point } from 'geojson';
import * as maplibregl from 'maplibre-gl';
import type { MapCanvasPoint } from '../MapCanvas';

type PinStatus = NonNullable<MapCanvasPoint['status']> | '';

const sourceId = 'operational-destinations';
const markerLayerId = 'operational-destination-markers';
// lucide MapPin outline (24x24 viewBox), without its inner circle so the stop number can sit in the head.
const mapPinPath = 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0Z';
// Scale 2.2 centers the pin in the 40x52 canvas and puts its tip at y=50, where the icon anchor sits.
const mapPinTransform = [2.2, 0, 0, 2.2, -6.4, 2.04] as const;

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
      const status = point.status ?? '';
      return {
        type: 'Feature',
        properties: {
          color,
          label,
          pinImage: markerImageId(color, label, status),
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
  const markers = new Map<string, { color: string; label: string; status: PinStatus }>();
  for (const point of points) {
    const color = point.color ?? (point.tone === 'assigned' ? '#0066cc' : '#8e8e93');
    const label = point.label ?? '';
    const status = point.status ?? '';
    markers.set(markerImageId(color, label, status), { color, label, status });
  }
  for (const [id, marker] of markers) {
    if (!map.hasImage(id)) {
      map.addImage(id, createStopPinImage(marker.color, marker.label, marker.status), { pixelRatio: 2 });
    }
  }
}

function markerImageId(color: string, label: string, status: PinStatus): string {
  return `stop-pin-${color.replace('#', '').toLowerCase()}-${label || 'blank'}-${status || 'none'}`;
}

function createStopPinImage(color: string, label: string, status: PinStatus): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 104;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  context.scale(2, 2);
  const path = new Path2D();
  path.addPath(new Path2D(mapPinPath), new DOMMatrix([...mapPinTransform]));
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
    context.strokeText(label, 20, 24);
    context.fillText(label, 20, 24);
  }
  if (status !== '') drawStatusBadge(context, color, status);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

// A white disc at the pin's lower right with a check (completed) or an x (failed), like lucide map-pin-check and
// map-pin-x. The shape tells the status when the color is a vehicle color.
function drawStatusBadge(context: CanvasRenderingContext2D, color: string, status: 'completed' | 'failed'): void {
  const x = 32.5;
  const y = 40;
  context.save();
  context.shadowBlur = 3;
  context.shadowColor = 'rgba(0, 0, 0, 0.25)';
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(x, y, 6.5, 0, Math.PI * 2);
  context.fill();
  context.shadowColor = 'transparent';
  context.strokeStyle = color;
  context.lineWidth = 2.2;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  if (status === 'completed') {
    context.moveTo(x - 3, y + 0.3);
    context.lineTo(x - 0.8, y + 2.5);
    context.lineTo(x + 3.2, y - 2.2);
  } else {
    context.moveTo(x - 2.5, y - 2.5);
    context.lineTo(x + 2.5, y + 2.5);
    context.moveTo(x + 2.5, y - 2.5);
    context.lineTo(x - 2.5, y + 2.5);
  }
  context.stroke();
  context.restore();
}
