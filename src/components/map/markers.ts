import vehicleMarkerDefaultSvg from '../../assets/vehicle-marker-default.svg?raw';
import vehicleMarkerSpotlightSvg from '../../assets/vehicle-marker-spotlight.svg?raw';

const stopPinPath = 'M20 50C20 50 4 31.5 4 18C4 9.16 11.16 2 20 2s16 7.16 16 16c0 13.5-16 32-16 32Z';
const routeStartIconPath = 'M10 3.2 3.5 8.4v8.1h4v-5h5v5h4V8.4L10 3.2Z';

export type MarkerImageDefinition = {
  id: string;
  image: ImageData;
  options?: { pixelRatio: number };
};

export function markerImageDefinitions(): MarkerImageDefinition[] {
  return [
    { id: 'origin-store-marker', image: createOriginStoreMarker(), options: { pixelRatio: 2 } },
    { id: 'vehicle-marker-default', image: rasterizeVehicleMarker(vehicleMarkerDefaultSvg) },
    { id: 'vehicle-marker-spotlight', image: rasterizeVehicleMarker(vehicleMarkerSpotlightSvg) },
    { id: 'stop-pin-default', image: createStopPinImage('#0066cc'), options: { pixelRatio: 2 } },
    { id: 'stop-pin-selected', image: createStopPinImage('#1f8b4c'), options: { pixelRatio: 2 } },
    { id: 'stop-pin-muted', image: createStopPinImage('#8e8e93'), options: { pixelRatio: 2 } },
    { id: 'stop-pin-done', image: createStopPinImage('#8e8e93'), options: { pixelRatio: 2 } },
    { id: 'stop-pin-risk', image: createStopPinImage('#d92d20'), options: { pixelRatio: 2 } },
  ];
}

function createOriginStoreMarker(): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = 60;
  canvas.height = 76;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  context.scale(2, 2);
  context.shadowBlur = 6;
  context.shadowColor = 'rgba(0,0,0,.3)';
  context.shadowOffsetY = 3;
  context.fillStyle = '#008060';
  context.strokeStyle = '#ffffff';
  context.lineWidth = 2;
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(11, 25);
  context.lineTo(15, 34);
  context.lineTo(19, 25);
  context.closePath();
  context.fill();
  context.stroke();
  context.beginPath();
  context.arc(15, 15, 14, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.shadowColor = 'transparent';
  context.save();
  context.translate(7.5, 7.5);
  context.scale(0.75, 0.75);
  context.fillStyle = '#ffffff';
  context.fill(new Path2D(routeStartIconPath));
  context.restore();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function rasterizeVehicleMarker(svg: string): ImageData {
  const svgDocument = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const color = svgDocument.querySelector('circle')?.getAttribute('fill') ?? '#C3C6BF';
  const vehiclePath = svgDocument.querySelector('path')?.getAttribute('d');
  if (!vehiclePath) throw new Error('Vehicle marker path unavailable');
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  context.save();
  context.shadowBlur = 6;
  context.shadowColor = 'rgba(0,0,0,.18)';
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
  context.fill(new Path2D(vehiclePath));
  context.restore();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function createStopPinImage(color: string): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 104;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  context.scale(2, 2);
  const path = new Path2D(stopPinPath);
  context.fillStyle = color;
  context.strokeStyle = '#ffffff';
  context.lineWidth = 3.2;
  context.lineJoin = 'round';
  context.fill(path);
  context.stroke(path);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}
