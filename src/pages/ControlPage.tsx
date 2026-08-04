import type { CSSProperties, ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { ChevronRight, Info } from 'lucide-react';
import { apiConfig } from '../api/config';
import { loadControlSummary } from '../services/control';
import type { ControlSummary } from '../services/control';
import { loadDispatchList } from '../services/dispatch';
import type { DispatchListItem } from '../services/dispatch';
import { loadControlManagementSnapshot } from '../services/management';
import type { ManagementData } from '../demo/management';
import { adminCustomerDeliveryPath } from '../app-routes';

type MobileControlPanel = 'customers' | 'destinations' | 'vehicles';
type CustomerOrderGroup = {
  id: string;
  name: string;
  orders: DispatchListItem[];
};
type ControlDestinationGroup = {
  anchor: DispatchListItem;
  destinationId: string;
  orders: DispatchListItem[];
  sequence: number;
};

const mobileControlQuery = '(max-width: 768px)';

export function ControlPage({
  estimatedArrivalByOrderId = new Map(),
  onOrdersChange,
  onManagementChange,
  onVehicleSelect,
  selectedVehicleId,
  vehicleColors = new Map(),
}: {
  estimatedArrivalByOrderId?: ReadonlyMap<string, string>;
  onManagementChange?: (management: ManagementData | undefined) => void;
  onOrdersChange?: (orders: DispatchListItem[], serviceDate?: string) => void;
  onVehicleSelect?: (vehicleId: string) => void;
  selectedVehicleId?: string;
  vehicleColors?: ReadonlyMap<string, string>;
} = {}): ReactElement {
  if (apiConfig.mode === 'remote') {
    return (
      <RemoteControlPage
        estimatedArrivalByOrderId={estimatedArrivalByOrderId}
        onManagementChange={onManagementChange}
        onOrdersChange={onOrdersChange}
        onVehicleSelect={onVehicleSelect}
        selectedVehicleId={selectedVehicleId}
        vehicleColors={vehicleColors}
      />
    );
  }
  return (
    <ControlPanels
      loading={false}
      customerOrders={[]}
      orders={[]}
      ordersCount={0}
      vehicles={[]}
    />
  );
}

export function ControlPreviewPanels(): ReactElement {
  return (
    <ControlPanels
      loading
      customerOrders={[]}
      orders={[]}
      ordersCount={0}
      vehicles={[]}
    />
  );
}

function RemoteControlPage({
  estimatedArrivalByOrderId,
  onOrdersChange,
  onManagementChange,
  onVehicleSelect,
  selectedVehicleId,
  vehicleColors,
}: {
  estimatedArrivalByOrderId: ReadonlyMap<string, string>;
  onManagementChange?: (management: ManagementData | undefined) => void;
  onOrdersChange?: (orders: DispatchListItem[], serviceDate?: string) => void;
  onVehicleSelect?: (vehicleId: string) => void;
  selectedVehicleId?: string;
  vehicleColors: ReadonlyMap<string, string>;
}): ReactElement {
  const [summary, setSummary] = useState<ControlSummary>();
  const [management, setManagement] = useState<ManagementData>();
  const [orders, setOrders] = useState<DispatchListItem[]>([]);
  const [panelError, setPanelError] = useState('');
  const [panelLoading, setPanelLoading] = useState(true);

  useEffect(() => {
    const summaryController = new AbortController();
    const dispatchController = new AbortController();
    let refreshing = false;
    setPanelLoading(true);
    setPanelError('');
    const refresh = async (initial: boolean) => {
      if (refreshing) return;
      refreshing = true;
      try {
        const nextSummary = await loadControlSummary(summaryController.signal);
        if (summaryController.signal.aborted) return;
        setSummary(nextSummary);
        const [nextManagement, dispatch] = await Promise.all([
          loadControlManagementSnapshot(),
          loadDispatchList(nextSummary.serviceDate, {}, dispatchController.signal),
        ]);
        if (summaryController.signal.aborted || dispatchController.signal.aborted) return;
        setManagement(nextManagement);
        onManagementChange?.(nextManagement);
        setOrders(dispatch.rows);
        onOrdersChange?.(dispatch.rows, nextSummary.serviceDate);
        setPanelError('');
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (initial) {
          setSummary(undefined);
          setManagement(undefined);
          onManagementChange?.(undefined);
          setOrders([]);
          onOrdersChange?.([]);
          setPanelError(error instanceof Error ? error.message : '관제 정보를 불러오지 못했습니다.');
        } else {
          setManagement((current) => markControlTelemetryStale(current));
          onManagementChange?.(undefined);
        }
      } finally {
        refreshing = false;
        if (initial && !summaryController.signal.aborted && !dispatchController.signal.aborted) setPanelLoading(false);
      }
    };
    void refresh(true);
    const refreshTimer = window.setInterval(() => void refresh(false), 30_000);
    return () => {
      window.clearInterval(refreshTimer);
      summaryController.abort();
      dispatchController.abort();
      onManagementChange?.(undefined);
      onOrdersChange?.([]);
    };
  }, [onManagementChange, onOrdersChange]);

  return (
    <ControlPanels
      error={panelError}
      loading={panelLoading}
      customerOrders={groupOrdersByCustomer(orders, management)}
      estimatedArrivalByOrderId={estimatedArrivalByOrderId}
      orders={orders}
      ordersCount={orders.length}
      summary={summary}
      vehicles={scheduledControlVehicles(orders, management)}
      assignments={management?.assignments ?? []}
      onVehicleSelect={onVehicleSelect}
      selectedVehicleId={selectedVehicleId}
      vehicleColors={vehicleColors}
    />
  );
}

function markControlTelemetryStale(management: ManagementData | undefined): ManagementData | undefined {
  if (management === undefined) return undefined;
  return {
    ...management,
    vehicles: management.vehicles.map((vehicle) => ({
      ...vehicle,
      temperatureStale: true,
      vehiclePositionStale: true,
    })),
  };
}

function ControlPanels({
  assignments = [],
  error = '',
  estimatedArrivalByOrderId = new Map(),
  loading,
  customerOrders,
  orders,
  ordersCount,
  summary,
  vehicles,
  onVehicleSelect,
  selectedVehicleId,
  vehicleColors = new Map(),
}: {
  assignments?: ManagementData['assignments'];
  error?: string;
  estimatedArrivalByOrderId?: ReadonlyMap<string, string>;
  loading: boolean;
  customerOrders: CustomerOrderGroup[];
  orders: DispatchListItem[];
  ordersCount: number;
  summary?: ControlSummary;
  vehicles: ManagementData['vehicles'];
  onVehicleSelect?: (vehicleId: string) => void;
  selectedVehicleId?: string;
  vehicleColors?: ReadonlyMap<string, string>;
}): ReactElement {
  const [mobilePanel, setMobilePanel] = useState<MobileControlPanel>();
  const selectedVehicleOrders = selectedVehicleId === undefined
    ? []
    : orders
      .filter((order) => order.vehicleId === selectedVehicleId)
      .sort(compareControlStops);
  const selectedVehicleDestinations = groupControlDestinations(selectedVehicleOrders);

  useEffect(() => {
    const compactViewport = window.matchMedia(mobileControlQuery);
    const closeOutsideMobile = (event: MediaQueryListEvent) => {
      if (!event.matches) setMobilePanel(undefined);
    };
    compactViewport.addEventListener('change', closeOutsideMobile);
    return () => compactViewport.removeEventListener('change', closeOutsideMobile);
  }, []);

  useEffect(() => {
    setMobilePanel((current) => {
      if (selectedVehicleId !== undefined && current === 'customers') return undefined;
      if (selectedVehicleId === undefined && current === 'destinations') return undefined;
      return current;
    });
  }, [selectedVehicleId]);

  useEffect(() => {
    const panelOpen = window.matchMedia(mobileControlQuery).matches && mobilePanel !== undefined;
    document.body.classList.toggle('mobile-control-panel-open', panelOpen);
    if (!panelOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobilePanel(undefined);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.body.classList.remove('mobile-control-panel-open');
    };
  }, [mobilePanel]);

  return (
    <aside className={`side control-side${mobilePanel ? ' mobile-panel-active' : ''}`} aria-label="관제 운영 패널">
      <div className={`panel-view ${selectedVehicleId === undefined ? 'vehicle-idle' : 'vehicle-focused'}${mobilePanel ? ' mobile-panel-open' : ''}`}>
        <section className={`card panel expand-card mobile-panel-${mobilePanel === 'vehicles' ? 'expanded' : 'collapsed'}`} id="vehicleCard" aria-label="차량 리스트">
          <div className="tab-line section-heading">
            <span className="desktop-panel-title">차량 리스트</span>
            <button className="mobile-panel-toggle" type="button" aria-expanded={mobilePanel === 'vehicles'} aria-label={`차량 리스트 ${mobilePanel === 'vehicles' ? '닫기' : '펼치기'}`} onClick={() => setMobilePanel((current) => current === 'vehicles' ? undefined : 'vehicles')}>
              <span>차량 리스트</span><span className="chip mini">{vehicles.length}대</span><span className="mobile-panel-action">{mobilePanel === 'vehicles' ? '닫기' : '펼치기'}</span>
            </button>
            <span className="card-tools desktop-panel-tools"><span className="chip mini">{vehicles.length}대</span></span>
          </div>
          {loading ? <div className="panel-state" role="status">차량을 불러오는 중입니다.</div> : null}
          {error ? <div className="panel-state error" role="alert">{error}</div> : null}
          {summary && !loading && !error ? (
            <div className="control-summary-strip" role="status" aria-label="지원되는 관제 요약">
              <span>기준일 <b>{summary.serviceDate}</b></span>
              <span>배차 <b>{summary.totalDispatchCount}</b></span>
              <span>미배정 <b>{summary.unassignedCount}</b></span>
            </div>
          ) : null}
          {!loading && !error ? (
            <div className="control-vehicle-list fleet overlay-scroll" id="fleetList">
              {vehicles.map((vehicle) => (
                <button
                  aria-pressed={selectedVehicleId === vehicle.id}
                  className={`control-vehicle-row${selectedVehicleId === vehicle.id ? ' selected' : ''}`}
                  key={vehicle.id}
                  onClick={() => onVehicleSelect?.(vehicle.id)}
                  style={{ '--control-route-color': vehicleColors.get(vehicle.id) ?? '#0066cc' } as CSSProperties}
                  type="button"
                >
                  <i aria-hidden="true" />
                  <span><strong>{vehicle.plate || '차량 번호 미등록'}</strong><small>{vehicle.type || '차종 미등록'} {controlVehicleMotionText(vehicle)} {controlVehicleTemperatureText(vehicle)}</small></span>
                  <em>{assignments.some((assignment) => assignment.vehicleId === vehicle.id) ? '배차 준비' : '배송원 미배정'}</em>
                </button>
              ))}
              {!vehicles.length ? <div className="panel-state">차량이 없습니다.</div> : null}
            </div>
          ) : null}
        </section>

        {selectedVehicleId !== undefined ? <section className={`card panel expand-card mobile-panel-${mobilePanel === 'destinations' ? 'expanded' : 'collapsed'}`} id="destinationCard" aria-label="배송지 리스트">
          <div className="tab-line section-heading">
            <span className="destination-title desktop-panel-title">배송지 리스트</span>
            <button className="mobile-panel-toggle" type="button" aria-expanded={mobilePanel === 'destinations'} aria-label={`배송지 리스트 ${mobilePanel === 'destinations' ? '닫기' : '펼치기'}`} onClick={() => setMobilePanel((current) => current === 'destinations' ? undefined : 'destinations')}>
              <span>배송지 리스트</span><span className="chip mini">{selectedVehicleDestinations.length}곳</span><span className="mobile-panel-action">{mobilePanel === 'destinations' ? '닫기' : '펼치기'}</span>
            </button>
            <span className="chip mini desktop-panel-tools">{selectedVehicleDestinations.length}곳</span>
          </div>
          <div className="control-destination-list overlay-scroll">
            <div className="control-destination-columns" aria-hidden="true"><span>배송지</span><span /><span>예상 도착</span><span>실제 완료</span></div>
            {selectedVehicleDestinations.map((destination) => (
              <div className="control-destination-row" key={destination.destinationId}>
                <i className="control-order-sequence" aria-label={`배송지 순서 ${destination.sequence}`}>{destination.sequence}</i>
                <span>
                  <b>{destination.anchor.destinationDisplayName || '배송지 미등록'}</b>
                  <small>{controlDestinationMeta(destination)}</small>
                </span>
                <span className="control-order-info" tabIndex={0} aria-label={`주문 정보 ${destination.orders.length}건`}>
                  <Info aria-hidden="true" />
                  <span className="control-order-tooltip" role="tooltip">
                    <strong>주문 정보</strong>
                    <ul>
                      {destination.orders.map((order) => (
                        <li key={order.sellerOrderId}>{controlOrderSummary(order)}</li>
                      ))}
                    </ul>
                  </span>
                </span>
                <time>{formatControlTime(sharedControlEta(destination.orders, estimatedArrivalByOrderId))}</time>
                <time className={controlDestinationCompletedAt(destination.orders) === null ? 'empty' : 'completed'}>{formatControlTime(controlDestinationCompletedAt(destination.orders))}</time>
              </div>
            ))}
            {!selectedVehicleDestinations.length ? <div className="panel-state">선택한 차량에 배정된 배송지가 없습니다.</div> : null}
          </div>
        </section> : null}

        {selectedVehicleId === undefined ? <section className={`card panel expand-card mobile-panel-${mobilePanel === 'customers' ? 'expanded' : 'collapsed'}`} id="customerCard" aria-label="고객사별 주문 리스트">
          <div className="tab-line section-heading">
            <span className="destination-title desktop-panel-title">고객사별 주문</span>
            <button className="mobile-panel-toggle" type="button" aria-expanded={mobilePanel === 'customers'} aria-label={`고객사별 주문 ${mobilePanel === 'customers' ? '닫기' : '펼치기'}`} onClick={() => setMobilePanel((current) => current === 'customers' ? undefined : 'customers')}>
              <span>고객사별 주문</span><span className="chip mini">{ordersCount}건</span><span className="mobile-panel-action">{mobilePanel === 'customers' ? '닫기' : '펼치기'}</span>
            </button>
            <span className="chip mini desktop-panel-tools">{ordersCount}건</span>
          </div>
          <div className="control-customer-order-list stops overlay-scroll" id="customerList">
            {customerOrders.map((group) => (
              <a
                aria-label={`${group.name} 고객사 조회 화면으로 이동`}
                className="control-customer-order-group"
                href={customerInquiryHref(group.id, summary?.serviceDate)}
                key={group.id}
              >
                <span className="control-customer-order-name">
                  <strong>{group.name}</strong>
                  <small>클릭하여 고객사 조회 화면으로 이동</small>
                </span>
                <span className="control-customer-order-meta">
                  <span>{group.orders.length}건</span>
                  <time>{customerFirstEta(group.orders, estimatedArrivalByOrderId)}</time>
                </span>
                <ChevronRight aria-hidden="true" />
              </a>
            ))}
            {!loading && !error && !customerOrders.length ? <div className="panel-state">등록된 고객사 주문이 없습니다.</div> : null}
          </div>
        </section> : null}
      </div>
    </aside>
  );
}

function groupOrdersByCustomer(orders: DispatchListItem[], management?: ManagementData): CustomerOrderGroup[] {
  const names = new Map(management?.customers.map((customer) => [customer.id, customer.name]) ?? []);
  const groups = new Map<string, DispatchListItem[]>();
  for (const order of orders) groups.set(order.customerId, [...(groups.get(order.customerId) ?? []), order]);
  return [...groups].map(([id, groupedOrders]) => ({ id, name: names.get(id) ?? '고객사 미등록', orders: groupedOrders }));
}

function groupControlDestinations(orders: DispatchListItem[]): ControlDestinationGroup[] {
  const groups = new Map<string, DispatchListItem[]>();
  for (const order of orders) groups.set(order.destinationId, [...(groups.get(order.destinationId) ?? []), order]);
  return [...groups.entries()]
    .map(([destinationId, groupedOrders]) => {
      const sortedOrders = [...groupedOrders].sort(compareControlStops);
      return { anchor: sortedOrders[0], destinationId, orders: sortedOrders };
    })
    .sort((left, right) => compareControlStops(left.anchor, right.anchor))
    .map((destination, index) => ({ ...destination, sequence: index + 1 }));
}

function scheduledControlVehicles(orders: DispatchListItem[], management?: ManagementData): ManagementData['vehicles'] {
  if (!management || orders.length === 0) return [];
  const scheduledVehicleIds = new Set(
    orders
      .filter((order) => order.assignmentStatus === 'ASSIGNED' && order.vehicleId !== null)
      .map((order) => order.vehicleId),
  );
  return management.vehicles.filter((vehicle) => scheduledVehicleIds.has(vehicle.id));
}

function controlVehicleTemperatureText(vehicle: ManagementData['vehicles'][number]): string {
  if (vehicle.temperatureStale === true) {
    const pairText = controlTemperaturePairText(vehicle);
    return pairText === '온도 미수신' ? '온도 지연 미수신' : `온도 지연 ${pairText}`;
  }
  return controlTemperaturePairText(vehicle);
}

function controlVehicleMotionText(vehicle: ManagementData['vehicles'][number]): string {
  if (vehicle.vehiclePositionStale === true) return '위치 지연';
  if (vehicle.vehicleStopped === true) return '정차';
  if (vehicle.vehicleStopped === false) return '이동';
  return '운행 미확인';
}

function controlTemperaturePairText(vehicle: ManagementData['vehicles'][number]): string {
  const temperatureA = controlTemperatureText(vehicle.temperatureA);
  const temperatureB = controlTemperatureText(vehicle.temperatureB);
  if (temperatureA === '미수신' && temperatureB === '미수신') return '온도 미수신';
  return `A ${temperatureA} B ${temperatureB}`;
}

function controlTemperatureText(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}℃` : '미수신';
}

function customerFirstEta(orders: DispatchListItem[], configuredEtas: ReadonlyMap<string, string>): string {
  const first = [...orders].sort((left, right) => {
    const leftEta = controlEtaTimestamp(left, configuredEtas);
    const rightEta = controlEtaTimestamp(right, configuredEtas);
    if (leftEta !== rightEta) return leftEta - rightEta;
    const leftSequence = left.routeStopSequence ?? Number.MAX_SAFE_INTEGER;
    const rightSequence = right.routeStopSequence ?? Number.MAX_SAFE_INTEGER;
    if (leftSequence !== rightSequence) return leftSequence - rightSequence;
    return left.sellerOrderKey.localeCompare(right.sellerOrderKey, 'ko');
  })[0];
  if (!first) return '-';
  return formatControlTime(controlEta(first, configuredEtas));
}

function sharedControlEta(orders: DispatchListItem[], configuredEtas: ReadonlyMap<string, string>): string | null {
  return [...orders]
    .map((order) => controlEta(order, configuredEtas))
    .filter((value): value is string => value !== null)
    .sort((left, right) => controlTimeValue(left) - controlTimeValue(right))[0] ?? null;
}

function controlDestinationCompletedAt(orders: DispatchListItem[]): string | null {
  if (orders.some((order) => order.actualCompletedAt === null)) return null;
  return [...orders]
    .map((order) => order.actualCompletedAt)
    .filter((value): value is string => value !== null)
    .sort((left, right) => controlTimeValue(right) - controlTimeValue(left))[0] ?? null;
}

function controlDestinationMeta(destination: ControlDestinationGroup): string {
  return destination.anchor.destinationAddress || destination.anchor.sellerOrderKey;
}

function controlOrderSummary(order: DispatchListItem): string {
  const condition = order.conditionCode ?? '조건 미등록';
  const boxes = order.shippedBoxes === null ? '박스 수 미등록' : `${order.shippedBoxes}박스`;
  return `${condition} - ${boxes}`;
}

function controlEtaTimestamp(order: DispatchListItem, configuredEtas: ReadonlyMap<string, string>): number {
  const eta = controlEta(order, configuredEtas);
  if (!eta) return Number.MAX_SAFE_INTEGER;
  const timestamp = new Date(eta).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function controlTimeValue(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function controlEta(order: DispatchListItem, configuredEtas: ReadonlyMap<string, string>): string | null {
  return order.estimatedArrivalAt ?? configuredEtas.get(order.sellerOrderId) ?? null;
}

function formatControlTime(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(date);
}

function compareControlStops(left: DispatchListItem, right: DispatchListItem): number {
  const sequenceOrder = (left.routeStopSequence ?? Number.MAX_SAFE_INTEGER) - (right.routeStopSequence ?? Number.MAX_SAFE_INTEGER);
  if (sequenceOrder !== 0) return sequenceOrder;
  return left.sellerOrderKey.localeCompare(right.sellerOrderKey, 'ko');
}

function customerInquiryHref(customerId: string, serviceDate?: string): string {
  const query = new URLSearchParams({ customer: customerId });
  if (serviceDate !== undefined) query.set('serviceDate', serviceDate);
  return `${adminCustomerDeliveryPath}?${query.toString()}`;
}
