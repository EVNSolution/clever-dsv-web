import type { CSSProperties, ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { ChevronRight, Info, X } from 'lucide-react';
import { apiConfig } from '../api/config';
import { loadControlSummary, loadVehicleTemperatureHistory } from '../services/control';
import type { ControlSummary, VehicleTemperatureHistory, VehicleTemperatureSample } from '../services/control';
import { loadDispatchList } from '../services/dispatch';
import type { DispatchListItem } from '../services/dispatch';
import { loadControlManagementSnapshot } from '../services/management';
import type { ManagementData } from '../demo/management';
import { adminCustomerDeliveryPath } from '../app-routes';
import { assignControlDestinationProgress } from '../features/control/control-progress';

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
  onDestinationSelect,
  onVehicleSelect,
  selectedDestinationId,
  selectedVehicleId,
  vehicleColors = new Map(),
}: {
  estimatedArrivalByOrderId?: ReadonlyMap<string, string>;
  onManagementChange?: (management: ManagementData | undefined) => void;
  onOrdersChange?: (orders: DispatchListItem[], serviceDate?: string) => void;
  onDestinationSelect?: (destinationId: string) => void;
  onVehicleSelect?: (vehicleId: string) => void;
  selectedDestinationId?: string;
  selectedVehicleId?: string;
  vehicleColors?: ReadonlyMap<string, string>;
} = {}): ReactElement {
  if (apiConfig.mode === 'remote') {
    return (
      <RemoteControlPage
        estimatedArrivalByOrderId={estimatedArrivalByOrderId}
        onManagementChange={onManagementChange}
        onOrdersChange={onOrdersChange}
        onDestinationSelect={onDestinationSelect}
        onVehicleSelect={onVehicleSelect}
        selectedDestinationId={selectedDestinationId}
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
  onDestinationSelect,
  onVehicleSelect,
  selectedDestinationId,
  selectedVehicleId,
  vehicleColors,
}: {
  estimatedArrivalByOrderId: ReadonlyMap<string, string>;
  onManagementChange?: (management: ManagementData | undefined) => void;
  onOrdersChange?: (orders: DispatchListItem[], serviceDate?: string) => void;
  onDestinationSelect?: (destinationId: string) => void;
  onVehicleSelect?: (vehicleId: string) => void;
  selectedDestinationId?: string;
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
      conditions={management?.conditions ?? []}
      onVehicleSelect={onVehicleSelect}
      onDestinationSelect={onDestinationSelect}
      selectedDestinationId={selectedDestinationId}
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
  conditions = [],
  error = '',
  estimatedArrivalByOrderId = new Map(),
  loading,
  customerOrders,
  orders,
  ordersCount,
  summary,
  vehicles,
  onVehicleSelect,
  onDestinationSelect,
  selectedDestinationId,
  selectedVehicleId,
  vehicleColors = new Map(),
}: {
  conditions?: ManagementData['conditions'];
  error?: string;
  estimatedArrivalByOrderId?: ReadonlyMap<string, string>;
  loading: boolean;
  customerOrders: CustomerOrderGroup[];
  orders: DispatchListItem[];
  ordersCount: number;
  summary?: ControlSummary;
  vehicles: ManagementData['vehicles'];
  onVehicleSelect?: (vehicleId: string) => void;
  onDestinationSelect?: (destinationId: string) => void;
  selectedDestinationId?: string;
  selectedVehicleId?: string;
  vehicleColors?: ReadonlyMap<string, string>;
}): ReactElement {
  const [mobilePanel, setMobilePanel] = useState<MobileControlPanel>();
  const [temperatureVehicle, setTemperatureVehicle] = useState<ManagementData['vehicles'][number]>();
  const [temperatureHistory, setTemperatureHistory] = useState<VehicleTemperatureHistory>();
  const [temperatureLoading, setTemperatureLoading] = useState(false);
  const [temperatureError, setTemperatureError] = useState('');
  const selectedVehicleOrders = selectedVehicleId === undefined
    ? []
    : orders
      .filter((order) => order.vehicleId === selectedVehicleId)
      .sort(compareControlStops);
  const selectedVehicleDestinations = assignControlDestinationProgress(groupControlDestinations(selectedVehicleOrders));
  const vehicleOrderCounts = assignedOrderCountsByVehicle(orders);

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

  useEffect(() => {
    if (!temperatureVehicle) return undefined;
    const controller = new AbortController();
    setTemperatureLoading(true);
    setTemperatureError('');
    setTemperatureHistory(undefined);
    loadVehicleTemperatureHistory(temperatureVehicle.id, controller.signal)
      .then((history) => {
        if (controller.signal.aborted) return;
        setTemperatureHistory({
          ...history,
          samples: recentTemperatureSamples(history.samples),
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setTemperatureError(error instanceof Error ? error.message : '온도 이력을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setTemperatureLoading(false);
      });
    return () => controller.abort();
  }, [temperatureVehicle]);

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
              <span>주문 수 <b>{summary.totalDispatchCount}</b></span>
              <span>미배정 <b>{summary.unassignedCount}</b></span>
            </div>
          ) : null}
          {!loading && !error ? (
            <div className="control-vehicle-list fleet overlay-scroll" id="fleetList">
              {vehicles.map((vehicle) => (
                <div
                  className={`control-vehicle-row${selectedVehicleId === vehicle.id ? ' selected' : ''}`}
                  key={vehicle.id}
                  style={{ '--control-route-color': vehicleColors.get(vehicle.id) ?? '#0066cc' } as CSSProperties}
                >
                  <i aria-hidden="true" />
                  <button
                    aria-pressed={selectedVehicleId === vehicle.id}
                    className="control-vehicle-select"
                    onClick={() => onVehicleSelect?.(vehicle.id)}
                    type="button"
                  >
                    <span><strong>{vehicle.plate || '차량 번호 미등록'}</strong><small>{vehicle.type || '차종 미등록'} {controlVehicleMotionText(vehicle)} {controlVehicleTemperatureText(vehicle, orders, conditions)}</small></span>
                  </button>
                  <em>{vehicleOrderCounts.get(vehicle.id) ?? 0}건</em>
                  <button className="control-temperature-button" type="button" onClick={() => setTemperatureVehicle(vehicle)}>온도</button>
                </div>
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
            <div className="control-destination-columns" aria-hidden="true"><span>배송지</span><span>주문</span><span>예상 도착</span><span>실제 완료</span></div>
            {selectedVehicleDestinations.map((destination) => (
              <div
                aria-selected={selectedDestinationId === destination.destinationId}
                className={`control-destination-row progress-${destination.progressStatus}${selectedDestinationId === destination.destinationId ? ' selected' : ''}`}
                key={destination.destinationId}
                onClick={() => onDestinationSelect?.(destination.destinationId)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onDestinationSelect?.(destination.destinationId);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <i className="control-order-sequence" aria-label={`배송지 순서 ${destination.sequence}`}>{destination.sequence}</i>
                <span>
                  <b>{destination.anchor.destinationDisplayName || '배송지 미등록'}</b>
                  <small>{controlDestinationMeta(destination)}</small>
                </span>
                <span className="control-destination-order-count">
                  <b>{destination.orders.length}건</b>
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
      {temperatureVehicle ? (
        <VehicleTemperatureDialog
          error={temperatureError}
          history={temperatureHistory}
          loading={temperatureLoading}
          onClose={() => setTemperatureVehicle(undefined)}
          vehicle={temperatureVehicle}
        />
      ) : null}
    </aside>
  );
}

function VehicleTemperatureDialog({
  error,
  history,
  loading,
  onClose,
  vehicle,
}: {
  error: string;
  history?: VehicleTemperatureHistory;
  loading: boolean;
  onClose: () => void;
  vehicle: ManagementData['vehicles'][number];
}): ReactElement {
  return (
    <div className="temperature-dialog-backdrop" role="presentation">
      <section className="temperature-dialog" role="dialog" aria-modal="true" aria-labelledby="temperatureDialogTitle">
        <header>
          <span>
            <strong id="temperatureDialogTitle">{vehicle.plate || '차량 번호 미등록'} 온도</strong>
            <small>최근 24시간, 5분 수집 포인트</small>
          </span>
          <button type="button" aria-label="온도 이력 닫기" onClick={onClose}><X aria-hidden="true" /></button>
        </header>
        {loading ? <div className="temperature-dialog-state" role="status">온도 이력을 불러오는 중입니다.</div> : null}
        {error ? <div className="temperature-dialog-state error" role="alert">{error}</div> : null}
        {!loading && !error && history ? <TemperatureChart samples={history.samples} /> : null}
      </section>
    </div>
  );
}

function TemperatureChart({ samples }: { samples: VehicleTemperatureSample[] }): ReactElement {
  const channels = [
    { key: 'temperatureA' as const, label: 'A 채널', color: 'var(--color-primary)' },
    { key: 'temperatureB' as const, label: 'B 채널', color: 'var(--color-risk)' },
  ];
  const values = samples.flatMap((sample) => [sample.temperatureA, sample.temperatureB]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!samples.length || !values.length) return <div className="temperature-dialog-state">표시할 온도 데이터가 없습니다.</div>;
  const width = 560;
  const height = 260;
  const padding = { bottom: 34, left: 44, right: 18, top: 20 };
  const timestamps = samples.map((sample) => new Date(sample.observedAt).getTime()).filter((value) => !Number.isNaN(value));
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const minValue = Math.floor(Math.min(...values) - 1);
  const maxValue = Math.ceil(Math.max(...values) + 1);
  const xFor = (observedAt: string): number => {
    const timestamp = new Date(observedAt).getTime();
    if (maxTime === minTime || Number.isNaN(timestamp)) return padding.left;
    return padding.left + ((timestamp - minTime) / (maxTime - minTime)) * (width - padding.left - padding.right);
  };
  const yFor = (value: number): number => {
    if (maxValue === minValue) return height / 2;
    return padding.top + ((maxValue - value) / (maxValue - minValue)) * (height - padding.top - padding.bottom);
  };
  const yTicks = [minValue, Math.round((minValue + maxValue) / 2), maxValue];
  const xTicks = [samples[0], samples[Math.floor(samples.length / 2)], samples[samples.length - 1]].filter((sample, index, list) => sample && list.findIndex((item) => item?.observedAt === sample.observedAt) === index);
  return (
    <div className="temperature-chart">
      <div className="temperature-legend" aria-hidden="true">
        {channels.map((channel) => <span key={channel.key}><i style={{ background: channel.color }} />{channel.label}</span>)}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="최근 24시간 차량 온도 A 채널과 B 채널 꺾은선 차트">
        <title>최근 24시간 차량 온도 이력</title>
        <desc>A 채널과 B 채널을 5분 수집 포인트와 꺾은선으로 표시합니다.</desc>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line className="temperature-grid-line" x1={padding.left} x2={width - padding.right} y1={yFor(tick)} y2={yFor(tick)} />
            <text className="temperature-axis-label" x={padding.left - 8} y={yFor(tick) + 4} textAnchor="end">{tick}℃</text>
          </g>
        ))}
        <line className="temperature-axis-line" x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} />
        <line className="temperature-axis-line" x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} />
        {xTicks.map((sample) => (
          <text className="temperature-axis-label" key={sample.observedAt} x={xFor(sample.observedAt)} y={height - 10} textAnchor="middle">{formatTemperatureAxisTime(sample.observedAt)}</text>
        ))}
        {channels.map((channel) => {
          const points = samples
            .filter((sample) => typeof sample[channel.key] === 'number' && Number.isFinite(sample[channel.key]))
            .map((sample) => ({ sample, value: sample[channel.key] as number, x: xFor(sample.observedAt), y: yFor(sample[channel.key] as number) }));
          const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
          return (
            <g key={channel.key}>
              {points.length > 1 ? <polyline className="temperature-line" fill="none" points={line} stroke={channel.color} /> : null}
              {points.map((point) => (
                <circle className="temperature-point" cx={point.x} cy={point.y} fill={channel.color} key={`${channel.key}-${point.sample.observedAt}`} r="3.2">
                  <title>{`${formatTemperatureTooltipTime(point.sample.observedAt)} ${channel.label} ${point.value.toFixed(1)}℃`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
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

function assignedOrderCountsByVehicle(orders: DispatchListItem[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const order of orders) {
    if (order.assignmentStatus !== 'ASSIGNED' || order.vehicleId === null) continue;
    counts.set(order.vehicleId, (counts.get(order.vehicleId) ?? 0) + 1);
  }
  return counts;
}

function controlVehicleTemperatureText(
  vehicle: ManagementData['vehicles'][number],
  orders: DispatchListItem[],
  conditions: ManagementData['conditions'],
): string {
  if (vehicle.temperatureStale === true) {
    const pairText = controlTemperaturePairText(vehicle);
    return pairText === '온도 미수신' ? '온도 지연 미수신' : `온도 지연 ${pairText}`;
  }
  const pairText = controlTemperaturePairText(vehicle);
  const policies = vehicleTemperaturePolicies(vehicle.id, orders, conditions);
  if (policies.length === 0 || pairText === '온도 미수신') return pairText;
  const minimums = policies.map((policy) => policy.temperatureMinC).filter((value): value is number => value !== null);
  const maximums = policies.map((policy) => policy.temperatureMaxC).filter((value): value is number => value !== null);
  const minimum = minimums.length === 0 ? null : Math.max(...minimums);
  const maximum = maximums.length === 0 ? null : Math.min(...maximums);
  if (minimum !== null && maximum !== null && minimum > maximum) return `온도 기준 충돌 ${pairText}`;
  const readings = [vehicle.temperatureA, vehicle.temperatureB]
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const outsidePolicy = readings.some((value) => (minimum !== null && value < minimum) || (maximum !== null && value > maximum));
  return `${outsidePolicy ? '온도 이탈' : '온도 정상'} ${pairText}`;
}

function vehicleTemperaturePolicies(
  vehicleId: string,
  orders: DispatchListItem[],
  conditions: ManagementData['conditions'],
): ManagementData['conditions'] {
  const conditionCodes = new Set(
    orders
      .filter((order) => order.assignmentStatus === 'ASSIGNED' && order.vehicleId === vehicleId && order.conditionCode !== null)
      .map((order) => order.conditionCode!.trim().toUpperCase()),
  );
  return conditions.filter((condition) => condition.temperatureAlertEnabled && conditionCodes.has(condition.code.trim().toUpperCase()));
}

function recentTemperatureSamples(samples: VehicleTemperatureSample[]): VehicleTemperatureSample[] {
  const latest = samples.reduce((max, sample) => {
    const timestamp = new Date(sample.observedAt).getTime();
    return Number.isNaN(timestamp) ? max : Math.max(max, timestamp);
  }, 0);
  if (latest === 0) return [];
  const cutoff = latest - 24 * 60 * 60 * 1000;
  return samples
    .filter((sample) => {
      const timestamp = new Date(sample.observedAt).getTime();
      return !Number.isNaN(timestamp) && timestamp >= cutoff && timestamp <= latest;
    })
    .sort((left, right) => new Date(left.observedAt).getTime() - new Date(right.observedAt).getTime());
}

function formatTemperatureAxisTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(date);
}

function formatTemperatureTooltipTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(date);
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
