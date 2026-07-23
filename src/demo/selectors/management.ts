import { demoVehicles, devDb } from '../data';
import { driverHistoryRelationsForManagementDriver } from '../identity';

export type DriverDeliveryHistoryRow = {
  vehicleId: string;
  plate: string;
  destination: string;
  completedAt: string;
};

export function vehiclesForDriver<TVehicle extends { id: string }>(vehicles: readonly TVehicle[], assignments: readonly { driverId: string; vehicleId: string }[], driverId: string): TVehicle[] {
  const ids = new Set(assignments.filter((item) => item.driverId === driverId).map((item) => item.vehicleId));
  return vehicles.filter((item) => ids.has(item.id));
}

export function historyForDriver(driverId: string): DriverDeliveryHistoryRow[] {
  return driverHistoryRelationsForManagementDriver(driverId).flatMap((relation) => {
    const hasRoutePlanFact = devDb.routePlanStops.some((routePlanStop) => (
      routePlanStop.driverId === relation.routeDriverId
      && routePlanStop.vehicleId === relation.routeVehicleId
    ));
    const vehicle = hasRoutePlanFact ? demoVehicles.find((entry) => entry.id === relation.mapVehicleId) : undefined;
    if (!vehicle?.actualArrivals?.length) return [];

    return vehicle.history
      .slice(0, Math.min(vehicle.done, vehicle.actualArrivals.length))
      .map((destination, index) => ({
        vehicleId: vehicle.id,
        plate: vehicle.plate,
        destination,
        completedAt: vehicle.actualArrivals?.[index] ?? '',
      }));
  });
}
