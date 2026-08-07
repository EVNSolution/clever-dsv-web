import type { ManagementVehicle } from '../../demo/management';
import type { DispatchListItem } from '../../services/dispatch';

export type ControlVehicleVisibility = 'ALL' | 'WITH_ORDERS';

export const CONTROL_VEHICLE_NO_ORDERS_COLOR = '#8e8e93';

const controlVehiclePalette = [
  '#0066cc',
  '#c4458f',
  '#d56b1d',
  '#6f52b5',
  '#007f78',
  '#c4493d',
  '#8a5a44',
  '#2b7a9b',
  '#7a7f00',
  '#b33f62',
  '#4b6cb7',
  '#aa5a00',
  '#008f5a',
  '#7b4fa3',
  '#b84c8a',
  '#4e7d2a',
] as const;

export function controlVehicleOrderCounts(orders: DispatchListItem[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const order of orders) {
    if (order.assignmentStatus !== 'ASSIGNED' || order.vehicleId === null) continue;
    counts.set(order.vehicleId, (counts.get(order.vehicleId) ?? 0) + 1);
  }
  return counts;
}

export function controlVehicleColor(vehicleId: string): string {
  let hash = 0;
  for (const character of vehicleId) hash = Math.imul(hash, 31) + character.charCodeAt(0) | 0;
  return controlVehiclePalette[(hash >>> 0) % controlVehiclePalette.length];
}

export function controlVehicleColorMap(
  vehicles: ManagementVehicle[],
  orders: DispatchListItem[],
): ReadonlyMap<string, string> {
  const vehicleIds = new Set(vehicles.map((vehicle) => vehicle.id));
  for (const order of orders) {
    if (order.vehicleId !== null) vehicleIds.add(order.vehicleId);
  }
  return new Map([...vehicleIds].map((vehicleId) => [vehicleId, controlVehicleColor(vehicleId)]));
}

export function visibleControlVehicles(
  vehicles: ManagementVehicle[],
  orderCounts: ReadonlyMap<string, number>,
  visibility: ControlVehicleVisibility,
): ManagementVehicle[] {
  return visibility === 'ALL'
    ? vehicles
    : vehicles.filter((vehicle) => (orderCounts.get(vehicle.id) ?? 0) > 0);
}

export function controlVehicleDisplayColor(
  vehicleId: string,
  orderCounts: ReadonlyMap<string, number>,
  vehicleColors: ReadonlyMap<string, string>,
): string {
  return (orderCounts.get(vehicleId) ?? 0) > 0
    ? vehicleColors.get(vehicleId) ?? controlVehicleColor(vehicleId)
    : CONTROL_VEHICLE_NO_ORDERS_COLOR;
}
