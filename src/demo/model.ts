// Frontend demo projection types only. These are not backend domain models and not API DTOs.
type InProgressDeliveryStatus = `cur${'rent'}`;

export type DeliveryStatus = 'planned' | InProgressDeliveryStatus | 'completed';
export type StatusTone = 'blue' | 'green' | 'gray';
export type RouteEngineProvider = 'public-osrm-dev' | 'clever-route-server-prod';

export type Customer = {
  id: string;
  name: string;
  billingCode: string;
};

export type CustomerUser = {
  id: string;
  customerId: string;
  name: string;
  role: 'admin' | 'dispatcher' | 'viewer';
  email: string;
};

export type Order = {
  id: string;
  customerId: string;
  orderKey: string;
  title: string;
  routeName: string;
  status: DeliveryStatus;
  deliveryDate: string;
  requestedAt: string;
};

export type OrderItem = {
  id: string;
  orderId: string;
  customerId: string;
  name: string;
  quantity: string;
  temperatureBand: 'ambient' | 'cold' | 'frozen';
};

export type DeliveryStop = {
  id: string;
  orderId: string;
  customerId: string;
  stopNo: number;
  customerName: string;
  address: string;
  status: DeliveryStatus;
  eta: string;
  itemIds: string[];
};

export type Vehicle = {
  id: string;
  plate: string;
  label: string;
  type: 'refrigerated-truck' | 'wing-body' | 'emergency-van';
  status: DeliveryStatus;
};

export type Driver = {
  id: string;
  name: string;
  phone: string;
  baseArea: string;
};

export type RoutePlanStop = {
  id: string;
  orderId: string;
  vehicleId: string;
  driverId: string;
  deliveryStopId: string;
  plannedSequence: number;
  remainingTime: string;
  arrivalEta: string;
  dwellUnloadEstimate: string;
};

export type ProofMedia = {
  id: string;
  orderId: string;
  deliveryStopId: string;
  kind: 'photo' | 'signature';
  label: string;
  capturedAt?: string;
};

export type DevDb = {
  customers: Customer[];
  customerUsers: CustomerUser[];
  orders: Order[];
  orderItems: OrderItem[];
  deliveryStops: DeliveryStop[];
  routePlanStops: RoutePlanStop[];
  vehicles: Vehicle[];
  drivers: Driver[];
  proofMedia: ProofMedia[];
};

export type DemoCourier = {
  id: string;
  name: string;
  avatar: string;
  age: number;
  gender: string;
  career: string;
  zone: string;
  score: string;
  traits: string[];
};

export type DemoVehicle = {
  id: string;
  plate: string;
  route: DemoRoute;
  courierId: string;
  location: string;
  eta: string;
  status: '상차' | '이동중' | '하차중' | '완료';
  routeStartedAt: string | null;
  actualArrivals?: string[];
  done: number;
  history: string[];
};

export type DemoRoute = 'gangnam' | 'west' | 'songpa' | 'central' | 'south';
export type Coordinate = [number, number];

export type ManagementAssignmentRelation = {
  id: string;
  driverId: string;
  vehicleId: string;
  kind: string;
};
