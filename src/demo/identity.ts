type CustomerVehicleMapVehicleRelation = {
  customerVehicleId: string;
  mapVehicleId: string;
};

type DriverHistoryProjectionRelation = {
  managementDriverId: string;
  routeDriverId: string;
  routeVehicleId: string;
  mapVehicleId: string;
};

export const customerVehicleMapVehicleRelations: readonly CustomerVehicleMapVehicleRelation[] = [
  { customerVehicleId: 'vehicle-330', mapVehicleId: 'proof11' },
] as const;

// Current Drivers page delivery-history projection: explicit seeded crossings only.
export const driverHistoryProjectionRelations: readonly DriverHistoryProjectionRelation[] = [
  { managementDriverId: 'c06', routeDriverId: 'driver-204', routeVehicleId: 'vehicle-204', mapVehicleId: 'final12' },
  { managementDriverId: 'c10', routeDriverId: 'driver-303', routeVehicleId: 'vehicle-303', mapVehicleId: 'to10' },
  { managementDriverId: 'c11', routeDriverId: 'driver-207', routeVehicleId: 'vehicle-207', mapVehicleId: 'delay07' },
  { managementDriverId: 'c12', routeDriverId: 'driver-330', routeVehicleId: 'vehicle-330', mapVehicleId: 'proof11' },
  { managementDriverId: 'c13', routeDriverId: 'driver-101', routeVehicleId: 'vehicle-101', mapVehicleId: 'complete12' },
] as const;

export function mapVehicleIdForCustomerVehicle(customerVehicleId: string): string | undefined {
  return customerVehicleMapVehicleRelations.find((relation) => relation.customerVehicleId === customerVehicleId)?.mapVehicleId;
}

export function driverHistoryRelationsForManagementDriver(managementDriverId: string): readonly DriverHistoryProjectionRelation[] {
  return driverHistoryProjectionRelations.filter((relation) => relation.managementDriverId === managementDriverId);
}
