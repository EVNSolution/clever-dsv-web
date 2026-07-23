export {
  getControlPage,
  getCustomerInquiryPage,
  getCustomerOrders,
  getHistoryPage,
  getOperationsPage,
  getOrderDetail,
  getSettingsPage,
} from '../demo/selectors/customer';
export {
  cargoFor,
  controlDemoVehicles,
  demoCouriers,
  demoVehicles,
  dispatchedDemoVehicles,
  routeCoordinates,
  routeOrigin,
  routeStops,
  selectedDemoVehicle,
  stopTone,
  vehicleTone,
  vehiclesForCourier,
  workAreaLabels,
} from '../demo/selectors/route';
export type { Coordinate, DemoCourier, DemoRoute, DemoVehicle } from '../demo/model';
export type {
  CargoViewModel,
  ControlPageViewModel,
  OrderDetailViewModel,
  RouteEngineConfig,
  StopViewModel,
} from '../demo/selectors/customer';
