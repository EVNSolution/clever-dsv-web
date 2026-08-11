import type { ManagementVehicle } from '../../demo/management';
import type { DispatchListItem } from '../../services/dispatch';

export type ControlVehicleVisibility = 'ALL' | 'WITH_ORDERS';

const controlVehiclePalette = [
  '#0072b2',
  '#d55e00',
  '#009e73',
  '#cc79a7',
  '#e69f00',
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
  return new Map([...vehicleIds].sort().map((vehicleId, index) => [
    vehicleId,
    controlVehiclePalette[index % controlVehiclePalette.length],
  ]));
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
  vehicleColors: ReadonlyMap<string, string>,
): string {
  return vehicleColors.get(vehicleId) ?? controlVehicleColor(vehicleId);
}
