import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { apiConfig } from '../api/config';
import { demoVehicles, routeStops } from '../dev-db/queries';
import { loadRemoteRecords } from '../services/records';
import type { DeliverySummary } from '../services/records';

export function RecordsPage(): ReactElement {
  if (apiConfig.mode === 'remote') return <RemoteRecordsPage />;
  return <MockRecordsPage />;
}

function MockRecordsPage(): ReactElement {
  const [selectedRecordNo, setSelectedRecordNo] = useState(1);
  const issues = ['정문 하차 불가', '지하주차장 높이 제한', '수령 담당자 부재', '냉장 검수 7분 대기', '특이사항 없음'];
  const tips = ['후문 지하주차장 B1 하역장 이용', '건물 북측 약품 반입구 사용', '약제팀 직통 연락 후 진입', '검체는 접수대가 아닌 검사실 전달', '1층 접수대에 온도기록지 함께 전달'];
  const records = Array.from({ length: 100 }, (_, index) => {
    const vehicle = demoVehicles[index % demoVehicles.length];
    const stop = routeStops[vehicle.route][index % routeStops[vehicle.route].length];
    return { no: index + 1, vehicle, stop, date: `2026. 07. ${String(8 - Math.floor(index / 8)).padStart(2, '0')}.`, time: `${String(9 + (index % 10)).padStart(2, '0')}:${String((index * 7) % 60).padStart(2, '0')}`, issue: issues[index % issues.length], tip: tips[index % tips.length] };
  });
  const selected = records.find((record) => record.no === selectedRecordNo) ?? records[0];

  return (
    <div className="page-grid">
      <section className="page-panel wide">
        <div className="tab-line section-heading"><span>완료 배송 기록</span><span className="chip gray">{records.length}건 저장됨</span></div>
        <div className="record-scroll overlay-scroll"><table className="page-table"><thead><tr><th>완료 일시</th><th>배송지</th><th>차량</th><th>문제 기록</th><th>배송팁</th></tr></thead><tbody>
          {records.map((record) => (
            <tr
              className={`record-row${record.no === selected.no ? ' active' : ''}`}
              key={record.no}
              tabIndex={0}
              onClick={() => setSelectedRecordNo(record.no)}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedRecordNo(record.no); }}
            >
              <td>{record.date} {record.time}</td><td>{record.stop}</td><td>{record.vehicle.plate}</td><td>{record.issue}</td><td>{record.tip}</td>
            </tr>
          ))}
        </tbody></table></div>
      </section>
      <section className="page-panel">
        <div className="tab-line section-heading"><span>증빙자료 업로드 기록</span><span className="chip mini">#{String(selected.no).padStart(3, '0')}</span></div>
        <div className="timeline overlay-scroll"><div className="t done"><i>1</i><span>POD 이미지</span><b>{selected.date} {selected.time}</b></div><div className="t done"><i>2</i><span>인수증 스캔</span><b>업로드 완료</b></div><div className="t done"><i>3</i><span>거래명세표</span><b>업로드 완료</b></div><div className="t done"><i>4</i><span>온도기록 리포트</span><b>{selected.vehicle.plate}</b></div></div>
      </section>
      <section className="page-panel">
        <div className="tab-line section-heading"><span>메모 기록</span><span className="chip blue">{selected.stop}</span></div>
        <div className="timeline overlay-scroll"><div className="t now"><i>문</i><span>{selected.issue}</span><b>문제</b></div><div className="t done"><i>팁</i><span>{selected.tip}</span><b>전달</b></div><div className="t"><i>메</i><span>다음 배송 시 {selected.tip}. 도착 10분 전 연락 필요.</span><b>저장</b></div></div>
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
    setState({ status: 'loading' });
    loadRemoteRecords(controller.signal)
      .then((data) => {
        setState({ status: 'ready', records: data.records });
        setSelectedKey((current) => current && data.records.some((record) => record.sellerOrderKey === current) ? current : data.records[0]?.sellerOrderKey);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : '배송 이력을 불러올 수 없습니다.' });
      });
    return () => controller.abort();
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="page-grid">
        <section className="page-panel wide">
          <div className="tab-line section-heading"><span>완료 배송 기록</span><span className="chip gray">remote</span></div>
          <div className="customer-empty-state" role="status"><strong>배송 이력 불러오는 중</strong><span>원격 정본에서 요약 이력을 확인하고 있습니다.</span></div>
        </section>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page-grid">
        <section className="page-panel wide">
          <div className="tab-line section-heading"><span>완료 배송 기록</span><span className="chip gray">remote</span></div>
          <div className="customer-empty-state" role="alert"><strong>배송 이력 차단</strong><span>{state.message}</span></div>
        </section>
      </div>
    );
  }

  const selected = state.records.find((record) => record.sellerOrderKey === selectedKey) ?? state.records[0];

  return (
    <div className="page-grid">
      <section className="page-panel wide">
        <div className="tab-line section-heading"><span>완료 배송 기록</span><span className="chip gray">{state.records.length}건 저장됨</span></div>
        {state.records.length ? (
          <div className="record-scroll overlay-scroll"><table className="page-table"><thead><tr><th>주문 키</th><th>배송지</th><th>배송 상태</th><th>ETA 상태</th><th>도착 예정</th></tr></thead><tbody>
            {state.records.map((record) => (
              <tr
                className={`record-row${record.sellerOrderKey === selected?.sellerOrderKey ? ' active' : ''}`}
                key={record.sellerOrderKey}
                tabIndex={0}
                onClick={() => setSelectedKey(record.sellerOrderKey)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedKey(record.sellerOrderKey); }}
              >
                <td>{record.sellerOrderKey}</td><td>{record.destinationDisplayName}</td><td>{record.deliveryStatus}</td><td>{record.etaStatus}</td><td>{record.estimatedArrivalAt ?? '요약 없음'}</td>
              </tr>
            ))}
          </tbody></table></div>
        ) : <div className="customer-empty-state" role="status"><strong>배송 이력 없음</strong><span>원격 정본에서 조회된 완료 배송 기록이 없습니다.</span></div>}
      </section>
      <section className="page-panel">
        <div className="tab-line section-heading"><span>증빙자료 업로드 기록</span><span className="chip mini">{selected?.proofStatus ?? 'remote'}</span></div>
        <div className="timeline overlay-scroll">
          {selected ? <div className="t now"><i>요</i><span>{selected.proofStatus}</span><b>요약만 제공</b></div> : null}
          <div className="t"><i>상</i><span>증빙 세부자료는 원격 v1 요약 응답에서 제공되지 않습니다.</span><b>상세 불가</b></div>
        </div>
      </section>
      <section className="page-panel">
        <div className="tab-line section-heading"><span>이벤트 요약</span><span className="chip blue">{selected?.destinationDisplayName ?? '배송지 없음'}</span></div>
        <div className="timeline overlay-scroll">
          {selected?.eventSummary.length ? selected.eventSummary.map((event) => (
            <div className="t done" key={`${event.type}-${event.occurredAt}`}><i>이</i><span>{event.type}</span><b>{event.occurredAt}</b></div>
          )) : <div className="t"><i>상</i><span>이벤트 세부 내역은 원격 v1 요약 응답에서 제공되지 않습니다.</span><b>상세 불가</b></div>}
        </div>
      </section>
    </div>
  );
}
