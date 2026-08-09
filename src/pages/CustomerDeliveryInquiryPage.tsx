import type { ReactElement } from 'react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { getCustomerInquiryPage } from '../dev-db/queries';
import type { OrderDetailViewModel } from '../dev-db/queries';
import { ProductHeader } from '../components/MapControls';
import { apiConfig } from '../api/config';
import { loadRemoteCustomerDeliveries } from '../services/customer-deliveries';
import type { CustomerDeliveryItem, RemoteCustomerDeliveries } from '../services/customer-deliveries';
import type { MapCanvasPoint, MapCanvasRoute } from '../components/MapCanvas';
import { ServiceDateSelector, todayInSeoul } from '../components/ServiceDateSelector';

const MapCanvas = lazy(() => import('../components/MapCanvas').then((module) => ({ default: module.MapCanvas })));
const locationRefreshIntervalMs = 60_000;

type CustomerDeliveryInquiryPageProps = {
  adminCustomerId?: string;
  principalDisplayName?: string;
};

export function CustomerDeliveryInquiryPage({ adminCustomerId, principalDisplayName }: CustomerDeliveryInquiryPageProps = {}): ReactElement {
  if (apiConfig.mode === 'remote') {
    return <RemoteCustomerDeliveryInquiryPage adminCustomerId={adminCustomerId} principalDisplayName={principalDisplayName} />;
  }
  return <MockCustomerDeliveryInquiryPage />;
}

function MockCustomerDeliveryInquiryPage(): ReactElement {
  const query = new URLSearchParams(window.location.search);
  const [selectedCustomerId] = useState(() => query.get('customer') ?? undefined);
  const [selectedDayOffset, setSelectedDayOffset] = useState(() => {
    const dayOffset = Number(query.get('day') ?? 0);
    return Number.isFinite(dayOffset) ? dayOffset : 0;
  });
  const [selectedOrderKey, setSelectedOrderKey] = useState<string>();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>();
  const page = getCustomerInquiryPage(selectedCustomerId, selectedDayOffset, selectedOrderKey, selectedVehicleId);
  const selectDay = (dayOffset: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set('customer', page.customerId);
    url.searchParams.set('day', String(dayOffset));
    url.searchParams.delete('order');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    setSelectedDayOffset(dayOffset);
    setSelectedOrderKey(undefined);
    setSelectedVehicleId(undefined);
  };

  return (
    <main className="page customer-delivery-demo">
      <div className="top-cluster">
        <ProductHeader title="CLEVER 배송조회" section={page.customerName.replace(' Demo', '')} />
      </div>
      <section className="grid" aria-label="고객사 배송 조회">
        <Suspense fallback={<article className="card map-card" aria-label="지도 불러오는 중" />}>
          <MapCanvas ariaLabel="고객 배송조회 지도 - OpenFreeMap" />
        </Suspense>
        <CustomerOrderPanel
          order={page.order}
          orders={page.orders}
          dateOptions={page.dateOptions}
          selectedDate={page.selectedDate}
          selectedDayOffset={page.dayOffset}
          onSelectDay={selectDay}
          onSelectOrder={(orderKey) => {
            setSelectedOrderKey(orderKey);
            setSelectedVehicleId(undefined);
          }}
          onSelectVehicle={setSelectedVehicleId}
        />
      </section>
    </main>
  );
}

function CustomerOrderPanel({
  order,
  orders,
  dateOptions,
  selectedDate,
  selectedDayOffset,
  onSelectDay,
  onSelectOrder,
  onSelectVehicle,
}: {
  order?: OrderDetailViewModel;
  orders: ReturnType<typeof getCustomerInquiryPage>['orders'];
  dateOptions: ReturnType<typeof getCustomerInquiryPage>['dateOptions'];
  selectedDate: string;
  selectedDayOffset: number;
  onSelectDay: (dayOffset: number) => void;
  onSelectOrder?: (orderKey: string) => void;
  onSelectVehicle?: (vehicleId: string) => void;
}): ReactElement {
  const selectedVehicle = order?.selectedVehicle;

  return (
    <section className="customer-order-card overlay-scroll" aria-label="고객 주문 상세">
      <div className="customer-section" aria-label="배송조회 날짜">
        <div className="customer-section-head"><span>배송조회</span><span>3일</span></div>
        <div className="customer-date-tabs">
          {dateOptions.map((option) => (
            <button key={option.dayOffset} type="button" className={option.dayOffset === selectedDayOffset ? 'active' : ''} aria-pressed={option.dayOffset === selectedDayOffset} onClick={() => onSelectDay(option.dayOffset)}>
              <strong>{option.label}</strong><small>{option.date.slice(5)}</small>
            </button>
          ))}
        </div>
      </div>

      {order ? <>
        <div className="customer-section" aria-label="주문 목록">
          <div className="customer-section-head"><span>주문 목록</span><span>{orders.length}건</span></div>
          <div className="customer-list">
            {orders.map((item) => (
              <button key={item.orderKey} type="button" className={`customer-route-group${item.orderKey === order.orderKey ? ' active' : ''}`} onClick={() => onSelectOrder?.(item.orderKey)}>
                <span className="customer-route-head"><strong>{item.orderKey}</strong><span>{customerOrderStatus(item.status)}</span></span>
                <small>{item.title} ({item.routeName})</small>
              </button>
            ))}
          </div>
        </div>

      <div className="customer-order-head">
        <div>
          <strong>{order.title}</strong>
          <small>{order.orderKey} ({order.routeName})</small>
        </div>
        <span className="chip gray">{selectedVehicle ? (order.isMultiVehicle ? '다중 차량' : '단일 차량') : '미배차'}</span>
      </div>

      {selectedVehicle ? <>
      <div className="customer-status-grid">
        <div className="customer-status-item remaining"><span>남은 시간</span><b>{selectedVehicle.remainingTime}</b></div>
        <div className="customer-status-item"><span>도착 예정</span><b>{selectedVehicle.arrivalEta}</b></div>
        <div className="customer-status-item"><span>하차 예상</span><b>{selectedVehicle.dwellUnloadEstimate}</b></div>
      </div>

      <div className="customer-section">
        <div className="customer-section-head"><span>차량 배정</span><span>{order.vehicles.length}대</span></div>
        <div className="customer-list">
          {order.vehicles.map((vehicle) => (
            <button key={vehicle.id} type="button" className={`customer-vehicle-target${vehicle.id === selectedVehicle.id ? ' active' : ''}`} data-status-tone={vehicle.tone} onClick={() => onSelectVehicle?.(vehicle.id)}>
              <strong>{vehicle.label}</strong>
              <span>{vehicle.driver} ({vehicle.plate})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="customer-section">
        <div className="customer-section-head"><span>배송지</span><span>순번은 경로 계획에서 재산정</span></div>
        <div className="customer-list">
          {selectedVehicle.destinations.map((stop) => (
            <div key={`${stop.sequence}-${stop.address}`} className={`customer-destination-row status-${stop.tone}`} data-status-tone={stop.tone}>
              <i>{stop.sequence}</i>
              <div><strong>{stop.customerName}</strong><small>{stop.address}</small></div>
              <span className={`chip ${stop.tone}`}>{customerOrderStatus(stop.statusLabel)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="customer-cargo">
        <div className="customer-cargo-title">주문 품목</div>
        {selectedVehicle.cargo.map((item) => (
          <div key={`${item.name}-${item.quantity}`} className="customer-cargo-row"><span>{item.name}</span><b>{item.quantity}</b></div>
        ))}
      </div>
      </> : <div className="customer-empty-state" role="status"><strong>배차 정보 없음</strong><span>고정차량배차리스트를 기준으로 차량과 배송원을 다시 연결합니다.</span></div>}
      </> : <div className="customer-empty-state" role="status"><strong>주문 없음</strong><span>{selectedDate}에는 조회할 배송 주문이 없습니다.</span></div>}
    </section>
  );
}

function customerOrderStatus(status: 'completed' | 'current' | 'planned'): string {
  if (status === 'completed') return '배송 이력';
  if (status === 'current') return '진행중';
  return '예정';
}

type RemoteInquiryState =
  | { status: 'loading' }
  | { status: 'ready'; data: RemoteCustomerDeliveries }
  | { status: 'error'; message: string };

type CustomerInquiryView = 'control' | 'history';

function RemoteCustomerDeliveryInquiryPage({
  adminCustomerId,
  principalDisplayName,
}: CustomerDeliveryInquiryPageProps): ReactElement {
  const [state, setState] = useState<RemoteInquiryState>({ status: 'loading' });
  const [selectedKey, setSelectedKey] = useState<string>();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>();
  const [searchValue, setSearchValue] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDestinationId, setSearchDestinationId] = useState<string>();
  const [serviceDate, setServiceDate] = useState(() => (
    new URLSearchParams(window.location.search).get('serviceDate') ?? todayInSeoul()
  ));
  const [view, setView] = useState<CustomerInquiryView>(() => (
    new URLSearchParams(window.location.search).get('view') === 'history' ? 'history' : 'control'
  ));

  useEffect(() => {
    const controller = new AbortController();
    let initial = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const data = await loadRemoteCustomerDeliveries({ adminCustomerId, serviceDate, signal: controller.signal });
        setState({ status: 'ready', data });
        const groups = customerDestinationGroups(data.deliveries);
        setSelectedKey((current) => current && groups.some((group) => group.destinationId === current) ? current : undefined);
        const vehicles = customerVehicleGroups(data.deliveries);
        setSelectedVehicleId((current) => current && vehicles.some((vehicle) => vehicle.id === current) ? current : undefined);
        initial = false;
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        if (initial) {
          setState({ status: 'error', message: error instanceof Error ? error.message : '고객 배송 조회를 불러올 수 없습니다.' });
        }
      } finally {
        refreshing = false;
      }
    };
    setState({ status: 'loading' });
    void refresh();
    const refreshTimer = window.setInterval(() => void refresh(), locationRefreshIntervalMs);
    return () => {
      controller.abort();
      window.clearInterval(refreshTimer);
    };
  }, [adminCustomerId, serviceDate]);

  if (state.status === 'loading') {
    return (
      <main className="page customer-delivery-demo">
        <section className="customer-order-card customer-account-boundary" aria-label="고객 배송 조회">
          <div className="customer-empty-state" role="status"><strong>배송 조회 불러오는 중</strong><span>세션 범위의 원격 배송 요약을 확인하고 있습니다.</span></div>
        </section>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="page customer-delivery-demo">
        <section className="customer-order-card customer-account-boundary" aria-label="고객 배송 조회">
          <div className="customer-empty-state" role="alert"><strong>배송 조회 차단</strong><span>{state.message}</span></div>
        </section>
      </main>
    );
  }

  const customerName = state.data.customerDisplayName
    ?? (adminCustomerId === undefined ? principalDisplayName : undefined)
    ?? '고객사 배송조회';
  const viewDeliveries = view === 'history'
    ? state.data.deliveries.filter(isCompletedCustomerDelivery)
    : state.data.deliveries;
  const vehicleGroups = customerVehicleGroups(viewDeliveries);
  const activeVehicleId = vehicleGroups.some((vehicle) => vehicle.id === selectedVehicleId) ? selectedVehicleId : undefined;
  const visibleDeliveries = activeVehicleId === undefined
    ? viewDeliveries
    : viewDeliveries.filter((delivery) => customerVehicleGroupId(delivery) === activeVehicleId);
  const destinationGroups = customerDestinationGroups(visibleDeliveries);
  const selected = destinationGroups.find((group) => group.destinationId === selectedKey);
  const searchResult = destinationGroups.find((group) => group.destinationId === searchDestinationId);
  const displayedDestinationGroups = searchResult === undefined
    ? destinationGroups
    : [searchResult, ...destinationGroups.filter((group) => group.destinationId !== searchResult.destinationId)];
  const searchCandidates = customerSearchCandidates(viewDeliveries, searchValue);
  const points = customerMapPoints(destinationGroups);
  const vehicles = customerVehiclePoints(visibleDeliveries);
  const visibleRoutes = view === 'history'
    ? []
    : activeVehicleId === undefined
      ? state.data.routes
      : state.data.routes.filter((route) => route.vehicleId === activeVehicleId);
  const routes = customerMapRoutes(visibleRoutes, activeVehicleId !== undefined);
  const departureLocation = state.data.departureLocation === undefined ? null : {
    address: state.data.departureLocation.address ?? '물류센터',
    latitude: state.data.departureLocation.latitude,
    longitude: state.data.departureLocation.longitude,
  };

  const selectView = (nextView: CustomerInquiryView) => {
    const url = new URL(window.location.href);
    if (nextView === 'control') url.searchParams.delete('view');
    else url.searchParams.set('view', nextView);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    setView(nextView);
    setSelectedVehicleId(undefined);
    setSelectedKey(undefined);
    setSearchDestinationId(undefined);
  };

  const selectVehicle = (vehicleId: string) => {
    const nextVehicleId = activeVehicleId === vehicleId ? undefined : vehicleId;
    setSelectedVehicleId(nextVehicleId);
    setSelectedKey(undefined);
    setSearchDestinationId(undefined);
  };

  const selectServiceDate = (nextServiceDate: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('serviceDate', nextServiceDate);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    setSelectedVehicleId(undefined);
    setSelectedKey(undefined);
    setSearchDestinationId(undefined);
    setSearchValue('');
    setSearchOpen(false);
    setServiceDate(nextServiceDate);
  };

  const selectSearchCandidate = (candidate: CustomerSearchCandidate) => {
    setSelectedVehicleId(candidate.vehicleId);
    setSelectedKey(candidate.destinationId);
    setSearchDestinationId(candidate.destinationId);
    setSearchValue(candidate.label);
    setSearchOpen(false);
  };

  return (
    <main className="page customer-delivery-demo nav-expanded">
      <CustomerNavigation customerName={customerName} onSelect={selectView} view={view} />
      <section className="grid" aria-label="고객사 배송 조회">
        <Suspense fallback={<article className="card map-card" aria-label="지도 불러오는 중" />}>
          <MapCanvas
            ariaLabel="고객사 배송지 지도"
            departureLocation={departureLocation}
            onPointSelect={(destinationId) => {
              const group = destinationGroups.find((item) => item.destinationId === destinationId);
              if (group !== undefined) {
                setSearchDestinationId(undefined);
                setSelectedKey(group.destinationId);
              }
            }}
            points={points}
            routes={routes}
            selectedPointId={selected?.destinationId}
            selectedPointIds={activeVehicleId === undefined ? [] : destinationGroups.map((group) => group.destinationId)}
            showEveryPoint
            vehicles={vehicles}
          />
        </Suspense>
        <div className="customer-map-tools">
          <ServiceDateSelector
            label="조회 기준일"
            onChange={(value) => { if (value !== undefined) selectServiceDate(value); }}
            serviceDate={serviceDate}
          />
          <div
            className="customer-search-card"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false);
            }}
          >
            <label className="customer-search-field">
              <Search aria-hidden="true" />
              <input
                aria-label="고객사 배송 검색"
                autoComplete="off"
                onChange={(event) => {
                  setSearchValue(event.target.value);
                  setSearchDestinationId(undefined);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                placeholder="주문 번호, 배송처 이름, 주소 검색"
                type="search"
                value={searchValue}
              />
            </label>
            {searchOpen && searchValue.trim() !== '' && searchCandidates.length ? (
              <div className="customer-search-suggestions" role="listbox" aria-label="검색 후보">
                {searchCandidates.map((candidate) => (
                  <button
                    aria-selected="false"
                    key={candidate.id}
                    type="button"
                    role="option"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => selectSearchCandidate(candidate)}
                  >
                    <small>{candidate.kind}</small>
                    <strong>{candidate.label}</strong>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <aside className="customer-control-side" aria-label="고객사 관제 패널">
          <section className="card panel expand-card customer-panel customer-vehicle-panel" aria-label="차량 목록">
            <CustomerPanelHeader
              count={`${vehicleGroups.length}대`}
              label="차량 목록"
            />
            {vehicleGroups.length ? (
              <div className="customer-vehicle-list overlay-scroll">
                {vehicleGroups.map((vehicle) => (
                  <button
                    key={vehicle.id}
                    type="button"
                    className={`customer-vehicle-row${vehicle.id === activeVehicleId ? ' active' : ''}`}
                    aria-pressed={vehicle.id === activeVehicleId}
                    onClick={() => selectVehicle(vehicle.id)}
                  >
                    <span><strong>{vehicle.label}</strong><small>{vehicle.orderCount}건 주문</small></span>
                    <b>{vehicle.destinationCount}곳</b>
                  </button>
                ))}
              </div>
            ) : <CustomerPanelEmpty label={view === 'history' ? '완료 차량 없음' : '배정 차량 없음'} />}
          </section>

          <section className="customer-order-card card panel expand-card customer-panel customer-destination-panel" aria-label="배송지 리스트">
            <CustomerPanelHeader
              count={`${destinationGroups.length}곳`}
              label={view === 'history' ? '배송 이력' : '배송지 리스트'}
            />
            {destinationGroups.length ? (
              <div className="customer-destination-list overlay-scroll">
                <div className="customer-destination-columns" aria-hidden="true">
                  <span>배송지</span><span>주문</span><span>도착 예정</span><span>실제 도착</span>
                </div>
                {displayedDestinationGroups.map((group) => {
                  const active = group.destinationId === selected?.destinationId;
                  const searchMatch = group.destinationId === searchDestinationId;
                  return (
                    <button
                      key={group.destinationId}
                      type="button"
                      className={`customer-destination-card${active ? ' active' : ''}${searchMatch ? ' search-match' : ''}`}
                      aria-expanded={active}
                      onClick={() => {
                        setSearchDestinationId(undefined);
                        setSelectedKey((current) => current === group.destinationId ? undefined : group.destinationId);
                      }}
                    >
                      <span className="customer-destination-card-summary">
                        <i aria-label={`배송지 순서 ${group.destinationSequence}`}>{group.destinationSequence}</i>
                        <span className="customer-destination-card-copy">
                          <strong>{group.destinationDisplayName}</strong>
                          {searchMatch ? <small>검색 결과</small> : null}
                        </span>
                        <span className="customer-destination-order-count">{group.orderCount}건</span>
                        <time>{formatCustomerTime(group.sharedEstimatedArrivalAt)}</time>
                        <time className={group.sharedActualCompletedAt === undefined ? 'empty' : 'completed'}>{formatCustomerTime(group.sharedActualCompletedAt)}</time>
                      </span>
                      {active ? <RemoteCustomerDeliveryDetail delivery={group} /> : null}
                    </button>
                  );
                })}
              </div>
            ) : <div className="customer-empty-state" role="status"><strong>배송 없음</strong><span>{state.data.emptyReason ?? '세션 범위에서 조회할 배송이 없습니다.'}</span></div>}
          </section>
        </aside>
      </section>
    </main>
  );
}

function CustomerNavigation({
  customerName,
  onSelect,
  view,
}: {
  customerName: string;
  onSelect: (view: CustomerInquiryView) => void;
  view: CustomerInquiryView;
}): ReactElement {
  return (
    <nav className="left-tabs customer-navigation" aria-label="고객사 메뉴">
      <div className="sidebar-brand customer-navigation-brand">
        <span className="sidebar-brand-mark" aria-hidden="true">C</span>
        <h1 className="sidebar-brand-title">CLEVER DSV</h1>
      </div>
      <strong className="customer-navigation-name" title={customerName}>{customerName}</strong>
      <button type="button" className={`main-tab${view === 'control' ? ' active' : ''}`} aria-current={view === 'control' ? 'page' : undefined} onClick={() => onSelect('control')}>
        <span className="main-tab-copy"><strong>관제</strong><small>배송 위치 확인</small></span>
      </button>
      <button type="button" className={`main-tab${view === 'history' ? ' active' : ''}`} aria-current={view === 'history' ? 'page' : undefined} onClick={() => onSelect('history')}>
        <span className="main-tab-copy"><strong>이력</strong><small>완료 배송 확인</small></span>
      </button>
    </nav>
  );
}

function CustomerPanelHeader({
  count,
  label,
}: {
  count: string;
  label: string;
}): ReactElement {
  return (
    <div className="customer-panel-head">
      <strong>{label}</strong>
      <span>{count}</span>
    </div>
  );
}

function CustomerPanelEmpty({ label }: { label: string }): ReactElement {
  return <div className="customer-panel-empty" role="status">{label}</div>;
}

function RemoteCustomerDeliveryDetail({ delivery }: { delivery: CustomerDestinationGroup }): ReactElement {
  return (
    <span className="customer-destination-card-detail">
      <span className="customer-destination-facts">
        <span className="customer-destination-address"><small>주소</small><b>{delivery.destinationAddress ?? '주소 확인 중'}</b></span>
        <span><small>박스</small><b>{delivery.shippedBoxes}개</b></span>
      </span>
      <span className="customer-destination-orders" aria-label={`${delivery.destinationDisplayName} 주문 목록`}>
        {delivery.orders.map((order) => (
          <span key={order.sellerOrderId} className="customer-destination-order">
            <span><strong>{order.sellerOrderKey}</strong><small>{order.latestCustomerMessage?.body ?? order.deliveryStatus}</small></span>
            <b>{order.shippedBoxes}박스</b>
          </span>
        ))}
      </span>
    </span>
  );
}

type CustomerDestinationGroup = {
  destinationSequence: number;
  destinationAddress?: string;
  destinationDisplayName: string;
  destinationId: string;
  eventSummary: CustomerDeliveryItem['eventSummary'];
  latitude?: number;
  longitude?: number;
  orderCount: number;
  orders: CustomerDeliveryItem[];
  sharedActualCompletedAt?: string;
  sharedEstimatedArrivalAt?: string;
  shippedBoxes: number;
};

type CustomerVehicleGroup = {
  destinationCount: number;
  id: string;
  label: string;
  orderCount: number;
};

type CustomerSearchCandidate = {
  destinationId: string;
  id: string;
  kind: '주소' | '주문 번호' | '배송처 이름';
  label: string;
  vehicleId?: string;
};

const unassignedCustomerVehicleId = '__unassigned__';

function customerSearchCandidates(deliveries: CustomerDeliveryItem[], query: string): CustomerSearchCandidate[] {
  const normalizedQuery = normalizeCustomerSearch(query);
  if (normalizedQuery === '') return [];
  const candidates = new Map<string, CustomerSearchCandidate>();
  for (const delivery of deliveries) {
    addCustomerSearchCandidate(candidates, {
      destinationId: delivery.destinationId,
      id: `order:${delivery.sellerOrderId}`,
      kind: '주문 번호',
      label: delivery.sellerOrderKey,
      vehicleId: delivery.vehicleId,
    });
    addCustomerSearchCandidate(candidates, {
      destinationId: delivery.destinationId,
      id: `destination:${delivery.destinationId}`,
      kind: '배송처 이름',
      label: delivery.destinationDisplayName,
    });
    const address = customerAddressLabel(delivery.destinationAddress);
    if (address !== undefined) {
      addCustomerSearchCandidate(candidates, {
        destinationId: delivery.destinationId,
        id: `address:${delivery.destinationId}`,
        kind: '주소',
        label: address,
      });
    }
  }
  return [...candidates.values()]
    .filter((candidate) => normalizeCustomerSearch(candidate.label).includes(normalizedQuery))
    .slice(0, 10);
}

function addCustomerSearchCandidate(
  candidates: Map<string, CustomerSearchCandidate>,
  candidate: CustomerSearchCandidate,
): void {
  if (candidate.label.trim() !== '' && !candidates.has(candidate.id)) candidates.set(candidate.id, candidate);
}

function normalizeCustomerSearch(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, '').toLocaleLowerCase('ko-KR');
}

function customerDestinationGroups(deliveries: CustomerDeliveryItem[]): CustomerDestinationGroup[] {
  const groups = new Map<string, CustomerDeliveryItem[]>();
  for (const delivery of deliveries) {
    const group = groups.get(delivery.destinationId);
    if (group === undefined) {
      groups.set(delivery.destinationId, [delivery]);
      continue;
    }
    group.push(delivery);
  }

  return [...groups.entries()]
    .map(([destinationId, orders]) => {
      const sortedOrders = [...orders].sort(compareCustomerDeliveryOrder);
      const anchor = sortedOrders[0];
      const coordinateAnchor = sortedOrders.find((order) => order.latitude !== undefined && order.longitude !== undefined);
      return {
        destinationSequence: 0,
        destinationAddress: customerAddressLabel(anchor.destinationAddress),
        destinationDisplayName: anchor.destinationDisplayName,
        destinationId,
        eventSummary: sortedOrders.flatMap((order) => order.eventSummary),
        latitude: coordinateAnchor?.latitude,
        longitude: coordinateAnchor?.longitude,
        orderCount: sortedOrders.length,
        orders: sortedOrders,
        sharedActualCompletedAt: sharedActualCompletedAt(sortedOrders),
        sharedEstimatedArrivalAt: sharedEstimatedArrivalAt(sortedOrders),
        shippedBoxes: sortedOrders.reduce((total, order) => total + order.shippedBoxes, 0),
      };
    })
    .sort(compareCustomerDestinationGroup)
    .map((group, index) => ({ ...group, destinationSequence: index + 1 }));
}

function compareCustomerDeliveryOrder(left: CustomerDeliveryItem, right: CustomerDeliveryItem): number {
  const leftTime = deliveryOrderTime(left);
  const rightTime = deliveryOrderTime(right);
  if (leftTime !== rightTime) return leftTime - rightTime;
  return left.sellerOrderKey.localeCompare(right.sellerOrderKey, 'ko');
}

function compareCustomerDestinationGroup(left: CustomerDestinationGroup, right: CustomerDestinationGroup): number {
  const leftTime = customerTimeValue(left.sharedEstimatedArrivalAt);
  const rightTime = customerTimeValue(right.sharedEstimatedArrivalAt);
  if (leftTime !== rightTime) return leftTime - rightTime;
  return left.destinationId.localeCompare(right.destinationId, 'ko');
}

function deliveryOrderTime(delivery: CustomerDeliveryItem): number {
  const value = delivery.estimatedArrivalAt ?? delivery.actualCompletedAt;
  return customerTimeValue(value);
}

function customerTimeValue(value?: string): number {
  if (value === undefined) return Number.MAX_SAFE_INTEGER;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function sharedEstimatedArrivalAt(deliveries: CustomerDeliveryItem[]): string | undefined {
  return deliveries
    .map((delivery) => delivery.estimatedArrivalAt)
    .filter((value): value is string => value !== undefined && !Number.isNaN(new Date(value).getTime()))
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0];
}

function sharedActualCompletedAt(deliveries: CustomerDeliveryItem[]): string | undefined {
  if (deliveries.some((delivery) => delivery.actualCompletedAt === undefined)) return undefined;
  return deliveries
    .map((delivery) => delivery.actualCompletedAt)
    .filter((value): value is string => value !== undefined && !Number.isNaN(new Date(value).getTime()))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
}

function customerVehicleGroups(deliveries: CustomerDeliveryItem[]): CustomerVehicleGroup[] {
  const groups = new Map<string, CustomerDeliveryItem[]>();
  for (const delivery of deliveries) {
    const id = customerVehicleGroupId(delivery);
    const group = groups.get(id);
    if (group === undefined) groups.set(id, [delivery]);
    else group.push(delivery);
  }
  return [...groups.entries()]
    .map(([id, orders]) => ({
      destinationCount: new Set(orders.map((order) => order.destinationId)).size,
      id,
      label: orders.find((order) => order.vehicleDisplayName?.trim())?.vehicleDisplayName ?? '미배정',
      orderCount: orders.length,
    }))
    .sort((left, right) => {
      if (left.id === unassignedCustomerVehicleId) return 1;
      if (right.id === unassignedCustomerVehicleId) return -1;
      return left.label.localeCompare(right.label, 'ko');
    });
}

function customerVehicleGroupId(delivery: CustomerDeliveryItem): string {
  return delivery.vehicleId ?? unassignedCustomerVehicleId;
}

function isCompletedCustomerDelivery(delivery: CustomerDeliveryItem): boolean {
  return delivery.actualCompletedAt !== undefined || delivery.deliveryStatus === 'DELIVERED';
}

function customerMapPoints(groups: CustomerDestinationGroup[]): MapCanvasPoint[] {
  return groups.flatMap((group) => (
    group.latitude !== undefined && group.longitude !== undefined
      ? [{
          color: '#0066cc',
          id: group.destinationId,
          label: String(group.destinationSequence),
          latitude: group.latitude,
          longitude: group.longitude,
          sortOrder: group.destinationSequence,
          tone: 'assigned' as const,
        }]
      : []
  ));
}

function customerMapRoutes(routes: RemoteCustomerDeliveries['routes'], selected: boolean): MapCanvasRoute[] {
  return routes.map((route) => ({
    color: '#0066cc',
    coordinates: route.coordinates,
    id: route.vehicleId,
    selected,
  }));
}

function customerAddressLabel(value?: string): string | undefined {
  if (value === undefined) return undefined;
  const parts = splitAddressParts(value);
  const uniqueParts = parts.filter((part, index) => (
    index === 0 || normalizedAddressPart(part) !== normalizedAddressPart(parts[index - 1] ?? '')
  ));
  const normalized = uniqueParts.join(', ').trim();
  return normalized === '' ? undefined : normalized;
}

function splitAddressParts(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '(') depth += 1;
    if (character === ')') depth = Math.max(0, depth - 1);
    if (character !== ',' || depth !== 0) continue;
    const part = value.slice(start, index).trim();
    if (part !== '') parts.push(part);
    start = index + 1;
  }
  const tail = value.slice(start).trim();
  if (tail !== '') parts.push(tail);
  return parts;
}

function normalizedAddressPart(value: string): string {
  return value.normalize('NFKC').replace(/[\s,]/gu, '').toLocaleLowerCase('ko-KR');
}

function customerVehiclePoints(deliveries: CustomerDeliveryItem[]) {
  const seen = new Set<string>();
  return deliveries.flatMap((delivery) => {
    if (
      delivery.vehicleId === undefined
      || delivery.vehicleLatitude === undefined
      || delivery.vehicleLongitude === undefined
      || seen.has(delivery.vehicleId)
    ) return [];
    seen.add(delivery.vehicleId);
    return [{
      id: delivery.vehicleId,
      label: delivery.vehicleDisplayName ?? '배송 차량',
      latitude: delivery.vehicleLatitude,
      longitude: delivery.vehicleLongitude,
    }];
  });
}

function formatCustomerTime(value?: string): string {
  if (value === undefined) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(date);
}
