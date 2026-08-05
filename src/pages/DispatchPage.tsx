import type { DragEvent, KeyboardEvent, ReactElement } from 'react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, LoaderCircle } from 'lucide-react';
import { ApiError } from '../api/client';
import { apiConfig } from '../api/config';
import { AdminPageHeader, AdminSectionHeader } from '../components/AdminUi';
import {
  clearDispatchTimeConstraint,
  confirmDispatchTimeConstraint,
  deleteDispatchOrders,
  loadDispatchList,
  MAX_DISPATCH_ASSIGNMENT_COUNT,
  MAX_DISPATCH_DELETE_COUNT,
  reassignDispatchOrder,
  reassignDispatchOrders,
  unassignDispatchOrder,
  unassignDispatchOrders,
} from '../services/dispatch';
import type { DispatchListItem, DispatchListView, DispatchSearch } from '../services/dispatch';
import {
  commitDispatchImport,
  parseDispatchFile,
  parseDispatchSheet,
  parseDispatchSource,
  preloadDispatchFileParser,
  previewDispatchImport,
  registerDispatchDriver,
  registerDispatchVehicle,
  registerTransportCondition,
} from '../services/dispatch-imports';
import type {
  DispatchAddressSuggestion,
  DispatchFileParseResult,
  DispatchImportInput,
  DispatchImportIssue,
  DispatchImportPreview,
  DispatchImportRow,
} from '../services/dispatch-imports';
import type { ManagementData } from '../demo/management';
import type { DepartureLocation } from '../components/DepartureMarker';
import { loadDispatchReferenceSnapshot } from '../services/management';
import { defaultAdminSettings, loadAdminSettings, loadRemoteOperationalSettings, saveAdminSettings, saveRemoteOperationalSettings } from '../services/settings';
import type { AdminSettings } from '../services/settings';

type ConditionCandidate = {
  code: string;
  description: string;
  name: string;
};

type UploadActivity = 'geocoding' | 'idle' | 'parsing';

type SheetCellFocusTarget = {
  columnIndex: number;
  requestId: number;
  rowIndex: number;
};

type UploadIssueEntry = {
  columnIndex: number | null;
  issue: DispatchImportIssue;
  rowNumber: number;
};

const DispatchMapCanvas = lazy(async () => {
  const module = await import('../components/MapCanvas');
  return { default: module.MapCanvas };
});

const TIME_ONLY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/u;

export function DispatchPage({ title, description }: { title: string; description: string }): ReactElement {
  const uploadFileInputRef = useRef<HTMLInputElement>(null);
  const uploadCellFocusRequest = useRef(0);
  const uploadPreviewRequest = useRef(0);
  const [mockSettings] = useState(() => apiConfig.mode === 'mock' ? loadAdminSettings() : null);
  const [loadingStartTime, setLoadingStartTime] = useState(() => mockSettings?.loadingStartTime ?? '');
  const [departureDraft, setDepartureDraft] = useState(() => mockSettings?.plannedDepartureTime ?? '');
  const [departureLocation, setDepartureLocation] = useState<DepartureLocation | null>(() => departureLocationFromSettings(mockSettings));
  const [departureError, setDepartureError] = useState(false);
  const [operationsBusy, setOperationsBusy] = useState(false);
  const [operationsError, setOperationsError] = useState('');
  const [operationsStatus, setOperationsStatus] = useState<'error' | 'loading' | 'ready'>(() => apiConfig.mode === 'remote' ? 'loading' : 'ready');
  const [workAction, setWorkAction] = useState<'upload' | ''>('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadRows, setUploadRows] = useState<DispatchImportRow[]>([]);
  const [uploadSheet, setUploadSheet] = useState<DispatchFileParseResult['sheet'] | null>(null);
  const [uploadPlanDate, setUploadPlanDate] = useState(todayInKorea);
  const [uploadPreview, setUploadPreview] = useState<DispatchImportPreview | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadActivity, setUploadActivity] = useState<UploadActivity>('idle');
  const [uploadDragging, setUploadDragging] = useState(false);
  const [uploadCellFocusTarget, setUploadCellFocusTarget] = useState<SheetCellFocusTarget | null>(null);
  const [conditionCandidates, setConditionCandidates] = useState<ConditionCandidate[]>([]);
  const [remoteDispatch, setRemoteDispatch] = useState<DispatchListView | null>(null);
  const [remoteReferences, setRemoteReferences] = useState<ManagementData | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<'error' | 'loading' | 'ready'>(() => apiConfig.mode === 'remote' ? 'loading' : 'ready');
  const [remoteError, setRemoteError] = useState('');
  const [remoteReloadKey, setRemoteReloadKey] = useState(0);
  const [mapReturnKey, setMapReturnKey] = useState(0);
  const [serviceDate, setServiceDate] = useState(todayInKorea);
  const [dispatchSearch, setDispatchSearch] = useState<DispatchSearch>({ destinationName: '', orderNumber: '' });
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
      } catch (error) {
        setOperationsError(errorMessage(error));
      } finally {
        setOperationsBusy(false);
      }
      return;
    }
    saveAdminSettings({ ...loadAdminSettings(), plannedDepartureTime: departureDraft });
  };
  useEffect(() => {
    if (apiConfig.mode !== 'remote') return undefined;
    let active = true;
    setOperationsStatus('loading');
    setOperationsError('');
    setLoadingStartTime(defaultAdminSettings.loadingStartTime);
    setDepartureDraft(defaultAdminSettings.plannedDepartureTime);
    loadRemoteOperationalSettings()
      .then((settings) => {
        if (!active) return;
        if (settings === null) throw new Error('원격 운영 시간을 불러올 수 없습니다.');
        setLoadingStartTime(settings.loadingStartTime);
        setDepartureDraft(settings.plannedDepartureTime);
        setDepartureLocation(departureLocationFromSettings(settings));
        setOperationsStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setOperationsError('운영 시간을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.');
        setOperationsStatus('error');
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
    Promise.all([
      loadDispatchList(serviceDate, dispatchSearch, controller.signal),
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
        setRemoteError(errorMessage(error));
        setRemoteStatus('error');
      });
    return () => controller.abort();
  }, [dispatchSearch, remoteReloadKey, serviceDate]);
  useEffect(() => {
    if (workAction === 'upload') preloadDispatchFileParser();
  }, [workAction]);
  const uploadInput = (): DispatchImportInput | null => uploadFileName && uploadRows.length > 0
    ? { fileName: uploadFileName, planDate: uploadPlanDate, rows: uploadRows }
    : null;
  const applyUploadPreview = (preview: DispatchImportPreview) => {
    setUploadPreview(preview);
    setUploadRows((current) => mergeResolvedPreviewRows(current, preview.rows));
    setConditionCandidates((current) => preview.conditionCandidates.map((code) =>
      current.find((candidate) => candidate.code === code) ?? { code, description: '', name: code }));
  };
  const refreshUploadPreview = async () => {
    const input = uploadInput();
    if (input === null) return;
    await inspectUpload(input);
    if (apiConfig.mode === 'remote') setRemoteReloadKey((current) => current + 1);
  };
  const inspectUpload = async (input = uploadInput()) => {
    if (input === null) {
      setUploadError('배차 파일을 먼저 선택하세요.');
      return;
    }
    const request = ++uploadPreviewRequest.current;
    setUploadBusy(true);
    setUploadActivity('geocoding');
    setUploadError('');
    try {
      const preview = await previewDispatchImport(input);
      if (request !== uploadPreviewRequest.current) return;
      applyUploadPreview(preview);
    } catch (error) {
      if (request !== uploadPreviewRequest.current) return;
      setUploadPreview(null);
      setConditionCandidates([]);
      setUploadError(errorMessage(error));
    } finally {
      if (request === uploadPreviewRequest.current) {
        setUploadBusy(false);
        setUploadActivity('idle');
      }
    }
  };
  const applyUploadParseResult = async (
    fileName: string,
    result: DispatchFileParseResult,
    planDate = uploadPlanDate,
    useDetectedPlanDate = true,
    preservePreview = false,
  ) => {
    const resolvedPlanDate = useDetectedPlanDate && result.planDate !== null ? result.planDate : planDate;
    const nextRows = preservePreview ? preserveResolvedRows(uploadRows, result.rows) : result.rows;
    if (!preservePreview || result.error) setUploadPreview(null);
    if (!preservePreview || result.error) setConditionCandidates([]);
    setUploadFileName(fileName);
    setUploadRows(nextRows);
    setUploadSheet(result.sheet);
    setUploadPlanDate(resolvedPlanDate);
    setUploadError(result.error);
    if (result.error) return;
    await waitForPreviewPaint();
    await inspectUpload({ fileName, planDate: resolvedPlanDate, rows: nextRows });
  };
  const loadUploadFile = async (file: File) => {
    uploadPreviewRequest.current += 1;
    setUploadBusy(true);
    setUploadActivity('parsing');
    setUploadFileName(file.name);
    setUploadRows([]);
    setUploadSheet(null);
    setUploadPreview(null);
    setConditionCandidates([]);
    setUploadError('');
    try {
      await applyUploadParseResult(file.name, await parseDispatchFile(file));
    } catch (error) {
      setUploadRows([]);
      setUploadSheet(null);
      setUploadError(errorMessage(error));
    } finally {
      setUploadBusy(false);
      setUploadActivity('idle');
    }
  };
  const dropUploadFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setUploadDragging(false);
    const file = event.dataTransfer.files[0];
    if (file !== undefined) void loadUploadFile(file);
  };
  const loadUploadSource = async (fileName: string, source: string, planDate = uploadPlanDate) => {
    await applyUploadParseResult(fileName, parseDispatchSource(source, 'CSV', fileName), planDate);
  };
  const editUploadSheetCell = (rowIndex: number, columnIndex: number, value: string) => {
    if (uploadSheet === null || uploadFileName === '') return;
    const cells = uploadSheet.cells.map((row) => [...row]);
    const row = cells[rowIndex] ?? [];
    while (row.length <= columnIndex) row.push('');
    row[columnIndex] = value;
    cells[rowIndex] = row;
    void applyUploadParseResult(
      uploadFileName,
      parseDispatchSheet(cells, uploadSheet.name, uploadFileName),
      uploadPlanDate,
      false,
      true,
    );
  };
  const applyAddressSuggestion = (rowNumber: number, suggestion: DispatchAddressSuggestion) => {
    const columnIndex = uploadFieldColumn(uploadSheet, 'address');
    if (columnIndex === null) return;
    editUploadSheetCell(
      rowNumber - 1,
      columnIndex,
      formatAddressSuggestion(suggestion),
    );
  };
  const focusUploadIssue = (entry: UploadIssueEntry) => {
    if (uploadSheet === null) return;
    const rowIndex = Math.max(0, Math.min(uploadSheet.cells.length - 1, entry.rowNumber - 1));
    const columnIndex = Math.max(0, entry.columnIndex ?? 0);
    setUploadCellFocusTarget({
      columnIndex,
      requestId: ++uploadCellFocusRequest.current,
      rowIndex,
    });
  };
  const loadExampleUpload = async () => {
    uploadPreviewRequest.current += 1;
    setUploadBusy(true);
    setUploadActivity('parsing');
    setUploadError('');
    try {
      const response = await fetch('/examples/dsv-fixed-dispatch-10.csv');
      if (!response.ok) throw new Error('예제 배차 파일을 불러올 수 없습니다.');
      await loadUploadSource('dsv-fixed-dispatch-10.csv', await response.text());
    } catch (error) {
      setUploadError(errorMessage(error));
    } finally {
      setUploadBusy(false);
      setUploadActivity('idle');
    }
  };
  const cancelUpload = () => {
    uploadPreviewRequest.current += 1;
    if (uploadFileInputRef.current !== null) uploadFileInputRef.current.value = '';
    setUploadFileName('');
    setUploadRows([]);
    setUploadSheet(null);
    setUploadPlanDate(todayInKorea());
    setUploadPreview(null);
    setUploadError('');
    setUploadDragging(false);
    setUploadCellFocusTarget(null);
    setUploadActivity('idle');
    setUploadBusy(false);
    setConditionCandidates([]);
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
      await refreshUploadPreview();
    } catch (error) {
      setUploadError(errorMessage(error));
    } finally {
      setUploadBusy(false);
    }
  };
  const registerDriver = async (name: string) => {
    setUploadBusy(true);
    setUploadError('');
    try {
      await registerDispatchDriver(name);
      await refreshUploadPreview();
    } catch (error) {
      setUploadError(errorMessage(error));
    } finally {
      setUploadBusy(false);
    }
  };
  const registerVehicle = async (plate: string) => {
    setUploadBusy(true);
    setUploadError('');
    try {
      await registerDispatchVehicle(plate);
      await refreshUploadPreview();
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
      await commitDispatchImport(input);
      if (apiConfig.mode === 'remote') {
        setServiceDate(uploadPlanDate);
        setRemoteReloadKey((current) => current + 1);
      }
      cancelUpload();
      setWorkAction('');
      setMapReturnKey((current) => current + 1);
    } catch (error) {
      setUploadError(errorMessage(error));
    } finally {
      setUploadBusy(false);
    }
  };
  const resolvedAddressRows = uploadPreview?.rows.filter((row) =>
    (row.addressResolutionStatus ?? row.normalized?.addressResolutionStatus) === 'RESOLVED'
    && (row.postalCode ?? row.normalized?.postalCode))?.length ?? 0;
  const uploadIssueRows = uploadPreview?.rows.filter((row) => row.issues.length > 0) ?? [];
  const uploadNoteRows = uploadPreview?.rows.filter((row) => row.notes !== null) ?? [];
  const uploadIssueEntries = uploadIssues(uploadPreview, uploadSheet);
  const uploadIssueCells = new Set(uploadIssueEntries.flatMap((entry) =>
    entry.columnIndex === null ? [] : [`${entry.rowNumber - 1}:${entry.columnIndex}`]));
  const driverCandidates = uploadResourceCandidates(uploadPreview, ['DRIVER_MISSING', 'DRIVER_NOT_FOUND'], 'driverName');
  const vehicleCandidates = uploadResourceCandidates(uploadPreview, ['VEHICLE_MISSING', 'VEHICLE_NOT_FOUND'], 'vehiclePlate');

  return (
    <>
      <AdminPageHeader
        className="operations-hero"
        title={title}
        description={description}
        actions={<button className="btn primary operations-upload" type="button" onClick={() => setWorkAction(workAction === 'upload' ? '' : 'upload')}>주문 업로드</button>}
      />
      <div className="dispatch-upload-layer" hidden={workAction !== 'upload'}>
        <section className="action-panel condition-upload-panel" aria-busy={uploadBusy} aria-label="주문 업로드">
          <div className="dispatch-upload-toolbar">
            {uploadSheet ? <p className="dispatch-upload-toolbar-note">*셀을 더블클릭하여 수정</p> : null}
            {uploadFileName ? <button className="btn" type="button" disabled={uploadBusy} onClick={cancelUpload}>취소</button> : null}
            <button className="btn" type="button" onClick={() => setWorkAction('')}>닫기</button>
          </div>
          <input ref={uploadFileInputRef} className="dispatch-upload-file-input" aria-label="배차 파일" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" type="file" onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file === undefined) {
              cancelUpload();
              return;
            }
            void loadUploadFile(file);
          }} />
          <div className={`dispatch-upload-scroll overlay-scroll${uploadFileName ? '' : ' is-empty'}`}>
            {!uploadFileName ? (
              <div
                className={`dispatch-upload-choice${uploadDragging ? ' is-dragging' : ''}`}
                onDragEnter={(event) => { event.preventDefault(); setUploadDragging(true); }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setUploadDragging(false);
                }}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setUploadDragging(true); }}
                onDrop={dropUploadFile}
              >
                <p>CSV 또는 XLSX 배차 파일을 선택하거나 이 영역에 끌어 놓으세요.</p>
                <div className="dispatch-upload-choice-actions">
                  <button className="btn primary" type="button" disabled={uploadBusy} onClick={() => uploadFileInputRef.current?.click()}>파일 업로드</button>
                  <button className="btn" type="button" disabled={uploadBusy} onClick={() => void loadExampleUpload()}>예제 업로드</button>
                </div>
              </div>
            ) : null}
            {uploadSheet ? (
              <DispatchSheetPreview
                activity={uploadActivity}
                focusTarget={uploadCellFocusTarget}
                issueCells={uploadIssueCells}
                onCellChange={editUploadSheetCell}
                sheet={uploadSheet}
              />
            ) : null}
            {uploadSheet === null && uploadActivity !== 'idle'
              ? <DispatchUploadActivity activity={uploadActivity} />
              : null}
            {uploadFileName ? (
              <div className="dispatch-upload-review">
                <p className="dispatch-upload-file"><strong>{uploadFileName}</strong><span>{Math.max(0, (uploadSheet?.cells.length ?? 1) - 1)}행</span></p>
                <label>배차일<input aria-label="배차일" type="date" value={uploadPlanDate} onChange={(event) => {
                  const planDate = event.target.value;
                  setUploadPlanDate(planDate);
                  if (uploadRows.length > 0) void inspectUpload({ fileName: uploadFileName, planDate, rows: uploadRows });
                }} /></label>
                {uploadError ? <p className="dispatch-upload-error" role="alert">{uploadError}</p> : null}
                <button className="btn primary" type="button" disabled={uploadBusy || uploadPreview?.canCommit !== true} onClick={() => void commitUpload()}>업로드 확정</button>
              </div>
            ) : null}
            {!uploadFileName && uploadError ? <p className="dispatch-upload-error" role="alert">{uploadError}</p> : null}
            {uploadPreview ? <div className="dispatch-upload-summary" role="status"><span>전체 <b>{uploadPreview.summary.totalRows}</b></span><span>주소 확인 <b>{resolvedAddressRows}</b></span><span>정상 <b>{uploadPreview.summary.readyRows}</b></span>{(uploadPreview.summary.updateCandidateRows ?? 0) > 0 ? <span>변경 <b>{uploadPreview.summary.updateCandidateRows}</b></span> : null}<span>확인 <b>{uploadPreview.summary.reviewRows}</b></span><span>오류 <b>{uploadPreview.summary.errorRows}</b></span></div> : null}
            {uploadNoteRows.length > 0 ? (
              <div className="dispatch-upload-notes" aria-label="특이사항 미리보기">
                {uploadNoteRows.map((row) => (
                  <div className="dispatch-upload-note-row" key={`${row.rowNumber}:${row.sellerOrderKey}`}>
                    <span>{row.rowNumber}행</span>
                    <strong>{row.sellerOrderKey}</strong>
                    <p>{row.notes}</p>
                    <b>미확인</b>
                  </div>
                ))}
              </div>
            ) : null}
            {uploadIssueRows.length ? (
              <details className="dispatch-upload-issues">
                <summary>
                  <span>오류 상세</span>
                  <span className="dispatch-upload-issues-toggle">
                    <span className="dispatch-upload-toggle-open">펼치기</span>
                    <span className="dispatch-upload-toggle-close">접기</span>
                    <ChevronDown aria-hidden="true" />
                  </span>
                  <b>{uploadIssueRows.length}행</b>
                </summary>
                <div className="dispatch-upload-issue-list">
                  {uploadIssueEntries.map((entry) => {
                    const addressDetails = uploadAddressDetails(uploadPreview, entry);
                    const suggestions = uploadAddressSuggestions(uploadPreview, entry);
                    return (
                      <div className="dispatch-upload-issue-row" key={`${entry.rowNumber}:${entry.issue.code}:${entry.issue.field}`}>
                        <button
                          className="dispatch-upload-issue-location"
                          type="button"
                          title={`${entry.rowNumber}행 ${entry.columnIndex === null ? '첫 번째 셀' : `${spreadsheetColumnName(entry.columnIndex)}열`} 수정`}
                          onClick={() => focusUploadIssue(entry)}
                        >
                          <strong>{entry.rowNumber}행</strong>
                          <b>{entry.columnIndex === null ? '행 전체' : `${spreadsheetColumnName(entry.columnIndex)}열`}</b>
                          <ArrowUpRight aria-hidden="true" />
                        </button>
                        <div className="dispatch-upload-issue-content">
                          <span className="dispatch-upload-issue-message">{uploadIssueMessage(entry.issue)}</span>
                          {addressDetails ? (
                            <dl className="dispatch-address-details">
                              <div><dt>기본 주소</dt><dd>{addressDetails.address || '-'}</dd></div>
                              <div><dt>상세주소</dt><dd>{addressDetails.detailAddress || '-'}</dd></div>
                            </dl>
                          ) : null}
                          {suggestions.length > 0 ? (
                            <div className="dispatch-address-suggestions" aria-label={`${entry.rowNumber}행 배송처 검색 후보`}>
                              {suggestions.map((suggestion) => (
                                <div className="dispatch-address-suggestion" key={`${suggestion.providerPlaceId ?? suggestion.address}:${suggestion.title}`}>
                                  <span>
                                    <strong>{suggestion.title}</strong>
                                    <small>{formatAddressSuggestion(suggestion)}</small>
                                  </span>
                                  <em>{suggestion.recommended ? '추천' : `${suggestion.score}점`}</em>
                                  <button
                                    type="button"
                                    disabled={uploadBusy}
                                    onClick={() => applyAddressSuggestion(entry.rowNumber, suggestion)}
                                  >
                                    적용
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            ) : null}
            {uploadPreview && !conditionCandidates.length && uploadPreview.summary.errorRows === 0 && uploadPreview.summary.reviewRows === 0 ? <p className="condition-upload-empty" role="status">필수 검사와 주소 정본 확인을 통과했습니다.</p> : null}
            {driverCandidates.map((name) => (
              <div className="upload-resource-candidate driver-candidate" key={name}>
                <span><small>배송원</small><strong>{name}</strong></span>
                <button type="button" disabled={uploadBusy} onClick={() => void registerDriver(name)}>배송원 등록</button>
              </div>
            ))}
            {vehicleCandidates.map((plate) => (
              <div className="upload-resource-candidate vehicle-candidate" key={plate}>
                <span><small>차량 번호</small><strong>{plate}</strong></span>
                <button type="button" disabled={uploadBusy} onClick={() => void registerVehicle(plate)}>차량 등록</button>
              </div>
            ))}
            {conditionCandidates.map((candidate) => <div className="condition-candidate" key={candidate.code}><strong>{candidate.code}</strong><label>명칭<input value={candidate.name} onChange={(event) => updateConditionCandidate(candidate.code, 'name', event.target.value)} /></label><label>설명<input value={candidate.description} onChange={(event) => updateConditionCandidate(candidate.code, 'description', event.target.value)} /></label><button type="button" disabled={uploadBusy || !candidate.name.trim() || !candidate.description.trim()} onClick={() => void registerCondition(candidate)}>등록</button></div>)}
          </div>
        </section>
      </div>
      {apiConfig.mode === 'remote' ? (
        <RemoteDispatchBoard
          departureDraft={departureDraft}
          departureError={departureError}
          departureLocation={departureLocation}
          error={remoteError}
          onDepartureChange={(value) => {
            setDepartureDraft(value);
            setDepartureError(false);
            setOperationsError('');
          }}
          onDepartureSave={() => void saveDepartureTime()}
          onRetry={() => setRemoteReloadKey((current) => current + 1)}
          onSearchChange={setDispatchSearch}
          onServiceDateChange={setServiceDate}
          onAssignmentChanged={() => setRemoteReloadKey((current) => current + 1)}
          mapReturnKey={mapReturnKey}
          operationsBusy={operationsBusy}
          operationsError={operationsError}
          operationsStatus={operationsStatus}
          status={remoteStatus}
          view={remoteDispatch}
          references={remoteReferences}
          search={dispatchSearch}
          serviceDate={serviceDate}
        />
      ) : (
        <MockDispatchBoard
          departureDraft={departureDraft}
          departureError={departureError}
          departureLocation={departureLocation}
          onDepartureChange={(value) => {
            setDepartureDraft(value);
            setDepartureError(false);
          }}
          onDepartureSave={() => void saveDepartureTime()}
          mapReturnKey={mapReturnKey}
          onSearchChange={setDispatchSearch}
          onServiceDateChange={setServiceDate}
          search={dispatchSearch}
          serviceDate={serviceDate}
        />
      )}
    </>
  );
}

function DispatchUploadActivity({
  activity,
  floating = false,
}: {
  activity: Exclude<UploadActivity, 'idle'>;
  floating?: boolean;
}): ReactElement {
  const parsing = activity === 'parsing';
  return (
    <div className={`dispatch-upload-activity${floating ? ' is-floating' : ''}`} role="status" aria-live="polite">
      <LoaderCircle aria-hidden="true" />
      <span>
        <strong>{parsing ? '파일 미리보기 준비 중' : '주소 확인 중'}</strong>
        <small>{parsing ? '업로드 파일을 읽고 있습니다.' : '지오코딩 작업을 진행하고 있습니다.'}</small>
      </span>
    </div>
  );
}

function DispatchSheetPreview({
  activity,
  focusTarget,
  issueCells,
  onCellChange,
  sheet,
}: {
  activity: UploadActivity;
  focusTarget: SheetCellFocusTarget | null;
  issueCells: Set<string>;
  onCellChange: (rowIndex: number, columnIndex: number, value: string) => void;
  sheet: DispatchFileParseResult['sheet'];
}): ReactElement {
  const sheetScrollRef = useRef<HTMLDivElement>(null);
  const cancelBlurCommit = useRef(false);
  const [editingCell, setEditingCell] = useState<{
    columnIndex: number;
    originalValue: string;
    rowIndex: number;
    value: string;
  } | null>(null);
  const [rowWindowStart, setRowWindowStart] = useState(0);
  const visibleRows = sheet.cells.slice(rowWindowStart, rowWindowStart + 101);
  const columnCount = Math.max(1, ...visibleRows.map((row) => row.length));
  const columns = Array.from({ length: columnCount }, (_, index) => index);
  const columnWidths = columns.map((column) => spreadsheetColumnWidth(sheet.cells[0]?.[column] ?? ''));
  const tableWidth = 36 + columnWidths.reduce((total, width) => total + width, 0);
  const commitCell = (value: string) => {
    if (editingCell === null) return;
    const { columnIndex, originalValue, rowIndex } = editingCell;
    setEditingCell(null);
    if (value === originalValue) return;
    onCellChange(rowIndex, columnIndex, value);
  };
  const beginEditing = (rowIndex: number, columnIndex: number, value: string) => {
    cancelBlurCommit.current = false;
    setEditingCell({ columnIndex, originalValue: value, rowIndex, value });
  };
  const handleEditorKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      cancelBlurCommit.current = true;
      setEditingCell(null);
    }
  };
  useEffect(() => {
    if (focusTarget === null) return;
    const maxWindowStart = Math.max(0, sheet.cells.length - 101);
    const nextWindowStart = focusTarget.rowIndex < rowWindowStart || focusTarget.rowIndex >= rowWindowStart + 101
      ? Math.min(maxWindowStart, Math.max(0, focusTarget.rowIndex - 12))
      : rowWindowStart;
    if (nextWindowStart !== rowWindowStart) setRowWindowStart(nextWindowStart);
    beginEditing(
      focusTarget.rowIndex,
      focusTarget.columnIndex,
      sheet.cells[focusTarget.rowIndex]?.[focusTarget.columnIndex] ?? '',
    );
  }, [focusTarget]);
  useEffect(() => {
    setRowWindowStart((current) => Math.min(current, Math.max(0, sheet.cells.length - 101)));
  }, [sheet.cells.length]);
  useEffect(() => {
    if (editingCell === null) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const editor = sheetScrollRef.current?.querySelector<HTMLInputElement>(
        `[data-sheet-editor="${editingCell.rowIndex}:${editingCell.columnIndex}"]`,
      );
      editor?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      editor?.focus({ preventScroll: true });
      editor?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingCell?.columnIndex, editingCell?.rowIndex, rowWindowStart]);
  return (
    <div className="upload-sheet dispatch-upload-sheet">
      <div className="sheet-scroll" ref={sheetScrollRef}>
        <table className="page-table" aria-label={`${sheet.name} 시트 미리보기`} style={{ minWidth: '100%', width: `${tableWidth}px` }}>
          <colgroup><col style={{ width: '36px' }} />{columnWidths.map((width, column) => <col key={column} style={{ width: `${width}px` }} />)}</colgroup>
          <thead><tr><th className="sheet-row" aria-label="행 번호" />{columns.map((column) => <th key={column} scope="col">{spreadsheetColumnName(column)}</th>)}</tr></thead>
          <tbody>
            {visibleRows.map((row, visibleRowIndex) => {
              const rowIndex = rowWindowStart + visibleRowIndex;
              return (
              <tr key={rowIndex}>
                <th className="sheet-row" scope="row">{rowIndex + 1}</th>
                {columns.map((columnIndex) => {
                  const value = row[columnIndex] ?? '';
                  const editing = editingCell?.rowIndex === rowIndex && editingCell.columnIndex === columnIndex;
                  const invalid = issueCells.has(`${rowIndex}:${columnIndex}`);
                  return (
                    <td
                      className={invalid ? 'is-error' : undefined}
                      data-sheet-cell={`${rowIndex}:${columnIndex}`}
                      key={columnIndex}
                    >
                      {editing ? (
                        <input
                          aria-label={`${rowIndex + 1}행 ${spreadsheetColumnName(columnIndex)}열 편집`}
                          autoFocus
                          className="sheet-cell-editor"
                          data-sheet-editor={`${rowIndex}:${columnIndex}`}
                          onBlur={(event) => {
                            if (cancelBlurCommit.current) {
                              cancelBlurCommit.current = false;
                              return;
                            }
                            commitCell(event.currentTarget.value);
                          }}
                          onChange={(event) => setEditingCell((current) => current === null ? null : { ...current, value: event.target.value })}
                          onFocus={(event) => event.currentTarget.select()}
                          onKeyDown={handleEditorKeyDown}
                          value={editingCell.value}
                        />
                      ) : (
                        <div
                          className="sheet-cell"
                          onDoubleClick={() => beginEditing(rowIndex, columnIndex, value)}
                          title={value || undefined}
                        >
                          {value || '\u00a0'}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {activity !== 'idle'
        ? <DispatchUploadActivity activity={activity} floating />
        : null}
    </div>
  );
}

function spreadsheetColumnWidth(header: string): number {
  if (header === '주소') return 260;
  if (header === '특이사항') return 150;
  if (header === '배송처' || header === 'SellerOrderKey') return 128;
  return 96;
}

function spreadsheetColumnName(index: number): string {
  let name = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  return name;
}

function mergeResolvedPreviewRows(
  rows: DispatchImportRow[],
  previewRows: DispatchImportPreview['rows'],
): DispatchImportRow[] {
  const previewByRowNumber = new Map(previewRows.map((row) => [row.rowNumber, row]));
  return rows.map((row) => {
    const preview = previewByRowNumber.get(row.rowNumber);
    if (preview === undefined) return row;
    const normalized = preview.normalized;
    const addressResolutionStatus = preview.addressResolutionStatus ?? normalized?.addressResolutionStatus;
    const postalCode = preview.postalCode ?? normalized?.postalCode;
    return {
      ...row,
      ...(addressResolutionStatus === undefined ? {} : { addressResolutionStatus }),
      ...(preview.detailAddress === undefined ? {} : { detailAddress: preview.detailAddress }),
      ...(preview.jibunAddress === undefined ? {} : { jibunAddress: preview.jibunAddress }),
      latitude: preview.latitude,
      longitude: preview.longitude,
      ...(postalCode === undefined ? {} : { postalCode }),
      rawAddress: preview.rawAddress ?? row.rawAddress ?? row.address,
    };
  });
}

function preserveResolvedRows(
  currentRows: DispatchImportRow[],
  nextRows: DispatchImportRow[],
): DispatchImportRow[] {
  const currentByRowNumber = new Map(currentRows.map((row) => [row.rowNumber, row]));
  return nextRows.map((row) => {
    const current = currentByRowNumber.get(row.rowNumber);
    if (current === undefined || current.address !== row.address) return row;
    return {
      ...row,
      addressResolutionStatus: current.addressResolutionStatus,
      detailAddress: current.detailAddress,
      jibunAddress: current.jibunAddress,
      latitude: current.latitude,
      longitude: current.longitude,
      postalCode: current.postalCode,
      rawAddress: current.rawAddress,
    };
  });
}

function waitForPreviewPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function MockDispatchBoard({
  departureDraft,
  departureError,
  departureLocation,
  mapReturnKey,
  onDepartureChange,
  onDepartureSave,
  onSearchChange,
  onServiceDateChange,
  search,
  serviceDate,
}: {
  departureDraft: string;
  departureError: boolean;
  departureLocation: DepartureLocation | null;
  mapReturnKey: number;
  onDepartureChange: (value: string) => void;
  onDepartureSave: () => void;
  onSearchChange: (value: DispatchSearch) => void;
  onServiceDateChange: (value: string) => void;
  search: DispatchSearch;
  serviceDate: string;
}): ReactElement {
  return (
    <DispatchWorkspace
      departureControl={<RemoteDepartureTime busy={false} draft={departureDraft} error="" invalid={departureError} onChange={onDepartureChange} onSave={onDepartureSave} status="ready" />}
      departureLocation={departureLocation}
      mapReturnKey={mapReturnKey}
      onSearchChange={onSearchChange}
      onServiceDateChange={onServiceDateChange}
      references={null}
      rows={[]}
      search={search}
      serviceDate={serviceDate}
      summary={{ assigned: 0, etaAttention: 0, total: 0, unassigned: 0 }}
    />
  );
}

function RemoteDispatchBoard({
  departureDraft,
  departureError,
  departureLocation,
  error,
  mapReturnKey,
  onAssignmentChanged,
  onDepartureChange,
  onDepartureSave,
  onRetry,
  onSearchChange,
  onServiceDateChange,
  operationsBusy,
  operationsError,
  operationsStatus,
  status,
  view,
  references,
  search,
  serviceDate,
}: {
  departureDraft: string;
  departureError: boolean;
  departureLocation: DepartureLocation | null;
  error: string;
  mapReturnKey: number;
  onAssignmentChanged: () => void;
  onDepartureChange: (value: string) => void;
  onDepartureSave: () => void;
  onRetry: () => void;
  onSearchChange: (value: DispatchSearch) => void;
  onServiceDateChange: (value: string) => void;
  operationsBusy: boolean;
  operationsError: string;
  operationsStatus: 'error' | 'loading' | 'ready';
  status: 'error' | 'loading' | 'ready';
  view: DispatchListView | null;
  references: ManagementData | null;
  search: DispatchSearch;
  serviceDate: string;
}): ReactElement {
  const departureControl = (
    <RemoteDepartureTime
      busy={operationsBusy}
      draft={departureDraft}
      error={operationsError}
      invalid={departureError}
      onChange={onDepartureChange}
      onSave={onDepartureSave}
      status={operationsStatus}
    />
  );
  if (status === 'loading') {
    return (
      <DispatchWorkspace
        departureControl={departureControl}
        departureLocation={departureLocation}
        loading
        mapReturnKey={mapReturnKey}
        onSearchChange={onSearchChange}
        onServiceDateChange={onServiceDateChange}
        references={references}
        rows={[]}
        search={search}
        serviceDate={serviceDate}
        summary={{ assigned: 0, etaAttention: 0, total: 0, unassigned: 0 }}
      />
    );
  }
  if (status === 'error' || view === null) {
    return (
      <DispatchWorkspace
        departureControl={departureControl}
        departureLocation={departureLocation}
        error={error || '잠시 후 다시 시도하세요.'}
        mapReturnKey={mapReturnKey}
        onRetry={onRetry}
        onSearchChange={onSearchChange}
        onServiceDateChange={onServiceDateChange}
        references={references}
        rows={[]}
        search={search}
        serviceDate={serviceDate}
        summary={{ assigned: 0, etaAttention: 0, total: 0, unassigned: 0 }}
      />
    );
  }
  return (
    <DispatchWorkspace
      departureControl={departureControl}
      departureLocation={departureLocation}
      mapReturnKey={mapReturnKey}
      onAssignmentChanged={onAssignmentChanged}
      onSearchChange={onSearchChange}
      onServiceDateChange={onServiceDateChange}
      references={references}
      rows={view.rows}
      search={search}
      serviceDate={serviceDate}
      summary={view.summary}
    />
  );
}

type DispatchFilter = 'ALL' | 'ASSIGNED' | 'UNASSIGNED';
type DispatchWorkspaceView = 'LIST' | 'MAP';

function DispatchWorkspace({
  departureControl,
  departureLocation,
  error = '',
  loading = false,
  mapReturnKey,
  onAssignmentChanged,
  onRetry,
  onSearchChange,
  onServiceDateChange,
  references,
  rows,
  search,
  serviceDate,
  summary,
}: {
  departureControl: ReactElement;
  departureLocation: DepartureLocation | null;
  error?: string;
  loading?: boolean;
  mapReturnKey: number;
  onAssignmentChanged?: () => void;
  onRetry?: () => void;
  onSearchChange: (value: DispatchSearch) => void;
  onServiceDateChange: (value: string) => void;
  references: ManagementData | null;
  rows: DispatchListItem[];
  search: DispatchSearch;
  serviceDate: string;
  summary: DispatchListView['summary'];
}): ReactElement {
  const [filter, setFilter] = useState<DispatchFilter>('ALL');
  const [workspaceView, setWorkspaceView] = useState<DispatchWorkspaceView>('MAP');
  const [searchDraft, setSearchDraft] = useState<DispatchSearch>(search);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectionCoordinates, setSelectionCoordinates] = useState<Array<[number, number]>>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const [constraintBusy, setConstraintBusy] = useState(false);
  const [constraintError, setConstraintError] = useState('');
  const [constraintEnd, setConstraintEnd] = useState('');
  const [constraintStart, setConstraintStart] = useState('');
  const [constraintStatus, setConstraintStatus] = useState('');
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const readOnly = serviceDate < todayInKorea();
  const hasSearch = search.destinationName !== '' || search.orderNumber !== '';
  const visibleRows = useMemo(
    () => filter === 'ALL' ? rows : rows.filter((row) => row.assignmentStatus === filter),
    [filter, rows],
  );
  const visibleDestinationGroups = useMemo(() => groupDispatchDestinations(visibleRows), [visibleRows]);
  const visibleIds = useMemo(() => new Set(visibleRows.map((row) => row.sellerOrderId)), [visibleRows]);
  const selectedIdSet = useMemo(() => new Set(selectedOrderIds), [selectedOrderIds]);
  const selectedOrders = useMemo(
    () => rows.filter((row) => selectedIdSet.has(row.sellerOrderId)),
    [rows, selectedIdSet],
  );
  const selectedDestinationGroups = useMemo(() => groupDispatchDestinations(selectedOrders), [selectedOrders]);
  const selectedDestinationIds = useMemo(
    () => selectedDestinationGroups.map((group) => group.destinationId),
    [selectedDestinationGroups],
  );
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedIdSet.has(row.sellerOrderId));
  const someVisibleSelected = !allVisibleSelected && visibleRows.some((row) => selectedIdSet.has(row.sellerOrderId));
  const points = useMemo(() => visibleDestinationGroups.flatMap((group) => {
    const anchor = dispatchDestinationCoordinateAnchor(group.orders);
    if (anchor === null || anchor.latitude === null || anchor.longitude === null) return [];
    return [{
      id: group.destinationId,
      latitude: anchor.latitude,
      longitude: anchor.longitude,
      tone: group.orders.every((row) => row.assignmentStatus === 'ASSIGNED') ? 'assigned' as const : 'unassigned' as const,
    }];
  }), [visibleDestinationGroups]);
  const missingCoordinateCount = visibleDestinationGroups.length - points.length;
  const drivers = references?.drivers ?? [];
  const vehicles = references?.vehicles ?? [];
  const assignments = references?.assignments ?? [];
  const selectedDriver = drivers.find((driver) => driver.id === selectedDriverId) ?? null;
  const selectedVehicleAssignment = selectedDriver === null ? undefined : assignments.find((assignment) => assignment.driverId === selectedDriver.id);
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleAssignment?.vehicleId) ?? null;
  const selectedDriverRoutePlanId = selectedDriver === null
    ? undefined
    : rows.find((row) => row.driverId === selectedDriver.id && row.routePlanId !== null)?.routePlanId ?? undefined;
  const assignedSelectionCount = selectedOrders.filter((row) => row.assignmentStatus === 'ASSIGNED').length;
  const assignmentCandidates = selectedOrders.filter((row) => row.driverId !== selectedDriver?.id);
  const selectedDestinationSummary = selectedDestinationGroups.length === 0
    ? '지도 또는 목록에서 배송지를 선택하세요.'
    : selectedDestinationGroups.length === 1
      ? dispatchDestinationName(selectedDestinationGroups[0].orders[0], references)
      : `${dispatchDestinationName(selectedDestinationGroups[0].orders[0], references)} 외 ${selectedDestinationGroups.length - 1}곳`;
  const selectedOrder = selectedOrders.length === 1 ? selectedOrders[0] : null;
  const selectedOrderMissingStop = selectedOrder?.deliveryStopId === null;
  const canClearSelectedTimeConstraint = selectedOrder !== null
    && (selectedOrder.timeConstraint !== null || selectedOrder.rawNote !== null || selectedOrder.reviewStatus === 'CONFIRMED');

  useEffect(() => {
    setSearchDraft(search);
  }, [search.destinationName, search.orderNumber]);

  useEffect(() => {
    setWorkspaceView('MAP');
  }, [mapReturnKey]);

  useEffect(() => {
    setConstraintError('');
    setConstraintStatus('');
    setConstraintStart(selectedOrder?.timeConstraint?.timeWindowStart ?? '');
    setConstraintEnd(selectedOrder?.timeConstraint?.timeWindowEnd ?? '');
  }, [selectedOrder?.sellerOrderId, selectedOrder?.timeConstraint?.timeWindowEnd, selectedOrder?.timeConstraint?.timeWindowStart]);

  useEffect(() => {
    setSelectedOrderIds((current) => {
      const next = current.filter((id) => visibleIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [visibleIds]);

  useEffect(() => {
    if (selectAllCheckboxRef.current !== null) selectAllCheckboxRef.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected]);

  useEffect(() => {
    if (!drivers.length) {
      setSelectedDriverId('');
      return;
    }
    if (!drivers.some((driver) => driver.id === selectedDriverId)) setSelectedDriverId(drivers[0].id);
  }, [drivers, selectedDriverId]);

  const selectOrder = useCallback((orderId: string) => {
    setMutationError('');
    setSelectionCoordinates([]);
    setSelectionMode(false);
    setSelectedOrderIds((current) => current.includes(orderId)
      ? current.filter((id) => id !== orderId)
      : [...current, orderId]);
  }, []);

  const selectDestination = useCallback((destinationId: string) => {
    const destinationOrderIds = visibleRows
      .filter((row) => row.destinationId === destinationId)
      .map((row) => row.sellerOrderId);
    if (destinationOrderIds.length === 0) return;
    setMutationError('');
    setSelectionCoordinates([]);
    setSelectionMode(false);
    setSelectedOrderIds((current) => {
      const currentIds = new Set(current);
      const removeDestination = destinationOrderIds.every((id) => currentIds.has(id));
      if (removeDestination) return current.filter((id) => !destinationOrderIds.includes(id));
      return [...new Set([...current, ...destinationOrderIds])];
    });
  }, [visibleRows]);

  const addSelectionPoint = useCallback((coordinate: [number, number]) => {
    setMutationError('');
    setSelectionCoordinates((current) => [...current, coordinate]);
  }, []);

  function startAreaSelection(): void {
    if (readOnly || points.length === 0) return;
    setMutationError('');
    setSelectedOrderIds([]);
    setSelectionCoordinates([]);
    setSelectionMode(true);
  }

  function cancelAreaSelection(): void {
    setSelectionMode(false);
    setSelectionCoordinates([]);
  }

  function clearSelection(): void {
    setMutationError('');
    setConstraintError('');
    setConstraintStatus('');
    setSelectedOrderIds([]);
    setSelectionCoordinates([]);
    setSelectionMode(false);
  }

  function toggleAllVisibleRows(): void {
    setMutationError('');
    setSelectionCoordinates([]);
    setSelectionMode(false);
    setSelectedOrderIds(allVisibleSelected ? [] : visibleRows.map((row) => row.sellerOrderId));
  }

  function changeWorkspaceView(nextView: DispatchWorkspaceView): void {
    if (nextView === workspaceView) return;
    if (selectionMode) {
      setSelectionCoordinates([]);
      setSelectionMode(false);
    }
    setWorkspaceView(nextView);
  }

  function applySearch(): void {
    const next = {
      destinationName: searchDraft.destinationName.trim().replace(/\s+/gu, ' '),
      orderNumber: searchDraft.orderNumber.trim().replace(/\s+/gu, ' '),
    };
    if (next.destinationName === search.destinationName && next.orderNumber === search.orderNumber) return;
    onSearchChange(next);
  }

  function clearSearch(): void {
    const empty = { destinationName: '', orderNumber: '' };
    setSearchDraft(empty);
    if (hasSearch) onSearchChange(empty);
  }

  const completeAreaSelection = useCallback((coordinates: Array<[number, number]>) => {
    if (coordinates.length < 3) {
      setMutationError('지도에서 세 점 이상을 선택하세요.');
      return;
    }
    const matchedIds = visibleDestinationGroups.flatMap((group) => {
      const anchor = dispatchDestinationCoordinateAnchor(group.orders);
      if (anchor === null || anchor.latitude === null || anchor.longitude === null) return [];
      return pointInPolygon([anchor.longitude, anchor.latitude], coordinates)
        ? group.orders.map((row) => row.sellerOrderId)
        : [];
    });
    setSelectedOrderIds(matchedIds);
    setSelectionMode(false);
    setSelectionCoordinates(coordinates);
    setMutationError(matchedIds.length === 0 ? '선택 영역 안에 배송지가 없습니다.' : '');
  }, [visibleDestinationGroups]);

  const changeAreaSelection = useCallback((coordinates: Array<[number, number]>) => {
    setSelectionCoordinates(coordinates);
    if (selectionMode || coordinates.length < 3) return;
    const matchedIds = visibleDestinationGroups.flatMap((group) => {
      const anchor = dispatchDestinationCoordinateAnchor(group.orders);
      if (anchor === null || anchor.latitude === null || anchor.longitude === null) return [];
      return pointInPolygon([anchor.longitude, anchor.latitude], coordinates)
        ? group.orders.map((row) => row.sellerOrderId)
        : [];
    });
    setSelectedOrderIds(matchedIds);
    setMutationError(matchedIds.length === 0 ? '선택 영역 안에 배송지가 없습니다.' : '');
  }, [selectionMode, visibleDestinationGroups]);

  async function assignSelected(): Promise<void> {
    if (assignmentCandidates.length === 0 || selectedDriver === null || selectedVehicle === null || readOnly) return;
    if (assignmentCandidates.length > MAX_DISPATCH_ASSIGNMENT_COUNT) {
      setMutationError(`배송 배정은 한 번에 최대 ${MAX_DISPATCH_ASSIGNMENT_COUNT}건까지 가능합니다.`);
      return;
    }
    setMutationBusy(true);
    setMutationError('');
    try {
      const assignmentInput = {
        driverId: selectedDriver.id,
        routePlanId: selectedDriverRoutePlanId,
        vehicleId: selectedVehicle.id,
      };
      if (assignmentCandidates.length === 1) {
        await reassignDispatchOrder({ ...assignmentInput, order: assignmentCandidates[0] });
      } else {
        await reassignDispatchOrders({ ...assignmentInput, orders: assignmentCandidates });
      }
      clearSelection();
    } catch (caught) {
      setMutationError(errorMessage(caught));
    } finally {
      onAssignmentChanged?.();
      setMutationBusy(false);
    }
  }

  async function unassignSelected(): Promise<void> {
    const assignedOrders = selectedOrders.filter((row) => row.assignmentStatus === 'ASSIGNED');
    if (assignedOrders.length === 0 || readOnly) return;
    if (assignedOrders.length > MAX_DISPATCH_ASSIGNMENT_COUNT) {
      setMutationError(`배정 해제는 한 번에 최대 ${MAX_DISPATCH_ASSIGNMENT_COUNT}건까지 가능합니다.`);
      return;
    }
    setMutationBusy(true);
    setMutationError('');
    try {
      try {
        await submitUnassignment(assignedOrders);
      } catch (caught) {
        if (!isAssignmentVersionConflict(caught)) throw caught;
        const refreshed = await loadDispatchList(serviceDate, search);
        const refreshedById = new Map(refreshed.rows.map((row) => [row.sellerOrderId, row]));
        const refreshedOrders = assignedOrders.map((row) => refreshedById.get(row.sellerOrderId));
        if (refreshedOrders.some((row) => row?.assignmentStatus !== 'ASSIGNED')) throw caught;
        await submitUnassignment(refreshedOrders as DispatchListItem[]);
      }
      clearSelection();
      onAssignmentChanged?.();
    } catch (caught) {
      setMutationError(errorMessage(caught));
    } finally {
      setMutationBusy(false);
    }
  }

  async function submitUnassignment(orders: DispatchListItem[]): Promise<void> {
    if (orders.length === 1) await unassignDispatchOrder(orders[0]);
    else await unassignDispatchOrders(orders);
  }

  async function deleteSelected(): Promise<void> {
    if (selectedOrders.length === 0 || readOnly) return;
    if (selectedOrders.length > MAX_DISPATCH_DELETE_COUNT) {
      setMutationError(`배송 삭제는 한 번에 최대 ${MAX_DISPATCH_DELETE_COUNT}건까지 가능합니다.`);
      return;
    }
    if (!window.confirm(`선택한 배송 ${selectedOrders.length}건을 영구 삭제합니다. 삭제 후에는 되돌릴 수 없습니다.`)) return;
    setMutationBusy(true);
    setMutationError('');
    try {
      await deleteDispatchOrders(selectedOrders, '관리자 배송 삭제');
      clearSelection();
      onAssignmentChanged?.();
    } catch (caught) {
      setMutationError(errorMessage(caught));
    } finally {
      setMutationBusy(false);
    }
  }

  async function confirmSelectedTimeConstraint(): Promise<void> {
    if (selectedOrder === null || readOnly) return;
    if (!isHardTimeRange(constraintStart, constraintEnd)) {
      setConstraintStatus('');
      setConstraintError('시간을 HH:mm 형식으로 입력하고 시작 시간을 종료 시간보다 빠르게 설정하세요.');
      return;
    }
    setConstraintBusy(true);
    setConstraintError('');
    setConstraintStatus('');
    try {
      const result = await confirmDispatchTimeConstraint(selectedOrder, {
        timeWindowEnd: constraintEnd,
        timeWindowStart: constraintStart,
      });
      setConstraintStatus(timeConstraintCommandMessage(result.recalculation.status));
      onAssignmentChanged?.();
    } catch (caught) {
      setConstraintError(errorMessage(caught));
    } finally {
      setConstraintBusy(false);
    }
  }

  async function clearSelectedTimeConstraint(): Promise<void> {
    if (selectedOrder === null || readOnly) return;
    setConstraintBusy(true);
    setConstraintError('');
    setConstraintStatus('');
    try {
      const result = await clearDispatchTimeConstraint(selectedOrder, '관리자 시간 제약 해제');
      setConstraintStart('');
      setConstraintEnd('');
      setConstraintStatus(timeConstraintCommandMessage(result.recalculation.status));
      onAssignmentChanged?.();
    } catch (caught) {
      setConstraintError(errorMessage(caught));
    } finally {
      setConstraintBusy(false);
    }
  }

  return (
    <section className="dispatch-assignment" aria-label="배차 작업">
      <div className="dispatch-assignment-toolbar">
        <label className="dispatch-date-field">배차일<input aria-label="배차일 선택" required type="date" value={serviceDate} onChange={(event) => { if (event.target.value !== '') onServiceDateChange(event.target.value); }} /></label>
        <div className="dispatch-progress" aria-label="배정 진행"><span>전체 <b>{summary.total}</b></span><span>배정 <b>{summary.assigned}</b></span><span>미배정 <b>{summary.unassigned}</b></span></div>
        {summary.total > 0 && summary.unassigned === 0 ? <strong className="dispatch-complete">배정 완료</strong> : null}
        {readOnly ? <span className="dispatch-readonly">지난 배차는 조회만 가능합니다.</span> : null}
        {departureControl}
      </div>
      <div className="dispatch-map-workspace">
        <section className="dispatch-workspace-panel dispatch-map-panel" aria-label={workspaceView === 'MAP' ? '지도' : '목록'}>
          <div className="dispatch-map-header">
            <AdminSectionHeader
              title={workspaceView === 'MAP' ? '배차 지도' : '배차 목록'}
              side={workspaceView === 'MAP'
                ? (
                    <span className="dispatch-map-counts" aria-label="배차 지도 집계">
                      <span>주문 <b>{visibleRows.length}</b>건</span>
                      <span>배송지 <b>{visibleDestinationGroups.length}</b>곳</span>
                      {missingCoordinateCount > 0 ? <span>좌표 미확인 <b>{missingCoordinateCount}</b>곳</span> : null}
                    </span>
                  )
                : <span className="section-meta">{visibleRows.length}건</span>}
            />
            <div className="dispatch-map-tools">
              <div className="dispatch-view-switch" aria-label="배차 보기">
                {([['MAP', '지도'], ['LIST', '목록']] as const).map(([value, label]) => (
                  <button
                    aria-pressed={workspaceView === value}
                    className={workspaceView === value ? 'active' : ''}
                    key={value}
                    type="button"
                    onClick={() => changeWorkspaceView(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="dispatch-filter" aria-label="배정 상태 필터">
                {([['ALL', '전체'], ['UNASSIGNED', '미배정'], ['ASSIGNED', '배정']] as const).map(([value, label]) => (
                  <button className={filter === value ? 'active' : ''} key={value} type="button" onClick={() => setFilter(value)}>{label}</button>
                ))}
              </div>
            </div>
          </div>
          <form
            className="dispatch-search-form"
            aria-label="배차 검색"
            onSubmit={(event) => {
              event.preventDefault();
              applySearch();
            }}
          >
            <label>
              <span>오더번호</span>
              <input
                aria-label="오더번호 검색"
                maxLength={120}
                placeholder="예: 123456"
                type="search"
                value={searchDraft.orderNumber}
                onChange={(event) => setSearchDraft((current) => ({ ...current, orderNumber: event.target.value }))}
              />
            </label>
            <label>
              <span>배송처</span>
              <input
                aria-label="배송처 검색"
                maxLength={120}
                placeholder="예: 강남세브란스"
                type="search"
                value={searchDraft.destinationName}
                onChange={(event) => setSearchDraft((current) => ({ ...current, destinationName: event.target.value }))}
              />
            </label>
            <div className="dispatch-search-actions">
              <button className="btn primary" type="submit">검색</button>
              <button
                className="btn"
                disabled={!hasSearch && searchDraft.destinationName === '' && searchDraft.orderNumber === ''}
                type="button"
                onClick={clearSearch}
              >
                초기화
              </button>
            </div>
          </form>
          {workspaceView === 'MAP' ? (
            <div className="dispatch-map-surface">
              <div className="dispatch-map-selection-tools">
                {!selectionMode ? (
                  <button className="btn dispatch-area-start" type="button" disabled={readOnly || points.length === 0} onClick={startAreaSelection}>영역 선택</button>
                ) : (
                  <div className="dispatch-area-controls" aria-label="영역 선택 도구">
                    <span>선택 중 {selectionCoordinates.length}점</span>
                    <button type="button" disabled={selectionCoordinates.length === 0} onClick={() => setSelectionCoordinates((current) => current.slice(0, -1))}>한 점 취소</button>
                    <button type="button" onClick={cancelAreaSelection}>취소</button>
                  </div>
                )}
              </div>
              <Suspense fallback={<div className="dispatch-map-loading" role="status">지도 준비 중</div>}>
                <DispatchMapCanvas
                  ariaLabel="배차 배송지 지도"
                  departureLocation={departureLocation}
                  onMapPointAdd={addSelectionPoint}
                  onPointSelect={selectDestination}
                  onSelectionChange={changeAreaSelection}
                  onSelectionComplete={completeAreaSelection}
                  points={points}
                  selectionCoordinates={selectionCoordinates}
                  selectionMode={selectionMode}
                  selectedPointIds={selectedDestinationIds}
                  showEveryPoint
                  variant="embedded"
                />
              </Suspense>
              {selectionMode ? <div className="dispatch-map-guide" role="status">세 점 이상 지정한 뒤 꼭짓점을 클릭해 닫으세요. 꼭짓점은 드래그해 옮길 수 있습니다.</div> : null}
              {!loading && !error && points.length === 0 ? <div className="dispatch-map-message empty" role="status"><strong>표시할 배송지가 없습니다.</strong><span>주문을 업로드하거나 주소 좌표를 확인하세요.</span></div> : null}
              {loading ? <div className="dispatch-map-message" role="status"><strong>배송지를 불러오는 중</strong></div> : null}
              {error ? <div className="dispatch-map-message error" role="alert"><strong>배차 정보를 불러오지 못했습니다.</strong><span>{error}</span>{onRetry ? <button className="btn" type="button" onClick={onRetry}>다시 시도</button> : null}</div> : null}
            </div>
          ) : (
            <div className="dispatch-order-table-wrap overlay-scroll">
              <table className="dispatch-order-table">
                <colgroup>
                  <col className="select-column" />
                  <col className="order-column" />
                  <col className="destination-column" />
                  <col className="address-column" />
                  <col className="customer-column" />
                  <col className="driver-column" />
                  <col className="vehicle-column" />
                  <col className="status-column" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        ref={selectAllCheckboxRef}
                        aria-label="전체 선택"
                        checked={allVisibleSelected}
                        disabled={visibleRows.length === 0}
                        title="현재 목록 전체 선택"
                        type="checkbox"
                        onChange={toggleAllVisibleRows}
                      />
                    </th>
                    <th scope="col">주문</th>
                    <th scope="col">배송처</th>
                    <th scope="col">주소</th>
                    <th scope="col">고객사</th>
                    <th scope="col">배송원</th>
                    <th scope="col">차량</th>
                    <th scope="col">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const destinationName = dispatchDestinationName(row, references);
                    const driverName = row.driverId === null ? '-' : referenceName(drivers, row.driverId);
                    const vehiclePlate = row.vehicleId === null ? '-' : vehicles.find((vehicle) => vehicle.id === row.vehicleId)?.plate ?? '정보 확인';
                    return (
                      <tr
                        aria-selected={selectedIdSet.has(row.sellerOrderId)}
                        className={selectedIdSet.has(row.sellerOrderId) ? 'selected' : ''}
                        key={row.sellerOrderId}
                        onClick={() => selectOrder(row.sellerOrderId)}
                      >
                        <td onClick={(event) => event.stopPropagation()}>
                          <input
                            aria-label={`${destinationName} 선택`}
                            checked={selectedIdSet.has(row.sellerOrderId)}
                            type="checkbox"
                            onChange={() => selectOrder(row.sellerOrderId)}
                          />
                        </td>
                        <td title={row.sellerOrderKey}><strong>{row.sellerOrderKey}</strong></td>
                        <td title={destinationName}>{destinationName}</td>
                        <td title={row.destinationAddress ?? ''}>{row.destinationAddress || '주소 확인 필요'}</td>
                        <td title={dispatchCustomerName(row, references)}>{dispatchCustomerName(row, references)}</td>
                        <td title={driverName}>{driverName}</td>
                        <td title={vehiclePlate}>{vehiclePlate}</td>
                        <td>
                          <span>{row.assignmentStatus === 'ASSIGNED' ? '배정' : '미배정'}</span>
                          {row.reviewStatus === 'UNCONFIRMED' ? <small className="dispatch-note-state">미확인</small> : null}
                          {row.reviewStatus === 'CONFIRMED' ? <small className="dispatch-note-state confirmed">확정</small> : null}
                          {row.routeConstraintStatus === 'PENDING_RECALCULATION' ? <small className="dispatch-note-state pending">재계산</small> : null}
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && !error && visibleRows.length === 0 ? (
                    <tr className="dispatch-order-empty-row">
                      <td colSpan={8}>
                        <div className="dispatch-order-empty" role="status">
                          <strong>배차 없음</strong>
                          <span>{rows.length === 0 ? hasSearch ? '검색 조건에 맞는 주문이 없습니다.' : '등록된 주문이 없습니다.' : '선택한 상태의 주문이 없습니다.'}</span>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              {loading ? <div className="dispatch-list-message" role="status">배송지를 불러오는 중</div> : null}
              {error ? <div className="dispatch-list-message error" role="alert"><strong>배차 정보를 불러오지 못했습니다.</strong><span>{error}</span>{onRetry ? <button className="btn" type="button" onClick={onRetry}>다시 시도</button> : null}</div> : null}
            </div>
          )}
        </section>

        <section className="dispatch-workspace-panel dispatch-drivers-panel" aria-label="배송원">
          <AdminSectionHeader title="배송원" side={<span className="section-meta">{drivers.length}명</span>} />
          <div className="dispatch-driver-table-wrap overlay-scroll">
            <table className="dispatch-driver-table">
              <thead><tr><th scope="col">배송원</th><th scope="col">차량</th><th scope="col">배정</th></tr></thead>
              <tbody>
                {drivers.map((driver) => {
                  const assignment = assignments.find((item) => item.driverId === driver.id);
                  const vehicle = vehicles.find((item) => item.id === assignment?.vehicleId);
                  const assignedCount = rows.filter((row) => row.driverId === driver.id).length;
                  return (
                    <tr
                      aria-selected={driver.id === selectedDriver?.id}
                      className={driver.id === selectedDriver?.id ? 'active' : ''}
                      key={driver.id}
                      tabIndex={0}
                      onClick={() => setSelectedDriverId(driver.id)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        setSelectedDriverId(driver.id);
                      }}
                    >
                      <td><strong>{driver.name}</strong></td>
                      <td><strong>{vehicle?.plate || '미등록'}</strong></td>
                      <td><b>{assignedCount}</b>건</td>
                    </tr>
                  );
                })}
                {!drivers.length ? <tr className="dispatch-driver-empty-row"><td colSpan={3}><div className="dispatch-driver-empty" role="status"><strong>배송원 없음</strong><span>관리에서 배송원과 차량을 등록하세요.</span></div></td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="dispatch-assignment-action">
            <div className="dispatch-selected-order">
              <div className="dispatch-selected-counts" aria-label="선택 집계">
                <span><small>배송지</small><strong>{selectedDestinationGroups.length}곳</strong></span>
                <span><small>주문</small><strong>{selectedOrders.length}건</strong></span>
              </div>
              <small>{selectedDestinationSummary}</small>
            </div>
            {selectedOrders.length > 0 || selectionCoordinates.length > 0 ? <button className="dispatch-selection-clear" type="button" onClick={clearSelection}>선택 지우기</button> : null}
            {selectedDriver !== null && selectedVehicle === null ? <p role="alert">선택한 배송원에 배정된 차량이 없습니다.</p> : null}
            {mutationError ? <p role="alert">{mutationError}</p> : null}
            {selectedOrder !== null ? (
              <div className="dispatch-special-instruction" aria-label="특이사항">
                <div className="dispatch-special-instruction-summary">
                  <span>특이사항</span>
                  <strong>{selectedOrder.rawNote ?? '없음'}</strong>
                  <small>{reviewStatusLabel(selectedOrder.reviewStatus)} · {routeConstraintStatusLabel(selectedOrder.routeConstraintStatus)}</small>
                </div>
                <form
                  className="dispatch-time-constraint-form"
                  aria-label="시간 제약"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void confirmSelectedTimeConstraint();
                  }}
                >
                  <label>시작<input aria-label="시간 제약 시작" disabled={readOnly || constraintBusy || selectedOrderMissingStop} maxLength={5} placeholder="10:30" value={constraintStart} onChange={(event) => setConstraintStart(event.target.value)} /></label>
                  <label>종료<input aria-label="시간 제약 종료" disabled={readOnly || constraintBusy || selectedOrderMissingStop} maxLength={5} placeholder="11:00" value={constraintEnd} onChange={(event) => setConstraintEnd(event.target.value)} /></label>
                  <button type="submit" disabled={readOnly || constraintBusy || selectedOrderMissingStop}>확정</button>
                  <button type="button" disabled={readOnly || constraintBusy || selectedOrderMissingStop || !canClearSelectedTimeConstraint} onClick={() => void clearSelectedTimeConstraint()}>해제</button>
                </form>
                {selectedOrderMissingStop ? <p role="alert">배송지 ID가 없어 시간 제약을 변경할 수 없습니다.</p> : null}
                {constraintError ? <p role="alert">{constraintError}</p> : null}
                {constraintStatus ? <p role="status">{constraintStatus}</p> : null}
              </div>
            ) : null}
            <div>
              <button aria-label="배정 해제" className="btn" type="button" disabled={mutationBusy || readOnly || assignedSelectionCount === 0} onClick={() => void unassignSelected()}>배정 해제<span className="dispatch-action-count">{assignedSelectionCount}건</span></button>
              <button className="btn danger" type="button" disabled={mutationBusy || readOnly || selectedOrders.length === 0} onClick={() => void deleteSelected()}>배송 삭제</button>
              <button aria-label={assignedSelectionCount > 0 ? '선택 이관' : '선택 배정'} className="btn primary" type="button" disabled={mutationBusy || readOnly || assignmentCandidates.length === 0 || selectedDriver === null || selectedVehicle === null} onClick={() => void assignSelected()}>
                {mutationBusy ? '처리 중' : assignedSelectionCount > 0 ? '선택 이관' : '선택 배정'}
                {!mutationBusy ? <span className="dispatch-action-count">{assignmentCandidates.length}건</span> : null}
              </button>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function isAssignmentVersionConflict(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 409 || !isRecord(error.body)) return false;
  const detail = error.body.error;
  return isRecord(detail) && detail.code === 'SELLER_ORDER_ASSIGNMENT_CHANGED';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

type DispatchDestinationGroup = {
  destinationId: string;
  orders: DispatchListItem[];
};

function groupDispatchDestinations(rows: DispatchListItem[]): DispatchDestinationGroup[] {
  const groups = new Map<string, DispatchListItem[]>();
  for (const row of rows) groups.set(row.destinationId, [...(groups.get(row.destinationId) ?? []), row]);
  return [...groups].map(([destinationId, orders]) => ({ destinationId, orders }));
}

function dispatchDestinationCoordinateAnchor(orders: DispatchListItem[]): DispatchListItem | null {
  return orders.find((row) => (
    row.latitude !== null
    && row.longitude !== null
    && Number.isFinite(row.latitude)
    && Number.isFinite(row.longitude)
  )) ?? null;
}

function pointInPolygon(point: [number, number], polygon: Array<[number, number]>): boolean {
  const [x, y] = point;
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const [currentX, currentY] = polygon[current];
    const [previousX, previousY] = polygon[previous];
    const crossesLatitude = (currentY > y) !== (previousY > y);
    if (!crossesLatitude) continue;
    const crossingLongitude = ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX;
    if (x < crossingLongitude) inside = !inside;
  }
  return inside;
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
  status: 'error' | 'loading' | 'ready';
}): ReactElement {
  if (status === 'loading') return <span className="work-departure-message" role="status">출발 시간 확인 중</span>;
  if (status === 'error') return <span className="work-departure-message error" role="alert">{error || '운영 시간을 불러오지 못했습니다.'}</span>;
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

function todayInKorea(): string {
  return new Date(Date.now() + 9 * 60 * 60_000).toISOString().slice(0, 10);
}

function departureLocationFromSettings(settings: AdminSettings | null): DepartureLocation | null {
  if (
    settings === null
    || settings.departureAddress.trim() === ''
    || settings.departureLatitude === null
    || settings.departureLongitude === null
  ) {
    return null;
  }
  return {
    address: settings.departureAddress,
    latitude: settings.departureLatitude,
    longitude: settings.departureLongitude,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '업로드 처리 중 오류가 발생했습니다.';
}

function uploadIssueMessage(issue: DispatchImportIssue): string {
  if (issue.code === 'DRIVER_MISSING' || issue.code === 'DRIVER_NOT_FOUND') return '등록된 배송원을 찾을 수 없습니다.';
  if (issue.code === 'VEHICLE_MISSING' || issue.code === 'VEHICLE_NOT_FOUND') return '등록된 차량 번호를 찾을 수 없습니다.';
  if (issue.code === 'CUSTOMER_MISSING') return '고객사를 찾을 수 없습니다.';
  if (issue.code === 'DESTINATION_MISSING') return '배송처를 찾을 수 없습니다.';
  return issue.message;
}

function uploadIssues(
  preview: DispatchImportPreview | null,
  sheet: DispatchFileParseResult['sheet'] | null,
): UploadIssueEntry[] {
  if (preview === null) return [];
  const entries = preview.rows.flatMap((row) => row.issues.map((issue) => ({
    columnIndex: uploadIssueColumn(sheet, issue),
    issue,
    rowNumber: row.rowNumber,
  })));
  return [...new Map(entries.map((entry) => [
    `${entry.rowNumber}:${entry.issue.code}:${entry.issue.field}`,
    entry,
  ])).values()];
}

function uploadIssueColumn(
  sheet: DispatchFileParseResult['sheet'] | null,
  issue: DispatchImportIssue,
): number | null {
  const field = issue.field === 'row' && isAddressIssue(issue.code) ? 'address' : issue.field;
  if (field === 'row') return null;
  return uploadFieldColumn(sheet, field);
}

function uploadFieldColumn(
  sheet: DispatchFileParseResult['sheet'] | null,
  field: keyof DispatchImportRow,
): number | null {
  if (sheet === null) return null;
  const headers: Partial<Record<keyof DispatchImportRow, string[]>> = {
    address: ['주소'],
    addressResolutionStatus: ['주소'],
    conditionCode: ['condition'],
    customerCode: ['customer'],
    detailAddress: ['주소'],
    destinationName: ['배송처'],
    driverName: ['driver'],
    jibunAddress: ['주소'],
    latitude: ['latitude'],
    longitude: ['longitude'],
    notes: ['특이사항'],
    postalCode: ['주소'],
    rawAddress: ['주소'],
    sellerOrderKey: ['SellerOrderKey'],
    shippedBoxes: ['shippedbox'],
    vehiclePlate: ['vehicle'],
  };
  const candidates = headers[field];
  if (candidates === undefined) return null;
  const normalizedHeaders = (sheet.cells[0] ?? []).map((header) => header.trim());
  const columnIndex = normalizedHeaders.findIndex((header) => candidates.includes(header));
  return columnIndex < 0 ? null : columnIndex;
}

function uploadAddressSuggestions(
  preview: DispatchImportPreview | null,
  entry: UploadIssueEntry,
): DispatchAddressSuggestion[] {
  if (preview === null || !isAddressIssue(entry.issue.code)) return [];
  return preview.rows.find((row) => row.rowNumber === entry.rowNumber)?.addressSuggestions ?? [];
}

function uploadAddressDetails(
  preview: DispatchImportPreview | null,
  entry: UploadIssueEntry,
): { address: string; detailAddress: string | null } | null {
  if (preview === null || !isAddressIssue(entry.issue.code)) return null;
  const row = preview.rows.find((candidate) => candidate.rowNumber === entry.rowNumber);
  if (row === undefined) return null;
  return {
    address: row.normalized?.address ?? row.address,
    detailAddress: row.normalized?.detailAddress ?? row.detailAddress ?? null,
  };
}

function formatAddressSuggestion(suggestion: DispatchAddressSuggestion): string {
  const detailAddress = suggestion.detailAddress?.trim();
  return detailAddress ? `${suggestion.address}, ${detailAddress}` : suggestion.address;
}

function isAddressIssue(code: string): boolean {
  return code === 'ADDRESS_AMBIGUOUS'
    || code === 'ADDRESS_COORDINATES_NOT_RESOLVED'
    || code === 'ADDRESS_NOT_FOUND'
    || code === 'ADDRESS_ONLY'
    || code === 'ADDRESS_SERVICE_UNAVAILABLE'
    || code === 'LOCATION_NOT_RESOLVED';
}

function uploadResourceCandidates(
  preview: DispatchImportPreview | null,
  issueCodes: string[],
  field: 'driverName' | 'vehiclePlate',
): string[] {
  if (preview === null) return [];
  return [...new Set(preview.rows
    .filter((row) => row.issues.some((issue) => issueCodes.includes(issue.code)))
    .map((row) => row[field].trim())
    .filter(Boolean))];
}

function dispatchDestinationName(row: DispatchListItem, references: ManagementData | null): string {
  return row.destinationDisplayName || referenceName(references?.destinations, row.destinationId);
}

function dispatchCustomerName(row: DispatchListItem, references: ManagementData | null): string {
  return references?.customers.find((customer) => customer.id === row.customerId)?.name ?? row.customerId;
}

function reviewStatusLabel(status: DispatchListItem['reviewStatus']): string {
  switch (status) {
    case 'UNCONFIRMED':
      return '미확인';
    case 'CONFIRMED':
      return '확정';
    case 'CLEARED':
      return '해제';
    default:
      return '해당 없음';
  }
}

function routeConstraintStatusLabel(status: DispatchListItem['routeConstraintStatus']): string {
  switch (status) {
    case 'UNCONFIRMED':
      return '미확인';
    case 'PENDING_RECALCULATION':
      return '재계산 대기';
    case 'NOT_EVALUATED':
      return '평가 전';
    default:
      return '해당 없음';
  }
}

function timeConstraintCommandMessage(status: 'FAILED_TO_SCHEDULE' | 'NOT_REQUIRED' | 'SCHEDULED'): string {
  switch (status) {
    case 'FAILED_TO_SCHEDULE':
      return '저장은 완료됐고 재계산 예약은 실패했습니다.';
    case 'SCHEDULED':
      return '저장 후 재계산을 예약했습니다.';
    default:
      return '저장했습니다.';
  }
}

function isHardTimeRange(start: string, end: string): boolean {
  return TIME_ONLY_PATTERN.test(start) && TIME_ONLY_PATTERN.test(end) && start < end;
}

function referenceName(items: Array<{ id: string; name: string }> | undefined, id: string | null): string {
  if (id === null) return '-';
  return items?.find((item) => item.id === id)?.name ?? '정보 확인';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
