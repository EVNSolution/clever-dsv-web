import { demoCustomerId, demoDeliveryDate, demoOrderKey, devDb } from '../data';
import type { DeliveryStatus, Driver, Order, OrderItem, RouteEngineProvider, StatusTone, Vehicle } from '../model';

export type RouteEngineConfig = {
  provider: RouteEngineProvider;
  endpoint: string;
};

export type CargoViewModel = {
  name: string;
  quantity: string;
};

export type StopViewModel = {
  sequence: number;
  customerName: string;
  address: string;
  tone: StatusTone;
  statusLabel: DeliveryStatus;
  eta: string;
  cargo: CargoViewModel[];
};

export type ControlPageViewModel = {
  customerName: string;
  routeEngine: RouteEngineConfig;
  fleet: {
    id: string;
    plate: string;
    driver: string;
    statusKey: 'completed' | 'moving' | 'loading';
    statusLabel: string;
    chip: StatusTone;
    eta: string;
  }[];
  order: OrderDetailViewModel;
};

export type OrderDetailViewModel = {
  id: string;
  orderKey: string;
  title: string;
  routeName: string;
  isMultiVehicle: boolean;
  vehicles: {
    id: string;
    label: string;
    plate: string;
    driver: string;
    tone: StatusTone;
    statusLabel: DeliveryStatus;
  }[];
  selectedVehicle: {
    id: string;
    label: string;
    plate: string;
    driver: string;
    tone: StatusTone;
    remainingTime: string;
    arrivalEta: string;
    dwellUnloadEstimate: string;
    destinations: StopViewModel[];
    cargo: CargoViewModel[];
  };
};

export function getControlPage(): ControlPageViewModel {
  const customer = devDb.customers.find((entry) => entry.id === demoCustomerId);
  return {
    customerName: customer?.name ?? 'CLEVER - 고객사 Demo',
    routeEngine: getRouteEngine(),
    fleet: buildFleet(),
    order: getOrderDetail(demoOrderKey),
  };
}

export function getCustomerInquiryPage(customerId = demoCustomerId, dayOffset = 0, orderKey?: string, selectedVehicleId?: string) {
  const requestedCustomer = devDb.customers.find((entry) => entry.id === customerId);
  const customer = requestedCustomer && getCustomerOrders(requestedCustomer.id).length
    ? requestedCustomer
    : devDb.customers.find((entry) => entry.id === demoCustomerId);
  const selectedDate = demoDeliveryDate(Number.isFinite(dayOffset) ? dayOffset : 0);
  const orders = getCustomerOrders(customer?.id ?? demoCustomerId)
    .filter((order) => order.deliveryDate === selectedDate);
  const selectedOrderKey = orders.find((order) => order.orderKey === orderKey)?.orderKey
    ?? orders[0]?.orderKey;
  return {
    customerId: customer?.id ?? demoCustomerId,
    customerName: customer?.name ?? 'CLEVER - 고객사 Demo',
    routeEngine: getRouteEngine(),
    selectedDate,
    dayOffset,
    dateOptions: [
      { dayOffset: -1, label: '전일', date: demoDeliveryDate(-1) },
      { dayOffset: 0, label: '금일', date: demoDeliveryDate(0) },
      { dayOffset: 1, label: '익일', date: demoDeliveryDate(1) },
    ],
    orders,
    order: selectedOrderKey ? getOrderDetail(selectedOrderKey, selectedVehicleId) : undefined,
  };
}

export function getCustomerOrders(customerId: string) {
  return devDb.orders
    .filter((order) => order.customerId === customerId)
    .map((order) => ({
      orderKey: order.orderKey,
      title: order.title,
      routeName: order.routeName,
      status: order.status,
      deliveryDate: order.deliveryDate,
      requestedAt: order.requestedAt,
      stopCount: visibleStops(order).length,
    }));
}

export function getOrderDetail(orderKey: string, preferredVehicleId?: string): OrderDetailViewModel {
  const order = mustOrder(orderKey);
  const visibleRouteStops = devDb.routePlanStops
    .filter((routeStop) => routeStop.orderId === order.id)
    .filter((routeStop) => visibleStops(order).some((stop) => stop.id === routeStop.deliveryStopId))
    .sort((left, right) => left.plannedSequence - right.plannedSequence);

  const vehicles = Array.from(new Set(visibleRouteStops.map((routeStop) => routeStop.vehicleId)))
    .map((vehicleId) => {
      const vehicle = mustVehicle(vehicleId);
      const driver = mustDriverByVehicle(vehicleId);
      return {
        id: vehicle.id,
        label: vehicle.label,
        plate: vehicle.plate,
        driver: driver.name,
        tone: statusTone(vehicle.status),
        statusLabel: vehicle.status,
      };
    });

  const currentRouteStop = visibleRouteStops.find((routeStop) => statusTone(mustStop(routeStop.deliveryStopId).status) === 'green') ?? visibleRouteStops[0];
  const selectedVehicleId = vehicles.some((vehicle) => vehicle.id === preferredVehicleId) ? preferredVehicleId : (currentRouteStop?.vehicleId ?? vehicles[0]?.id);
  if (!selectedVehicleId) throw new Error(`No vehicle assigned to order ${orderKey}`);
  const selectedVehicle = mustVehicle(selectedVehicleId);
  const selectedDriver = mustDriverByVehicle(selectedVehicleId);
  const selectedRouteStops = visibleRouteStops.filter((routeStop) => routeStop.vehicleId === selectedVehicleId);
  const selectedCurrentRouteStop = selectedRouteStops.find((routeStop) => statusTone(mustStop(routeStop.deliveryStopId).status) === 'green') ?? selectedRouteStops[0];
  const selectedStops = selectedRouteStops.map((routeStop, index) => buildStopViewModel(routeStop.deliveryStopId, index));

  return {
    id: order.id,
    orderKey: order.orderKey,
    title: order.title,
    routeName: order.routeName,
    isMultiVehicle: vehicles.length > 1,
    vehicles,
    selectedVehicle: {
      id: selectedVehicle.id,
      label: selectedVehicle.label,
      plate: selectedVehicle.plate,
      driver: selectedDriver.name,
      tone: statusTone(selectedVehicle.status),
      remainingTime: selectedCurrentRouteStop?.remainingTime ?? '대기',
      arrivalEta: selectedCurrentRouteStop?.arrivalEta ?? '일정 없음',
      dwellUnloadEstimate: selectedCurrentRouteStop?.dwellUnloadEstimate ?? '하차 정보 없음',
      destinations: selectedStops,
      cargo: selectedStops.flatMap((stop) => stop.cargo),
    },
  };
}

export function getOperationsPage() {
  return { summary: '배차/업로드 작업은 dev DB 주문 모델에서 준비됩니다.', pendingOrders: getCustomerOrders(demoCustomerId).length };
}

export function getHistoryPage() {
  return { recentOrders: getCustomerOrders(demoCustomerId) };
}

export function getSettingsPage() {
  return { routeEngine: getRouteEngine(), users: devDb.customerUsers.filter((user) => user.customerId === demoCustomerId) };
}

function getRouteEngine(): RouteEngineConfig {
  const prodEndpoint = import.meta.env.VITE_CLEVER_OSRM_ENDPOINT || '/api/osrm-engine';
  return import.meta.env.DEV
    ? { provider: 'public-osrm-dev', endpoint: 'https://router.project-osrm.org' }
    : { provider: 'clever-route-server-prod', endpoint: prodEndpoint };
}

function buildFleet(): ControlPageViewModel['fleet'] {
  return devDb.vehicles.map((vehicle) => {
    const driver = mustDriverByVehicle(vehicle.id);
    return {
      id: vehicle.id,
      plate: vehicle.plate,
      driver: driver.name,
      statusKey: statusKey(vehicle.status),
      statusLabel: statusText(vehicle.status),
      chip: statusTone(vehicle.status),
      eta: fleetEta(vehicle),
    };
  });
}

function buildStopViewModel(deliveryStopId: string, index: number): StopViewModel {
  const stop = mustStop(deliveryStopId);
  const cargo = stop.itemIds
    .map((itemId) => devDb.orderItems.find((item) => item.id === itemId))
    .filter((item): item is OrderItem => item !== undefined)
    .filter((item) => item.customerId === stop.customerId)
    .map((item) => ({ name: item.name, quantity: item.quantity }));

  return {
    sequence: index + 1,
    customerName: stop.customerName,
    address: stop.address,
    tone: statusTone(stop.status),
    statusLabel: stop.status,
    eta: stop.eta,
    cargo,
  };
}

function visibleStops(order: Order) {
  return devDb.deliveryStops.filter((stop) => stop.orderId === order.id && stop.customerId === order.customerId);
}

function statusTone(status: DeliveryStatus): StatusTone {
  if (status === 'completed') return 'gray';
  if (status === 'current') return 'green';
  return 'blue';
}

function statusKey(status: DeliveryStatus): 'completed' | 'moving' | 'loading' {
  if (status === 'completed') return 'completed';
  if (status === 'current') return 'moving';
  return 'loading';
}

function statusText(status: DeliveryStatus): string {
  if (status === 'completed') return '완료';
  if (status === 'current') return '배송중';
  return '대기';
}

function fleetEta(vehicle: Vehicle): string {
  if (vehicle.status === 'completed') return '완료 오후 04:33';
  if (vehicle.id === 'vehicle-330') return '24초';
  if (vehicle.id === 'vehicle-303') return '1분 05초';
  if (vehicle.id === 'vehicle-207') return '1분 06초';
  return '1분 00초';
}

function mustOrder(orderKey: string): Order {
  const order = devDb.orders.find((entry) => entry.orderKey === orderKey);
  if (!order) throw new Error(`Unknown order: ${orderKey}`);
  return order;
}

function mustVehicle(vehicleId: string): Vehicle {
  const vehicle = devDb.vehicles.find((entry) => entry.id === vehicleId);
  if (!vehicle) throw new Error(`Unknown vehicle: ${vehicleId}`);
  return vehicle;
}

function mustDriverByVehicle(vehicleId: string): Driver {
  const routePlanStop = devDb.routePlanStops.find((entry) => entry.vehicleId === vehicleId);
  const driver = routePlanStop ? devDb.drivers.find((entry) => entry.id === routePlanStop.driverId) : undefined;
  if (!driver) throw new Error(`Unknown driver for vehicle: ${vehicleId}`);
  return driver;
}

function mustStop(deliveryStopId: string) {
  const stop = devDb.deliveryStops.find((entry) => entry.id === deliveryStopId);
  if (!stop) throw new Error(`Unknown stop: ${deliveryStopId}`);
  return stop;
}
