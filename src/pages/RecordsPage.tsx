import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { apiConfig } from '../api/config';
import { AdminSectionHeader, AdminTableFrame } from '../components/AdminUi';
import { loadRemoteRecords } from '../services/records';
import type { DeliverySummary } from '../services/records';

export function RecordsPage(): ReactElement {
  return apiConfig.mode === 'remote' ? <RemoteRecordsPage /> : <EmptyRecordsPage />;
}

function EmptyRecordsPage(): ReactElement {
  return (
    <div className="page-grid">
      <section className="page-panel wide">
        <RecordsHeading count={0} />
        <EmptyState title="배송 이력이 없습니다." description="고정차량 배차 데이터로 배송이 완료되면 이곳에 기록됩니다." />
      </section>
      <section className="page-panel">
        <AdminSectionHeader title="증빙자료 업로드 기록" />
        <EmptyState title="증빙자료가 없습니다." description="배송 이력을 선택하면 연결된 증빙자료가 표시됩니다." />
      </section>
      <section className="page-panel">
        <AdminSectionHeader title="메모 기록" />
        <EmptyState title="메모가 없습니다." description="배송 이력을 선택하면 배송지 메모와 주의사항이 표시됩니다." />
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
  const [selectedKey, setSelectedKey] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    loadRemoteRecords(controller.signal)
      .then((data) => {
        setState({ status: 'ready', records: data.records });
        setSelectedKey((current) => current && data.records.some((record) => record.sellerOrderKey === current)
          ? current
          : data.records[0]?.sellerOrderKey);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: 'error', message: error instanceof Error ? error.message : '배송 이력을 불러올 수 없습니다.' });
        }
      });
    return () => controller.abort();
  }, []);

  if (state.status === 'loading') {
    return <SingleRecordsState title="배송 이력 불러오는 중" description="원격 정본에서 배송 이력을 확인하고 있습니다." />;
  }
  if (state.status === 'error') {
    return <SingleRecordsState title="배송 이력 차단" description={state.message} alert />;
  }

  const selected = state.records.find((record) => record.sellerOrderKey === selectedKey) ?? state.records[0];
  return (
    <div className="page-grid">
      <section className="page-panel wide">
        <RecordsHeading count={state.records.length} />
        {state.records.length ? (
          <AdminTableFrame className="record-scroll">
            <table className="page-table">
              <thead><tr><th>주문 키</th><th>배송지</th><th>배송 상태</th><th>ETA 상태</th><th>도착 예정</th></tr></thead>
              <tbody>{state.records.map((record) => (
                <tr
                  className={`record-row${record.sellerOrderKey === selected?.sellerOrderKey ? ' active' : ''}`}
                  key={record.sellerOrderKey}
                  tabIndex={0}
                  onClick={() => setSelectedKey(record.sellerOrderKey)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setSelectedKey(record.sellerOrderKey);
                  }}
                >
                  <td>{record.sellerOrderKey}</td>
                  <td>{record.destinationDisplayName}</td>
                  <td>{record.deliveryStatus}</td>
                  <td>{record.etaStatus}</td>
                  <td>{record.estimatedArrivalAt ?? '-'}</td>
                </tr>
              ))}</tbody>
            </table>
          </AdminTableFrame>
        ) : <EmptyState title="배송 이력이 없습니다." description="원격 정본에서 조회된 완료 배송 기록이 없습니다." />}
      </section>
      <section className="page-panel">
        <AdminSectionHeader title="증빙자료 업로드 기록" />
        <EmptyState title={selected?.proofStatus ?? '증빙자료가 없습니다.'} description="증빙 세부자료는 배송 상세 계약에서 연결합니다." />
      </section>
      <section className="page-panel">
        <AdminSectionHeader title="이벤트 요약" />
        {selected?.eventSummary.length ? (
          <div className="timeline overlay-scroll">
            {selected.eventSummary.map((event) => (
              <div className="t done" key={`${event.type}-${event.occurredAt}`}><i>이</i><span>{event.type}</span><b>{event.occurredAt}</b></div>
            ))}
          </div>
        ) : <EmptyState title="이벤트가 없습니다." description="선택한 배송의 이벤트가 여기에 표시됩니다." />}
      </section>
    </div>
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
    <AdminSectionHeader title="완료 배송 기록" side={count !== undefined ? <span className="chip gray">{count}건 저장됨</span> : undefined} />
  );
}

function EmptyState({ title, description }: { title: string; description: string }): ReactElement {
  return <div className="customer-empty-state" role="status"><strong>{title}</strong><span>{description}</span></div>;
}
