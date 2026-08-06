import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { apiConfig } from '../api/config';
import { AdminSectionHeader, AdminTableFrame } from '../components/AdminUi';
import { ServiceDateSelector } from '../components/ServiceDateSelector';
import { loadRemoteRecords } from '../services/records';
import type { DeliveryEventSummary, DeliveryProof, DeliverySummary, RecordsPageInfo } from '../services/records';

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Seoul',
});

const eventLabels: Record<string, string> = {
  NOTE_ADDED: '메모 등록',
  PICKUP_COMPLETED: '상차 완료',
  ROUTE_COMPLETED: '운행 완료',
  ROUTE_PAUSED: '운행 일시정지',
  ROUTE_STARTED: '출발',
  STOP_ARRIVED: '배송지 도착',
  STOP_DELIVERED: '배송 완료',
  STOP_FAILED: '배송 실패',
};

export function RecordsPage(): ReactElement {
  return apiConfig.mode === 'remote' ? <RemoteRecordsPage /> : <EmptyRecordsPage />;
}

function EmptyRecordsPage(): ReactElement {
  return (
    <div className="page-grid">
      <section className="page-panel wide">
        <RecordsHeading count={0} />
        <EmptyState title="배송 이력이 없습니다." description="배송이 진행되면 주문별 이력이 이곳에 기록됩니다." />
      </section>
      <section className="page-panel record-detail-panel">
        <AdminSectionHeader title="증빙자료" />
        <EmptyState title="증빙자료가 없습니다." description="배송 이력을 선택하면 연결된 증빙자료가 표시됩니다." />
      </section>
      <section className="page-panel record-detail-panel">
        <AdminSectionHeader title="이벤트" />
        <EmptyState title="이벤트가 없습니다." description="배송 이력을 선택하면 처리 과정이 표시됩니다." />
      </section>
    </div>
  );
}

type RemoteRecordsState =
  | { status: 'loading' }
  | { status: 'ready'; page: RecordsPageInfo; records: DeliverySummary[] }
  | { status: 'error'; message: string };

type RecordSortKey = 'address' | 'destination' | 'eta' | 'order' | 'status';
type RecordSort = { direction: 'asc' | 'desc'; key: RecordSortKey } | null;

function RemoteRecordsPage(): ReactElement {
  const [state, setState] = useState<RemoteRecordsState>({ status: 'loading' });
  const [selectedId, setSelectedId] = useState<string>();
  const [serviceDate, setServiceDate] = useState<string | undefined>(() => initialServiceDate());
  const [pageNumber, setPageNumber] = useState(() => initialPageNumber());
  const [sort, setSort] = useState<RecordSort>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    setSelectedId(undefined);
    loadRemoteRecords({ page: pageNumber, serviceDate, signal: controller.signal })
      .then((data) => {
        setState({ status: 'ready', page: data.page, records: data.records });
        setSelectedId(data.records[0]?.sellerOrderId);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: 'error', message: error instanceof Error ? error.message : '배송 이력을 불러올 수 없습니다.' });
        }
    });
    return () => controller.abort();
  }, [pageNumber, serviceDate]);

  const records = state.status === 'ready' ? state.records : [];
  const sortedRecords = useMemo(() => sortRecords(records, sort), [records, sort]);

  function changeServiceDate(value?: string): void {
    setServiceDate(value);
    setPageNumber(1);
    setSelectedId(undefined);
    replaceRecordsQuery(value, 1);
  }

  function changePage(value: number): void {
    if (value === pageNumber) return;
    setPageNumber(value);
    setSelectedId(undefined);
    replaceRecordsQuery(serviceDate, value);
  }

  function cycleSort(key: RecordSortKey): void {
    setSort((current) => {
      if (current?.key !== key) return { direction: 'desc', key };
      if (current.direction === 'desc') return { direction: 'asc', key };
      return null;
    });
  }

  if (state.status === 'loading') {
    return <SingleRecordsState serviceDate={serviceDate} onServiceDateChange={changeServiceDate} title="배송 이력 불러오는 중" description="배송 이력을 확인하고 있습니다." />;
  }
  if (state.status === 'error') {
    return <SingleRecordsState serviceDate={serviceDate} onServiceDateChange={changeServiceDate} title="배송 이력 차단" description={state.message} alert />;
  }

  const selected = state.records.find((record) => record.sellerOrderId === selectedId) ?? state.records[0];
  return (
    <div className="page-grid">
      <section className="page-panel wide">
        <RecordsHeading count={state.page.totalItems} serviceDate={serviceDate} onServiceDateChange={changeServiceDate} />
        {state.records.length ? (
          <AdminTableFrame className="record-scroll">
            <table className="page-table record-table">
              <thead>
                <tr>
                  <SortableRecordHeader label="주문번호" onSort={cycleSort} sort={sort} sortKey="order" />
                  <SortableRecordHeader label="배송지" onSort={cycleSort} sort={sort} sortKey="destination" />
                  <SortableRecordHeader label="주소" onSort={cycleSort} sort={sort} sortKey="address" />
                  <SortableRecordHeader label="배송 상태" onSort={cycleSort} sort={sort} sortKey="status" />
                  <SortableRecordHeader label="도착 예정" onSort={cycleSort} sort={sort} sortKey="eta" />
                </tr>
              </thead>
              <tbody>{sortedRecords.map((record) => (
                <tr
                  className={`record-row${record.sellerOrderId === selected?.sellerOrderId ? ' active' : ''}`}
                  key={record.sellerOrderId}
                  tabIndex={0}
                  onClick={() => setSelectedId(record.sellerOrderId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(record.sellerOrderId);
                    }
                  }}
                >
                  <td>{record.sellerOrderKey}</td>
                  <td>{record.destinationDisplayName}</td>
                  <td>{record.destinationAddress ?? '-'}</td>
                  <td>{deliveryStatusLabel(record.deliveryStatus)}</td>
                  <td>{formatDateTime(record.estimatedArrivalAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          </AdminTableFrame>
        ) : <EmptyState title="배송 이력이 없습니다." description="조회된 배송 기록이 없습니다." />}
        <RecordPagination currentPage={state.page.currentPage} onChange={changePage} totalPages={state.page.totalPages} />
      </section>

      <section className="page-panel record-detail-panel">
        <AdminSectionHeader
          title="증빙자료"
          side={selected ? <span className="record-detail-count">{selected.proofs.length}건</span> : undefined}
        />
        {selected?.proofs.length ? (
          <div className="record-proof-list overlay-scroll">
            {selected.proofs.map((proof) => <ProofRow key={proof.proofId} proof={proof} />)}
          </div>
        ) : (
          <EmptyState
            title={selected?.proofStatus === 'EXPIRED' ? '보관 기간이 만료되었습니다.' : '증빙자료가 없습니다.'}
            description="선택한 배송에 연결된 증빙자료가 없습니다."
          />
        )}
      </section>

      <section className="page-panel record-detail-panel">
        <AdminSectionHeader
          title="이벤트"
          side={selected ? <span className="record-detail-count">{selected.eventSummary.length}건</span> : undefined}
        />
        {selected?.eventSummary.length ? (
          <div className="record-event-list overlay-scroll">
            {selected.eventSummary.map((event) => <EventRow key={event.eventId} event={event} />)}
          </div>
        ) : <EmptyState title="이벤트가 없습니다." description="선택한 배송의 처리 이벤트가 없습니다." />}
      </section>
    </div>
  );
}

function ProofRow({ proof }: { proof: DeliveryProof }): ReactElement {
  const title = proof.originalFilename ?? (proof.kind === 'PHOTO' ? '배송 사진' : '배송 증빙');
  return (
    <article className="record-proof-row">
      <div>
        <strong>{title}</strong>
        <span>{proof.driverDisplayName ?? '배송원 정보 없음'}</span>
      </div>
      <dl>
        <div><dt>형식</dt><dd>{proof.contentType}</dd></div>
        <div><dt>용량</dt><dd>{formatBytes(proof.sizeBytes)}</dd></div>
        <div><dt>등록</dt><dd>{formatDateTime(proof.uploadedAt)}</dd></div>
      </dl>
      <span className={`record-proof-status ${proof.status.toLowerCase()}`}>
        {proof.status === 'AVAILABLE' ? '보관 중' : '만료'}
      </span>
    </article>
  );
}

function EventRow({ event }: { event: DeliveryEventSummary }): ReactElement {
  const hasCoordinates = event.latitude !== undefined && event.longitude !== undefined;
  return (
    <article className="record-event-row">
      <span className="record-event-dot" aria-hidden="true" />
      <div>
        <strong>{eventLabels[event.type] ?? event.type}</strong>
        <span>{event.driverDisplayName ?? '시스템 이벤트'}</span>
        {hasCoordinates ? <small>{event.latitude?.toFixed(5)}, {event.longitude?.toFixed(5)}</small> : null}
      </div>
      <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time>
    </article>
  );
}

function SingleRecordsState({
  alert = false,
  description,
  onServiceDateChange,
  serviceDate,
  title,
}: {
  alert?: boolean;
  description: string;
  onServiceDateChange: (value?: string) => void;
  serviceDate?: string;
  title: string;
}): ReactElement {
  return (
    <div className="page-grid">
      <section className="page-panel wide">
        <RecordsHeading serviceDate={serviceDate} onServiceDateChange={onServiceDateChange} />
        <div className="customer-empty-state" role={alert ? 'alert' : 'status'}><strong>{title}</strong><span>{description}</span></div>
      </section>
    </div>
  );
}

function RecordsHeading({
  count,
  onServiceDateChange,
  serviceDate,
}: {
  count?: number;
  onServiceDateChange?: (value?: string) => void;
  serviceDate?: string;
}): ReactElement {
  const side = count !== undefined || onServiceDateChange ? (
    <span className="records-heading-actions">
      {count !== undefined ? <span className="record-detail-count">{count}건</span> : null}
      {onServiceDateChange ? (
        <ServiceDateSelector allowAllDates label="이력 기준일" onChange={onServiceDateChange} serviceDate={serviceDate} />
      ) : null}
    </span>
  ) : undefined;
  return (
    <AdminSectionHeader title="배송 이력" side={side} />
  );
}

function SortableRecordHeader({
  label,
  onSort,
  sort,
  sortKey,
}: {
  label: string;
  onSort: (key: RecordSortKey) => void;
  sort: RecordSort;
  sortKey: RecordSortKey;
}): ReactElement {
  const active = sort?.key === sortKey;
  const directionLabel = active ? (sort.direction === 'desc' ? '내림차순' : '오름차순') : '기본순';
  return (
    <th scope="col">
      <button
        aria-label={`${label} 정렬 ${directionLabel}`}
        className={`record-sort-header${active ? ' active' : ''}`}
        type="button"
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        <b aria-hidden="true">{active ? (sort.direction === 'desc' ? '↓' : '↑') : ''}</b>
      </button>
    </th>
  );
}

function RecordPagination({
  currentPage,
  onChange,
  totalPages,
}: {
  currentPage: number;
  onChange: (page: number) => void;
  totalPages: number;
}): ReactElement | null {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="배송 이력 페이지" className="record-pagination">
      {recordPaginationItems(currentPage, totalPages).map((item) => typeof item === 'number' ? (
        <button
          aria-current={item === currentPage ? 'page' : undefined}
          key={item}
          type="button"
          onClick={() => onChange(item)}
        >{item}</button>
      ) : <span aria-hidden="true" key={item}>…</span>)}
    </nav>
  );
}

function EmptyState({ title, description }: { title: string; description: string }): ReactElement {
  return <div className="customer-empty-state" role="status"><strong>{title}</strong><span>{description}</span></div>;
}

function sortRecords(records: DeliverySummary[], sort: RecordSort): DeliverySummary[] {
  if (sort === null) return records;
  const direction = sort.direction === 'asc' ? 1 : -1;
  return records.map((record, index) => ({ index, record })).sort((left, right) => {
    const valueDelta = recordSortValue(left.record, sort.key)
      .localeCompare(recordSortValue(right.record, sort.key), 'ko', { numeric: true, sensitivity: 'base' });
    return valueDelta === 0 ? left.index - right.index : valueDelta * direction;
  }).map(({ record }) => record);
}

function recordSortValue(record: DeliverySummary, key: RecordSortKey): string {
  switch (key) {
    case 'address':
      return record.destinationAddress ?? '';
    case 'destination':
      return record.destinationDisplayName;
    case 'eta':
      return record.estimatedArrivalAt ?? '';
    case 'order':
      return record.sellerOrderKey;
    case 'status':
      return deliveryStatusLabel(record.deliveryStatus);
  }
}

function recordPaginationItems(currentPage: number, totalPages: number): Array<number | string> {
  const pages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages]
    .filter((page) => page >= 1 && page <= totalPages))].sort((left, right) => left - right);
  return pages.flatMap((page, index) => {
    const previous = pages[index - 1];
    return previous !== undefined && page - previous > 1 ? [`ellipsis-${previous}-${page}`, page] : [page];
  });
}

function initialServiceDate(): string | undefined {
  const value = new URLSearchParams(window.location.search).get('serviceDate');
  return value !== null && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : undefined;
}

function initialPageNumber(): number {
  const value = Number(new URLSearchParams(window.location.search).get('page'));
  return Number.isSafeInteger(value) && value >= 1 ? value : 1;
}

function replaceRecordsQuery(serviceDate: string | undefined, page: number): void {
  const query = new URLSearchParams(window.location.search);
  if (serviceDate === undefined) query.delete('serviceDate');
  else query.set('serviceDate', serviceDate);
  if (page === 1) query.delete('page');
  else query.set('page', String(page));
  const suffix = query.size === 0 ? '' : `?${query}`;
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${suffix}${window.location.hash}`);
}

function deliveryStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    ASSIGNED: '배정',
    CANCELLED: '취소',
    DELIVERED: '완료',
    FAILED: '실패',
    IN_TRANSIT: '이동 중',
    OUT_FOR_DELIVERY: '배송 중',
    PENDING: '대기',
    READY: '준비',
  };
  return labels[value] ?? value;
}

function formatDateTime(value?: string): string {
  if (value === undefined) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
