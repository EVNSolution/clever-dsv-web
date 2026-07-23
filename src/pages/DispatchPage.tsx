import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { cargoFor, demoCouriers, routeStops, selectedDemoVehicle, vehiclesForCourier, workAreaLabels } from '../dev-db/queries';
import { apiConfig } from '../api/config';
import { loadDispatchList } from '../services/dispatch';
import type { DispatchListView } from '../services/dispatch';
import {
  commitDispatchImport,
  parseDispatchCsv,
  previewDispatchImport,
  registerTransportCondition,
} from '../services/dispatch-imports';
import type {
  DispatchImportInput,
  DispatchImportPreview,
  DispatchImportRow,
  DispatchImportView,
} from '../services/dispatch-imports';
import type { ManagementData } from '../demo/management';
import { loadDispatchReferenceSnapshot } from '../services/management';
import { defaultAdminSettings, loadAdminSettings, loadRemoteOperationalSettings, saveAdminSettings, saveRemoteOperationalSettings } from '../services/settings';

type ConditionCandidate = {
  code: string;
  description: string;
  name: string;
};

export function DispatchPage({ title, description }: { title: string; description: string }): ReactElement {
  const [selectedCourierId, setSelectedCourierId] = useState('c01');
  const [selectedStopIndex, setSelectedStopIndex] = useState(0);
  const [mockSettings] = useState(() => apiConfig.mode === 'mock' ? loadAdminSettings() : null);
  const [loadingStartTime, setLoadingStartTime] = useState(() => mockSettings?.loadingStartTime ?? '');
  const [departureTime, setDepartureTime] = useState(() => mockSettings?.plannedDepartureTime ?? '');
  const [departureDraft, setDepartureDraft] = useState(() => mockSettings?.plannedDepartureTime ?? '');
  const [departureError, setDepartureError] = useState(false);
  const [operationsBusy, setOperationsBusy] = useState(false);
  const [operationsError, setOperationsError] = useState('');
  const [operationsStatus, setOperationsStatus] = useState<'loading' | 'ready'>(() => apiConfig.mode === 'remote' ? 'loading' : 'ready');
  const [workAction, setWorkAction] = useState<'upload' | 'edit' | 'delete' | ''>('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadRows, setUploadRows] = useState<DispatchImportRow[]>([]);
  const [uploadPlanDate, setUploadPlanDate] = useState(todayInKorea);
  const [uploadPreview, setUploadPreview] = useState<DispatchImportPreview | null>(null);
  const [uploadedImport, setUploadedImport] = useState<DispatchImportView | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [conditionCandidates, setConditionCandidates] = useState<ConditionCandidate[]>([]);
  const [remoteDispatch, setRemoteDispatch] = useState<DispatchListView | null>(null);
  const [remoteReferences, setRemoteReferences] = useState<ManagementData | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<'error' | 'loading' | 'ready'>(() => apiConfig.mode === 'remote' ? 'loading' : 'ready');
  const [remoteError, setRemoteError] = useState('');
  const [remoteReloadKey, setRemoteReloadKey] = useState(0);
  const courier = demoCouriers.find((person) => person.id === selectedCourierId) ?? demoCouriers[0];
  const vehicle = vehiclesForCourier(courier.id)[0] ?? selectedDemoVehicle();
  const stops = routeStops[vehicle.route];
  const safeStopIndex = Math.min(selectedStopIndex, stops.length - 1);
  const selectedStop = stops[safeStopIndex];
  const selectedSequence = safeStopIndex + 1;
  const selectedArrivalTime = addMinutes(departureTime, 35 + safeStopIndex * 6);
  const selectCourier = (courierId: string) => {
    setSelectedCourierId(courierId);
    setSelectedStopIndex(0);
  };
  const saveDepartureTime = async () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(departureDraft)) {
      setDepartureError(true);
      return;
    }
    setDepartureError(false);
    setOperationsError('');
    if (apiConfig.mode === 'remote') {
      if (operationsStatus !== 'ready') return;
      setOperationsBusy(true);
      try {
        await saveRemoteOperationalSettings({ loadingStartTime, plannedDepartureTime: departureDraft });
        setDepartureTime(departureDraft);
      } catch (error) {
        setOperationsError(errorMessage(error));
      } finally {
        setOperationsBusy(false);
      }
      return;
    }
    setDepartureTime(departureDraft);
    saveAdminSettings({ ...loadAdminSettings(), plannedDepartureTime: departureDraft });
  };
  useEffect(() => {
    if (apiConfig.mode !== 'remote') return undefined;
    let active = true;
    setOperationsStatus('loading');
    setOperationsError('');
    setLoadingStartTime(defaultAdminSettings.loadingStartTime);
    setDepartureTime(defaultAdminSettings.plannedDepartureTime);
    setDepartureDraft(defaultAdminSettings.plannedDepartureTime);
    loadRemoteOperationalSettings()
      .then((settings) => {
        if (!active) return;
        if (settings === null) throw new Error('원격 운영 시간을 불러올 수 없습니다.');
        setLoadingStartTime(settings.loadingStartTime);
        setDepartureTime(settings.plannedDepartureTime);
        setDepartureDraft(settings.plannedDepartureTime);
        setOperationsStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setLoadingStartTime(defaultAdminSettings.loadingStartTime);
        setDepartureTime(defaultAdminSettings.plannedDepartureTime);
        setDepartureDraft(defaultAdminSettings.plannedDepartureTime);
        setOperationsStatus('ready');
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (apiConfig.mode !== 'remote') return undefined;
    const controller = new AbortController();
    setRemoteStatus('loading');
    setRemoteError('');
    setRemoteDispatch(null);
    setRemoteReferences(null);
    Promise.all([
      loadDispatchList(controller.signal),
      loadDispatchReferenceSnapshot(),
    ])
      .then(([view, references]) => {
        setRemoteDispatch(view);
        setRemoteReferences(references);
        setRemoteStatus('ready');
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setRemoteDispatch(null);
        setRemoteReferences(null);
        setRemoteError(errorMessage(error));
        setRemoteStatus('error');
      });
    return () => controller.abort();
  }, [remoteReloadKey]);
  const uploadInput = (): DispatchImportInput | null => uploadFileName && uploadRows.length > 0
    ? { fileName: uploadFileName, planDate: uploadPlanDate, rows: uploadRows }
    : null;
  const inspectUpload = async () => {
    const input = uploadInput();
    if (input === null) {
      setUploadError('배차 CSV 파일을 먼저 선택하세요.');
      return;
    }
    setUploadBusy(true);
    setUploadError('');
    setUploadedImport(null);
    try {
      const preview = await previewDispatchImport(input);
      setUploadPreview(preview);
      setConditionCandidates(preview.conditionCandidates.map((code) => ({ code, description: '', name: code })));
    } catch (error) {
      setUploadPreview(null);
      setConditionCandidates([]);
      setUploadError(errorMessage(error));
    } finally {
      setUploadBusy(false);
    }
  };
  const updateConditionCandidate = (code: string, field: 'description' | 'name', value: string) => {
    setConditionCandidates((current) => current.map((candidate) => candidate.code === code ? { ...candidate, [field]: value } : candidate));
  };
  const registerCondition = async (candidate: ConditionCandidate) => {
    if (!candidate.name.trim() || !candidate.description.trim()) return;
    setUploadBusy(true);
    setUploadError('');
    try {
      await registerTransportCondition({
        code: candidate.code,
        description: candidate.description.trim(),
        name: candidate.name.trim(),
      });
      const input = uploadInput();
      if (input !== null) {
        const preview = await previewDispatchImport(input);
        setUploadPreview(preview);
        setConditionCandidates(preview.conditionCandidates.map((code) => ({ code, description: '', name: code })));
      }
    } catch (error) {
      setUploadError(errorMessage(error));
    } finally {
      setUploadBusy(false);
    }
  };
  const commitUpload = async () => {
    const input = uploadInput();
    if (input === null || uploadPreview?.canCommit !== true) return;
    setUploadBusy(true);
    setUploadError('');
    try {
      setUploadedImport(await commitDispatchImport(input));
      if (apiConfig.mode === 'remote') setRemoteReloadKey((current) => current + 1);
    } catch (error) {
      setUploadError(errorMessage(error));
    } finally {
      setUploadBusy(false);
    }
  };

  return (
    <>
      <div className="page-hero operations-hero"><div><h2>{title}</h2><p>{description}</p></div><button className="btn primary operations-upload" type="button" onClick={() => setWorkAction(workAction === 'upload' ? '' : 'upload')}>주문 업로드</button></div>
      <div className="action-panel condition-upload-panel" hidden={workAction !== 'upload'}>
        <div className="condition-upload-head"><div><b>배차 업로드 사전 검사</b><p>배송원과 차량 번호는 별도로 확인합니다. 한 행은 한 SellerOrderKey이며, 미등록 운송조건은 확정 전에 등록해야 합니다.</p></div><button className="btn" type="button" onClick={() => setWorkAction('')}>닫기</button></div>
        <div className="dispatch-upload-inputs">
          <label>배차 CSV<input aria-label="배차 파일" accept=".csv,text/csv" type="file" onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            setUploadPreview(null);
            setUploadedImport(null);
            setConditionCandidates([]);
            if (file === undefined) {
              setUploadFileName('');
              setUploadRows([]);
              return;
            }
            void file.text().then((source) => {
              setUploadRows(parseDispatchCsv(source));
              setUploadFileName(file.name);
              setUploadError('');
            }).catch((error: unknown) => {
              setUploadRows([]);
              setUploadFileName('');
              setUploadError(errorMessage(error));
            });
          }} /></label>
          <label>배차일<input aria-label="배차일" type="date" value={uploadPlanDate} onChange={(event) => { setUploadPlanDate(event.target.value); setUploadPreview(null); setUploadedImport(null); }} /></label>
          <a className="btn dispatch-example-link" href="/examples/dsv-fixed-dispatch-10.csv" download>예제 CSV</a>
          <button className="btn" type="button" disabled={uploadBusy || uploadRows.length === 0} onClick={() => void inspectUpload()}>사전 검사</button>
          <button className="btn primary" type="button" disabled={uploadBusy || uploadPreview?.canCommit !== true || uploadedImport !== null} onClick={() => void commitUpload()}>업로드 확정</button>
        </div>
        {uploadFileName ? <p className="dispatch-upload-file"><strong>{uploadFileName}</strong><span>{uploadRows.length}행</span></p> : null}
        {uploadError ? <p className="dispatch-upload-error" role="alert">{uploadError}</p> : null}
        {uploadPreview ? <div className="dispatch-upload-summary" role="status"><span>전체 <b>{uploadPreview.summary.totalRows}</b></span><span>정상 <b>{uploadPreview.summary.readyRows}</b></span><span>확인 <b>{uploadPreview.summary.reviewRows}</b></span><span>오류 <b>{uploadPreview.summary.errorRows}</b></span></div> : null}
        {uploadPreview?.rows.some((row) => row.issues.length > 0) ? <div className="dispatch-upload-issues" aria-label="업로드 검사 결과">{uploadPreview.rows.filter((row) => row.issues.length > 0).slice(0, 6).map((row) => <p key={row.rowNumber}><strong>{row.rowNumber}행</strong><span>{row.issues.map((issue) => issue.message).join(' ')}</span></p>)}</div> : null}
        {uploadPreview && !conditionCandidates.length && uploadPreview.summary.errorRows === 0 ? <p className="condition-upload-empty" role="status">필수 검사를 통과했습니다. 좌표 확인 행은 스테이징 후 보완할 수 있습니다.</p> : null}
        {conditionCandidates.map((candidate) => <div className="condition-candidate" key={candidate.code}><strong>{candidate.code}</strong><label>명칭<input value={candidate.name} onChange={(event) => updateConditionCandidate(candidate.code, 'name', event.target.value)} /></label><label>설명<input value={candidate.description} onChange={(event) => updateConditionCandidate(candidate.code, 'description', event.target.value)} /></label><button type="button" disabled={uploadBusy || !candidate.name.trim() || !candidate.description.trim()} onClick={() => void registerCondition(candidate)}>등록</button></div>)}
        {uploadedImport ? <p className="dispatch-upload-complete" role="status"><strong>{uploadedImport.rowCount}건 업로드 완료</strong><span>배차일 {uploadedImport.planDate}</span><small>ID {uploadedImport.id}</small></p> : null}
      </div>
      {apiConfig.mode === 'remote' ? (
        <RemoteDispatchBoard
          departureDraft={departureDraft}
          departureError={departureError}
          error={remoteError}
          onDepartureChange={(value) => {
            setDepartureDraft(value);
            setDepartureError(false);
            setOperationsError('');
          }}
          onDepartureSave={() => void saveDepartureTime()}
          onRetry={() => setRemoteReloadKey((current) => current + 1)}
          operationsBusy={operationsBusy}
          operationsError={operationsError}
          operationsStatus={operationsStatus}
          status={remoteStatus}
          view={remoteDispatch}
          references={remoteReferences}
        />
      ) : (
      <div className="work-two-grid">
        <section className="work-column split" aria-label="배송원 선택">
          <div className="tab-line section-heading"><span>배차 현황</span><span className="section-meta">{demoCouriers.length}명</span></div>
          <div className="work-scroll work-courier-table-scroll overlay-scroll" aria-label="배송원 목록">
            <table className="work-courier-table">
              <thead><tr><th>배송원</th><th>차량</th></tr></thead>
              <tbody>
                {demoCouriers.map((person) => {
                  const assignedVehicle = vehiclesForCourier(person.id)[0] ?? vehicle;
                  const active = person.id === courier.id;
                  return (
                    <tr
                      className={active ? 'active' : ''}
                      key={person.id}
                      aria-selected={active}
                      tabIndex={0}
                      onClick={() => selectCourier(person.id)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        selectCourier(person.id);
                      }}
                    >
                      <td><button className="work-courier-name" type="button" onClick={(event) => { event.stopPropagation(); selectCourier(person.id); }}><strong>{person.name}</strong><small>{person.zone}</small></button></td>
                      <td><strong>{assignedVehicle.plate}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="work-right-stack">
          <section className="work-column" aria-label="전체 타임라인">
            <div className="work-live-head section-heading">
              <span>전체 타임라인</span>
              <form className="work-departure-time" onSubmit={(event) => { event.preventDefault(); void saveDepartureTime(); }}><label htmlFor="departureTime">출발</label><input id="departureTime" aria-label="출발 시간" aria-invalid={departureError} value={departureDraft} maxLength={5} inputMode="numeric" placeholder="HH:mm" onChange={(event) => setDepartureDraft(event.target.value)} /><button type="submit">저장</button>{departureError ? <span className="work-time-error" role="alert">HH:mm</span> : null}</form>
            </div>
            <div className="work-timeline-list overlay-scroll" aria-label="배송 전체 타임라인">
              <div className="work-timeline-row"><i>준</i><span><strong>군포복합물류센터 준비</strong></span><time dateTime={loadingStartTime || undefined}>{loadingStartTime || '-'}</time></div>
              <div className="work-timeline-row"><i>출</i><span><strong>군포복합물류센터 출발</strong></span><time dateTime={departureTime}>{departureTime}</time></div>
              {stops.map((name, index) => {
                const sequence = index + 1;
                const arrivalTime = addMinutes(departureTime, 35 + index * 6);
                return (
                  <button className={`work-timeline-row ${index === safeStopIndex ? 'active' : ''}`} type="button" key={name} onClick={() => setSelectedStopIndex(index)}>
                    <i>{sequence}</i><span><strong>{name}</strong></span><time dateTime={arrivalTime}>{arrivalTime}</time>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="work-column" aria-label="선택 배송 상세">
            <div className="tab-line section-heading section-heading-actions"><span>배송 상세</span><span className="work-detail-actions"><button type="button" onClick={() => setWorkAction(workAction === 'edit' ? '' : 'edit')}>수정</button><button className="danger" type="button" onClick={() => setWorkAction(workAction === 'delete' ? '' : 'delete')}>삭제</button></span></div>
            <div className="work-order-detail">
              <div className="work-detail-feedback" hidden={workAction !== 'edit' && workAction !== 'delete'}>{workAction === 'edit' ? <><span><b>수정</b> {selectedStop} 배송 시간, 배정 배송원, 물품 수량을 수정합니다.</span><button type="button" onClick={() => setWorkAction('')}>저장</button></> : workAction === 'delete' ? <><span><b>삭제</b> {selectedStop} 주문을 삭제 대기 상태로 바꿉니다.</span><button className="danger" type="button" onClick={() => setWorkAction('')}>삭제 확인</button></> : null}</div>
              <section className="work-selected-stop"><strong>{selectedSequence}. {selectedStop}</strong><span>{workAreaLabels[vehicle.route][Math.min(workAreaLabels[vehicle.route].length - 1, Math.floor(safeStopIndex / 4))]} {selectedArrivalTime} 도착 예정</span></section>
              <div className="work-detail-content">
                <section className="work-cargo-detail">
                  <div className="work-block-title"><span>주문 품목</span><span className="section-meta">{cargoFor(selectedSequence).length}개 품목</span></div>
                  <div className="work-cargo-table overlay-scroll">{cargoFor(selectedSequence).map((item) => <div className="work-cargo-row" key={item.name}><strong>{item.name}</strong><b>{item.qty}개</b></div>)}</div>
                </section>
                <section className="proof-image-grid overlay-scroll" aria-label="증빙 이미지 영역">
                  {['POD', '인수증', '명세표'].map((proof, index) => <details className={`proof-image-card ${index ? '' : 'done'}`} key={proof} open><summary className="proof-image-head"><span>{proof}</span><span className="proof-status">{index ? '대기' : '확보'}</span></summary><div className="proof-image-box">{proof} {index ? '업로드 영역' : '이미지'}</div></details>)}
                </section>
              </div>
            </div>
          </section>
        </div>
      </div>
      )}
    </>
  );
}

function RemoteDispatchBoard({
  departureDraft,
  departureError,
  error,
  onDepartureChange,
  onDepartureSave,
  onRetry,
  operationsBusy,
  operationsError,
  operationsStatus,
  status,
  view,
  references,
}: {
  departureDraft: string;
  departureError: boolean;
  error: string;
  onDepartureChange: (value: string) => void;
  onDepartureSave: () => void;
  onRetry: () => void;
  operationsBusy: boolean;
  operationsError: string;
  operationsStatus: 'loading' | 'ready';
  status: 'error' | 'loading' | 'ready';
  view: DispatchListView | null;
  references: ManagementData | null;
}): ReactElement {
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const selectedOrder = view?.rows.find((row) => row.sellerOrderId === selectedOrderId) ?? view?.rows[0];

  useEffect(() => {
    if (!view?.rows.length) {
      setSelectedOrderId('');
      return;
    }
    if (!view.rows.some((row) => row.sellerOrderId === selectedOrderId)) setSelectedOrderId(view.rows[0].sellerOrderId);
  }, [selectedOrderId, view]);

  if (status === 'loading') {
    return (
      <div className="work-two-grid">
        <section className="work-column" aria-label="배차 현황">
          <div className="tab-line section-heading"><span>배차 현황</span><span className="section-meta">확인 중</span></div>
          <div className="customer-empty-state" role="status"><strong>불러오는 중</strong><span>배차 정보를 확인하고 있습니다.</span></div>
        </section>
      </div>
    );
  }
  if (status === 'error' || view === null) {
    return (
      <div className="work-two-grid">
        <section className="work-column" aria-label="배차 현황">
          <div className="tab-line section-heading"><span>배차 현황</span><span className="section-meta">확인 필요</span></div>
          <div className="customer-empty-state" role="alert"><strong>배차 정보를 불러오지 못했습니다.</strong><span>{error || '잠시 후 다시 시도하세요.'}</span><button className="btn" type="button" onClick={onRetry}>다시 시도</button></div>
        </section>
      </div>
    );
  }
  return (
    <div className="work-two-grid">
      <section className="work-column split" aria-label="배차 현황">
        <div className="tab-line section-heading"><span>배차 현황</span><span className="section-meta">{view.summary.total}건</span></div>
        <div className="work-scroll work-courier-table-scroll overlay-scroll" aria-label="배차 목록">
          <table className="work-courier-table remote-dispatch-table">
            <thead><tr><th>주문</th><th>상태</th></tr></thead>
            <tbody>
              {view.rows.map((row) => (
                <tr
                  className={row.sellerOrderId === selectedOrder?.sellerOrderId ? 'active' : ''}
                  key={row.sellerOrderId}
                  aria-selected={row.sellerOrderId === selectedOrder?.sellerOrderId}
                  tabIndex={0}
                  onClick={() => setSelectedOrderId(row.sellerOrderId)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    setSelectedOrderId(row.sellerOrderId);
                  }}
                >
                  <td><strong>{row.sellerOrderKey}</strong><small>{referenceName(references?.customers, row.customerId)}</small></td>
                  <td><strong>{assignmentLabel(row.assignmentStatus)}</strong><small>{etaLabel(row.etaStatus)}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!view.rows.length ? <div className="customer-empty-state" role="status"><strong>배차 없음</strong><span>등록된 주문이 없습니다.</span></div> : null}
        </div>
      </section>

      <div className="work-right-stack">
        <section className="work-column" aria-label="배송 일정">
          <div className="work-live-head section-heading">
            <span>배송 일정</span>
            <RemoteDepartureTime
              busy={operationsBusy}
              draft={departureDraft}
              error={operationsError}
              invalid={departureError}
              onChange={onDepartureChange}
              onSave={onDepartureSave}
              status={operationsStatus}
            />
          </div>
          {selectedOrder ? <div className="work-timeline-list overlay-scroll" aria-label="배송 전체 타임라인">
            <div className="work-timeline-row"><i>출</i><span><strong>출발 예정</strong><small>{assignmentLabel(selectedOrder.assignmentStatus)}</small></span><time>{departureDraft || '-'}</time></div>
            <div className="work-timeline-row active"><i>도</i><span><strong>{referenceName(references?.destinations, selectedOrder.destinationId)}</strong><small>{etaLabel(selectedOrder.etaStatus)}</small></span><time dateTime={selectedOrder.estimatedArrivalAt ?? undefined}>{formatRemoteEta(selectedOrder.estimatedArrivalAt)}</time></div>
          </div> : <div className="customer-empty-state" role="status"><strong>배송 일정 없음</strong><span>주문을 등록하면 출발과 도착 일정이 표시됩니다.</span></div>}
        </section>

        <section className="work-column" aria-label="배송 상세">
          <div className="tab-line section-heading"><span>배송 상세</span><span className="section-meta">{selectedOrder ? etaLabel(selectedOrder.etaStatus) : '선택 없음'}</span></div>
          {selectedOrder ? <div className="work-order-detail">
            <section className="work-selected-stop"><strong>{selectedOrder.sellerOrderKey}</strong><span>{referenceName(references?.destinations, selectedOrder.destinationId)}</span></section>
            <dl className="remote-dispatch-detail">
              <div><dt>제조사</dt><dd>{referenceName(references?.customers, selectedOrder.customerId)}</dd></div>
              <div><dt>배정 상태</dt><dd>{assignmentLabel(selectedOrder.assignmentStatus)}</dd></div>
              <div><dt>도착 상태</dt><dd>{etaLabel(selectedOrder.etaStatus)}</dd></div>
              <div><dt>도착 예정</dt><dd>{formatRemoteEta(selectedOrder.estimatedArrivalAt)}</dd></div>
            </dl>
          </div> : <div className="customer-empty-state" role="status"><strong>배송 상세 없음</strong><span>왼쪽에서 주문을 선택하세요.</span></div>}
        </section>
      </div>
    </div>
  );
}

function RemoteDepartureTime({
  busy,
  draft,
  error,
  invalid,
  onChange,
  onSave,
  status,
}: {
  busy: boolean;
  draft: string;
  error: string;
  invalid: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  status: 'loading' | 'ready';
}): ReactElement {
  if (status === 'loading') return <div className="customer-empty-state" role="status"><strong>운영 시간 확인 중</strong><span>출발 예정 시간을 확인하고 있습니다.</span></div>;
  return (
    <form className="work-departure-time" aria-label="운영 시간 편집" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
      <label htmlFor="remoteDepartureTime">출발</label>
      <input id="remoteDepartureTime" aria-label="출발 시간" aria-invalid={invalid} value={draft} maxLength={5} inputMode="numeric" placeholder="HH:mm" onChange={(event) => onChange(event.target.value)} />
      <button type="submit" disabled={busy}>{busy ? '저장 중' : '저장'}</button>
      {invalid ? <span className="work-time-error" role="alert">HH:mm</span> : null}
      {!invalid && error ? <span className="work-time-error" role="alert">{error}</span> : null}
    </form>
  );
}

function addMinutes(time: string, minutes: number): string {
  const [hours = 0, minute = 0] = time.split(':').map(Number);
  const totalMinutes = ((hours * 60 + minute + minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function todayInKorea(): string {
  return new Date(Date.now() + 9 * 60 * 60_000).toISOString().slice(0, 10);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '업로드 처리 중 오류가 발생했습니다.';
}

function formatRemoteEta(value: string | null): string {
  if (!value) return '예정 확인';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }).format(date);
}

function assignmentLabel(value: DispatchListView['rows'][number]['assignmentStatus']): string {
  return value === 'ASSIGNED' ? '배정 완료' : '미배정';
}

function etaLabel(value: DispatchListView['rows'][number]['etaStatus']): string {
  switch (value) {
    case 'READY':
      return '도착 예정';
    case 'PENDING':
      return '계산 중';
    case 'FAILED':
      return '확인 필요';
    case 'STALE':
      return '갱신 필요';
    case 'NOT_REQUIRED':
      return '미대상';
  }
}

function referenceName(items: Array<{ id: string; name: string }> | undefined, id: string): string {
  return items?.find((item) => item.id === id)?.name ?? '정보 확인';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
