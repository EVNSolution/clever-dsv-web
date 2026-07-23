import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { apiConfig } from '../api/config';
import { controlDemoVehicles, routeCoordinates, routeOrigin, routeStops, selectedDemoVehicle, stopTone, vehicleTone } from '../dev-db/queries';
import type { DemoVehicle } from '../dev-db/queries';
import { fallbackRouteEstimate, readCachedRoute } from '../services/routing';
import type { RouteEstimate } from '../services/routing';
import { loadAdminSettings } from '../services/settings';
import { currentDeliveryStopFor, deliveryStopIdFor, loadControlSummary, loadDeliveryStopContext } from '../services/control';
import type { ControlSummary, DeliveryStopContext, DeliveryStopSelection } from '../services/control';

type ControlPageProps = {
  endpoint: string;
  selectedVehicleId: string;
  selectedDeliveryStop?: DeliveryStopSelection;
  spotlightVehicleId?: string;
  vehicleLookupRequest: number;
  onSelectDeliveryStop: (selection: DeliveryStopSelection) => void;
  onSelectVehicle: (vehicleId: string) => void;
};

type StatusClass = 'completed' | 'loading' | 'moving';

export function ControlPage(props: ControlPageProps): ReactElement {
  if (apiConfig.mode === 'remote') return <RemoteControlPage selectedDeliveryStop={props.selectedDeliveryStop} />;
  return <DemoControlPage {...props} />;
}

function RemoteControlPage({ selectedDeliveryStop }: { selectedDeliveryStop?: DeliveryStopSelection }): ReactElement {
  const [summary, setSummary] = useState<ControlSummary>();
  const [summaryError, setSummaryError] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [retryRequest, setRetryRequest] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deliveryContext, setDeliveryContext] = useState<DeliveryStopContext>();
  const [deliveryContextError, setDeliveryContextError] = useState('');
  const [deliveryContextLoading, setDeliveryContextLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setSummaryLoading(true);
    setSummaryError('');
    loadControlSummary(controller.signal)
      .then(setSummary)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSummary(undefined);
        setSummaryError(error instanceof Error ? error.message : '관제 요약을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setSummaryLoading(false);
      });
    return () => controller.abort();
  }, [retryRequest]);

  useEffect(() => {
    if (!detailOpen || !selectedDeliveryStop) return;
    const controller = new AbortController();
    setDeliveryContextLoading(true);
    setDeliveryContextError('');
    loadDeliveryStopContext(selectedDeliveryStop, controller.signal)
      .then(setDeliveryContext)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setDeliveryContext(undefined);
        setDeliveryContextError(error instanceof Error ? error.message : '배송지 상세 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setDeliveryContextLoading(false);
      });
    return () => controller.abort();
  }, [detailOpen, selectedDeliveryStop]);

  return (
    <aside className="side" aria-label="관제 원격 패널">
      <div className="panel-view">
        <section className="card panel expand-card" id="vehicleCard" aria-label="관제 요약">
          <div className="tab-line section-heading">
            <span>관제 요약</span>
            <span className="card-tools"><span className="chip mini">remote v1</span><button className="panel-toggle" type="button" onClick={() => setRetryRequest((request) => request + 1)}>재시도</button></span>
          </div>
          {summaryLoading ? <div className="panel-state" role="status">관제 요약을 불러오는 중입니다.</div> : null}
          {summaryError ? <div className="panel-state error" role="alert">{summaryError}</div> : null}
          {summary && !summaryLoading && !summaryError ? (
            <div className="destination-context" role="status" aria-label="지원되는 관제 요약">
              <div className="note-list cargo-note-list">
                <div className="note-row done"><i>일</i><span><b>기준일</b>serviceDate</span><em>{summary.serviceDate}</em></div>
                <div className="note-row done"><i>총</i><span><b>전체 배차</b>totalDispatchCount</span><em>{summary.totalDispatchCount}</em></div>
                <div className="note-row done"><i>배</i><span><b>배정 완료</b>assignedCount</span><em>{summary.assignedCount}</em></div>
                <div className="note-row warn"><i>미</i><span><b>미배정</b>unassignedCount</span><em>{summary.unassignedCount}</em></div>
                <div className="note-row warn"><i>대</i><span><b>ETA 대기</b>pendingEtaCount</span><em>{summary.pendingEtaCount}</em></div>
                <div className="note-row warn"><i>실</i><span><b>ETA 실패</b>failedEtaCount</span><em>{summary.failedEtaCount}</em></div>
                <div className="note-row done"><i>준</i><span><b>ETA 준비</b>readyEtaCount</span><em>{summary.readyEtaCount}</em></div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="card panel expand-card" id="destinationCard" aria-label="원격 미지원 상세">
          <div className="tab-line section-heading">
            <span className="destination-title">상세 기능 <small>미지원</small></span>
            <button className={`panel-toggle ${detailOpen ? 'active' : ''}`} type="button" disabled={!selectedDeliveryStop} onClick={() => setDetailOpen((open) => !open)}>{detailOpen ? '닫기' : '상세'}</button>
          </div>
          <div className="destination-context">
            <section aria-label="미지원 기능"><h3>원격 정본 미지원</h3><div className="note-list">
              {['fleet', 'map', 'route', 'cargo', 'proof'].map((feature) => <div className="note-row warn" key={feature}><i>!</i><span><b>{feature}</b>원격 v1 정본 계약에 포함되지 않아 표시하지 않습니다.</span></div>)}
            </div></section>
            {selectedDeliveryStop ? (
              <section aria-label="배송지 상세"><h3>배송지 상세</h3>
                {!detailOpen ? <div className="panel-state">상세 열기 전에는 legacy 배송지 context를 호출하지 않습니다.</div> : null}
                {deliveryContextLoading ? <div className="panel-state" role="status">배송지 상세 정보를 불러오는 중입니다.</div> : null}
                {deliveryContextError ? <div className="panel-state error" role="alert">{deliveryContextError}</div> : null}
                {deliveryContext ? <div className="panel-state">legacy 배송지 context가 명시적 상세 열기로 로드되었습니다.</div> : null}
              </section>
            ) : <div className="panel-state">원격 v1 요약 외 상세 데이터는 표시하지 않습니다.</div>}
          </div>
        </section>
      </div>
    </aside>
  );
}

function DemoControlPage({ endpoint, selectedVehicleId, selectedDeliveryStop, spotlightVehicleId, vehicleLookupRequest, onSelectDeliveryStop, onSelectVehicle }: ControlPageProps): ReactElement {
  const [vehiclePanelOpen, setVehiclePanelOpen] = useState(false);
  const [destinationNoteOpen, setDestinationNoteOpen] = useState(false);
  const [destinationCollapsed, setDestinationCollapsed] = useState(false);
  const [deliveryContext, setDeliveryContext] = useState<DeliveryStopContext>();
  const [deliveryContextError, setDeliveryContextError] = useState('');
  const [deliveryContextLoading, setDeliveryContextLoading] = useState(false);
  const [, setRouteEstimateVersion] = useState(0);
  const fleetRef = useRef<HTMLDivElement>(null);
  const vehicle = controlDemoVehicles.find((item) => item.id === selectedVehicleId) ?? selectedDemoVehicle();
  const stops = routeStops[vehicle.route];
  const contextSelection = selectedDeliveryStop?.vehicleId === vehicle.id ? selectedDeliveryStop : currentDeliveryStopFor(vehicle.id);
  const estimate = routeEstimate(endpoint, vehicle);
  const dwellMinutes = loadAdminSettings().dwellMinutes;
  const stopArrivals = plannedArrivals(vehicle, estimate, dwellMinutes);
  const expectedArrivals = rollingExpectedArrivals(stopArrivals, estimate, vehicle.actualArrivals, dwellMinutes);
  const currentStopIndex = Math.min(vehicle.done, stops.length - 1);

  useEffect(() => {
    const refresh = () => setRouteEstimateVersion((version) => version + 1);
    window.addEventListener('clever:route-estimate', refresh);
    return () => window.removeEventListener('clever:route-estimate', refresh);
  }, []);

  useEffect(() => {
    if (vehicleLookupRequest === 0) return;
    setVehiclePanelOpen(true);
    setDestinationNoteOpen(false);
    setDestinationCollapsed(false);
    const frame = requestAnimationFrame(() => {
      const selectedRow = fleetRef.current?.querySelector<HTMLElement>(`[data-vehicle-id="${selectedVehicleId}"]`);
      selectedRow?.scrollIntoView({ block: 'center' });
      selectedRow?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedVehicleId, vehicleLookupRequest]);

  useEffect(() => {
    const controller = new AbortController();
    setDeliveryContextLoading(true);
    setDeliveryContextError('');
    loadDeliveryStopContext(contextSelection, controller.signal)
      .then(setDeliveryContext)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setDeliveryContext(undefined);
        setDeliveryContextError(error instanceof Error ? error.message : '배송지 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setDeliveryContextLoading(false);
      });
    return () => controller.abort();
  }, [contextSelection.deliveryStopId, contextSelection.stopNo, contextSelection.vehicleId]);

  return (
    <aside className="side" aria-label="배송 상태 패널">
      <div className={`panel-view ${destinationCollapsed ? 'destination-collapsed' : ''}`} id="sideContent">
        <section className={`card panel expand-card ${vehiclePanelOpen ? 'expanded' : ''}`} id="vehicleCard">
          <aside className="left-expansion temperature-expansion overlay-scroll" aria-label="차량 온도 변화">
            <div className="expansion-title"><span>{vehicle.plate} 온도</span><span className="chip mini">미연결</span></div>
            <div className="temperature-empty"><strong>단말기 미설치</strong><span>차량 단말기 설치 후 실제 온도와 이탈 기록이 표시됩니다.</span></div>
          </aside>
          <div className="tab-line section-heading">
            <span>차량 리스트</span>
            <span className="card-tools"><span className="chip mini">{controlDemoVehicles.length}대</span><button className={`panel-toggle ${vehiclePanelOpen ? 'active' : ''}`} type="button" onClick={() => { setVehiclePanelOpen((open) => !open); setDestinationNoteOpen(false); }}>{vehiclePanelOpen ? '닫기' : '온도'}</button></span>
          </div>
          <div className="fleet overlay-scroll" id="fleetList" ref={fleetRef}>
            {controlDemoVehicles.map((item) => {
              const tone = vehicleTone(item);
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className={`row status-${statusClassForTone(tone)}${item.id === spotlightVehicleId ? ' active' : ''}`}
                  data-vehicle-id={item.id}
                  data-status-tone={tone}
                  aria-pressed={item.id === spotlightVehicleId}
                  onClick={() => onSelectVehicle(item.id)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectVehicle(item.id); }}
                >
                  <div>
                    <div className="vehicle-line">
                      <span className="plate-text">{item.plate}</span>
                      <span className={`status-pill ${statusClassForTone(tone)}`}>{item.status}</span>
                      {item.status !== '완료' ? <span className="status-pill">{Math.min(item.done + 1, routeStops[item.route].length)}번</span> : null}
                    </div>
                  </div>
                  <span className={`chip ${tone}`}>{remainingEta(endpoint, item)}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className={`card panel expand-card ${destinationNoteOpen ? 'expanded' : ''} ${destinationCollapsed ? 'collapsed' : ''}`} id="destinationCard">
          <aside className="left-expansion overlay-scroll" aria-label="배송지 노트">
            <div className="expansion-title"><span>{deliveryContext?.destination.name ?? stops[contextSelection.stopNo - 1]} 메모</span><span className="chip mini">{deliveryContext?.items.length ?? 0}품목</span></div>
            {deliveryContextLoading ? <div className="panel-state">배송지 정보를 불러오는 중입니다.</div> : null}
            {deliveryContextError ? <div className="panel-state error" role="alert">{deliveryContextError}</div> : null}
            {deliveryContext ? <div className="destination-context">
              <section aria-label="배송 품목"><h3>배송 품목</h3><div className="note-list cargo-note-list">{deliveryContext.items.map((item) => <div className="note-row done" key={item.orderItemId}><i>✓</i><span><b>{item.name}</b>{item.sku ?? '품목 코드 없음'}</span><em>{item.quantity}개</em></div>)}</div></section>
              <section aria-label="배송지 안내"><h3>배송지 안내</h3>{deliveryContext.tips.length ? <div className="note-list">{deliveryContext.tips.map((tip) => <div className={`note-row ${tip.severity === 'warning' ? 'warn' : 'done'}`} key={tip.tipId}><i>{tip.severity === 'warning' ? '!' : 'i'}</i><span><b>{tip.title}</b>{tip.body}</span></div>)}</div> : <div className="panel-state">등록된 배송지 팁이 없습니다.</div>}</section>
            </div> : null}
          </aside>
          <div className="tab-line section-heading">
            <span className="destination-title">배송지 리스트 <small>{stops.length}개</small></span>
            <button className={`panel-toggle ${destinationNoteOpen ? 'active' : ''}`} type="button" onClick={() => { setDestinationNoteOpen((open) => !open); setVehiclePanelOpen(false); }}>{destinationNoteOpen ? '닫기' : '노트'}</button>
          </div>
          <div className="stop-time-head" aria-hidden="true"><span>배송지</span><span>예상 도착</span><span>실제 도착</span></div>
          <div className="collapse-summary"><strong>{stops[currentStopIndex]}</strong><b>{formatTime(expectedArrivals[currentStopIndex])}</b></div>
          <div className="stops overlay-scroll" id="destinationList">
            {stops.map((name, index) => {
              const sequence = index + 1;
              const deliveryStopId = deliveryStopIdFor(vehicle.id, sequence);
              const tone = stopTone(vehicle, sequence);
              const actualArrival = vehicle.actualArrivals?.[index];
              const delta = arrivalDeltaMinutes(stopArrivals[index], expectedArrivals[index]);
              return (
                <div key={name} role="button" tabIndex={0} aria-pressed={selectedDeliveryStop?.deliveryStopId === deliveryStopId} className={`t ${tone === 'green' ? 'now' : ''} ${tone === 'gray' ? 'done' : ''}${selectedDeliveryStop?.deliveryStopId === deliveryStopId ? ' selected' : ''}`} data-status-tone={tone} data-delivery-stop-id={deliveryStopId} onClick={() => onSelectDeliveryStop({ deliveryStopId, stopNo: sequence, vehicleId: vehicle.id })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectDeliveryStop({ deliveryStopId, stopNo: sequence, vehicleId: vehicle.id }); }}>
                  <i>{sequence}</i>
                  <span>{name}</span>
                  <span className="stop-times"><time dateTime={expectedArrivals[index].toISOString()}>{formatTime(expectedArrivals[index])}{delta !== 0 ? <small className={delta > 0 ? 'late' : 'early'}>{formatDelta(delta)}</small> : null}</time><time className={actualArrival ? '' : 'empty'} dateTime={actualArrival}>{actualArrival ? formatTime(new Date(actualArrival)) : '-'}</time></span>
                </div>
              );
            })}
          </div>
          <button className="collapse-btn" type="button" onClick={() => setDestinationCollapsed((collapsed) => !collapsed)}>{destinationCollapsed ? '펼치기' : '접기'}</button>
        </section>
      </div>
    </aside>
  );
}

function routeEstimate(endpoint: string, vehicle: DemoVehicle): RouteEstimate {
  const waypoints = [routeOrigin.coordinate, ...routeCoordinates[vehicle.route]];
  return readCachedRoute(endpoint, vehicle.route) ?? fallbackRouteEstimate(waypoints);
}

function statusClassForTone(tone: ReturnType<typeof vehicleTone>): StatusClass {
  switch (tone) {
    case 'green':
      return 'moving';
    case 'gray':
      return 'completed';
    case 'blue':
      return 'loading';
  }
}

function remainingEta(endpoint: string, vehicle: DemoVehicle): string {
  if (vehicle.status === '완료') return '완료';
  if (vehicle.status === '하차중') return '도착';
  const duration = routeEstimate(endpoint, vehicle).legDurations[Math.min(vehicle.done, routeStops[vehicle.route].length - 1)] ?? 0;
  return `${Math.max(1, Math.ceil(duration / 60))}분 예상`;
}

function plannedArrivals(vehicle: DemoVehicle, estimate: RouteEstimate, dwellMinutes: number): Date[] {
  const startedAt = new Date(vehicle.routeStartedAt ?? 0).getTime();
  let travelSeconds = 0;
  return routeStops[vehicle.route].map((_, index) => {
    travelSeconds += estimate.legDurations[index] ?? 0;
    return new Date(startedAt + (travelSeconds + index * dwellMinutes * 60) * 1000);
  });
}

function rollingExpectedArrivals(planned: Date[], estimate: RouteEstimate, actual: string[] | undefined, dwellMinutes: number): Date[] {
  return planned.reduce<Date[]>((expected, arrival, index) => {
    if (index === 0) return [arrival];
    const previousArrival = actual?.[index - 1] ? new Date(actual[index - 1]) : expected[index - 1];
    expected.push(new Date(previousArrival.getTime() + ((estimate.legDurations[index] ?? 0) + dwellMinutes * 60) * 1000));
    return expected;
  }, []);
}

function arrivalDeltaMinutes(planned: Date, actual: Date): number {
  return Math.round((actual.getTime() - planned.getTime()) / 60_000);
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }).format(date);
}
