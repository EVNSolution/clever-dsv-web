import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { routeCoordinates, routeOrigin, routeStops } from '../../demo/selectors/route';
import type { Coordinate, DemoVehicle } from '../../demo/model';
import { deliveryStopIdFor } from '../../services/control';

export type FocusedStop = {
  deliveryStopId: string;
  vehicleId: string;
  stopNo: number;
  coordinate: Coordinate;
};

export const emptyLines = (): FeatureCollection<LineString> => ({ type: 'FeatureCollection', features: [] });

export function makeRoutes(vehicles: DemoVehicle[], geometries: Record<string, Coordinate[]>): FeatureCollection<LineString, { vehicleId: string }> {
  return { type: 'FeatureCollection', features: vehicles.map((vehicle) => lineFeature(geometries[vehicle.route], vehicle.id)) };
}

export function lineCollection(coordinates: Coordinate[], vehicleId: string): FeatureCollection<LineString, { vehicleId: string }> {
  return { type: 'FeatureCollection', features: [lineFeature(coordinates, vehicleId)] };
}

export function makeStops(vehicles: DemoVehicle[], spotlightVehicle?: DemoVehicle, focusedStop?: FocusedStop): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: vehicles.flatMap((vehicle) => routeCoordinates[vehicle.route].map((coordinate, index) => {
      const sequence = index + 1;
      const selected = vehicle.id === spotlightVehicle?.id;
      const done = sequence <= vehicle.done;
      const next = selected && sequence === Math.min(vehicle.done + 1, routeStops[vehicle.route].length);
      const risk = vehicle.id === 'unload04' && sequence === Math.min(vehicle.done + 1, routeStops[vehicle.route].length);
      const muted = !!spotlightVehicle && !selected;
      const focused = vehicle.id === focusedStop?.vehicleId && sequence === focusedStop.stopNo;
      const color = stopColor(done, muted, risk, next);
      const pinImage = stopPinImage(done, muted, risk, next);
      const sortKey = stopSortKey(focused, next, selected, muted);
      return { type: 'Feature', properties: { vehicleId: vehicle.id, deliveryStopId: deliveryStopIdFor(vehicle.id, sequence), stopNo: sequence, label: String(sequence), color, pinImage, selected, focused, done, next, muted, risk, sortKey }, geometry: { type: 'Point', coordinates: coordinate } } as Feature<Point>;
    })),
  };
}

export function makeDropoffs(vehicle: DemoVehicle | undefined, dropoffs: Record<string, Coordinate[]>, focusedStop?: FocusedStop): FeatureCollection<Point> {
  if (!vehicle) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: (dropoffs[vehicle.route] ?? routeCoordinates[vehicle.route]).flatMap((coordinate, index) => {
      const stopNo = index + 1;
      if (stopNo <= vehicle.done) return [];
      return [{
        type: 'Feature',
        properties: { vehicleId: vehicle.id, stopNo, active: vehicle.id === focusedStop?.vehicleId && stopNo === focusedStop.stopNo },
        geometry: { type: 'Point', coordinates: coordinate },
      } as Feature<Point>];
    }),
  };
}

export function makeVehicles(vehicles: DemoVehicle[], spotlightVehicle?: DemoVehicle): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: vehicles.map((vehicle) => {
      const selected = vehicle.id === spotlightVehicle?.id;
      const coordinates = routeCoordinates[vehicle.route];
      const position = vehicle.done === 0 ? routeOrigin.coordinate : coordinates[Math.min(vehicle.done, coordinates.length - 1)];
      return {
        type: 'Feature',
        properties: { vehicleId: vehicle.id, plate: vehicle.plate, selected, markerImage: selected ? 'vehicle-marker-spotlight' : 'vehicle-marker-default', sortKey: selected ? 5000 : 2000 },
        geometry: { type: 'Point', coordinates: position },
      };
    }),
  };
}

export function selectedProgress(route: Coordinate[], stops: Coordinate[], vehicle: DemoVehicle): { done: Coordinate[]; next: Coordinate[] } {
  const doneStop = vehicle.done > 0 ? stops[Math.min(vehicle.done - 1, stops.length - 1)] : undefined;
  const nextStop = stops[Math.min(vehicle.done, stops.length - 1)];
  const doneIndex = doneStop ? nearestIndex(route, doneStop) : 0;
  const nextIndex = nearestIndex(route, nextStop);
  return { done: doneStop ? route.slice(0, doneIndex + 1) : [], next: route.slice(doneIndex, Math.max(doneIndex + 1, nextIndex) + 1) };
}

function lineFeature(coordinates: Coordinate[], vehicleId: string): Feature<LineString, { vehicleId: string }> {
  return { type: 'Feature', properties: { vehicleId }, geometry: { type: 'LineString', coordinates } };
}

function stopColor(done: boolean, muted: boolean, risk: boolean, next: boolean): string {
  if (done || muted) return '#8e8e93';
  if (risk) return '#d92d20';
  if (next) return '#1f8b4c';
  return '#0066cc';
}

function stopPinImage(done: boolean, muted: boolean, risk: boolean, next: boolean): string {
  if (done) return 'stop-pin-done';
  if (muted) return 'stop-pin-muted';
  if (risk) return 'stop-pin-risk';
  if (next) return 'stop-pin-selected';
  return 'stop-pin-default';
}

function stopSortKey(focused: boolean, next: boolean, selected: boolean, muted: boolean): number {
  if (focused) return 5000;
  if (next) return 4000;
  if (selected) return 3000;
  if (muted) return 1000;
  return 2000;
}

function nearestIndex(route: Coordinate[], target: Coordinate): number {
  return route.reduce((best, coordinate, index) => distanceSquared(coordinate, target) < distanceSquared(route[best], target) ? index : best, 0);
}

function distanceSquared([lng, lat]: Coordinate, [targetLng, targetLat]: Coordinate): number {
  return (lng - targetLng) ** 2 + (lat - targetLat) ** 2;
}
