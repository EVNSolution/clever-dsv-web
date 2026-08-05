import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { apiConfig } from '../api/config';
import { AdminSectionHeader, AdminTableFrame } from '../components/AdminUi';
import { loadRemoteRecords } from '../services/records';
import type { DeliveryEventSummary, DeliveryProof, DeliverySummary } from '../services/records';

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
  | { status: 'ready'; records: DeliverySummary[] }
  | { status: 'error'; message: string };

function RemoteRecordsPage(): ReactElement {
  const [state, setState] = useState<RemoteRecordsState>({ status: 'loading' });
  const [selectedId, setSelectedId] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    loadRemoteRecords(controller.signal)
      .then((data) => {
        setState({ status: 'ready', records: data.records });
        setSelectedId((current) => current && data.records.some((record) => record.sellerOrderId === current)
          ? current
          : data.records[0]?.sellerOrderId);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: 'error', message: error instanceof Error ? error.message : '배송 이력을 불러올 수 없습니다.' });
        }
      });
    return () => controller.abort();
  }, []);

  if (state.status === 'loading') {
    return <SingleRecordsState title="배송 이력 불러오는 중" description="배송 이력을 확인하고 있습니다." />;
  }
  if (state.status === 'error') {
    return <SingleRecordsState title="배송 이력 차단" description={state.message} alert />;
  }

  const selected = state.records.find((record) => record.sellerOrderId === selectedId) ?? state.records[0];
  return (
    <div className="page-grid">
      <section className="page-panel wide">
        <RecordsHeading count={state.records.length} />
        {state.records.length ? (
          <AdminTableFrame className="record-scroll">
            <table className="page-table record-table">
              <thead>
                <tr>
                  <th>주문번호</th>
                  <th>배송지</th>
                  <th>주소</th>
                  <th>배송 상태</th>
                  <th>도착 예정</th>
                </tr>
              </thead>
              <tbody>{state.records.map((record) => (
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

function SingleRecordsState({ title, description, alert = false }: { title: string; description: string; alert?: boolean }): ReactElement {
  return (
    <div className="page-grid">
      <section className="page-panel wide">
        <RecordsHeading />
        <div className="customer-empty-state" role={alert ? 'alert' : 'status'}><strong>{title}</strong><span>{description}</span></div>
      </section>
    </div>
  );
}

function RecordsHeading({ count }: { count?: number }): ReactElement {
  return (
    <AdminSectionHeader title="배송 이력" side={count !== undefined ? <span className="record-detail-count">{count}건</span> : undefined} />
  );
}

function EmptyState({ title, description }: { title: string; description: string }): ReactElement {
  return <div className="customer-empty-state" role="status"><strong>{title}</strong><span>{description}</span></div>;
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
