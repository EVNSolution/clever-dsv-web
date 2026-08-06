import type { CSSProperties, ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, X } from 'lucide-react';
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
type TemperatureConditionBand = {
  code: string;
  color: string;
  label: string;
  maximum: number;
  minimum: number;
};

const mobileControlQuery = '(max-width: 768px)';
const temperatureConditionPalette = ['#0066cc', '#e87514', '#6f42c1', '#0f8a82', '#c23373', '#8a5a00'];
const temperatureConditionSignatureColors = new Map([
  ['AMBIENT', '#e87514'],
  ['COLD', '#0066cc'],
  ['TS03', '#6f42c1'],
]);

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
  const [serviceDateFilter, setServiceDateFilter] = useState<string>();

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
        const nextSummary = await loadControlSummary(serviceDateFilter, summaryController.signal);
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
  }, [onManagementChange, onOrdersChange, serviceDateFilter]);

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
      conditions={management?.conditions ?? []}
      drivers={management?.drivers ?? []}
      onVehicleSelect={onVehicleSelect}
      onDestinationSelect={onDestinationSelect}
      onServiceDateChange={setServiceDateFilter}
      selectedDestinationId={selectedDestinationId}
      selectedServiceDate={serviceDateFilter}
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
  conditions = [],
  drivers = [],
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
  onServiceDateChange,
  selectedDestinationId,
  selectedServiceDate,
  selectedVehicleId,
  vehicleColors = new Map(),
}: {
  assignments?: ManagementData['assignments'];
  conditions?: ManagementData['conditions'];
  drivers?: ManagementData['drivers'];
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
  onServiceDateChange?: (serviceDate: string) => void;
  selectedDestinationId?: string;
  selectedServiceDate?: string;
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
      <label className="control-date-picker">
        <span className="control-date-picker-label"><CalendarDays aria-hidden="true" />관제 기준일</span>
        <strong>{formatControlServiceDate(selectedServiceDate ?? summary?.serviceDate ?? todayInSeoul())}</strong>
        <span className="control-date-picker-action">날짜 변경</span>
        <input
          aria-label="관제 기준일"
          disabled={onServiceDateChange === undefined}
          max={todayInSeoul()}
          onChange={(event) => {
            if (event.currentTarget.value !== '') onServiceDateChange?.(event.currentTarget.value);
          }}
          type="date"
          value={selectedServiceDate ?? summary?.serviceDate ?? todayInSeoul()}
        />
      </label>
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
              <span>주문 수 <b>{summary.totalDispatchCount}</b></span>
              <span>미배정 <b>{summary.unassignedCount}</b></span>
            </div>
          ) : null}
          {!loading && !error ? (
            <div className="control-vehicle-list fleet overlay-scroll" id="fleetList">
              {vehicles.map((vehicle) => {
                const driverNames = controlVehicleDriverNames(vehicle.id, orders, drivers, assignments);
                const conditionLabels = controlVehicleConditionLabels(vehicle.id, orders, conditions);
                const specialInstructions = controlVehicleSpecialInstructions(vehicle.id, orders);
                return <div
                  className={`control-vehicle-row${selectedVehicleId === vehicle.id ? ' selected' : ''}`}
                  key={vehicle.id}
                  style={{ '--control-route-color': vehicleColors.get(vehicle.id) ?? '#0066cc' } as CSSProperties}
                >
                  <i aria-hidden="true" />
                  <button
                    aria-expanded={selectedVehicleId === vehicle.id}
                    aria-pressed={selectedVehicleId === vehicle.id}
                    className="control-vehicle-select"
                    onClick={() => onVehicleSelect?.(vehicle.id)}
                    type="button"
                  >
                    <span><strong>{vehicle.plate || '차량 번호 미등록'}</strong></span>
                    <ChevronDown aria-hidden="true" className="control-row-chevron" />
                  </button>
                  <em>{vehicleOrderCounts.get(vehicle.id) ?? 0}건</em>
                  <button className="control-temperature-button" type="button" onClick={() => setTemperatureVehicle(vehicle)}>온도</button>
                  {selectedVehicleId === vehicle.id ? (
                    <div className="control-detail-card control-vehicle-details" id={`control-vehicle-details-${vehicle.id}`}>
                      <span><small>차종</small><b className="control-detail-value">{vehicle.type || '차종 미등록'}</b></span>
                      <span><small>운행</small><b className="control-detail-value">{controlVehicleMotionText(vehicle)}</b></span>
                      <span><small>운전자</small><b className="control-detail-value">{driverNames.join(', ')}</b></span>
                      <span className="control-vehicle-detail-wide"><small>운송 조건</small><b className="control-detail-value">{conditionLabels.join(', ')}</b></span>
                      <span className="control-vehicle-detail-wide">
                        <small>배송 특이사항</small>
                        {specialInstructions.length ? (
                          <ul className="control-detail-list">
                            {specialInstructions.map((instruction) => (
                              <li key={instruction.id}><strong>{instruction.destination}</strong><span>{instruction.note}</span></li>
                            ))}
                          </ul>
                        ) : <b className="control-detail-value">특이사항 없음</b>}
                      </span>
                    </div>
                  ) : null}
                </div>
              })}
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
                aria-expanded={selectedDestinationId === destination.destinationId}
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
                <span className="control-destination-summary">
                  <b>{destination.anchor.destinationDisplayName || '배송지 미등록'}</b>
                  <ChevronDown aria-hidden="true" className="control-row-chevron" />
                </span>
                <span className="control-destination-order-count">
                  <b>{destination.orders.length}건</b>
                </span>
                <time>{formatControlTime(sharedControlEta(destination.orders, estimatedArrivalByOrderId))}</time>
                <time className={controlDestinationCompletedAt(destination.orders) === null ? 'empty' : 'completed'}>{formatControlTime(controlDestinationCompletedAt(destination.orders))}</time>
                {selectedDestinationId === destination.destinationId ? (
                  <div className="control-detail-card control-destination-details">
                    <div>
                      <small>배송지</small>
                      <b className="control-detail-value">{destination.anchor.destinationDisplayName || '배송지 미등록'}</b>
                    </div>
                    <div className="control-destination-detail-address">
                      <small>주소</small>
                      <b className="control-detail-value">{controlDestinationMeta(destination)}</b>
                    </div>
                    <div className="control-destination-detail-orders">
                      <small>주문 정보</small>
                      <ul>
                        {destination.orders.map((order) => (
                          <li key={order.sellerOrderId}>
                            <strong>{order.sellerOrderKey}</strong>
                            <div className="control-order-meta">
                              <span>운영 상태 {order.conditionCode ?? '미등록'}</span>
                              <span>박스 {order.shippedBoxes === null ? '미등록' : `${order.shippedBoxes}박스`}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
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
          temperatureBands={controlVehicleTemperatureBands(temperatureVehicle.id, orders, conditions)}
          vehicle={temperatureVehicle}
        />
      ) : null}
    </aside>
  );
}

function todayInSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Seoul',
    year: 'numeric',
  }).format(new Date());
}

function formatControlServiceDate(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${year}. ${month}. ${day}.` : value;
}

function VehicleTemperatureDialog({
  error,
  history,
  loading,
  onClose,
  temperatureBands,
  vehicle,
}: {
  error: string;
  history?: VehicleTemperatureHistory;
  loading: boolean;
  onClose: () => void;
  temperatureBands: TemperatureConditionBand[];
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
        {!loading && !error && history ? <TemperatureChart samples={history.samples} temperatureBands={temperatureBands} /> : null}
      </section>
    </div>
  );
}

function TemperatureChart({
  samples,
  temperatureBands,
}: {
  samples: VehicleTemperatureSample[];
  temperatureBands: TemperatureConditionBand[];
}): ReactElement {
  const channels = [
    { key: 'temperatureA' as const, label: 'A 채널', color: 'var(--color-primary)' },
    { key: 'temperatureB' as const, label: 'B 채널', color: 'var(--color-risk)' },
  ];
  const values = samples.flatMap((sample) => [sample.temperatureA, sample.temperatureB]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const timeframe = samples.length ? `${formatTemperatureTooltipTime(samples[0].observedAt)} ~ ${formatTemperatureTooltipTime(samples[samples.length - 1].observedAt)}` : '수집 기록 없음';
  const conditionLegend = temperatureBands.length ? (
    <div className="temperature-condition-legend" aria-label="운영 상태 온도 기준">
      {temperatureBands.map((band) => (
        <span key={band.code}>
          <i aria-hidden="true" style={{ background: band.color }} />
          {`${band.code} ${band.label} ${formatTemperatureValue(band.minimum)}℃ ~ ${formatTemperatureValue(band.maximum)}℃`}
        </span>
      ))}
    </div>
  ) : null;
  if (!samples.length || !values.length) {
    return (
      <div className="temperature-chart">
        <div className="temperature-timeframe" aria-label="온도 수집 시간표">
          <span>조회 시간 <b>{timeframe}</b></span>
          <span>수집 주기 <b>5분</b></span>
        </div>
        {conditionLegend}
        <div className="temperature-dialog-state">표시할 온도 데이터가 없습니다.</div>
      </div>
    );
  }
  const width = 560;
  const height = 260;
  const padding = { bottom: 34, left: 44, right: 18, top: 20 };
  const timestamps = samples.map((sample) => new Date(sample.observedAt).getTime()).filter((value) => !Number.isNaN(value));
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const scaleValues = [...values, ...temperatureBands.flatMap((band) => [band.minimum, band.maximum])];
  const minValue = Math.floor(Math.min(...scaleValues) - 1);
  const maxValue = Math.ceil(Math.max(...scaleValues) + 1);
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
      <div className="temperature-timeframe" aria-label="온도 수집 시간표">
        <span>조회 시간 <b>{timeframe}</b></span>
        <span>수집 주기 <b>5분</b></span>
      </div>
      {conditionLegend}
      <div className="temperature-legend" aria-hidden="true">
        {channels.map((channel) => <span key={channel.key}><i style={{ background: channel.color }} />{channel.label}</span>)}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="최근 24시간 차량 온도 A 채널과 B 채널 꺾은선 차트">
        <title>최근 24시간 차량 온도 이력</title>
        <desc>A 채널과 B 채널을 5분 수집 포인트와 꺾은선으로 표시하고 운영 상태별 온도 범위를 투명 영역으로 구분합니다.</desc>
        {temperatureBands.map((band) => (
          <rect
            className="temperature-condition-band"
            fill={band.color}
            fillOpacity="0.12"
            height={Math.max(1, yFor(band.minimum) - yFor(band.maximum))}
            key={band.code}
            width={width - padding.left - padding.right}
            x={padding.left}
            y={yFor(band.maximum)}
          >
            <title>{`${band.code} ${band.label} ${formatTemperatureValue(band.minimum)}℃ ~ ${formatTemperatureValue(band.maximum)}℃`}</title>
          </rect>
        ))}
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

function controlVehicleDriverNames(
  vehicleId: string,
  orders: DispatchListItem[],
  drivers: ManagementData['drivers'],
  assignments: ManagementData['assignments'],
): string[] {
  const driverIds = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.vehicleId === vehicleId) driverIds.add(assignment.driverId);
  }
  for (const order of orders) {
    if (order.vehicleId === vehicleId && order.driverId !== null) driverIds.add(order.driverId);
  }
  const names = [...driverIds]
    .map((driverId) => drivers.find((driver) => driver.id === driverId)?.name)
    .filter((name): name is string => Boolean(name));
  return names.length ? [...new Set(names)] : ['운전자 정보 없음'];
}

function controlVehicleConditionLabels(
  vehicleId: string,
  orders: DispatchListItem[],
  conditions: ManagementData['conditions'],
): string[] {
  const conditionByCode = new Map(conditions.map((condition) => [condition.code.trim().toUpperCase(), condition]));
  const labels = orders
    .filter((order) => order.vehicleId === vehicleId && order.conditionCode !== null)
    .map((order) => order.conditionCode!.trim().toUpperCase())
    .filter(Boolean)
    .map((code) => {
      const condition = conditionByCode.get(code);
      return condition === undefined || condition.name.trim() === '' ? code : `${code} ${condition.name.trim()}`;
    });
  return labels.length ? [...new Set(labels)] : ['운송 조건 없음'];
}

function controlVehicleTemperatureBands(
  vehicleId: string,
  orders: DispatchListItem[],
  conditions: ManagementData['conditions'],
): TemperatureConditionBand[] {
  const activeCodes = new Set(
    orders
      .filter((order) => order.vehicleId === vehicleId && order.conditionCode !== null)
      .map((order) => order.conditionCode!.trim().toUpperCase())
      .filter(Boolean),
  );
  const conditionByCode = new Map<string, ManagementData['conditions'][number]>();
  for (const condition of conditions) {
    const code = condition.code.trim().toUpperCase();
    if (!activeCodes.has(code) || conditionByCode.has(code)) continue;
    if (
      typeof condition.temperatureMinC === 'number'
      && Number.isFinite(condition.temperatureMinC)
      && typeof condition.temperatureMaxC === 'number'
      && Number.isFinite(condition.temperatureMaxC)
      && condition.temperatureMinC <= condition.temperatureMaxC
    ) conditionByCode.set(code, condition);
  }
  const usedColors = new Set<string>();
  return [...conditionByCode.entries()]
    .sort(([leftCode], [rightCode]) => leftCode.localeCompare(rightCode, 'en'))
    .map(([code, condition], index) => {
      const preferredColor = temperatureConditionSignatureColors.get(code);
      const color = preferredColor && !usedColors.has(preferredColor)
        ? preferredColor
        : temperatureConditionPalette.find((candidate) => !usedColors.has(candidate)) ?? `hsl(${(index * 47) % 360} 62% 42%)`;
      usedColors.add(color);
      return {
        code,
        color,
        label: condition.name.trim() || '명칭 미등록',
        maximum: condition.temperatureMaxC!,
        minimum: condition.temperatureMinC!,
      };
    });
}

function controlVehicleSpecialInstructions(
  vehicleId: string,
  orders: DispatchListItem[],
): Array<{ destination: string; id: string; note: string }> {
  const instructions = new Map<string, { destination: string; id: string; note: string }>();
  for (const order of orders) {
    const note = order.rawNote?.trim();
    if (order.vehicleId !== vehicleId || !note) continue;
    const destination = order.destinationDisplayName?.trim() || order.sellerOrderKey;
    const key = `${order.destinationId}\u0000${note}`;
    if (!instructions.has(key)) instructions.set(key, { destination, id: key, note });
  }
  return [...instructions.values()];
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

function formatTemperatureValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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
