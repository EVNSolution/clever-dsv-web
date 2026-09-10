import type { CSSProperties, ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, LocateFixed, Pause, Play, RotateCcw, X } from 'lucide-react';
import { apiConfig } from '../api/config';
import { loadControlSummary, loadVehicleTemperatureHistory } from '../services/control';
import type { ControlSummary, VehicleTemperatureHistory, VehicleTemperatureSample } from '../services/control';
import { loadDispatchList } from '../services/dispatch';
import type { DispatchListItem } from '../services/dispatch';
import { loadControlManagementSnapshot } from '../services/management';
import type { ManagementData } from '../demo/management';
import { adminCustomerDeliveryPath } from '../app-routes';
import { assignControlDestinationProgress } from '../features/control/control-progress';
import { ServiceDateSelector, todayInSeoul } from '../components/ServiceDateSelector';
import {
  controlVehicleDisplayColor,
  controlVehicleOrderCounts,
  visibleControlVehicles,
} from '../features/control/control-vehicles';
import type { ControlVehicleVisibility } from '../features/control/control-vehicles';

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
  onOrdersChange,
  onManagementChange,
  onDestinationSelect,
  onVehicleCenter,
  onVehicleSelect,
  onTrailCursorChange,
  onTrailFollowChange,
  onTrailPlayingChange,
  onTrailReset,
  onTrailToggle,
  selectedDestinationId,
  selectedVehicleId,
  trailCursorMs,
  trailError = '',
  trailFollow = false,
  trailOpen = false,
  trailPlaying = false,
  trailRange,
  trailReady = false,
  vehicleColors = new Map(),
  vehicleVisibility = 'ALL',
  onVehicleVisibilityChange,
}: {
  onManagementChange?: (management: ManagementData | undefined) => void;
  onOrdersChange?: (orders: DispatchListItem[], serviceDate?: string) => void;
  onDestinationSelect?: (destinationId: string) => void;
  onVehicleCenter?: (latitude: number, longitude: number) => void;
  onVehicleSelect?: (vehicleId: string) => void;
  onTrailCursorChange?: (cursorMs: number) => void;
  onTrailFollowChange?: (follow: boolean) => void;
  onTrailPlayingChange?: (playing: boolean) => void;
  onTrailReset?: () => void;
  onTrailToggle?: () => void;
  selectedDestinationId?: string;
  selectedVehicleId?: string;
  trailCursorMs?: number;
  trailError?: string;
  trailFollow?: boolean;
  trailOpen?: boolean;
  trailPlaying?: boolean;
  trailRange?: { endMs: number; startMs: number };
  trailReady?: boolean;
  vehicleColors?: ReadonlyMap<string, string>;
  vehicleVisibility?: ControlVehicleVisibility;
  onVehicleVisibilityChange?: (visibility: ControlVehicleVisibility) => void;
} = {}): ReactElement {
  if (apiConfig.mode === 'remote') {
    return (
      <RemoteControlPage
        onManagementChange={onManagementChange}
        onOrdersChange={onOrdersChange}
        onDestinationSelect={onDestinationSelect}
        onVehicleCenter={onVehicleCenter}
        onVehicleSelect={onVehicleSelect}
        onTrailCursorChange={onTrailCursorChange}
        onTrailFollowChange={onTrailFollowChange}
        onTrailPlayingChange={onTrailPlayingChange}
        onTrailReset={onTrailReset}
        onTrailToggle={onTrailToggle}
        selectedDestinationId={selectedDestinationId}
        selectedVehicleId={selectedVehicleId}
        trailCursorMs={trailCursorMs}
        trailError={trailError}
        trailFollow={trailFollow}
        trailOpen={trailOpen}
        trailPlaying={trailPlaying}
        trailRange={trailRange}
        trailReady={trailReady}
        vehicleColors={vehicleColors}
        vehicleVisibility={vehicleVisibility}
        onVehicleVisibilityChange={onVehicleVisibilityChange}
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
  onOrdersChange,
  onManagementChange,
  onDestinationSelect,
  onVehicleCenter,
  onVehicleSelect,
  onTrailCursorChange,
  onTrailFollowChange,
  onTrailPlayingChange,
  onTrailReset,
  onTrailToggle,
  selectedDestinationId,
  selectedVehicleId,
  trailCursorMs,
  trailError,
  trailFollow,
  trailOpen,
  trailPlaying,
  trailRange,
  trailReady,
  vehicleColors,
  vehicleVisibility,
  onVehicleVisibilityChange,
}: {
  onManagementChange?: (management: ManagementData | undefined) => void;
  onOrdersChange?: (orders: DispatchListItem[], serviceDate?: string) => void;
  onDestinationSelect?: (destinationId: string) => void;
  onVehicleCenter?: (latitude: number, longitude: number) => void;
  onVehicleSelect?: (vehicleId: string) => void;
  onTrailCursorChange?: (cursorMs: number) => void;
  onTrailFollowChange?: (follow: boolean) => void;
  onTrailPlayingChange?: (playing: boolean) => void;
  onTrailReset?: () => void;
  onTrailToggle?: () => void;
  selectedDestinationId?: string;
  selectedVehicleId?: string;
  trailCursorMs?: number;
  trailError: string;
  trailFollow: boolean;
  trailOpen: boolean;
  trailPlaying: boolean;
  trailRange?: { endMs: number; startMs: number };
  trailReady: boolean;
  vehicleColors: ReadonlyMap<string, string>;
  vehicleVisibility: ControlVehicleVisibility;
  onVehicleVisibilityChange?: (visibility: ControlVehicleVisibility) => void;
}): ReactElement {
  const [summary, setSummary] = useState<ControlSummary>();
  const [management, setManagement] = useState<ManagementData>();
  const [orders, setOrders] = useState<DispatchListItem[]>([]);
  const [panelError, setPanelError] = useState('');
  const [panelLoading, setPanelLoading] = useState(true);
  const [serviceDateFilter, setServiceDateFilter] = useState<string>();
  const managementRef = useRef<ManagementData | undefined>(undefined);

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
        managementRef.current = nextManagement;
        setManagement(nextManagement);
        onManagementChange?.(nextManagement);
        setOrders(dispatch.rows);
        onOrdersChange?.(dispatch.rows, nextSummary.serviceDate);
        setPanelError('');
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (initial) {
          setSummary(undefined);
          managementRef.current = undefined;
          setManagement(undefined);
          onManagementChange?.(undefined);
          setOrders([]);
          onOrdersChange?.([]);
          setPanelError(error instanceof Error ? error.message : '관제 정보를 불러오지 못했습니다.');
        } else {
          const staleManagement = markControlTelemetryStale(managementRef.current);
          managementRef.current = staleManagement;
          setManagement(staleManagement);
          onManagementChange?.(staleManagement);
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
      orders={orders}
      ordersCount={orders.length}
      summary={summary}
      vehicles={management?.vehicles ?? []}
      assignments={management?.assignments ?? []}
      conditions={management?.conditions ?? []}
      drivers={management?.drivers ?? []}
      onVehicleSelect={onVehicleSelect}
      onDestinationSelect={onDestinationSelect}
      onVehicleCenter={onVehicleCenter}
      onServiceDateChange={setServiceDateFilter}
      selectedDestinationId={selectedDestinationId}
      selectedServiceDate={serviceDateFilter}
      selectedVehicleId={selectedVehicleId}
      trailCursorMs={trailCursorMs}
      trailError={trailError}
      trailFollow={trailFollow}
      trailOpen={trailOpen}
      trailPlaying={trailPlaying}
      trailRange={trailRange}
      trailReady={trailReady}
      onTrailCursorChange={onTrailCursorChange}
      onTrailFollowChange={onTrailFollowChange}
      onTrailPlayingChange={onTrailPlayingChange}
      onTrailReset={onTrailReset}
      onTrailToggle={onTrailToggle}
      vehicleColors={vehicleColors}
      vehicleVisibility={vehicleVisibility}
      onVehicleVisibilityChange={onVehicleVisibilityChange}
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
  loading,
  customerOrders,
  orders,
  ordersCount,
  summary,
  vehicles,
  onVehicleSelect,
  onVehicleCenter,
  onDestinationSelect,
  onServiceDateChange,
  onTrailCursorChange,
  onTrailFollowChange,
  onTrailPlayingChange,
  onTrailReset,
  onTrailToggle,
  selectedDestinationId,
  selectedServiceDate,
  selectedVehicleId,
  trailCursorMs,
  trailError = '',
  trailFollow = false,
  trailOpen = false,
  trailPlaying = false,
  trailRange,
  trailReady = false,
  vehicleColors = new Map(),
  vehicleVisibility = 'ALL',
  onVehicleVisibilityChange,
}: {
  assignments?: ManagementData['assignments'];
  conditions?: ManagementData['conditions'];
  drivers?: ManagementData['drivers'];
  error?: string;
  loading: boolean;
  customerOrders: CustomerOrderGroup[];
  orders: DispatchListItem[];
  ordersCount: number;
  summary?: ControlSummary;
  vehicles: ManagementData['vehicles'];
  onVehicleSelect?: (vehicleId: string) => void;
  onVehicleCenter?: (latitude: number, longitude: number) => void;
  onDestinationSelect?: (destinationId: string) => void;
  onServiceDateChange?: (serviceDate: string) => void;
  onTrailCursorChange?: (cursorMs: number) => void;
  onTrailFollowChange?: (follow: boolean) => void;
  onTrailPlayingChange?: (playing: boolean) => void;
  onTrailReset?: () => void;
  onTrailToggle?: () => void;
  selectedDestinationId?: string;
  selectedServiceDate?: string;
  selectedVehicleId?: string;
  trailCursorMs?: number;
  trailError?: string;
  trailFollow?: boolean;
  trailOpen?: boolean;
  trailPlaying?: boolean;
  trailRange?: { endMs: number; startMs: number };
  trailReady?: boolean;
  vehicleColors?: ReadonlyMap<string, string>;
  vehicleVisibility?: ControlVehicleVisibility;
  onVehicleVisibilityChange?: (visibility: ControlVehicleVisibility) => void;
}): ReactElement {
  const [mobilePanel, setMobilePanel] = useState<MobileControlPanel>();
  const [temperatureVehicle, setTemperatureVehicle] = useState<ManagementData['vehicles'][number]>();
  const [temperatureHistory, setTemperatureHistory] = useState<VehicleTemperatureHistory>();
  const [temperatureLoading, setTemperatureLoading] = useState(false);
  const [temperatureError, setTemperatureError] = useState('');
  const [telemetryClock, setTelemetryClock] = useState(() => Date.now());
  const controlServiceDate = selectedServiceDate ?? summary?.serviceDate ?? todayInSeoul();
  const selectedVehicleOrders = selectedVehicleId === undefined
    ? []
    : orders
      .filter((order) => order.vehicleId === selectedVehicleId)
      .sort(compareControlStops);
  const selectedVehicleDestinations = assignControlDestinationProgress(groupControlDestinations(selectedVehicleOrders));
  const vehicleOrderCounts = controlVehicleOrderCounts(orders);
  const visibleVehicles = visibleControlVehicles(vehicles, vehicleOrderCounts, vehicleVisibility);
  const orderedVehicleCount = vehicles.filter((vehicle) => (vehicleOrderCounts.get(vehicle.id) ?? 0) > 0).length;
  const selectedVehicle = selectedVehicleId === undefined
    ? undefined
    : vehicles.find((vehicle) => vehicle.id === selectedVehicleId);
  const selectedVehicleDrivers = selectedVehicle === undefined
    ? []
    : controlVehicleDriverNames(selectedVehicle.id, orders, drivers, assignments);
  const selectedVehicleConditions = selectedVehicle === undefined
    ? []
    : controlVehicleConditionLabels(selectedVehicle.id, orders, conditions);
  const selectedVehicleInstructions = selectedVehicle === undefined
    ? []
    : controlVehicleSpecialInstructions(selectedVehicle.id, orders);

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

  useEffect(() => {
    if (!selectedVehicle) return undefined;
    setTelemetryClock(Date.now());
    const timer = window.setInterval(() => setTelemetryClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [selectedVehicle]);

  return <>
    <aside className={`side control-side${mobilePanel ? ' mobile-panel-active' : ''}`} aria-label="관제 운영 패널">
      {onServiceDateChange ? (
        <ServiceDateSelector
          label="관제 기준일"
          onChange={(value) => { if (value !== undefined) onServiceDateChange(value); }}
          serviceDate={controlServiceDate}
        />
      ) : null}
      <div className={`panel-view ${selectedVehicleId === undefined ? 'vehicle-idle' : 'vehicle-focused'}${mobilePanel ? ' mobile-panel-open' : ''}`}>
        {selectedVehicle ? (
          <section className="card panel expand-card control-vehicle-detail-panel" aria-label="차량 상세">
            <div className="tab-line section-heading">
              <span>차량 상세</span>
              <button
                aria-describedby={trailError ? 'controlTrailError' : undefined}
                aria-pressed={trailOpen}
                className="control-trail-toggle"
                disabled={!trailReady}
                onClick={onTrailToggle}
                type="button"
              >{trailOpen ? '자취 닫기' : '자취 보기'}</button>
            </div>
            {trailError ? <p className="control-trail-error" id="controlTrailError" role="alert">{trailError}</p> : null}
            <div className="control-detail-card control-vehicle-detail-content">
              <span><small>차량 번호</small><b className="control-detail-value">{selectedVehicle.plate || '차량 번호 미등록'}</b></span>
              <span><small>운전자</small><b className="control-detail-value">{selectedVehicleDrivers.join(', ') || '미배정'}</b></span>
              <span><small>운행</small><b className="control-detail-value">{controlVehicleMotionText(selectedVehicle)}</b></span>
              <TelemetryRecency
                label="최근 위치 조회"
                now={telemetryClock}
                observedAt={selectedVehicle.vehiclePositionObservedAt}
                stale={selectedVehicle.vehiclePositionStale === true}
              />
              <details className="control-vehicle-secondary">
                <summary>운송 정보</summary>
                <span><small>차종</small><b className="control-detail-value">{selectedVehicle.type || '차종 미등록'}</b></span>
                <span><small>운송 조건</small><b className="control-detail-value">{selectedVehicleConditions.join(', ') || '운송 조건 없음'}</b></span>
                <span>
                  <small>배송 특이사항</small>
                  {selectedVehicleInstructions.length ? <ul className="control-detail-list">
                    {selectedVehicleInstructions.map((instruction) => (
                      <li key={instruction.id}><strong>{instruction.destination}</strong><span>{instruction.note}</span></li>
                    ))}
                  </ul> : <b className="control-detail-value">특이사항 없음</b>}
                </span>
                <TelemetryRecency
                  label="최근 온도 조회"
                  now={telemetryClock}
                  observedAt={selectedVehicle.temperatureObservedAt}
                  stale={selectedVehicle.temperatureStale === true}
                />
              </details>
            </div>
          </section>
        ) : null}
        <section className={`card panel expand-card mobile-panel-${mobilePanel === 'vehicles' ? 'expanded' : 'collapsed'}`} id="vehicleCard" aria-label="차량 리스트">
          <div className="tab-line section-heading">
            <span className="desktop-panel-title">차량 리스트</span>
            <button className="mobile-panel-toggle" type="button" aria-expanded={mobilePanel === 'vehicles'} aria-label={`차량 리스트 ${mobilePanel === 'vehicles' ? '닫기' : '펼치기'}`} onClick={() => setMobilePanel((current) => current === 'vehicles' ? undefined : 'vehicles')}>
              <span>차량 리스트</span><span className="mobile-panel-action">{mobilePanel === 'vehicles' ? '닫기' : '펼치기'}</span>
            </button>
            <div className="card-tools desktop-panel-tools">
              {summary && !loading && !error ? (
                <span className="control-vehicle-heading-summary" role="status" aria-label="지원되는 관제 요약">
                  <span>주문 수 <b>{summary.totalDispatchCount}</b></span>
                </span>
              ) : null}
              <fieldset className="control-vehicle-visibility" aria-label="차량 표시 범위">
                <label>
                  <input
                    checked={vehicleVisibility === 'ALL'}
                    name="controlVehicleVisibility"
                    onChange={() => onVehicleVisibilityChange?.('ALL')}
                    type="radio"
                  />
                  <span>전체 <b>{vehicles.length}</b></span>
                </label>
                <label>
                  <input
                    checked={vehicleVisibility === 'WITH_ORDERS'}
                    name="controlVehicleVisibility"
                    onChange={() => onVehicleVisibilityChange?.('WITH_ORDERS')}
                    type="radio"
                  />
                  <span>배정 <b>{orderedVehicleCount}</b></span>
                </label>
              </fieldset>
            </div>
          </div>
          {loading ? <div className="panel-state" role="status">차량을 불러오는 중입니다.</div> : null}
          {error ? <div className="panel-state error" role="alert">{error}</div> : null}
          {!loading && !error ? (
            <div className="control-vehicle-list fleet overlay-scroll" id="fleetList">
              {visibleVehicles.map((vehicle) => {
                return <div
                  className={`control-vehicle-row${selectedVehicleId === vehicle.id ? ' selected' : ''}`}
                  key={vehicle.id}
                  style={{ '--control-route-color': controlVehicleDisplayColor(vehicle.id, vehicleColors) } as CSSProperties}
                >
                  <i aria-hidden="true" />
                  <button
                    aria-pressed={selectedVehicleId === vehicle.id}
                    className="control-vehicle-select"
                    onClick={() => {
                      onVehicleSelect?.(vehicle.id);
                      if (
                        typeof vehicle.vehicleLatitude === 'number'
                        && Number.isFinite(vehicle.vehicleLatitude)
                        && typeof vehicle.vehicleLongitude === 'number'
                        && Number.isFinite(vehicle.vehicleLongitude)
                      ) {
                        onVehicleCenter?.(vehicle.vehicleLatitude, vehicle.vehicleLongitude);
                      }
                    }}
                    type="button"
                  >
                    <span><strong>{vehicle.plate || '차량 번호 미등록'}</strong></span>
                  </button>
                  <em>{(vehicleOrderCounts.get(vehicle.id) ?? 0) > 0 ? `${vehicleOrderCounts.get(vehicle.id)}건` : '주문 없음'}</em>
                  <button className="control-temperature-button" type="button" onClick={() => setTemperatureVehicle(vehicle)}>온도</button>
                </div>
              })}
              {!visibleVehicles.length ? <div className="panel-state">표시할 차량이 없습니다.</div> : null}
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
                  <small>총 {controlDestinationBoxTotal(destination.orders)}박스</small>
                </span>
                <time className={controlDestinationCompletedAt(destination.orders) === null ? undefined : 'superseded'}>{formatControlEta(destination.orders)}</time>
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
                href={customerInquiryHref(group.id)}
                key={group.id}
              >
                <span className="control-customer-order-name">
                  <strong>{group.name}</strong>
                  <small>클릭하여 고객사 조회 화면으로 이동</small>
                </span>
                <span className="control-customer-order-meta">
                  <span>{group.orders.length}건</span>
                  <time>{customerFirstEta(group.orders)}</time>
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
    {trailOpen && selectedVehicle ? (
      <VehicleTrailTimeline
        cursorMs={trailCursorMs}
        follow={trailFollow}
        onCursorChange={onTrailCursorChange}
        onFollowChange={onTrailFollowChange}
        onPlayingChange={onTrailPlayingChange}
        onReset={onTrailReset}
        playing={trailPlaying}
        range={trailRange}
        vehicleLabel={selectedVehicle.plate || '차량 번호 미등록'}
      />
    ) : null}
  </>;
}

function VehicleTrailTimeline({
  cursorMs,
  follow,
  onCursorChange,
  onFollowChange,
  onPlayingChange,
  onReset,
  playing,
  range,
  vehicleLabel,
}: {
  cursorMs?: number;
  follow: boolean;
  onCursorChange?: (cursorMs: number) => void;
  onFollowChange?: (follow: boolean) => void;
  onPlayingChange?: (playing: boolean) => void;
  onReset?: () => void;
  playing: boolean;
  range?: { endMs: number; startMs: number };
  vehicleLabel: string;
}): ReactElement {
  if (range === undefined) return <></>;
  const cursor = Math.min(range.endMs, Math.max(range.startMs, cursorMs ?? range.startMs));
  const togglePlayback = (): void => {
    if (!playing && cursor >= range.endMs) onCursorChange?.(range.startMs);
    onPlayingChange?.(!playing);
  };
  return (
    <section className="control-trail-timeline" aria-label={`${vehicleLabel} 자취 타임라인`}>
      <header>
        <span><small>차량 자취</small><strong>{vehicleLabel}</strong></span>
        <time dateTime={new Date(cursor).toISOString()}>{formatTrailTimelineTime(cursor, range.endMs)}</time>
      </header>
      <div className="control-trail-timeline__track">
        <button
          aria-label={playing ? '자취 재생 일시정지' : '자취 재생'}
          className="control-trail-play"
          onClick={togglePlayback}
          type="button"
        >{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button>
        <time>{formatTrailTimelineTime(range.startMs, range.endMs)}</time>
        <input
          aria-label="자취 시점"
          max={range.endMs}
          min={range.startMs}
          onChange={(event) => onCursorChange?.(Number(event.currentTarget.value))}
          step={60_000}
          type="range"
          value={cursor}
        />
        <time>{formatTrailTimelineTime(range.endMs, range.endMs)}</time>
      </div>
      <footer>
        <button onClick={onReset} type="button"><RotateCcw aria-hidden="true" />처음</button>
        <button
          aria-pressed={follow}
          className={follow ? 'active' : ''}
          onClick={() => onFollowChange?.(!follow)}
          type="button"
        ><LocateFixed aria-hidden="true" />차량 따라가기</button>
      </footer>
    </section>
  );
}

function formatTrailTimelineTime(value: number, endMs: number): string {
  if (value === endMs) return '24:00';
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value));
}

function TelemetryRecency({
  label,
  now,
  observedAt,
  stale,
}: {
  label: string;
  now: number;
  observedAt?: string | null;
  stale: boolean;
}): ReactElement {
  const value = formatTelemetryRecency(observedAt, now);
  const observedTimestamp = observedAt ? Date.parse(observedAt) : Number.NaN;
  const state = Number.isNaN(observedTimestamp) ? 'missing' : stale ? 'delayed' : 'recent';
  const stateLabel = state === 'missing' ? '최근 수신 없음' : state === 'delayed' ? '수신 간격 지연' : '최근 수신';
  return (
    <span className={`control-telemetry-recency ${state}`} title={telemetryObservedAtTitle(label, observedAt)} aria-label={`${label}: ${value}, ${stateLabel}`}>
      <small>{label}<i className="control-telemetry-status-dot" aria-hidden="true" /></small>
      <time dateTime={observedAt ?? undefined}>{value}</time>
    </span>
  );
}

function formatTelemetryRecency(observedAt: string | null | undefined, now: number): string {
  if (!observedAt) return '수신 없음';
  const timestamp = Date.parse(observedAt);
  if (Number.isNaN(timestamp)) return '수신 없음';
  const elapsedMinutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (elapsedMinutes < 1) return '방금 전';
  if (elapsedMinutes < 60) return `${elapsedMinutes}분 전`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}시간 전`;
  return `${Math.floor(elapsedHours / 24)}일 전`;
}

function telemetryObservedAtTitle(label: string, observedAt: string | null | undefined): string {
  if (!observedAt) return `${label}: 수신 기록 없음`;
  const timestamp = new Date(observedAt);
  if (Number.isNaN(timestamp.getTime())) return `${label}: 수신 기록 없음`;
  return `${label}: ${timestamp.toLocaleString('ko-KR', { hour12: false })}`;
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
  const temperatureBandCodes = temperatureBands.map((band) => band.code).join('\u0000');
  const [selectedTemperatureBandCodes, setSelectedTemperatureBandCodes] = useState<string[]>([]);
  const [temperaturePickerOpen, setTemperaturePickerOpen] = useState(true);
  useEffect(() => {
    setSelectedTemperatureBandCodes([]);
  }, [temperatureBandCodes]);
  const selectedTemperatureBands = temperatureBands.filter((band) => selectedTemperatureBandCodes.includes(band.code));
  const temperatureWindowLabel = selectedTemperatureBands.length === 0
    ? '기준 미적용'
    : selectedTemperatureBands.length === 1
      ? '단일 기준'
      : `${selectedTemperatureBands.length}개 비교`;
  const toggleTemperatureBand = (code: string): void => {
    setSelectedTemperatureBandCodes((current) => {
      if (!current.includes(code)) return [...current, code];
      return current.filter((currentCode) => currentCode !== code);
    });
  };
  return (
    <div className="temperature-dialog-backdrop" role="presentation">
      <section className="temperature-dialog" role="dialog" aria-modal="true" aria-labelledby="temperatureDialogTitle">
        <header>
          <span>
            <strong id="temperatureDialogTitle">{vehicle.plate || '차량 번호 미등록'} 온도</strong>
          </span>
          <button type="button" aria-label="온도 이력 닫기" onClick={onClose}><X aria-hidden="true" /></button>
        </header>
        {loading ? <div className="temperature-dialog-state" role="status">온도 이력을 불러오는 중입니다.</div> : null}
        {error ? <div className="temperature-dialog-state error" role="alert">{error}</div> : null}
        {!loading && !error && history ? (
          <>
            {temperatureBands.length ? (
              <details
                aria-label="운영 상태 온도 기준"
                className="temperature-condition-picker"
                onToggle={(event) => setTemperaturePickerOpen(event.currentTarget.open)}
                open={temperaturePickerOpen}
              >
                <summary>
                  <strong>운영 상태 온도 기준</strong>
                  <span>{temperatureWindowLabel}</span>
                  <ChevronDown aria-hidden="true" />
                </summary>
                <section>
                  <div className="temperature-condition-options">
                    {temperatureBands.map((band) => {
                      const selected = selectedTemperatureBandCodes.includes(band.code);
                      return (
                        <button
                          aria-pressed={selected}
                          key={band.code}
                          onClick={() => toggleTemperatureBand(band.code)}
                          style={{ '--temperature-condition-color': band.color } as CSSProperties}
                          type="button"
                        >
                          <span>
                            <strong>{band.code}</strong>
                            <small>{band.label}</small>
                          </span>
                          <b>{`${formatTemperatureValue(band.minimum)}℃ ~ ${formatTemperatureValue(band.maximum)}℃`}</b>
                        </button>
                      );
                    })}
                  </div>
                </section>
              </details>
            ) : null}
            <TemperatureChart
              availableTemperatureBands={temperatureBands}
              samples={history.samples}
              temperatureBands={selectedTemperatureBands}
            />
          </>
        ) : null}
      </section>
    </div>
  );
}

function TemperatureChart({
  availableTemperatureBands,
  samples,
  temperatureBands,
}: {
  availableTemperatureBands: TemperatureConditionBand[];
  samples: VehicleTemperatureSample[];
  temperatureBands: TemperatureConditionBand[];
}): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const xAxisRef = useRef<SVGSVGElement>(null);
  const yAxisRef = useRef<SVGSVGElement>(null);
  const [hoveredSample, setHoveredSample] = useState<VehicleTemperatureSample>();
  const channels = [
    { key: 'temperatureA' as const, label: '온도', color: 'var(--color-primary)' },
  ];
  const values = samples.map((sample) => sample.temperatureA).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const timeframe = samples.length ? `${formatTemperatureTooltipTime(samples[0].observedAt)} ~ ${formatTemperatureTooltipTime(samples[samples.length - 1].observedAt)}` : '수집 기록 없음';
  const hasTemperatureData = samples.length > 0 && values.length > 0;
  const fiveMinutes = 5 * 60 * 1000;
  const thirtyMinutes = 30 * 60 * 1000;
  const viewportHeight = 302;
  const axisHeight = 38;
  const axisWidth = 52;
  const padding = { bottom: 16, right: 20, top: 16 };
  const parsedTimestamps = samples.map((sample) => new Date(sample.observedAt).getTime()).filter((value) => !Number.isNaN(value));
  const timestamps = parsedTimestamps.length ? parsedTimestamps : [Date.now()];
  const firstTime = Math.min(...timestamps);
  const lastTime = Math.max(...timestamps);
  const minTime = Math.floor(firstTime / thirtyMinutes) * thirtyMinutes;
  const maxTime = Math.max(minTime + thirtyMinutes, Math.ceil(lastTime / thirtyMinutes) * thirtyMinutes);
  const halfHourCount = Math.max(1, Math.round((maxTime - minTime) / thirtyMinutes));
  const width = Math.max(808, padding.right + halfHourCount * 108);
  const averageValue = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const valueDistance = values.length ? Math.max(...values.map((value) => Math.abs(value - averageValue))) : 0;
  const visibleHalfRange = Math.max(5, Math.ceil(valueDistance / 5) * 5);
  const visibleMinValue = averageValue - visibleHalfRange;
  const visibleMaxValue = averageValue + visibleHalfRange;
  const minValue = Math.min(visibleMinValue, ...temperatureBands.map((band) => band.minimum));
  const maxValue = Math.max(visibleMaxValue, ...temperatureBands.map((band) => band.maximum));
  const pixelsPerDegree = (viewportHeight - padding.top - padding.bottom) / (visibleHalfRange * 2);
  const height = padding.top + padding.bottom + ((maxValue - minValue) * pixelsPerDegree);
  const xFor = (observedAt: string): number => {
    const timestamp = new Date(observedAt).getTime();
    if (maxTime === minTime || Number.isNaN(timestamp)) return 0;
    return ((timestamp - minTime) / (maxTime - minTime)) * (width - padding.right);
  };
  const yFor = (value: number): number => {
    return padding.top + ((maxValue - value) * pixelsPerDegree);
  };
  const yTicks = numberTicks(Math.ceil(minValue), Math.floor(maxValue), 1);
  const xTicks = numberTicks(minTime, maxTime, fiveMinutes);
  const hoveredX = hoveredSample ? xFor(hoveredSample.observedAt) : 0;
  const syncTemperatureAxes = (): void => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    if (xAxisRef.current) xAxisRef.current.style.transform = `translateX(${-scroll.scrollLeft}px)`;
    if (yAxisRef.current) yAxisRef.current.style.transform = `translateY(${-scroll.scrollTop}px)`;
  };
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || !hasTemperatureData) return undefined;
    const frame = window.requestAnimationFrame(() => {
      scroll.scrollLeft = scroll.scrollWidth - scroll.clientWidth;
      scroll.scrollTop = Math.max(0, yFor(averageValue) - (scroll.clientHeight / 2));
      syncTemperatureAxes();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [averageValue, hasTemperatureData, height, samples, width]);
  if (!hasTemperatureData) {
    return (
      <div className="temperature-chart">
        <div className="temperature-timeframe" aria-label="온도 수집 시간표">
          <span>조회 시간 <b>{timeframe}</b></span>
          <span>수집 주기 <b>5분</b></span>
        </div>
        <div className="temperature-dialog-state">표시할 온도 데이터가 없습니다.</div>
      </div>
    );
  }
  return (
    <div className="temperature-chart">
      <div className="temperature-timeframe" aria-label="온도 수집 시간표">
        <span>조회 시간 <b>{timeframe}</b></span>
        <span>수집 주기 <b>5분</b></span>
      </div>
      <div className="temperature-legend" aria-hidden="true">
        {channels.map((channel) => <span key={channel.key}><i style={{ background: channel.color }} />{channel.label}</span>)}
      </div>
      <div className="temperature-chart-frame">
        <div className="temperature-y-axis-window">
          <svg aria-hidden="true" className="temperature-y-axis" height={height} ref={yAxisRef} viewBox={`0 0 ${axisWidth} ${height}`}>
            {yTicks.map((tick) => {
              const major = tick % 5 === 0;
              return major ? (
                <text className="temperature-axis-label" key={tick} x={axisWidth - 10} y={yFor(tick) + 4} textAnchor="end">{tick}℃</text>
              ) : null;
            })}
            <line className="temperature-axis-line" x1={axisWidth - 1} x2={axisWidth - 1} y1={padding.top} y2={height - padding.bottom} />
          </svg>
        </div>
        <div className="temperature-chart-scroll" onScroll={syncTemperatureAxes} ref={scrollRef}>
          <div className="temperature-chart-plot" style={{ height: `${height}px`, width: `${width}px` }}>
            <svg
              aria-label="전날부터 최근 수신까지 차량 온도 꺾은선 차트"
              role="img"
              viewBox={`0 0 ${width} ${height}`}
            >
            <desc>냉동 배송 위치의 온도를 5분 수집 포인트와 꺾은선으로 표시하고 운영 상태별 온도 범위를 투명 영역으로 구분합니다.</desc>
          {temperatureBands.map((band) => (
            <rect
              className="temperature-condition-band"
              fill={band.color}
              fillOpacity="0.12"
              height={Math.max(1, yFor(band.minimum) - yFor(band.maximum))}
              key={band.code}
              width={width - padding.right}
              x="0"
              y={yFor(band.maximum)}
            >
              <title>{`${band.code} ${band.label} ${formatTemperatureValue(band.minimum)}℃ ~ ${formatTemperatureValue(band.maximum)}℃`}</title>
            </rect>
          ))}
          {xTicks.map((tick) => {
            const major = (tick - minTime) % thirtyMinutes === 0;
            return (
              <g key={tick}>
                <line
                  className={`temperature-grid-line temperature-grid-x temperature-grid-${major ? 'major' : 'minor'}`}
                  x1={xForTimestamp(tick, minTime, maxTime, width, { ...padding, left: 0 })}
                  x2={xForTimestamp(tick, minTime, maxTime, width, { ...padding, left: 0 })}
                  y1={padding.top}
                  y2={height - padding.bottom}
                />
              </g>
            );
          })}
          {yTicks.map((tick) => {
            const major = tick % 5 === 0;
            return (
              <g key={tick}>
                <line className={`temperature-grid-line temperature-grid-y temperature-grid-${major ? 'major' : 'minor'}`} x1="0" x2={width - padding.right} y1={yFor(tick)} y2={yFor(tick)} />
              </g>
            );
          })}
          <line className="temperature-axis-line" x1="0" x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} />
          {hoveredSample ? (
            <line className="temperature-hover-guide" x1={hoveredX} x2={hoveredX} y1={padding.top} y2={height - padding.bottom} />
          ) : null}
          {channels.map((channel) => {
            const points = samples
              .filter((sample) => typeof sample[channel.key] === 'number' && Number.isFinite(sample[channel.key]))
              .map((sample) => ({ sample, value: sample[channel.key] as number, x: xFor(sample.observedAt), y: yFor(sample[channel.key] as number) }));
            const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
            return (
              <g key={channel.key}>
                {points.length > 1 ? <polyline className="temperature-line" fill="none" points={line} stroke={channel.color} /> : null}
                {points.map((point) => (
                  <circle
                    aria-label={`${formatTemperatureTooltipTime(point.sample.observedAt)} ${channel.label} ${point.value.toFixed(1)}℃`}
                    className="temperature-point"
                    cx={point.x}
                    cy={point.y}
                    fill={channel.color}
                    key={`${channel.key}-${point.sample.observedAt}`}
                    onBlur={() => setHoveredSample(undefined)}
                    onFocus={() => setHoveredSample(point.sample)}
                    onMouseEnter={() => setHoveredSample(point.sample)}
                    onMouseLeave={() => setHoveredSample(undefined)}
                    r="3.2"
                    tabIndex={0}
                  />
                ))}
              </g>
            );
          })}
            </svg>
            {hoveredSample ? (
              <TemperatureSampleTooltip
                alignEnd={hoveredX > width / 2}
                availableTemperatureBands={availableTemperatureBands}
                sample={hoveredSample}
                x={hoveredX}
              />
            ) : null}
          </div>
        </div>
        <div aria-hidden="true" className="temperature-axis-corner" />
        <div className="temperature-x-axis-window">
          <svg aria-hidden="true" className="temperature-x-axis" height={axisHeight} ref={xAxisRef} viewBox={`0 0 ${width} ${axisHeight}`} width={width}>
            {xTicks.map((tick) => {
              const major = (tick - minTime) % thirtyMinutes === 0;
              return major ? (
                <text
                  className="temperature-axis-label"
                  key={tick}
                  textAnchor="middle"
                  x={xForTimestamp(tick, minTime, maxTime, width, { ...padding, left: 0 })}
                  y={24}
                >
                  {formatTemperatureAxisTime(new Date(tick).toISOString())}
                </text>
              ) : null;
            })}
            <line className="temperature-axis-line" x1="0" x2={width - padding.right} y1="1" y2="1" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function TemperatureSampleTooltip({
  alignEnd,
  availableTemperatureBands,
  sample,
  x,
}: {
  alignEnd: boolean;
  availableTemperatureBands: TemperatureConditionBand[];
  sample: VehicleTemperatureSample;
  x: number;
}): ReactElement {
  return (
    <aside
      className={`temperature-sample-tooltip${alignEnd ? ' align-end' : ''}`}
      role="tooltip"
      style={{ left: `${x}px` }}
    >
      <div className="temperature-sample-tooltip-header">
        <span>수집 시각</span>
        <strong>{formatTemperatureTooltipTime(sample.observedAt)}</strong>
      </div>
      <div className="temperature-sample-readings">
        <span><small>온도</small><b>{formatTemperatureReading(sample.temperatureA)}</b></span>
      </div>
      <section>
        <strong>이 시점 배송 온도 기준</strong>
        {availableTemperatureBands.length ? (
          <ul>
            {availableTemperatureBands.map((band) => {
              const assessment = assessTemperatureSample(sample, band);
              return (
                <li key={band.code} style={{ '--temperature-condition-color': band.color } as CSSProperties}>
                  <span><b>{band.code}</b><small>{band.label}</small></span>
                  <span><b>{`${formatTemperatureValue(band.minimum)}℃ ~ ${formatTemperatureValue(band.maximum)}℃`}</b><small className={assessment.risk ? 'risk' : ''}>{assessment.label}</small></span>
                </li>
              );
            })}
          </ul>
        ) : <p>적용된 온도 기준이 없습니다.</p>}
      </section>
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
  const validConditions = conditions.filter((condition) => (
    typeof condition.temperatureMinC === 'number'
    && Number.isFinite(condition.temperatureMinC)
    && typeof condition.temperatureMaxC === 'number'
    && Number.isFinite(condition.temperatureMaxC)
    && condition.temperatureMinC <= condition.temperatureMaxC
  ));
  const assignedConditions = validConditions.filter((condition) => activeCodes.has(condition.code.trim().toUpperCase()));
  const conditionByCode = new Map<string, ManagementData['conditions'][number]>();
  for (const condition of assignedConditions.length ? assignedConditions : validConditions) {
    const code = condition.code.trim().toUpperCase();
    if (code !== '' && !conditionByCode.has(code)) conditionByCode.set(code, condition);
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

function numberTicks(start: number, end: number, step: number): number[] {
  const ticks: number[] = [];
  for (let value = start; value <= end; value += step) ticks.push(value);
  return ticks;
}

function xForTimestamp(
  timestamp: number,
  minTime: number,
  maxTime: number,
  width: number,
  padding: { left: number; right: number },
): number {
  if (maxTime === minTime) return padding.left;
  return padding.left + ((timestamp - minTime) / (maxTime - minTime)) * (width - padding.left - padding.right);
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

function formatTemperatureReading(value: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}℃` : '미수신';
}

function assessTemperatureSample(
  sample: VehicleTemperatureSample,
  band: TemperatureConditionBand,
): { label: string; risk: boolean } {
  const value = sample.temperatureA;
  const assessment = typeof value !== 'number' || !Number.isFinite(value)
    ? '미수신'
    : value < band.minimum
      ? `${(band.minimum - value).toFixed(1)}℃ 미달`
      : value > band.maximum
        ? `${(value - band.maximum).toFixed(1)}℃ 초과`
        : '기준 내';
  return {
    label: assessment,
    risk: assessment.includes('미달') || assessment.includes('초과'),
  };
}

function controlVehicleMotionText(vehicle: ManagementData['vehicles'][number]): string {
  if (vehicle.vehiclePositionStale === true) return '위치 지연';
  if (vehicle.vehicleStopped === true) return '정차';
  if (vehicle.vehicleStopped === false) return '이동';
  return '운행 미확인';
}

function customerFirstEta(orders: DispatchListItem[]): string {
  const first = [...orders].sort((left, right) => {
    const leftEta = controlEtaTimestamp(left);
    const rightEta = controlEtaTimestamp(right);
    if (leftEta !== rightEta) return leftEta - rightEta;
    const leftSequence = left.routeStopSequence ?? Number.MAX_SAFE_INTEGER;
    const rightSequence = right.routeStopSequence ?? Number.MAX_SAFE_INTEGER;
    if (leftSequence !== rightSequence) return leftSequence - rightSequence;
    return left.sellerOrderKey.localeCompare(right.sellerOrderKey, 'ko');
  })[0];
  if (!first) return '-';
  return formatControlEta([first]);
}

function sharedControlEta(orders: DispatchListItem[]): string | null {
  return [...orders]
    .map((order) => order.estimatedArrivalAt)
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

function controlDestinationBoxTotal(orders: DispatchListItem[]): number {
  return orders.reduce((total, order) => total + (order.shippedBoxes ?? 0), 0);
}

function controlEtaTimestamp(order: DispatchListItem): number {
  const eta = order.estimatedArrivalAt;
  if (!eta) return Number.MAX_SAFE_INTEGER;
  const timestamp = new Date(eta).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function controlTimeValue(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function formatControlEta(orders: DispatchListItem[]): string {
  const eta = sharedControlEta(orders);
  if (eta !== null) return formatControlTime(eta);
  if (orders.some(({ etaStatus }) => etaStatus === 'FAILED')) return '계산 실패';
  if (orders.some(({ etaStatus }) => etaStatus === 'STALE')) return '갱신 필요';
  if (orders.some(({ etaStatus }) => etaStatus === 'PENDING')) return '계산 중';
  return '-';
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

function customerInquiryHref(customerId: string): string {
  const query = new URLSearchParams({ customer: customerId });
  return `${adminCustomerDeliveryPath}?${query.toString()}`;
}
