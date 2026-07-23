import { mapVehicleIdForCustomerVehicle } from './identity';
import type { ManagementAssignmentRelation, RoutePlanStop } from './model';
import { historyForDriver } from './selectors/management';

const sameVehicleAssignments: readonly ManagementAssignmentRelation[] = [
  { id: 'assignment-a', driverId: 'driver-a', vehicleId: 'vehicle-shared', kind: '기본 배정' },
  { id: 'assignment-b', driverId: 'driver-b', vehicleId: 'vehicle-shared', kind: '기본 배정' },
];

const sameDriverAssignments: readonly ManagementAssignmentRelation[] = [
  { id: 'assignment-c', driverId: 'driver-shared', vehicleId: 'vehicle-a', kind: '기본 배정' },
  { id: 'assignment-d', driverId: 'driver-shared', vehicleId: 'vehicle-b', kind: '기본 배정' },
];

const routeHistoryInputs: readonly Pick<RoutePlanStop, 'driverId' | 'vehicleId' | 'deliveryStopId'>[] = [
  { driverId: 'driver-101', vehicleId: 'vehicle-101', deliveryStopId: 'stop-gangnam' },
];

const identityResult: string | undefined = mapVehicleIdForCustomerVehicle('vehicle-330');

void sameVehicleAssignments;
void sameDriverAssignments;
void routeHistoryInputs;
void historyForDriver;
void identityResult;
