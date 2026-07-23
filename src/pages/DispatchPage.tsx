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
import { loadAdminSettings, loadRemoteOperationalSettings, saveAdminSettings, saveRemoteOperationalSettings } from '../services/settings';

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
  const [operationsReloadKey, setOperationsReloadKey] = useState(0);
  const [operationsStatus, setOperationsStatus] = useState<'error' | 'loading' | 'ready'>(() => apiConfig.mode === 'remote' ? 'loading' : 'ready');
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
    setLoadingStartTime('');
    setDepartureTime('');
    setDepartureDraft('');
    loadRemoteOperationalSettings()
      .then((settings) => {
        if (!active) return;
        if (settings === null) throw new Error('원격 운영 시간을 불러올 수 없습니다.');
        setLoadingStartTime(settings.loadingStartTime);
        setDepartureTime(settings.plannedDepartureTime);
        setDepartureDraft(settings.plannedDepartureTime);
        setOperationsStatus('ready');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setOperationsError(errorMessage(error));
        setOperationsStatus('error');
      });
    return () => {
      active = false;
    };
  }, [operationsReloadKey]);
  useEffect(() => {
    if (apiConfig.mode !== 'remote') return undefined;
    const controller = new AbortController();
    setRemoteStatus('loading');
    setRemoteError('');
    setRemoteDispatch(null);
    loadDispatchList(controller.signal)
      .then((view) => {
        setRemoteDispatch(view);
        setRemoteStatus('ready');
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setRemoteDispatch(null);
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
          onOperationsRetry={() => setOperationsReloadKey((current) => current + 1)}
          onRetry={() => setRemoteReloadKey((current) => current + 1)}
          operationsBusy={operationsBusy}
          operationsError={operationsError}
          operationsStatus={operationsStatus}
          status={remoteStatus}
          view={remoteDispatch}
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
  onOperationsRetry,
  onRetry,
  operationsBusy,
  operationsError,
  operationsStatus,
  status,
  view,
}: {
  departureDraft: string;
  departureError: boolean;
  error: string;
  onDepartureChange: (value: string) => void;
  onDepartureSave: () => void;
  onOperationsRetry: () => void;
  onRetry: () => void;
  operationsBusy: boolean;
  operationsError: string;
  operationsStatus: 'error' | 'loading' | 'ready';
  status: 'error' | 'loading' | 'ready';
  view: DispatchListView | null;
}): ReactElement {
  if (status === 'loading') {
    return (
      <div className="work-two-grid">
        <section className="work-column" aria-label="배차 정본">
          <div className="tab-line section-heading"><span>배차 현황</span><span className="section-meta">remote</span></div>
          <div className="customer-empty-state" role="status"><strong>불러오는 중</strong><span>원격 배차 정본을 확인하고 있습니다.</span></div>
        </section>
      </div>
    );
  }
  if (status === 'error' || view === null) {
    return (
      <div className="work-two-grid">
        <section className="work-column" aria-label="배차 정본">
          <div className="tab-line section-heading"><span>배차 현황</span><span className="section-meta">remote</span></div>
          <div className="customer-empty-state" role="alert"><strong>배차 정본 차단</strong><span>{error || '원격 배차 정본을 불러올 수 없습니다.'}</span><button className="btn" type="button" onClick={onRetry}>다시 시도</button></div>
        </section>
      </div>
    );
  }
  return (
    <div className="work-two-grid">
      <section className="work-column split" aria-label="배차 정본">
        <div className="tab-line section-heading"><span>배차 현황</span><span className="section-meta">{view.summary.total}건</span></div>
        <div className="dispatch-upload-summary" role="status">
          <span>전체 <b>{view.summary.total}</b></span>
          <span>배정 <b>{view.summary.assigned}</b></span>
          <span>미배정 <b>{view.summary.unassigned}</b></span>
          <span>ETA 확인 <b>{view.summary.etaAttention}</b></span>
        </div>
        <div className="work-scroll work-courier-table-scroll overlay-scroll" aria-label="배차 목록">
          <table className="work-courier-table">
            <thead><tr><th>SellerOrderKey</th><th>배정</th><th>ETA</th></tr></thead>
            <tbody>
              {view.rows.map((row) => (
                <tr key={row.sellerOrderId}>
                  <td><strong>{row.sellerOrderKey}</strong><small>{row.sellerOrderId}</small></td>
                  <td><strong>{row.assignmentStatus}</strong></td>
                  <td><strong>{row.etaStatus}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="work-right-stack">
        <section className="work-column" aria-label="배차 요약">
          <div className="tab-line section-heading"><span>정본 필드</span><span className="section-meta">G005</span></div>
          <RemoteDepartureTime
            busy={operationsBusy}
            draft={departureDraft}
            error={operationsError}
            invalid={departureError}
            onChange={onDepartureChange}
            onRetry={onOperationsRetry}
            onSave={onDepartureSave}
            status={operationsStatus}
          />
          {view.rows.length ? <div className="work-timeline-list overlay-scroll" aria-label="배차 정본 필드 목록">{view.rows.map((row) => (
            <div className="work-timeline-row" key={`${row.sellerOrderId}:fields`}>
              <i>주</i>
              <span><strong>{row.customerId}</strong><small>{row.destinationId}</small><small>{routeLabel(row)}</small></span>
              <time dateTime={row.estimatedArrivalAt ?? undefined}>{formatRemoteEta(row.estimatedArrivalAt)}</time>
            </div>
          ))}</div> : <div className="customer-empty-state" role="status"><strong>배차 없음</strong><span>원격 정본에서 조회된 배차가 없습니다.</span></div>}
        </section>

        <section className="work-column" aria-label="배차 상세 제한">
          <div className="tab-line section-heading"><span>상세 정보</span><span className="section-meta">unavailable</span></div>
          <div className="work-order-detail">
            <section className="work-selected-stop"><strong>원격 정본 표시 제한</strong><span>이 화면은 G005 배차 필드만 표시합니다.</span></section>
            <div className="customer-empty-state" role="status"><strong>부가 세부 정보 미제공</strong><span>원격 API가 제공하지 않는 운영 세부 항목은 표시하지 않습니다.</span></div>
          </div>
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
  onRetry,
  onSave,
  status,
}: {
  busy: boolean;
  draft: string;
  error: string;
  invalid: boolean;
  onChange: (value: string) => void;
  onRetry: () => void;
  onSave: () => void;
  status: 'error' | 'loading' | 'ready';
}): ReactElement {
  if (status === 'loading') return <div className="customer-empty-state" role="status"><strong>운영 시간 불러오는 중</strong><span>원격 출발 예정 시간을 확인하고 있습니다.</span></div>;
  if (status === 'error') return <div className="customer-empty-state" role="alert"><strong>출발 시간 unavailable</strong><span>{error || '원격 운영 시간을 불러올 수 없습니다.'}</span><button className="btn" type="button" onClick={onRetry}>다시 시도</button></div>;
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
  if (!value) return 'ETA 미제공';
  return value;
}

function routeLabel(row: DispatchListView['rows'][number]): string {
  return `routePlanId ${row.routePlanId ?? '-'} / routeVersionId ${row.routeVersionId ?? '-'}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
