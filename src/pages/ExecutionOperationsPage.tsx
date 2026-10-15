import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ApiError } from '../api/client';
import { AdminTableFrame } from '../components/AdminUi';
import {
  acknowledgeDeliveryException, ackOperationsNotification, loadDeliveryException,
  loadDeliveryExceptions, loadExecution, loadExecutions, loadOperationsNotifications,
  mapExecution, resolveDeliveryException, resolveOperationsNotification, selectExecution,
} from '../services/dsv-operations';
import type {
  DeliveryException, ExecutionDetail, ExecutionListItem, MappingCommand,
  OperationsNotification, SelectionCommand,
} from '../services/dsv-operations';

type Section = 'executions' | 'notifications' | 'reports';
type Destination = { execution: string | null; notification: string | null; report: string | null };
type LocationState = Destination & { serviceDate: string; section: Section; error: string };
type PendingCommand =
  | { kind: 'map'; input: MappingCommand; status: 'sending' | 'uncertain' | 'conflict'; ownerKey: string | null }
  | { kind: 'select'; input: SelectionCommand; status: 'sending' | 'uncertain' | 'conflict'; ownerKey: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const formatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const knownStates: Record<string, string> = {
  ACTIVE: '진행 중', CANCELLED: '취소', COMPLETED: '종료', EXPIRED: '만료', REASSIGNED: '재배정',
  OPEN: '미처리', RESOLVED: '처리 완료', ACKNOWLEDGED: '확인',
  OFF: 'OFF', SHADOW: 'SHADOW', LIVE: 'LIVE',
  PENDING: '대기', PAUSED: '일시 중지', RUNNING: '감시 중', NONE: '없음',
  STARTED: '시작 승인', ENDED: '종료', SUPPRESSED: '생성 억제',
  CREATED: '생성', CLAIMED: '작업 확보', SENDING: '발송 처리 중', SENT: '발송 처리 완료',
  SUCCEEDED: '처리 성공', FAILED: '처리 실패', RETRY: '재시도', SKIPPED: '건너뜀',
  DELIVERED: '발송 처리 완료', ACCEPTED: '제공자 접수', STALE_ACTIVATION: '활성화 이전 관측',
  ARRIVED: '도착', DEPARTED: '출발', ARRIVAL: '도착', DEPARTURE: '출발', ENTERED: '진입', EXITED: '이탈',
  AWAITING_DEPARTURE: '출발 관측 대기', AWAITING_START: '시작 승인 대기',
  PAUSED_WAREHOUSE_RETURN: '창고 재진입으로 중지', CAP_REACHED: '서버 상한 도달',
  RESOLVED_START: '시작 승인으로 경고 종료', AWAITING_FRESH_DEPARTURE: '새 출발 관측 대기',
  REMINDER_ACTIVE: '시작 경고 감시 중', INCIDENT_MISSING: '경고 사건 없음', AUTHORITY_ENDED: '감시 권한 종료',
  LEASED: '작업 확보', DEAD: '재시도 종료',
};
const executionStates = new Set(['ACTIVE', 'CANCELLED', 'COMPLETED', 'EXPIRED', 'REASSIGNED']);
const notificationNames: Record<string, string> = {
  N01: '배차 등록', N02: '배차 변경', N03: '배정 해제', N04: '창고 도착',
  N05: '시작 경고', N06: '배송지 도착', N07: '미배송 보고',
};

function today(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map((key) => parts.find((part) => part.type === key)?.value ?? '').join('-');
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function readLocation(): LocationState {
  const query = new URLSearchParams(window.location.search);
  const date = query.get('serviceDate');
  const destination = { execution: query.get('execution'), notification: query.get('notification'), report: query.get('report') };
  const targets = Object.values(destination).filter((value) => value !== null);
  const invalid = targets.length > 1 || targets.some((value) => !UUID.test(value!));
  const error = invalid ? '목적지 주소가 올바르지 않습니다. 목록에서 다시 선택해 주세요.'
    : date !== null && !validDate(date) ? '업무일 주소가 올바르지 않습니다. 업무일을 다시 선택해 주세요.' : '';
  return {
    serviceDate: date !== null && validDate(date) ? date : today(),
    ...(invalid ? { execution: null, notification: null, report: null } : destination),
    section: destination.notification !== null ? 'notifications' : destination.report !== null ? 'reports' : 'executions',
    error,
  };
}

function time(value: string | null | undefined): string {
  if (!value) return '기록 없음';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? formatter.format(date) : `알 수 없는 시각 (${value})`;
}

function State({ value }: { value: string | null | undefined }) {
  if (!value) return <span>기록 없음</span>;
  const label = knownStates[value];
  return <span className={`chip${value === 'OPEN' || value === 'FAILED' ? ' risk' : value === 'ACTIVE' ? ' blue' : ''}`}>
    {label === undefined ? `알 수 없는 상태 (${value})` : label === value ? value : `${label} (${value})`}
  </span>;
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="execution-facts">{children}</dl>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

function Counts({ values }: { values: Record<string, number> }) {
  const entries = Object.entries(values);
  return entries.length === 0 ? <span>기록 없음</span> : <ul className="execution-counts">{entries.map(([key, value]) => <li key={key}><State value={key} /> <span>{value}건</span></li>)}</ul>;
}

function Limit({ count, limit, truncated }: { count: number; limit: number; truncated?: boolean }) {
  return <p className={truncated ? 'execution-limit execution-warning' : 'execution-limit'}>
    {count}건 표시 / 서버 조회 한도 {limit}건{truncated === undefined ? ' / 전체 건수와 초과 여부는 서버에서 제공하지 않습니다.' : truncated ? ' / 일부 기록이 생략되었습니다.' : ' / 생략 없음'}
  </p>;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return '서버에 연결할 수 없습니다. 연결을 확인한 후 다시 시도해 주세요.';
    if (error.status === 401) return '로그인이 만료되었습니다. 로그인 후 현재 권한으로 목적지를 다시 확인합니다.';
    if (error.status === 403) return '현재 권한 또는 보안 토큰으로 요청할 수 없습니다. 계정 권한과 세션을 확인해 주세요.';
    if (error.status === 404) return '대상을 찾을 수 없습니다. 취소, 재배정, 만료 또는 접근 제한 여부를 확인해 주세요. 서버가 이 기능을 지원하지 않을 수도 있습니다.';
    if (error.status === 409) return '다른 작업으로 상태가 변경되었습니다. 최신 상태를 확인해 주세요. 기존 입력을 자동으로 덮어쓰지 않습니다.';
    if (error.status === 503) return '서버가 회차 기능을 제공할 수 없습니다. 서버 지원 여부를 확인해 주세요.';
    if (error.status === 502) return '서버 응답이 계약과 다릅니다. 최신 서버 지원 여부를 확인해 주세요.';
    if (error.status >= 500) return '서버 처리 결과를 확인할 수 없습니다. 잠시 후 다시 조회해 주세요.';
    return `요청이 거부되었습니다. 입력을 확인해 주세요. (${error.status})`;
  }
  return '서버에 연결할 수 없습니다. 연결을 확인한 후 다시 시도해 주세요.';
}

function inputInstant(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/u.test(value)) return null;
  const date = new Date(`${value.length === 16 ? `${value}:00` : value}+09:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function readPending(ownerKey: string | null): PendingCommand | null {
  if (ownerKey === null) return null;
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(ownerKey) ?? 'null');
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.ownerKey !== ownerKey || !['sending', 'uncertain', 'conflict'].includes(String(record.status))
      || typeof record.input !== 'object' || record.input === null || Array.isArray(record.input)) return null;
    const input = record.input as Record<string, unknown>;
    const isUuid = (key: string) => typeof input[key] === 'string' && UUID.test(input[key]);
    const isInstant = (key: string) => typeof input[key] === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(input[key])
      && Number.isFinite(new Date(input[key]).getTime());
    if (!isUuid('commandId')) return null;
    if (record.kind === 'map') {
      const keys = input.mapping === 'SAME_EXECUTION' ? ['commandId', 'effectiveAt', 'executionContextId', 'mapping', 'routePlanId'] : ['commandId', 'effectiveAt', 'mapping', 'routePlanId'];
      if (!isUuid('routePlanId') || !isInstant('effectiveAt') || !['SAME_EXECUTION', 'NEW_EXECUTION'].includes(String(input.mapping))
        || (input.mapping === 'SAME_EXECUTION' && !isUuid('executionContextId')) || Object.keys(input).length !== keys.length
        || Object.keys(input).some((key) => !keys.includes(key))) return null;
      return { kind: 'map', input: input as MappingCommand, status: record.status === 'conflict' ? 'conflict' : 'uncertain', ownerKey };
    }
    if (record.kind === 'select') {
      const keys = ['commandId', 'executionContextId', 'vehicleId', 'validFrom', 'validUntil'];
      if (!isUuid('executionContextId') || !isUuid('vehicleId') || !isInstant('validFrom') || !isInstant('validUntil')
        || String(input.validUntil) <= String(input.validFrom) || Object.keys(input).length !== keys.length
        || Object.keys(input).some((key) => !keys.includes(key))) return null;
      return { kind: 'select', input: input as SelectionCommand, status: record.status === 'conflict' ? 'conflict' : 'uncertain', ownerKey };
    }
  } catch { /* Storage can be unavailable. The current page still retains the frozen input. */ }
  return null;
}

function storePending(command: PendingCommand | null, ownerKey: string | null) {
  if (ownerKey === null) return;
  try {
    if (command === null) sessionStorage.removeItem(ownerKey);
    else if (command.ownerKey === ownerKey) sessionStorage.setItem(ownerKey, JSON.stringify(command));
  } catch { /* Storage can be unavailable. Never replace the frozen command to work around it. */ }
}

export function ExecutionOperationsPage({ principalScopes, principalId, principalShopId }: { principalScopes: readonly string[]; principalId: string | null; principalShopId: string | null }) {
  const storageKey = principalId !== null && principalShopId !== null && UUID.test(principalId) && UUID.test(principalShopId)
    ? `dsv.operations.command:${principalShopId}:${principalId}` : null;
  const [location, setLocation] = useState(readLocation);
  const [executions, setExecutions] = useState<ExecutionListItem[]>([]);
  const [executionLimit, setExecutionLimit] = useState(100);
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [notifications, setNotifications] = useState<OperationsNotification[]>([]);
  const [reports, setReports] = useState<DeliveryException[]>([]);
  const [report, setReport] = useState<DeliveryException | null>(null);
  const [notificationCursor, setNotificationCursor] = useState<string | null>(null);
  const [reportCursor, setReportCursor] = useState<string | null>(null);
  const [nextNotificationCursor, setNextNotificationCursor] = useState<string | null>(null);
  const [nextReportCursor, setNextReportCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingCommand | null>(() => readPending(storageKey));
  const [mapDraft, setMapDraft] = useState({ routePlanId: '', mapping: 'SAME_EXECUTION' as 'SAME_EXECUTION' | 'NEW_EXECUTION', executionContextId: '', effectiveAt: '' });
  const [selectDraft, setSelectDraft] = useState({ executionContextId: '', vehicleId: '', validFrom: '', validUntil: '' });
  const refresh = useRef<() => void>(() => undefined);
  const actionLock = useRef(false);
  const requestGeneration = useRef(0);
  const mounted = useRef(true);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const canRead = principalScopes.includes('dsv:control:read');
  const canWrite = canRead && principalScopes.includes('dsv:dispatches:write');
  const canAck = canWrite && principalId !== null && UUID.test(principalId);
  const authorityKey = `${principalShopId ?? ''}:${principalId ?? ''}:${principalScopes.slice().sort().join(',')}`;

  useEffect(() => { setPending(readPending(storageKey)); }, [storageKey]);
  useEffect(() => {
    if (pending === null || pending.ownerKey === storageKey) storePending(pending, storageKey);
  }, [pending, storageKey]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (!query.has('serviceDate')) {
      query.set('serviceDate', location.serviceDate);
      window.history.replaceState({}, '', `${window.location.pathname}?${query}`);
    }
    const update = () => setLocation(readLocation());
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);

  useEffect(() => {
    setDetail(null);
    setReport(null);
    const controller = new AbortController();
    const generation = ++requestGeneration.current;
    let running = false;
    let queued = false;
    const current = () => !controller.signal.aborted && requestGeneration.current === generation;
    const run = async () => {
      if (!current() || !canRead) return;
      if (running) { queued = true; return; }
      running = true;
      do {
        queued = false;
        setLoading(true);
        setLoadError('');
        try {
          const destination = async () => {
            if (location.error) return { execution: null, report: null };
            if (location.notification !== null) {
              const resolution = await resolveOperationsNotification(location.notification, controller.signal);
              const resolvedReport = await loadDeliveryException(resolution.destination.reportId, controller.signal);
              if (resolvedReport.id !== resolution.destination.reportId
                || resolvedReport.executionContextId !== resolution.destination.executionContextId
                || resolvedReport.targetStopId !== resolution.destination.targetStopId) {
                throw new ApiError(502, '알림 목적지와 보고가 일치하지 않습니다.');
              }
              return { execution: await loadExecution(resolvedReport.executionContextId, controller.signal), report: resolvedReport };
            }
            if (location.report !== null) {
              const resolvedReport = await loadDeliveryException(location.report, controller.signal);
              return { execution: await loadExecution(resolvedReport.executionContextId, controller.signal), report: resolvedReport };
            }
            if (location.execution !== null) return { execution: await loadExecution(location.execution, controller.signal), report: null };
            return { execution: null, report: null };
          };
          const results = await Promise.allSettled([
            location.section === 'executions' ? loadExecutions(location.serviceDate, controller.signal) : Promise.resolve(null),
            location.section === 'notifications' ? loadOperationsNotifications(notificationCursor, controller.signal, 30) : Promise.resolve(null),
            location.section === 'reports' ? loadDeliveryExceptions(reportCursor, controller.signal, 30) : Promise.resolve(null),
            destination(),
          ]);
          const failure = results.find((result) => result.status === 'rejected' && result.reason instanceof ApiError && [401, 403].includes(result.reason.status))
            ?? results.find((result) => result.status === 'rejected');
          if (failure?.status === 'rejected') throw failure.reason;
          const [executionPage, notificationPage, reportPage, selected] = results.map((result) => {
            if (result.status === 'rejected') throw result.reason;
            return result.value;
          }) as [Awaited<ReturnType<typeof loadExecutions>> | null, Awaited<ReturnType<typeof loadOperationsNotifications>> | null, Awaited<ReturnType<typeof loadDeliveryExceptions>> | null, { execution: ExecutionDetail | null; report: DeliveryException | null }];
          if (!current()) break;
          if (executionPage !== null) { setExecutions(executionPage.items); setExecutionLimit(executionPage.limit); }
          if (notificationPage !== null) { setNotifications(notificationPage.items); setNextNotificationCursor(notificationPage.nextCursor); }
          if (reportPage !== null) { setReports(reportPage.items); setNextReportCursor(reportPage.nextCursor); }
          setDetail(selected.execution);
          setReport(selected.report);
          setLastUpdated(new Date().toISOString());
        } catch (error) {
          if (!current()) break;
          setDetail(null);
          setReport(null);
          setLoadError(errorMessage(error));
          if (error instanceof ApiError && [401, 403].includes(error.status)) {
            setExecutions([]);
            setNotifications([]);
            setReports([]);
            setNextNotificationCursor(null);
            setNextReportCursor(null);
          }
        } finally {
          if (current()) setLoading(false);
        }
      } while (queued && current());
      running = false;
    };
    refresh.current = () => { void run(); };
    if (canRead) void run();
    else {
      setExecutions([]); setNotifications([]); setReports([]); setLoading(false);
    }
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void run(); }, 30_000);
    return () => { controller.abort(); window.clearInterval(interval); refresh.current = () => undefined; };
  }, [location.serviceDate, location.section, location.execution, location.notification, location.report, location.error, notificationCursor, reportCursor, canRead, authorityKey]);

  function navigateDestination(destination: Destination, section: Section, serviceDate = location.serviceDate) {
    const query = new URLSearchParams({ serviceDate });
    for (const [key, value] of Object.entries(destination)) if (value !== null) query.set(key, value);
    window.history.pushState({}, '', `${window.location.pathname}?${query.toString()}`);
    setLocation({ ...destination, serviceDate, section, error: '' });
    setActionMessage('');
    setActionError('');
    window.requestAnimationFrame(() => detailHeading.current?.focus());
  }

  function chooseSection(section: Section) {
    navigateDestination({ execution: null, notification: null, report: null }, section);
  }

  async function runAction(kind: 'READ' | 'OPENED' | 'acknowledge' | 'resolve') {
    if (!canWrite || actionLock.current || loading || loadError) return;
    if ((kind === 'READ' || kind === 'OPENED') && (!canAck || !location.notification)) return;
    if ((kind === 'acknowledge' || kind === 'resolve') && (report === null || loading || loadError)) return;
    actionLock.current = true;
    setActionBusy(true);
    setActionError('');
    setActionMessage('');
    const generation = requestGeneration.current;
    try {
      if (kind === 'READ' || kind === 'OPENED') await ackOperationsNotification(location.notification!, kind);
      else if (kind === 'acknowledge') await acknowledgeDeliveryException(report!.id);
      else await resolveDeliveryException(report!.id);
      if (!mounted.current || requestGeneration.current !== generation) return;
      setActionMessage(kind === 'READ' ? '알림 읽음을 기록했습니다. 보고 상태는 변경하지 않았습니다.'
        : kind === 'OPENED' ? '알림 열람을 기록했습니다. 보고 상태는 변경하지 않았습니다.'
        : kind === 'acknowledge' ? '미배송 보고를 확인했습니다.' : '미배송 보고를 처리 완료했습니다. 주문과 배송 상태는 변경하지 않았습니다.');
      refresh.current();
    } catch (error) {
      if (!mounted.current || requestGeneration.current !== generation) return;
      setActionError(errorMessage(error));
      setDetail(null); setReport(null);
      refresh.current();
    } finally {
      actionLock.current = false;
      if (mounted.current) setActionBusy(false);
    }
  }

  async function sendCommand(command: PendingCommand) {
    if (!canWrite || storageKey === null || loading || loadError || actionLock.current || command.ownerKey !== storageKey) return;
    actionLock.current = true;
    setActionBusy(true);
    const sending = { ...command, status: 'sending' as const };
    setPending(sending);
    storePending(sending, storageKey);
    setActionError(''); setActionMessage('');
    try {
      const result = command.kind === 'map' ? await mapExecution(command.input) : await selectExecution(command.input);
      if (!mounted.current) return;
      setPending(null);
      storePending(null, storageKey);
      const effective = ['ACCEPT', 'REPLAY'].includes(result.outcome) && result.executionContextId !== null
        && (!('assignmentEpoch' in result) || (result.assignmentEpoch !== null && result.routeVersion !== null));
      const message = `${command.kind === 'map' ? '회차 연결' : '회차 선택'} 결과: ${result.outcome}. ${effective ? `회차 ID: ${result.executionContextId}.` : '회차 연결을 확정할 수 없습니다. 서버 결과를 확인해 주세요.'} commandId: ${command.input.commandId}`;
      if (effective) setActionMessage(message);
      else {
        setActionError(message);
        if (!['MAPPING_REQUIRED', 'SKIPPED_NON_DSV', 'SKIPPED_UNAVAILABLE', 'REPLAY'].includes(result.outcome)) {
          const uncertain: PendingCommand = { ...command, status: 'uncertain' };
          setPending(uncertain);
          storePending(uncertain, storageKey);
        }
      }
      refresh.current();
    } catch (error) {
      if (!mounted.current) return;
      const uncertain = !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
      const next: PendingCommand | null = uncertain ? { ...command, status: 'uncertain' }
        : error instanceof ApiError && error.status === 409 ? { ...command, status: 'conflict' } : null;
      setPending(next);
      storePending(next, storageKey);
      setActionError(uncertain ? '명령 결과를 확인할 수 없습니다. commandId와 입력을 보존했습니다. 같은 명령으로 재시도해 주세요.' : errorMessage(error));
      setDetail(null); setReport(null);
      refresh.current();
    } finally {
      actionLock.current = false;
      if (mounted.current) setActionBusy(false);
    }
  }

  function blocksNewExecutionCommand(executionContextId: string): boolean {
    const targetId = executionContextId.toLowerCase();
    const status = detail?.context.executionContextId.toLowerCase() === targetId
      ? detail.context.status
      : executions.find((item) => item.executionContextId.toLowerCase() === targetId)?.status;
    if (status === undefined || executionStates.has(status)) return false;
    setActionError(`조회한 회차의 상태를 해석할 수 없습니다. 새 명령을 보내지 않았습니다. (${status})`);
    return true;
  }

  function submitMap(event: FormEvent) {
    event.preventDefault();
    if (!canWrite || storageKey === null || loading || loadError || pending !== null || actionLock.current) return;
    const effectiveAt = inputInstant(mapDraft.effectiveAt);
    if (!UUID.test(mapDraft.routePlanId) || (mapDraft.mapping === 'SAME_EXECUTION' && !UUID.test(mapDraft.executionContextId))
      || effectiveAt === null || new Date(effectiveAt).getTime() > Date.now()) {
      setActionError('배차 ID와 회차 ID를 확인해 주세요. 적용 시각은 현재 이전의 한국시간이어야 합니다.'); return;
    }
    if (mapDraft.mapping === 'SAME_EXECUTION' && blocksNewExecutionCommand(mapDraft.executionContextId)) return;
    const common = { commandId: crypto.randomUUID(), routePlanId: mapDraft.routePlanId, effectiveAt };
    const input: MappingCommand = mapDraft.mapping === 'SAME_EXECUTION'
      ? { ...common, mapping: 'SAME_EXECUTION', executionContextId: mapDraft.executionContextId }
      : { ...common, mapping: 'NEW_EXECUTION' };
    void sendCommand({ kind: 'map', input, status: 'sending', ownerKey: storageKey });
  }

  function submitSelect(event: FormEvent) {
    event.preventDefault();
    if (!canWrite || storageKey === null || loading || loadError || pending !== null || actionLock.current) return;
    const validFrom = inputInstant(selectDraft.validFrom);
    const validUntil = inputInstant(selectDraft.validUntil);
    if (!UUID.test(selectDraft.executionContextId) || !UUID.test(selectDraft.vehicleId) || validFrom === null || validUntil === null || validUntil <= validFrom) {
      setActionError('회차 ID와 차량 ID를 확인해 주세요. 선택 종료는 선택 시작 이후의 한국시간이어야 합니다.'); return;
    }
    if (blocksNewExecutionCommand(selectDraft.executionContextId)) return;
    const input: SelectionCommand = { commandId: crypto.randomUUID(), executionContextId: selectDraft.executionContextId, vehicleId: selectDraft.vehicleId, validFrom, validUntil };
    void sendCommand({ kind: 'select', input, status: 'sending', ownerKey: storageKey });
  }

  const selectedNotification = notifications.find((item) => item.id === location.notification);
  const visiblePending = pending?.ownerKey === storageKey ? pending : null;
  const formDisabled = !canWrite || storageKey === null || !!loadError || actionBusy || visiblePending !== null;
  const warnings = detail?.notifications.items.filter((item) => item.kind === 'N05') ?? [];
  const warningCounts = warnings.reduce<Record<string, number>>((counts, item) => {
    counts[item.businessStatus] = (counts[item.businessStatus] ?? 0) + 1;
    return counts;
  }, {});
  if (!canRead) return <p role="alert">이 계정에는 회차 조회 권한이 없습니다.</p>;

  return <div className="execution-operations">
    <div className="execution-toolbar">
      <label htmlFor="execution-date">업무일</label>
      <input id="execution-date" type="date" value={location.serviceDate} onChange={(event) => {
        if (validDate(event.target.value)) {
          setNotificationCursor(null); setReportCursor(null);
          navigateDestination({ execution: null, notification: null, report: null }, 'executions', event.target.value);
        }
      }} />
      <button className="btn" type="button" onClick={() => refresh.current()} disabled={loading}>새로고침</button>
      <span className="execution-note">30초마다 갱신 / 시각은 한국시간</span>
      <span className="execution-note">최근 갱신: {time(lastUpdated)}</span>
    </div>
    <div className="execution-tabs" role="group" aria-label="회차 화면 선택">
      <button className="btn" type="button" aria-pressed={location.section === 'executions'} onClick={() => chooseSection('executions')}>회차</button>
      <button className="btn" type="button" aria-pressed={location.section === 'notifications'} onClick={() => chooseSection('notifications')}>알림</button>
      <button className="btn" type="button" aria-pressed={location.section === 'reports'} onClick={() => chooseSection('reports')}>미배송 보고</button>
    </div>
    {location.error ? <p className="execution-error" role="alert">{location.error}</p> : null}
    {loadError ? <p className="execution-error" role="alert">{loadError} <button className="btn" type="button" onClick={() => refresh.current()} disabled={loading}>다시 조회</button></p> : null}
    {actionError ? <p className="execution-error" role="alert">{actionError}</p> : null}
    {actionMessage ? <p className="execution-success" role="status">{actionMessage}</p> : null}
    {loading ? <p className="execution-note" role="status">최신 상태를 확인하는 중입니다.</p> : null}
    {!canWrite ? <p className="execution-note">조회 전용 계정입니다. 변경에는 배차 변경 권한이 필요합니다.</p> : null}
    {location.section === 'executions' ? <>
      <div className="execution-workspace">
        <section className="page-panel execution-list" aria-label="회차 목록" aria-busy={loading}>
          <h3>회차 목록</h3>
          <Limit count={executions.length} limit={executionLimit} />
          {!loading && !loadError && executions.length === 0 ? <p role="status">이 업무일에 회차가 없습니다.</p> : null}
          <ul className="execution-items">
            {executions.map((item) => <li key={item.executionContextId}>
              <button type="button" className={`execution-item${item.executionContextId === location.execution ? ' active' : ''}`} aria-pressed={item.executionContextId === location.execution} aria-label={`회차 ${item.executionContextId} 열기`} onClick={() => navigateDestination({ execution: item.executionContextId, notification: null, report: null }, 'executions')}>
                <strong>{item.executionContextId}</strong><span>{item.serviceDate} <State value={item.status} /></span>
                <span>기사 ID: {item.driverId ?? '없음'}</span><span>차량 ID: {item.vehicleId ?? '없음'}</span>
                <span>시작 승인: {time(item.startedAt)}</span><span>다음 경고: {time(item.reminderDueAt)}</span>
                <span>경고 상태: <State value={item.reminderStatus} /></span>
                {item.operationalSummaryTruncated ? <span className="execution-warning">알림 요약 일부 생략</span> : null}
              </button>
            </li>)}
          </ul>
        </section>
        <section className="page-panel execution-detail" aria-label="회차 상세" aria-busy={loading}>
          <div className="execution-section-heading"><h3 ref={detailHeading} tabIndex={-1}>회차 상세</h3>{location.execution ? <button className="btn" type="button" onClick={() => navigateDestination({ execution: null, notification: null, report: null }, 'executions')}>선택 취소</button> : null}</div>
          {detail === null ? <p role="status">{location.execution ? loadError ? '현재 상태를 확인한 후 상세를 표시합니다.' : '회차 상세를 확인하는 중입니다.' : '목록에서 회차를 선택해 주세요.'}</p> : <>
            <Facts>
              <Fact label="회차 ID">{detail.context.executionContextId}</Fact><Fact label="업무일">{detail.context.serviceDate}</Fact>
              <Fact label="기사 ID">{detail.context.driverId ?? '없음'}</Fact><Fact label="차량 ID">{detail.context.vehicleId ?? '없음'}</Fact>
              <Fact label="회차 상태"><State value={detail.context.status} /></Fact><Fact label="종료 사유"><State value={detail.context.endReason} /></Fact>
              <Fact label="배차 ID">{detail.context.routePlanId}</Fact><Fact label="내용 버전">{detail.context.routeVersion}</Fact>
              <Fact label="배정 세대">{detail.context.assignmentEpoch}</Fact><Fact label="적용 시각">{time(detail.context.effectiveAt)}</Fact>
              <Fact label="출발 관측">{time(detail.context.departureObservedAt)}</Fact><Fact label="시작 승인">{time(detail.context.startedAt)}</Fact>
              <Fact label="다음 경고 시각">{time(detail.context.reminderDueAt)}</Fact><Fact label="경고 상태"><State value={detail.context.reminderStatus} /></Fact>
              <Fact label="경고 사건 ID">{detail.context.reminderIncidentId ?? '없음'}</Fact><Fact label="논리 경고 순번">{detail.context.reminderOrdinal}</Fact>
              <Fact label="창고 알림 관측 시각">{time(detail.context.warehouseNotifiedAt)}</Fact><Fact label="종료 시각">{time(detail.context.closedAt)}</Fact>
            </Facts>
            <section className="execution-subsection" aria-label="정책">
              <h4>정책</h4>
              <Facts><Fact label="서버 모드"><State value={detail.context.notificationMode} /></Fact><Fact label="실발송 자격 시각">{time(detail.context.liveEligibleAt)}</Fact><Fact label="감시 시작">{time(detail.context.monitorStartAt)}</Fact><Fact label="감시 종료">{time(detail.context.monitorEndAt)}</Fact></Facts>
              <p className="execution-note">정책 버전은 아래 GPS 근거의 서버 값을 표시합니다. 설정 변경 API는 없습니다. 운영 정책 D01, D02, D04, D05, D07은 별도 승인이 필요합니다.</p>
            </section>
            <section className="execution-subsection" aria-label="GPS 근거">
              <h4>GPS 근거</h4><p className="execution-note">GPS 도착과 출발 관측은 시작 승인과 별도 기록입니다. GPS 관측만으로 배송 상태를 변경하지 않습니다.</p>
              <Limit count={detail.geofenceEvidence.items.length} limit={detail.geofenceEvidence.limit} truncated={detail.geofenceEvidence.truncated} />
              {detail.geofenceEvidence.items.length === 0 ? <p>GPS 근거가 없습니다.</p> : <AdminTableFrame><table className="page-table"><caption className="execution-sr-only">GPS 근거</caption><thead><tr><th scope="col">대상</th><th scope="col">전이</th><th scope="col">최초 관측</th><th scope="col">확인 관측</th><th scope="col">서버 확인</th><th scope="col">정책 버전</th><th scope="col">원본 샘플</th><th scope="col">배정 세대</th></tr></thead><tbody>{detail.geofenceEvidence.items.map((item) => <tr key={item.id}><td>{item.boundary.targetKey === 'DEPOT' ? '창고 (DEPOT)' : item.boundary.targetKey}<small>방문 {item.boundary.visitOrdinal} / 내용 {item.routeVersion}</small></td><td><State value={item.boundary.transition} /></td><td>{time(item.firstObservedAt)}</td><td>{time(item.confirmedObservedAt)}</td><td>{time(item.confirmedAt)}</td><td>{item.policyVersion}</td><td>{item.sourceSampleId ?? '없음'}</td><td>{item.assignmentEpoch}</td></tr>)}</tbody></table></AdminTableFrame>}
            </section>
            <section className="execution-subsection" aria-label="시작 경고">
              <h4>시작 경고</h4><p className="execution-note">N05 알림 생성과 발송 처리를 구분합니다. workerAttemptCount는 작업 확보와 재시도 예산입니다. 기사에게 전달된 횟수가 아닙니다.</p>
              <Facts><Fact label="N05 업무 상태"><Counts values={warningCounts} /></Fact><Fact label="N05 작업 시도 합계">{warnings.reduce((count, item) => count + item.workerAttemptCount, 0)}</Fact></Facts>
              <p className="execution-note">N05 합계는 아래 조회 범위 내 기록만 계산합니다. 기기 수신과 기사 열람 증거는 이 조회 계약에서 제공하지 않습니다.</p>
            </section>
            <section className="execution-subsection" aria-label="회차 알림">
              <h4>알림</h4><Limit count={detail.notifications.items.length} limit={detail.notifications.limit} truncated={detail.notifications.truncated} />
              {detail.notifications.attemptsTruncated ? <p className="execution-warning">발송 처리 기록은 서버 한도 1,000건을 초과하여 일부 생략되었습니다.</p> : <p className="execution-limit">발송 처리 기록 서버 한도 1,000건 / 생략 없음</p>}
              <p className="execution-note">N01~N06은 기사 알림입니다. N07은 관제 미배송 보고 알림입니다. 기기 수신은 확인되지 않았습니다. 기사 읽음과 열람은 조회 계약에서 제공하지 않습니다.</p>
              {detail.notifications.items.length === 0 ? <p>알림 기록이 없습니다.</p> : <AdminTableFrame><table className="page-table"><caption className="execution-sr-only">회차 알림 상태</caption><thead><tr><th scope="col">알림</th><th scope="col">업무 상태</th><th scope="col">생성 시각</th><th scope="col">예정 시각</th><th scope="col">발송 처리</th><th scope="col">작업 시도</th><th scope="col">종료 사유</th><th scope="col">만료 시각</th></tr></thead><tbody>{detail.notifications.items.map((item) => <tr key={item.id}><td>{notificationNames[item.kind] ?? `알 수 없는 종류 (${item.kind})`}<small>{item.kind} / 순번 {item.ordinal}</small><small>{item.id}</small>{item.kind === 'N07' ? <button className="btn" type="button" aria-label={`알림 ${item.id} 열기`} onClick={() => navigateDestination({ execution: null, notification: item.id, report: null }, 'notifications')}>보고 열기</button> : null}</td><td><State value={item.businessStatus} /></td><td>{time(item.createdAt)}</td><td>{time(item.dueAt)}</td><td><Counts values={item.attemptRecordsByStatus} /><small>최근 처리: {time(item.lastCompletedAt)}</small><small>기기 수신: 확인되지 않음</small></td><td>{item.workerAttemptCount}</td><td>{item.resolutionReason ?? '없음'}<small>{time(item.resolvedAt)}</small></td><td>{time(item.expiresAt)}</td></tr>)}</tbody></table></AdminTableFrame>}
            </section>
            <section className="execution-subsection" aria-label="회차 보고">
              <h4>미배송 보고</h4><Limit count={detail.deliveryExceptions.items.length} limit={detail.deliveryExceptions.limit} truncated={detail.deliveryExceptions.truncated} />
              <ul className="execution-items">{detail.deliveryExceptions.items.map((item) => <li key={item.id}><button className="execution-item" type="button" aria-label={`미배송 보고 ${item.id} 열기`} onClick={() => navigateDestination({ execution: null, notification: null, report: item.id }, 'reports')}><strong>{item.reasonCode}</strong><span>{item.id}</span><State value={item.status} /><span>접수: {time(item.createdAt)}</span></button></li>)}</ul>
            </section>
          </>}
        </section>
      </div>
      <section className="page-panel execution-command-panel" aria-label="관리자 작업">
        <h3>관리자 작업</h3><p className="execution-note">배차 수정과 회차 연결은 별도 작업입니다. 새 회차는 명시적인 연결 명령으로 만듭니다. 충돌을 자동으로 덮어쓰지 않습니다.</p>
        {storageKey === null ? <p className="execution-note">계정과 사업장을 확인할 수 없어 회차 명령을 실행할 수 없습니다.</p> : null}
        {visiblePending ? <div className="execution-command-result" role="status"><p>commandId: <code>{visiblePending.input.commandId}</code></p><p>고정 입력: <code>{JSON.stringify(visiblePending.input)}</code></p>{visiblePending.status === 'sending' ? <p>명령 처리 결과를 확인하는 중입니다.</p> : visiblePending.status === 'uncertain' ? <><p>응답을 확인하지 못했습니다. 같은 명령으로 결과를 확인해 주세요.</p><button className="btn primary" type="button" disabled={!canWrite || actionBusy || loading || !!loadError} onClick={() => void sendCommand(visiblePending)}>같은 명령 재시도</button></> : <><p>최신 상태를 조회한 후 기존 명령을 종료해야 새 명령을 만들 수 있습니다.</p><button className="btn" type="button" disabled={loading || !!loadError || !canWrite} onClick={() => { setPending(null); storePending(null, storageKey); setActionError('최신 상태를 검토하고 입력을 확인한 후 새 명령을 실행해 주세요.'); }}>최신 상태 확인 후 새 명령 준비</button></>}</div> : null}
        <div className="execution-command-grid">
          <form aria-label="회차 연결" onSubmit={submitMap}>
            <h4>회차 연결</h4><fieldset disabled={formDisabled}>
              <label>연결할 배차 ID<input required value={mapDraft.routePlanId} onChange={(event) => setMapDraft((draft) => ({ ...draft, routePlanId: event.target.value.trim() }))} placeholder="UUID" /></label>
              <label>연결 방식<select value={mapDraft.mapping} onChange={(event) => setMapDraft((draft) => ({ ...draft, mapping: event.target.value as 'SAME_EXECUTION' | 'NEW_EXECUTION' }))}><option value="SAME_EXECUTION">같은 회차</option><option value="NEW_EXECUTION">새 회차</option></select></label>
              {mapDraft.mapping === 'SAME_EXECUTION' ? <label>연결할 회차 ID<input required value={mapDraft.executionContextId} onChange={(event) => setMapDraft((draft) => ({ ...draft, executionContextId: event.target.value.trim() }))} placeholder="UUID" /></label> : null}
              <label>적용 시각 (한국시간)<input required type="datetime-local" step="1" value={mapDraft.effectiveAt} onChange={(event) => setMapDraft((draft) => ({ ...draft, effectiveAt: event.target.value }))} /></label>
              <p className="execution-note">같은 회차는 동일 업무일의 진행 중 회차만 연결할 수 있습니다. 오후의 별도 운행은 새 회차 연결을 사용합니다.</p>
              <button className="btn primary" type="submit" disabled={loading}>회차 연결 실행</button>
            </fieldset></form>
          <form aria-label="회차 선택" onSubmit={submitSelect}>
            <h4>회차 선택</h4><fieldset disabled={formDisabled}>
              <label>선택할 회차 ID<input required value={selectDraft.executionContextId} onChange={(event) => setSelectDraft((draft) => ({ ...draft, executionContextId: event.target.value.trim() }))} placeholder="UUID" /></label>
              <label>차량 ID<input required value={selectDraft.vehicleId} onChange={(event) => setSelectDraft((draft) => ({ ...draft, vehicleId: event.target.value.trim() }))} placeholder="UUID" /></label>
              <label>선택 시작 (한국시간)<input required type="datetime-local" step="1" value={selectDraft.validFrom} onChange={(event) => setSelectDraft((draft) => ({ ...draft, validFrom: event.target.value }))} /></label>
              <label>선택 종료 (한국시간)<input required type="datetime-local" step="1" value={selectDraft.validUntil} onChange={(event) => setSelectDraft((draft) => ({ ...draft, validUntil: event.target.value }))} /></label>
              <p className="execution-note">같은 차량에 여러 회차가 있으면 이 시간 구간의 관측 대상 회차를 명시적으로 선택합니다.</p>
              <button className="btn primary" type="submit" disabled={loading}>회차 선택 실행</button>
            </fieldset></form>
        </div>
      </section>
    </> : <div className="execution-workspace">
      <section className="page-panel execution-list" aria-label={location.section === 'notifications' ? '알림 목록' : '미배송 보고 목록'} aria-busy={loading}>
        <h3>{location.section === 'notifications' ? '알림 목록' : '미배송 보고 목록'}</h3>
        <p className="execution-note">현재 사업장의 최신순 목록입니다. 업무일 필터는 회차 목록에만 적용됩니다.</p>
        {location.section === 'notifications' ? <>
          <p className="execution-limit">페이지 조회 한도 30건 / {notifications.length}건 표시{nextNotificationCursor ? ' / 다음 페이지 있음' : ' / 다음 페이지 없음'}</p>
          <p className="execution-note">이 목록은 관제 N07입니다. 기사 N01~N06은 회차 상세에서 확인합니다. ackedAt은 읽음과 열람 종류를 구분하지 않습니다.</p>
          {!loading && !loadError && notifications.length === 0 ? <p role="status">현재 페이지에 알림이 없습니다.</p> : null}
          <ul className="execution-items">{notifications.map((item) => <li key={item.id}><button type="button" className={`execution-item${item.id === location.notification ? ' active' : ''}`} aria-pressed={item.id === location.notification} aria-label={`알림 ${item.id} 열기`} onClick={() => navigateDestination({ execution: null, notification: item.id, report: null }, 'notifications')}><strong>{item.summary.title}</strong><span>{notificationNames[item.kind] ?? '알 수 없는 종류'} ({item.kind})</span><span>{item.summary.body}</span><span>{item.id}</span><State value={item.businessStatus} /><span>접수: {time(item.createdAt)}</span><span>알림 확인 시각 (종류 미제공): {time(item.ackedAt)}</span><span>만료: {time(item.expiresAt)}</span></button></li>)}</ul>
          <div className="execution-actions"><button className="btn" type="button" disabled={notificationCursor === null || loading} onClick={() => setNotificationCursor(null)}>첫 페이지</button><button className="btn" type="button" disabled={nextNotificationCursor === null || loading} onClick={() => setNotificationCursor(nextNotificationCursor)}>다음 페이지</button></div>
        </> : <>
          <p className="execution-limit">페이지 조회 한도 30건 / {reports.length}건 표시{nextReportCursor ? ' / 다음 페이지 있음' : ' / 다음 페이지 없음'}</p>
          {!loading && !loadError && reports.length === 0 ? <p role="status">현재 페이지에 미배송 보고가 없습니다.</p> : null}
          <ul className="execution-items">{reports.map((item) => <li key={item.id}><button type="button" className={`execution-item${item.id === location.report ? ' active' : ''}`} aria-pressed={item.id === location.report} aria-label={`미배송 보고 ${item.id} 열기`} onClick={() => navigateDestination({ execution: null, notification: null, report: item.id }, 'reports')}><strong>{item.reasonCode}</strong><span>{item.id}</span><State value={item.status} /><span>접수: {time(item.createdAt)}</span><span>보고 확인: {time(item.acknowledgedAt)}</span></button></li>)}</ul>
          <div className="execution-actions"><button className="btn" type="button" disabled={reportCursor === null || loading} onClick={() => setReportCursor(null)}>첫 페이지</button><button className="btn" type="button" disabled={nextReportCursor === null || loading} onClick={() => setReportCursor(nextReportCursor)}>다음 페이지</button></div>
        </>}
      </section>
      <section className="page-panel execution-detail" aria-label="미배송 보고 상세" aria-busy={loading}>
        <div className="execution-section-heading"><h3 ref={detailHeading} tabIndex={-1}>미배송 보고 상세</h3>{location.notification || location.report ? <button className="btn" type="button" onClick={() => navigateDestination({ execution: null, notification: null, report: null }, location.section)}>선택 취소</button> : null}</div>
        {location.notification ? <section className="execution-subsection" aria-label="알림 열람">
          <h4>알림 열람</h4><p className="execution-note">알림 목적지는 갱신할 때마다 현재 권한으로 확인합니다. 보고를 열어도 업무 상태를 변경하지 않습니다.</p>
          <Facts><Fact label="알림 ID">{location.notification}</Fact><Fact label="알림 업무 상태"><State value={selectedNotification?.businessStatus} /></Fact><Fact label="알림 확인 시각 (종류 미제공)">{selectedNotification ? time(selectedNotification.ackedAt) : '현재 페이지에 기록이 없습니다.'}</Fact></Facts>
          <div className="execution-actions"><button className="btn" type="button" disabled={!canAck || actionBusy || loading || report === null || !!loadError} onClick={() => void runAction('READ')}>읽음 기록</button><button className="btn" type="button" disabled={!canAck || actionBusy || loading || report === null || !!loadError} onClick={() => void runAction('OPENED')}>열람 기록</button></div>
          {canWrite && !canAck ? <p className="execution-note">유효한 관리자 ID를 확인할 수 없어 읽음과 열람을 기록할 수 없습니다.</p> : null}
        </section> : null}
        {report === null ? <p role="status">{location.notification || location.report ? loadError ? '현재 권한으로 목적지를 확인한 후 보고를 표시합니다.' : '미배송 보고를 확인하는 중입니다.' : '목록에서 알림 또는 보고를 선택해 주세요.'}</p> : <>
          {detail && (detail.context.status !== 'ACTIVE' || detail.context.assignmentEpoch !== report.assignmentEpoch) ? <p className="execution-warning" role="status">이 보고는 종료 또는 재배정 이전의 기록입니다. 현재 회차 상태와 배정 세대를 확인해 주세요. 보고 처리로 현재 배차를 변경하지 않습니다.</p> : null}
          {detail ? <Facts><Fact label="현재 회차 상태"><State value={detail.context.status} /></Fact><Fact label="현재 배정 세대">{detail.context.assignmentEpoch}</Fact><Fact label="현재 종료 사유"><State value={detail.context.endReason} /></Fact></Facts> : null}
          <Facts><Fact label="보고 ID">{report.id}</Fact><Fact label="보고 상태"><State value={report.status} /></Fact><Fact label="회차 ID">{report.executionContextId}</Fact><Fact label="대상 배송지 ID">{report.targetStopId}</Fact><Fact label="기사 ID">{report.driverId}</Fact><Fact label="미배송 사유">{report.reasonCode}</Fact><Fact label="접수 시각">{time(report.createdAt)}</Fact><Fact label="보고 확인 시각">{time(report.acknowledgedAt)}</Fact><Fact label="처리 완료 시각">{time(report.resolvedAt)}</Fact><Fact label="내용 버전">{report.routeVersion}</Fact><Fact label="배정 세대">{report.assignmentEpoch}</Fact></Facts>
          <section className="execution-subsection" aria-label="보고 설명"><h4>설명</h4><p className="execution-explanation">{report.explanation ?? '설명 없음'}</p></section>
          <section className="execution-subsection" aria-label="보고 처리"><h4>보고 처리</h4><p className="execution-note">보고 확인과 처리 완료는 알림 읽음 및 열람과 별도 작업입니다. 보고 처리로 주문 실패나 배송 완료를 만들지 않습니다. 사유 기준과 처리 흐름의 운영 승인은 별도입니다.</p><div className="execution-actions"><button className="btn" type="button" disabled={!canWrite || actionBusy || loading || !!loadError || report.status !== 'OPEN'} onClick={() => void runAction('acknowledge')}>보고 확인</button><button className="btn primary" type="button" disabled={!canWrite || actionBusy || loading || !!loadError || !['OPEN', 'ACKNOWLEDGED'].includes(report.status)} onClick={() => void runAction('resolve')}>처리 완료</button><button className="btn" type="button" onClick={() => navigateDestination({ execution: report.executionContextId, notification: null, report: null }, 'executions')}>회차 열기</button></div></section>
        </>}
      </section>
    </div>}
  </div>;
}
