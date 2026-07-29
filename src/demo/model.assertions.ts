import type { ManagementAssignmentRelation } from './model';

const sameVehicleAssignments: readonly ManagementAssignmentRelation[] = [
  { id: 'assignment-a', driverId: 'driver-a', vehicleId: 'vehicle-shared', kind: '기본 배정' },
  { id: 'assignment-b', driverId: 'driver-b', vehicleId: 'vehicle-shared', kind: '기본 배정' },
];

const sameDriverAssignments: readonly ManagementAssignmentRelation[] = [
  { id: 'assignment-c', driverId: 'driver-shared', vehicleId: 'vehicle-a', kind: '기본 배정' },
  { id: 'assignment-d', driverId: 'driver-shared', vehicleId: 'vehicle-b', kind: '기본 배정' },
];

void sameVehicleAssignments;
void sameDriverAssignments;
