import { demoCustomerId, demoDeliveryDate, devDb } from '../data';
import type { DeliveryStatus, Order, OrderItem, StatusTone } from '../model';

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

type VehicleViewModel = {
  id: string;
  label: string;
  plate: string;
  driver: string;
  tone: StatusTone;
  statusLabel: DeliveryStatus;
};

export type OrderDetailViewModel = {
  id: string;
  orderKey: string;
  title: string;
  routeName: string;
  isMultiVehicle: boolean;
  vehicles: VehicleViewModel[];
  selectedVehicle?: VehicleViewModel & {
    remainingTime: string;
    arrivalEta: string;
    dwellUnloadEstimate: string;
    destinations: StopViewModel[];
    cargo: CargoViewModel[];
  };
};

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
    customerName: customer?.name ?? '고객사',
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
  const routeStops = devDb.routePlanStops
    .filter((routeStop) => routeStop.orderId === order.id)
    .filter((routeStop) => visibleStops(order).some((stop) => stop.id === routeStop.deliveryStopId))
    .sort((left, right) => left.plannedSequence - right.plannedSequence);
  const vehicles = Array.from(new Set(routeStops.map((routeStop) => routeStop.vehicleId)))
    .flatMap((vehicleId): VehicleViewModel[] => {
      const vehicle = devDb.vehicles.find((entry) => entry.id === vehicleId);
      const routeStop = routeStops.find((entry) => entry.vehicleId === vehicleId);
      const driver = routeStop ? devDb.drivers.find((entry) => entry.id === routeStop.driverId) : undefined;
      if (!vehicle || !driver) return [];
      return [{
        id: vehicle.id,
        label: vehicle.label,
        plate: vehicle.plate,
        driver: driver.name,
        tone: statusTone(vehicle.status),
        statusLabel: vehicle.status,
      }];
    });
  const base: OrderDetailViewModel = {
    id: order.id,
    orderKey: order.orderKey,
    title: order.title,
    routeName: order.routeName,
    isMultiVehicle: vehicles.length > 1,
    vehicles,
  };
  const selectedVehicleId = vehicles.some((vehicle) => vehicle.id === preferredVehicleId)
    ? preferredVehicleId
    : vehicles[0]?.id;
  if (!selectedVehicleId) return base;

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId);
  const selectedRouteStops = routeStops.filter((routeStop) => routeStop.vehicleId === selectedVehicleId);
  if (!selectedVehicle) return base;
  const destinations = selectedRouteStops.map((routeStop, index) => buildStopViewModel(routeStop.deliveryStopId, index));
  const current = selectedRouteStops[0];
  return {
    ...base,
    selectedVehicle: {
      ...selectedVehicle,
      remainingTime: current?.remainingTime ?? '대기',
      arrivalEta: current?.arrivalEta ?? '일정 없음',
      dwellUnloadEstimate: current?.dwellUnloadEstimate ?? '하차 정보 없음',
      destinations,
      cargo: destinations.flatMap((stop) => stop.cargo),
    },
  };
}

function buildStopViewModel(deliveryStopId: string, index: number): StopViewModel {
  const stop = devDb.deliveryStops.find((entry) => entry.id === deliveryStopId);
  if (!stop) throw new Error(`Unknown stop: ${deliveryStopId}`);
  const cargo = stop.itemIds
    .map((itemId) => devDb.orderItems.find((item) => item.id === itemId))
    .filter((item): item is OrderItem => item !== undefined && item.customerId === stop.customerId)
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

function mustOrder(orderKey: string): Order {
  const order = devDb.orders.find((entry) => entry.orderKey === orderKey);
  if (!order) throw new Error(`Unknown order: ${orderKey}`);
  return order;
}
