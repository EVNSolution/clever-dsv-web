import type { ManagementAssignmentRelation } from './model';

const oneToOneDefaultAssignments: readonly ManagementAssignmentRelation[] = [
  { id: 'assignment-a', driverId: 'driver-a', vehicleId: 'vehicle-a', kind: '기본 배정' },
  { id: 'assignment-b', driverId: 'driver-b', vehicleId: 'vehicle-b', kind: '기본 배정' },
];

void oneToOneDefaultAssignments;
