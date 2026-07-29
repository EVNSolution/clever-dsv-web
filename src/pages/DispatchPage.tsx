import type { DragEvent, KeyboardEvent, ReactElement } from 'react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { apiConfig } from '../api/config';
import { AdminPageHeader, AdminSectionHeader } from '../components/AdminUi';
import { loadDispatchList, reassignDispatchOrder, unassignDispatchOrder } from '../services/dispatch';
import type { DispatchListItem, DispatchListView } from '../services/dispatch';
import {
  commitDispatchImport,
  parseDispatchFile,
  parseDispatchSheet,
  parseDispatchSource,
  previewDispatchImport,
  registerDispatchDriver,
  registerDispatchVehicle,
  registerTransportCondition,
} from '../services/dispatch-imports';
import type {
  DispatchFileParseResult,
  DispatchImportInput,
  DispatchImportIssue,
  DispatchImportPreview,
  DispatchImportRow,
  DispatchImportView,
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

const DispatchMapCanvas = lazy(async () => {
  const module = await import('../components/MapCanvas');
  return { default: module.MapCanvas };
});

export function DispatchPage({ title, description }: { title: string; description: string }): ReactElement {
  const uploadFileInputRef = useRef<HTMLInputElement>(null);
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
  const [uploadedImport, setUploadedImport] = useState<DispatchImportView | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadDragging, setUploadDragging] = useState(false);
  const [conditionCandidates, setConditionCandidates] = useState<ConditionCandidate[]>([]);
  const [remoteDispatch, setRemoteDispatch] = useState<DispatchListView | null>(null);
  const [remoteReferences, setRemoteReferences] = useState<ManagementData | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<'error' | 'loading' | 'ready'>(() => apiConfig.mode === 'remote' ? 'loading' : 'ready');
  const [remoteError, setRemoteError] = useState('');
  const [remoteReloadKey, setRemoteReloadKey] = useState(0);
  const [serviceDate, setServiceDate] = useState(todayInKorea);
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
    setRemoteReferences(null);
    Promise.all([
      loadDispatchList(serviceDate, controller.signal),
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
  }, [remoteReloadKey, serviceDate]);
  const uploadInput = (): DispatchImportInput | null => uploadFileName && uploadRows.length > 0
    ? { fileName: uploadFileName, planDate: uploadPlanDate, rows: uploadRows }
    : null;
  const applyUploadPreview = (preview: DispatchImportPreview) => {
    setUploadPreview(preview);
    setConditionCandidates((current) => preview.conditionCandidates.map((code) =>
      current.find((candidate) => candidate.code === code) ?? { code, description: '', name: code }));
  };
  const refreshUploadPreview = async () => {
    const input = uploadInput();
    if (input === null) return;
    applyUploadPreview(await previewDispatchImport(input));
    if (apiConfig.mode === 'remote') setRemoteReloadKey((current) => current + 1);
  };
  const inspectUpload = async (input = uploadInput()) => {
    if (input === null) {
      setUploadError('배차 파일을 먼저 선택하세요.');
      return;
    }
    setUploadBusy(true);
    setUploadError('');
    setUploadedImport(null);
    try {
      applyUploadPreview(await previewDispatchImport(input));
    } catch (error) {
      setUploadPreview(null);
      setConditionCandidates([]);
      setUploadError(errorMessage(error));
    } finally {
      setUploadBusy(false);
    }
  };
  const applyUploadParseResult = async (
    fileName: string,
    result: DispatchFileParseResult,
    planDate = uploadPlanDate,
    useDetectedPlanDate = true,
  ) => {
    const resolvedPlanDate = useDetectedPlanDate && result.planDate !== null ? result.planDate : planDate;
    setUploadPreview(null);
    setUploadedImport(null);
    setConditionCandidates([]);
    setUploadFileName(fileName);
    setUploadRows(result.rows);
    setUploadSheet(result.sheet);
    setUploadPlanDate(resolvedPlanDate);
    setUploadError(result.error);
    if (result.error) return;
    await inspectUpload({ fileName, planDate: resolvedPlanDate, rows: result.rows });
  };
  const loadUploadFile = async (file: File) => {
    setUploadBusy(true);
    setUploadFileName(file.name);
    setUploadRows([]);
    setUploadSheet(null);
    setUploadPreview(null);
    setUploadedImport(null);
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
    );
  };
  const loadExampleUpload = async () => {
    setUploadBusy(true);
    setUploadError('');
    try {
      const response = await fetch('/examples/dsv-fixed-dispatch-10.csv');
      if (!response.ok) throw new Error('예제 배차 파일을 불러올 수 없습니다.');
      await loadUploadSource('dsv-fixed-dispatch-10.csv', await response.text());
    } catch (error) {
      setUploadError(errorMessage(error));
    } finally {
      setUploadBusy(false);
    }
  };
  const cancelUpload = () => {
    if (uploadFileInputRef.current !== null) uploadFileInputRef.current.value = '';
    setUploadFileName('');
    setUploadRows([]);
    setUploadSheet(null);
    setUploadPlanDate(todayInKorea());
    setUploadPreview(null);
    setUploadedImport(null);
    setUploadError('');
    setUploadDragging(false);
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
      setUploadedImport(await commitDispatchImport(input));
      if (apiConfig.mode === 'remote') {
        setServiceDate(uploadPlanDate);
        setRemoteReloadKey((current) => current + 1);
      }
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
        <section className="action-panel condition-upload-panel" aria-label="주문 업로드">
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
            {uploadSheet ? <DispatchSheetPreview issueCells={uploadIssueCells} onCellChange={editUploadSheetCell} sheet={uploadSheet} /> : null}
            {uploadFileName ? (
              <div className="dispatch-upload-review">
                <p className="dispatch-upload-file"><strong>{uploadFileName}</strong><span>{Math.max(0, (uploadSheet?.cells.length ?? 1) - 1)}행</span></p>
                <label>배차일<input aria-label="배차일" type="date" value={uploadPlanDate} onChange={(event) => {
                  const planDate = event.target.value;
                  setUploadPlanDate(planDate);
                  setUploadedImport(null);
                  if (uploadRows.length > 0) void inspectUpload({ fileName: uploadFileName, planDate, rows: uploadRows });
                }} /></label>
                {uploadError ? <p className="dispatch-upload-error" role="alert">{uploadError}</p> : null}
                <button className="btn primary" type="button" disabled={uploadBusy || uploadPreview?.canCommit !== true || uploadedImport !== null} onClick={() => void commitUpload()}>업로드 확정</button>
              </div>
            ) : null}
            {!uploadFileName && uploadError ? <p className="dispatch-upload-error" role="alert">{uploadError}</p> : null}
            {uploadPreview ? <div className="dispatch-upload-summary" role="status"><span>전체 <b>{uploadPreview.summary.totalRows}</b></span><span>주소 확인 <b>{resolvedAddressRows}</b></span><span>정상 <b>{uploadPreview.summary.readyRows}</b></span><span>확인 <b>{uploadPreview.summary.reviewRows}</b></span><span>오류 <b>{uploadPreview.summary.errorRows}</b></span></div> : null}
            {uploadIssueRows.length ? (
              <details className="dispatch-upload-issues">
                <summary>
                  <span>오류 상세</span>
                  <span className="dispatch-upload-issues-toggle">
                    <span className="dispatch-upload-toggle-open">펼치기</span>
                    <span className="dispatch-upload-toggle-close">접기</span>
                    <ChevronDown aria-hidden="true" />
                  </span>
                  <b>{uploadIssueEntries.length}건</b>
                </summary>
                <div className="dispatch-upload-issue-list">
                  {uploadIssueEntries.map((entry) => (
                    <p key={`${entry.rowNumber}:${entry.issue.code}:${entry.issue.field}`}>
                      <strong>{entry.rowNumber}행</strong>
                      <b>{entry.columnIndex === null ? '행 전체' : `${spreadsheetColumnName(entry.columnIndex)}열`}</b>
                      <span>{uploadIssueMessage(entry.issue)}</span>
                    </p>
                  ))}
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
            {uploadedImport ? <p className="dispatch-upload-complete" role="status"><strong>{uploadedImport.rowCount}건 업로드 완료</strong><span>배차일 {uploadedImport.planDate}</span><small>ID {uploadedImport.id}</small></p> : null}
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
          onServiceDateChange={setServiceDate}
          onAssignmentChanged={() => setRemoteReloadKey((current) => current + 1)}
          operationsBusy={operationsBusy}
          operationsError={operationsError}
          operationsStatus={operationsStatus}
          status={remoteStatus}
          view={remoteDispatch}
          references={remoteReferences}
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
          onServiceDateChange={setServiceDate}
          serviceDate={serviceDate}
        />
      )}
    </>
  );
}

function DispatchSheetPreview({
  issueCells,
  onCellChange,
  sheet,
}: {
  issueCells: Set<string>;
  onCellChange: (rowIndex: number, columnIndex: number, value: string) => void;
  sheet: DispatchFileParseResult['sheet'];
}): ReactElement {
  const [editingCell, setEditingCell] = useState<{ columnIndex: number; rowIndex: number; value: string } | null>(null);
  const visibleRows = sheet.cells.slice(0, 101);
  const columnCount = Math.max(1, ...visibleRows.map((row) => row.length));
  const columns = Array.from({ length: columnCount }, (_, index) => index);
  const columnWidths = columns.map((column) => spreadsheetColumnWidth(sheet.cells[0]?.[column] ?? ''));
  const tableWidth = 36 + columnWidths.reduce((total, width) => total + width, 0);
  const commitCell = (value: string) => {
    if (editingCell === null) return;
    const { columnIndex, rowIndex } = editingCell;
    setEditingCell(null);
    onCellChange(rowIndex, columnIndex, value);
  };
  const handleEditorKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitCell(event.currentTarget.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setEditingCell(null);
    }
  };
  return (
    <div className="upload-sheet dispatch-upload-sheet">
      <div className="sheet-scroll">
        <table className="page-table" aria-label={`${sheet.name} 시트 미리보기`} style={{ minWidth: '100%', width: `${tableWidth}px` }}>
          <colgroup><col style={{ width: '36px' }} />{columnWidths.map((width, column) => <col key={column} style={{ width: `${width}px` }} />)}</colgroup>
          <thead><tr><th className="sheet-row" aria-label="행 번호" />{columns.map((column) => <th key={column} scope="col">{spreadsheetColumnName(column)}</th>)}</tr></thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th className="sheet-row" scope="row">{rowIndex + 1}</th>
                {columns.map((columnIndex) => {
                  const value = row[columnIndex] ?? '';
                  const editing = editingCell?.rowIndex === rowIndex && editingCell.columnIndex === columnIndex;
                  const invalid = issueCells.has(`${rowIndex}:${columnIndex}`);
                  return (
                    <td className={invalid ? 'is-error' : undefined} key={columnIndex}>
                      {editing ? (
                        <input
                          aria-label={`${rowIndex + 1}행 ${spreadsheetColumnName(columnIndex)}열 편집`}
                          autoFocus
                          className="sheet-cell-editor"
                          onBlur={(event) => commitCell(event.currentTarget.value)}
                          onChange={(event) => setEditingCell((current) => current === null ? null : { ...current, value: event.target.value })}
                          onFocus={(event) => event.currentTarget.select()}
                          onKeyDown={handleEditorKeyDown}
                          value={editingCell.value}
                        />
                      ) : (
                        <div
                          className="sheet-cell"
                          onDoubleClick={() => setEditingCell({ columnIndex, rowIndex, value })}
                          title={value || undefined}
                        >
                          {value || '\u00a0'}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

function MockDispatchBoard({
  departureDraft,
  departureError,
  departureLocation,
  onDepartureChange,
  onDepartureSave,
  onServiceDateChange,
  serviceDate,
}: {
  departureDraft: string;
  departureError: boolean;
  departureLocation: DepartureLocation | null;
  onDepartureChange: (value: string) => void;
  onDepartureSave: () => void;
  onServiceDateChange: (value: string) => void;
  serviceDate: string;
}): ReactElement {
  return (
    <DispatchWorkspace
      departureControl={<RemoteDepartureTime busy={false} draft={departureDraft} error="" invalid={departureError} onChange={onDepartureChange} onSave={onDepartureSave} status="ready" />}
      departureLocation={departureLocation}
      onServiceDateChange={onServiceDateChange}
      references={null}
      rows={[]}
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
  onAssignmentChanged,
  onDepartureChange,
  onDepartureSave,
  onRetry,
  onServiceDateChange,
  operationsBusy,
  operationsError,
  operationsStatus,
  status,
  view,
  references,
  serviceDate,
}: {
  departureDraft: string;
  departureError: boolean;
  departureLocation: DepartureLocation | null;
  error: string;
  onAssignmentChanged: () => void;
  onDepartureChange: (value: string) => void;
  onDepartureSave: () => void;
  onRetry: () => void;
  onServiceDateChange: (value: string) => void;
  operationsBusy: boolean;
  operationsError: string;
  operationsStatus: 'error' | 'loading' | 'ready';
  status: 'error' | 'loading' | 'ready';
  view: DispatchListView | null;
  references: ManagementData | null;
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
        onServiceDateChange={onServiceDateChange}
        references={references}
        rows={[]}
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
        onRetry={onRetry}
        onServiceDateChange={onServiceDateChange}
        references={references}
        rows={[]}
        serviceDate={serviceDate}
        summary={{ assigned: 0, etaAttention: 0, total: 0, unassigned: 0 }}
      />
    );
  }
  return (
    <DispatchWorkspace
      departureControl={departureControl}
      departureLocation={departureLocation}
      onAssignmentChanged={onAssignmentChanged}
      onServiceDateChange={onServiceDateChange}
      references={references}
      rows={view.rows}
      serviceDate={serviceDate}
      summary={view.summary}
    />
  );
}

type DispatchFilter = 'ALL' | 'ASSIGNED' | 'UNASSIGNED';

function DispatchWorkspace({
  departureControl,
  departureLocation,
  error = '',
  loading = false,
  onAssignmentChanged,
  onRetry,
  onServiceDateChange,
  references,
  rows,
  serviceDate,
  summary,
}: {
  departureControl: ReactElement;
  departureLocation: DepartureLocation | null;
  error?: string;
  loading?: boolean;
  onAssignmentChanged?: () => void;
  onRetry?: () => void;
  onServiceDateChange: (value: string) => void;
  references: ManagementData | null;
  rows: DispatchListItem[];
  serviceDate: string;
  summary: DispatchListView['summary'];
}): ReactElement {
  const [filter, setFilter] = useState<DispatchFilter>('ALL');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectionCoordinates, setSelectionCoordinates] = useState<Array<[number, number]>>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const readOnly = serviceDate < todayInKorea();
  const visibleRows = useMemo(
    () => filter === 'ALL' ? rows : rows.filter((row) => row.assignmentStatus === filter),
    [filter, rows],
  );
  const visibleIds = useMemo(() => new Set(visibleRows.map((row) => row.sellerOrderId)), [visibleRows]);
  const selectedIdSet = useMemo(() => new Set(selectedOrderIds), [selectedOrderIds]);
  const selectedOrders = useMemo(
    () => rows.filter((row) => selectedIdSet.has(row.sellerOrderId)),
    [rows, selectedIdSet],
  );
  const points = useMemo(() => visibleRows.flatMap((row) => {
    if (row.latitude === null || row.longitude === null) return [];
    const originalIndex = rows.findIndex((candidate) => candidate.sellerOrderId === row.sellerOrderId);
    return [{
      id: row.sellerOrderId,
      label: String(originalIndex + 1),
      latitude: row.latitude,
      longitude: row.longitude,
      tone: row.assignmentStatus === 'ASSIGNED' ? 'assigned' as const : 'unassigned' as const,
    }];
  }), [rows, visibleRows]);
  const missingCoordinateCount = visibleRows.length - points.length;
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
  const selectedDestinationSummary = selectedOrders.length === 0
    ? '지도에서 배송지를 선택하세요.'
    : selectedOrders.length === 1
      ? dispatchDestinationName(selectedOrders[0], references)
      : `${dispatchDestinationName(selectedOrders[0], references)} 외 ${selectedOrders.length - 1}곳`;

  useEffect(() => {
    setSelectedOrderIds((current) => {
      const next = current.filter((id) => visibleIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [visibleIds]);

  useEffect(() => {
    if (!drivers.length) {
      setSelectedDriverId('');
      return;
    }
    if (!drivers.some((driver) => driver.id === selectedDriverId)) setSelectedDriverId(drivers[0].id);
  }, [drivers, selectedDriverId]);

  const selectPoint = useCallback((pointId: string) => {
    setMutationError('');
    setSelectionCoordinates([]);
    setSelectionMode(false);
    setSelectedOrderIds((current) => current.includes(pointId)
      ? current.filter((id) => id !== pointId)
      : [...current, pointId]);
  }, []);

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
    setSelectedOrderIds([]);
    setSelectionCoordinates([]);
    setSelectionMode(false);
  }

  function applyAreaSelection(): void {
    if (selectionCoordinates.length < 3) {
      setMutationError('지도에서 세 점 이상을 선택하세요.');
      return;
    }
    const matchedIds = visibleRows.flatMap((row) => {
      if (row.latitude === null || row.longitude === null) return [];
      return pointInPolygon([row.longitude, row.latitude], selectionCoordinates) ? [row.sellerOrderId] : [];
    });
    setSelectedOrderIds(matchedIds);
    setSelectionMode(false);
    setMutationError(matchedIds.length === 0 ? '선택 영역 안에 배송지가 없습니다.' : '');
  }

  async function assignSelected(): Promise<void> {
    if (assignmentCandidates.length === 0 || selectedDriver === null || selectedVehicle === null || readOnly) return;
    setMutationBusy(true);
    setMutationError('');
    let completed = 0;
    let targetRoutePlanId = selectedDriverRoutePlanId;
    try {
      for (const order of assignmentCandidates) {
        const result = await reassignDispatchOrder({
          driverId: selectedDriver.id,
          order,
          routePlanId: targetRoutePlanId,
          vehicleId: selectedVehicle.id,
        });
        targetRoutePlanId = result.routePlanId ?? targetRoutePlanId;
        completed += 1;
      }
      clearSelection();
    } catch (caught) {
      const prefix = completed > 0 ? `${completed}건 반영 후 중단되었습니다. ` : '';
      setMutationError(`${prefix}${errorMessage(caught)}`);
    } finally {
      if (completed > 0) onAssignmentChanged?.();
      setMutationBusy(false);
    }
  }

  async function unassignSelected(): Promise<void> {
    const assignedOrders = selectedOrders.filter((row) => row.assignmentStatus === 'ASSIGNED');
    if (assignedOrders.length === 0 || readOnly) return;
    setMutationBusy(true);
    setMutationError('');
    let completed = 0;
    try {
      for (const order of assignedOrders) {
        await unassignDispatchOrder(order);
        completed += 1;
      }
      clearSelection();
    } catch (caught) {
      const prefix = completed > 0 ? `${completed}건 반영 후 중단되었습니다. ` : '';
      setMutationError(`${prefix}${errorMessage(caught)}`);
    } finally {
      if (completed > 0) onAssignmentChanged?.();
      setMutationBusy(false);
    }
  }

  return (
    <section className="dispatch-assignment" aria-label="배차 작업">
      <div className="dispatch-assignment-toolbar">
        <label className="dispatch-date-field">배차일<input aria-label="배차일 선택" type="date" value={serviceDate} onChange={(event) => onServiceDateChange(event.target.value)} /></label>
        <div className="dispatch-progress" aria-label="배정 진행"><span>전체 <b>{summary.total}</b></span><span>배정 <b>{summary.assigned}</b></span><span>미배정 <b>{summary.unassigned}</b></span></div>
        {summary.total > 0 && summary.unassigned === 0 ? <strong className="dispatch-complete">배정 완료</strong> : null}
        {readOnly ? <span className="dispatch-readonly">지난 배차는 조회만 가능합니다.</span> : null}
        {departureControl}
      </div>
      <div className="dispatch-map-workspace">
        <section className="dispatch-workspace-panel dispatch-map-panel" aria-label="지도">
          <div className="dispatch-map-header">
            <AdminSectionHeader title="배차 지도" side={<span className="section-meta">좌표 {points.length}곳{missingCoordinateCount > 0 ? ` · 미확인 ${missingCoordinateCount}건` : ''}</span>} />
            <div className="dispatch-map-tools">
              <div className="dispatch-filter" aria-label="배정 상태 필터">
                {([['ALL', '전체'], ['UNASSIGNED', '미배정'], ['ASSIGNED', '배정']] as const).map(([value, label]) => (
                  <button className={filter === value ? 'active' : ''} key={value} type="button" onClick={() => setFilter(value)}>{label}</button>
                ))}
              </div>
              {!selectionMode ? (
                <button className="btn dispatch-area-start" type="button" disabled={readOnly || points.length === 0} onClick={startAreaSelection}>영역 선택</button>
              ) : (
                <div className="dispatch-area-controls" aria-label="영역 선택 도구">
                  <span>{selectionCoordinates.length}점</span>
                  <button type="button" disabled={selectionCoordinates.length === 0} onClick={() => setSelectionCoordinates((current) => current.slice(0, -1))}>한 점 취소</button>
                  <button type="button" onClick={cancelAreaSelection}>취소</button>
                  <button className="primary" type="button" disabled={selectionCoordinates.length < 3} onClick={applyAreaSelection}>선택 적용</button>
                </div>
              )}
            </div>
          </div>
          <div className="dispatch-map-surface">
            <Suspense fallback={<div className="dispatch-map-loading" role="status">지도 준비 중</div>}>
              <DispatchMapCanvas
                ariaLabel="배차 배송지 지도"
                departureLocation={departureLocation}
                fitPoints
                onMapPointAdd={addSelectionPoint}
                onPointSelect={selectPoint}
                points={points}
                selectionCoordinates={selectionCoordinates}
                selectionMode={selectionMode}
                selectedPointIds={selectedOrderIds}
                variant="embedded"
              />
            </Suspense>
            {selectionMode ? <div className="dispatch-map-guide" role="status">지도에 영역의 꼭짓점을 차례로 찍으세요.</div> : null}
            {!loading && !error && points.length === 0 ? <div className="dispatch-map-message empty" role="status"><strong>표시할 배송지가 없습니다.</strong><span>주문을 업로드하거나 주소 좌표를 확인하세요.</span></div> : null}
            {loading ? <div className="dispatch-map-message" role="status"><strong>배송지를 불러오는 중</strong></div> : null}
            {error ? <div className="dispatch-map-message error" role="alert"><strong>배차 정보를 불러오지 못했습니다.</strong><span>{error}</span>{onRetry ? <button className="btn" type="button" onClick={onRetry}>다시 시도</button> : null}</div> : null}
          </div>
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
              <span>선택 배송지</span>
              <strong>{selectedOrders.length}곳</strong>
              <small>{selectedDestinationSummary}</small>
            </div>
            {selectedOrders.length > 0 ? <button className="dispatch-selection-clear" type="button" onClick={clearSelection}>선택 지우기</button> : null}
            {selectedDriver !== null && selectedVehicle === null ? <p role="alert">선택한 배송원에 배정된 차량이 없습니다.</p> : null}
            {mutationError ? <p role="alert">{mutationError}</p> : null}
            <div>
              <button className="btn" type="button" disabled={mutationBusy || readOnly || assignedSelectionCount === 0} onClick={() => void unassignSelected()}>배정 해제</button>
              <button className="btn primary" type="button" disabled={mutationBusy || readOnly || assignmentCandidates.length === 0 || selectedDriver === null || selectedVehicle === null} onClick={() => void assignSelected()}>
                {mutationBusy ? '처리 중' : assignedSelectionCount > 0 ? '선택 이관' : '선택 배정'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
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
  if (issue.code === 'REQUIRED' && issue.field === 'driverName') return '필수 값이 없습니다: driver';
  if (issue.code === 'DRIVER_MISSING' || issue.code === 'DRIVER_NOT_FOUND') return '등록된 배송원을 찾을 수 없습니다.';
  if (issue.code === 'VEHICLE_MISSING' || issue.code === 'VEHICLE_NOT_FOUND') return '등록된 차량 번호를 찾을 수 없습니다.';
  if (issue.code === 'CUSTOMER_MISSING') return '고객사를 찾을 수 없습니다.';
  if (issue.code === 'DESTINATION_MISSING') return '배송처를 찾을 수 없습니다.';
  return issue.message;
}

function uploadIssues(preview: DispatchImportPreview | null, sheet: DispatchFileParseResult['sheet'] | null): Array<{
  columnIndex: number | null;
  issue: DispatchImportIssue;
  rowNumber: number;
}> {
  if (preview === null) return [];
  const entries = preview.rows.flatMap((row) => row.issues.map((issue) => ({
    columnIndex: uploadIssueColumn(sheet, issue.field),
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
  field: DispatchImportIssue['field'],
): number | null {
  if (sheet === null || field === 'row') return null;
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

function referenceName(items: Array<{ id: string; name: string }> | undefined, id: string | null): string {
  if (id === null) return '-';
  return items?.find((item) => item.id === id)?.name ?? '정보 확인';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
