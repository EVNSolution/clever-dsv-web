import type { ReactElement } from 'react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { getCustomerInquiryPage } from '../dev-db/queries';
import type { OrderDetailViewModel } from '../dev-db/queries';
import { ProductHeader } from '../components/MapControls';
import { apiConfig } from '../api/config';
import { loadRemoteCustomerDeliveries } from '../services/customer-deliveries';
import type { RemoteCustomerDeliveries } from '../services/customer-deliveries';
import type { DeliverySummary } from '../services/records';

const MapCanvas = lazy(() => import('../components/MapCanvas').then((module) => ({ default: module.MapCanvas })));

export function CustomerDeliveryInquiryPage(): ReactElement {
  if (apiConfig.mode === 'remote') return <RemoteCustomerDeliveryInquiryPage />;
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

function RemoteCustomerDeliveryInquiryPage(): ReactElement {
  const [state, setState] = useState<RemoteInquiryState>({ status: 'loading' });
  const [selectedKey, setSelectedKey] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    loadRemoteCustomerDeliveries(controller.signal)
      .then((data) => {
        setState({ status: 'ready', data });
        setSelectedKey((current) => current && data.deliveries.some((delivery) => delivery.sellerOrderKey === current) ? current : data.deliveries[0]?.sellerOrderKey);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : '고객 배송 조회를 불러올 수 없습니다.' });
      });
    return () => controller.abort();
  }, []);

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

  const selected = state.data.deliveries.find((delivery) => delivery.sellerOrderKey === selectedKey) ?? state.data.deliveries[0];

  return (
    <main className="page customer-delivery-demo">
      <section className="customer-order-card overlay-scroll" aria-label="고객 배송 조회">
        <div className="customer-section" aria-label="배송조회">
          <div className="customer-section-head"><span>배송조회</span><span>{remoteCountLabel(state.data)}</span></div>
        </div>
        {state.data.deliveries.length ? <>
          <div className="customer-section" aria-label="주문 목록">
            <div className="customer-section-head"><span>주문 목록</span><span>{state.data.deliveries.length}건</span></div>
            <div className="customer-list">
              {state.data.deliveries.map((delivery) => (
                <button key={delivery.sellerOrderKey} type="button" className={`customer-route-group${delivery.sellerOrderKey === selected?.sellerOrderKey ? ' active' : ''}`} onClick={() => setSelectedKey(delivery.sellerOrderKey)}>
                  <span className="customer-route-head"><strong>{delivery.sellerOrderKey}</strong><span>{delivery.deliveryStatus}</span></span>
                  <small>{delivery.destinationDisplayName}</small>
                </button>
              ))}
            </div>
          </div>

          {selected ? <RemoteCustomerDeliveryDetail delivery={selected} /> : null}
        </> : <div className="customer-empty-state" role="status"><strong>배송 없음</strong><span>{state.data.emptyReason ?? '세션 범위에서 조회할 배송이 없습니다.'}</span></div>}
      </section>
    </main>
  );
}

function RemoteCustomerDeliveryDetail({ delivery }: { delivery: DeliverySummary }): ReactElement {
  return (
    <>
      <div className="customer-order-head">
        <div>
          <strong>{delivery.destinationDisplayName}</strong>
          <small>{delivery.sellerOrderKey}</small>
        </div>
        <span className="chip green">{delivery.deliveryStatus}</span>
      </div>

      <div className="customer-status-grid">
        <div className="customer-status-item remaining"><span>ETA 상태</span><b>{delivery.etaStatus}</b></div>
        <div className="customer-status-item"><span>도착 예정</span><b>{delivery.estimatedArrivalAt ?? '요약 없음'}</b></div>
        <div className="customer-status-item"><span>확인 상태</span><b>{delivery.proofStatus}</b></div>
      </div>

      <div className="customer-section">
        <div className="customer-section-head"><span>이벤트 요약</span><span>{delivery.eventSummary.length}건</span></div>
        <div className="customer-list">
          {delivery.eventSummary.length ? delivery.eventSummary.map((event) => (
            <div key={`${event.type}-${event.occurredAt}`} className="customer-destination-row status-current" data-status-tone="current">
              <i>요</i>
              <div><strong>{event.type}</strong><small>{event.occurredAt}</small></div>
              <span className="chip blue">요약</span>
            </div>
          )) : (
            <div className="customer-empty-state" role="status"><strong>이벤트 없음</strong><span>세부 내역은 원격 v1 요약 응답에서 제공되지 않습니다.</span></div>
          )}
        </div>
      </div>
    </>
  );
}

function remoteCountLabel(data: RemoteCustomerDeliveries): string {
  return `${data.deliveries.length}건`;
}
