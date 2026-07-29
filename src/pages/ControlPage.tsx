import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { apiConfig } from '../api/config';
import { loadControlSummary } from '../services/control';
import type { ControlSummary } from '../services/control';
import { loadDispatchList } from '../services/dispatch';
import type { DispatchListItem } from '../services/dispatch';
import { loadControlManagementSnapshot } from '../services/management';
import type { ManagementData } from '../demo/management';

type MobileControlPanel = 'orders' | 'vehicles';
type ManufacturerOrderGroup = {
  id: string;
  name: string;
  orders: DispatchListItem[];
};

const mobileControlQuery = '(max-width: 768px)';

export function ControlPage(): ReactElement {
  if (apiConfig.mode === 'remote') return <RemoteControlPage />;
  return (
    <ControlPanels
      loading={false}
      manufacturerOrders={[]}
      ordersCount={0}
      vehicles={[]}
    />
  );
}

export function ControlPreviewPanels(): ReactElement {
  return (
    <ControlPanels
      loading
      manufacturerOrders={[]}
      ordersCount={0}
      vehicles={[]}
    />
  );
}

function RemoteControlPage(): ReactElement {
  const [summary, setSummary] = useState<ControlSummary>();
  const [management, setManagement] = useState<ManagementData>();
  const [orders, setOrders] = useState<DispatchListItem[]>([]);
  const [panelError, setPanelError] = useState('');
  const [panelLoading, setPanelLoading] = useState(true);

  useEffect(() => {
    const summaryController = new AbortController();
    const dispatchController = new AbortController();
    setPanelLoading(true);
    setPanelError('');
    loadControlSummary(summaryController.signal)
      .then(async (nextSummary) => {
        if (summaryController.signal.aborted) return;
        setSummary(nextSummary);
        const [nextManagement, dispatch] = await Promise.all([
          loadControlManagementSnapshot(),
          loadDispatchList(nextSummary.serviceDate, dispatchController.signal),
        ]);
        if (summaryController.signal.aborted || dispatchController.signal.aborted) return;
        setManagement(nextManagement);
        setOrders(dispatch.rows);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSummary(undefined);
        setManagement(undefined);
        setOrders([]);
        setPanelError(error instanceof Error ? error.message : '관제 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!summaryController.signal.aborted && !dispatchController.signal.aborted) setPanelLoading(false);
      });
    return () => {
      summaryController.abort();
      dispatchController.abort();
    };
  }, []);

  return (
    <ControlPanels
      error={panelError}
      loading={panelLoading}
      manufacturerOrders={groupOrdersByManufacturer(orders, management)}
      ordersCount={orders.length}
      summary={summary}
      vehicles={management?.vehicles ?? []}
      assignments={management?.assignments ?? []}
    />
  );
}

function ControlPanels({
  assignments = [],
  error = '',
  loading,
  manufacturerOrders,
  ordersCount,
  summary,
  vehicles,
}: {
  assignments?: ManagementData['assignments'];
  error?: string;
  loading: boolean;
  manufacturerOrders: ManufacturerOrderGroup[];
  ordersCount: number;
  summary?: ControlSummary;
  vehicles: ManagementData['vehicles'];
}): ReactElement {
  const [mobilePanel, setMobilePanel] = useState<MobileControlPanel>();

  useEffect(() => {
    const compactViewport = window.matchMedia(mobileControlQuery);
    const closeOutsideMobile = (event: MediaQueryListEvent) => {
      if (!event.matches) setMobilePanel(undefined);
    };
    compactViewport.addEventListener('change', closeOutsideMobile);
    return () => compactViewport.removeEventListener('change', closeOutsideMobile);
  }, []);

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
      <div className={`panel-view${mobilePanel ? ' mobile-panel-open' : ''}`}>
        <section className={`card panel expand-card mobile-panel-${mobilePanel === 'vehicles' ? 'expanded' : 'collapsed'}`} id="vehicleCard" aria-label="예정 차량 리스트">
          <div className="tab-line section-heading">
            <span className="desktop-panel-title">예정 차량</span>
            <button className="mobile-panel-toggle" type="button" aria-expanded={mobilePanel === 'vehicles'} aria-label={`예정 차량 ${mobilePanel === 'vehicles' ? '닫기' : '펼치기'}`} onClick={() => setMobilePanel((current) => current === 'vehicles' ? undefined : 'vehicles')}>
              <span>예정 차량</span><span className="chip mini">{vehicles.length}대</span><span className="mobile-panel-action">{mobilePanel === 'vehicles' ? '닫기' : '펼치기'}</span>
            </button>
            <span className="card-tools desktop-panel-tools"><span className="chip mini">{vehicles.length}대</span></span>
          </div>
          {loading ? <div className="panel-state" role="status">예정 차량을 불러오는 중입니다.</div> : null}
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
                <div className="control-vehicle-row" key={vehicle.id}>
                  <span><strong>{vehicle.plate || '차량 번호 미등록'}</strong><small>{vehicle.type || '차종 미등록'}</small></span>
                  <em>{assignments.some((assignment) => assignment.vehicleId === vehicle.id) ? '배차 준비' : '배송원 미배정'}</em>
                </div>
              ))}
              {!vehicles.length ? <div className="panel-state">예정 차량이 없습니다.</div> : null}
            </div>
          ) : null}
        </section>

        <section className={`card panel expand-card mobile-panel-${mobilePanel === 'orders' ? 'expanded' : 'collapsed'}`} id="destinationCard" aria-label="제조사별 주문 리스트">
          <div className="tab-line section-heading">
            <span className="destination-title desktop-panel-title">제조사별 주문</span>
            <button className="mobile-panel-toggle" type="button" aria-expanded={mobilePanel === 'orders'} aria-label={`제조사별 주문 ${mobilePanel === 'orders' ? '닫기' : '펼치기'}`} onClick={() => setMobilePanel((current) => current === 'orders' ? undefined : 'orders')}>
              <span>제조사별 주문</span><span className="chip mini">{ordersCount}건</span><span className="mobile-panel-action">{mobilePanel === 'orders' ? '닫기' : '펼치기'}</span>
            </button>
            <span className="chip mini desktop-panel-tools">{ordersCount}건</span>
          </div>
          <div className="manufacturer-order-list stops overlay-scroll" id="destinationList">
            {manufacturerOrders.map((group) => (
              <section className="manufacturer-order-group" key={group.id}>
                <div><strong>{group.name}</strong><span>{group.orders.length}건</span></div>
                {group.orders.map((order) => (
                  <div className="manufacturer-order-row" key={order.sellerOrderId}>
                    <span><b>{order.sellerOrderKey}</b><small>{order.destinationId}</small></span>
                    <em>{formatControlEta(order.estimatedArrivalAt)}</em>
                  </div>
                ))}
              </section>
            ))}
            {!loading && !error && !manufacturerOrders.length ? <div className="panel-state">등록된 제조사 주문이 없습니다.</div> : null}
          </div>
        </section>
      </div>
    </aside>
  );
}

function groupOrdersByManufacturer(orders: DispatchListItem[], management?: ManagementData): ManufacturerOrderGroup[] {
  const names = new Map(management?.customers.map((customer) => [customer.id, customer.name]) ?? []);
  const groups = new Map<string, DispatchListItem[]>();
  for (const order of orders) groups.set(order.customerId, [...(groups.get(order.customerId) ?? []), order]);
  return [...groups].map(([id, groupedOrders]) => ({ id, name: names.get(id) ?? id, orders: groupedOrders }));
}

function formatControlEta(value: string | null): string {
  if (!value) return '예정 확인';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(date);
}
