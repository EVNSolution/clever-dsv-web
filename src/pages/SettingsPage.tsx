import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { apiConfig } from '../api/config';
import { loadAdminSettings, loadRemoteOperationalSettings, saveAdminSettings, saveRemoteOperationalSettings } from '../services/settings';
import type { AdminSettings, OperationalSettings } from '../services/settings';

type RemoteLoadState = 'error' | 'loading' | 'ready';
type RemoteSaveState = 'error' | 'idle' | 'saving' | 'saved';

export function SettingsPage(): ReactElement {
  const isRemote = apiConfig.mode === 'remote';
  const [mockSettings, setMockSettings] = useState<AdminSettings | undefined>(() => isRemote ? undefined : loadAdminSettings());
  const [remoteSettings, setRemoteSettings] = useState<OperationalSettings | undefined>();
  const [remoteLoadState, setRemoteLoadState] = useState<RemoteLoadState>(() => isRemote ? 'loading' : 'ready');
  const [remoteLoadError, setRemoteLoadError] = useState('');
  const [remoteSaveState, setRemoteSaveState] = useState<RemoteSaveState>('idle');
  const [remoteSaveError, setRemoteSaveError] = useState('');
  const [loadRequest, setLoadRequest] = useState(0);

  useEffect(() => {
    if (isRemote || !mockSettings) return;
    saveAdminSettings(mockSettings);
  }, [isRemote, mockSettings]);

  useEffect(() => {
    if (!isRemote) return undefined;
    let active = true;
    setRemoteLoadState('loading');
    setRemoteLoadError('');
    setRemoteSaveError('');
    setRemoteSaveState('idle');
    setRemoteSettings(undefined);
    loadRemoteOperationalSettings()
      .then((remote) => {
        if (!active) return;
        setRemoteSettings(remote);
        setRemoteLoadState('ready');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setRemoteSettings(undefined);
        setRemoteLoadError(errorMessage(error));
        setRemoteLoadState('error');
      });
    return () => { active = false; };
  }, [isRemote, loadRequest]);

  const updateMock = <Key extends keyof AdminSettings>(key: Key, value: AdminSettings[Key]) => {
    setMockSettings((current) => current ? { ...current, [key]: value } : current);
  };

  const updateRemote = <Key extends keyof OperationalSettings>(key: Key, value: OperationalSettings[Key]) => {
    setRemoteSettings((current) => current ? { ...current, [key]: value } : current);
    setRemoteSaveState('idle');
    setRemoteSaveError('');
  };

  const saveRemoteDraft = useCallback(async () => {
    if (!remoteSettings || remoteLoadState !== 'ready') return;
    setRemoteSaveState('saving');
    setRemoteSaveError('');
    try {
      await saveRemoteOperationalSettings(remoteSettings);
      setRemoteSaveState('saved');
    } catch (error) {
      setRemoteSaveError(errorMessage(error));
      setRemoteSaveState('error');
    }
  }, [remoteLoadState, remoteSettings]);

  if (isRemote && !remoteSettings) {
    return (
      <div className="page-grid">
        <section className="page-panel">
          <div className="tab-line section-heading"><span>원격 설정</span><span className="chip blue">remote</span></div>
          {remoteLoadState === 'loading' ? <div className="panel-state" role="status">설정을 불러오는 중입니다.</div> : null}
          {remoteLoadState === 'error' ? (
            <div className="panel-state error" role="alert">
              <strong>설정 불러오기 차단</strong>
              <span>{remoteLoadError}</span>
              <button className="btn" type="button" onClick={() => setLoadRequest((request) => request + 1)}>재시도</button>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  if (isRemote && remoteSettings) {
    return (
      <div className="page-grid">
        <section className="page-panel">
          <div className="tab-line section-heading"><span>원격 설정</span><span className="chip blue">remote</span></div>
          {remoteSaveState === 'saving' ? <div className="panel-state" role="status">설정을 저장하는 중입니다.</div> : null}
          {remoteSaveState === 'saved' ? <div className="panel-state" role="status">설정을 저장했습니다.</div> : null}
          {remoteSaveState === 'error' ? <div className="panel-state error" role="alert">{remoteSaveError}</div> : null}
          <button className="btn primary" type="button" disabled={remoteSaveState === 'saving'} onClick={() => void saveRemoteDraft()}>저장</button>
        </section>
        <section className="page-panel">
          <div className="tab-line section-heading"><span>운영 시간</span></div>
          <table className="page-table"><tbody><tr><th>준비 시작</th><td><input className="setting-input" aria-label="준비 시작 시간" type="time" value={remoteSettings.loadingStartTime} onChange={(event) => updateRemote('loadingStartTime', event.target.value)} /></td></tr><tr><th>출발 예정</th><td><input className="setting-input" aria-label="출발 예정 시간" type="time" value={remoteSettings.plannedDepartureTime} onChange={(event) => updateRemote('plannedDepartureTime', event.target.value)} /></td></tr></tbody></table>
        </section>
        <section className="page-panel">
          <div className="tab-line section-heading"><span>알림 기준</span><span className="chip amber">사용 불가</span></div>
          <div className="panel-state">원격 운영 설정에서 제공되지 않습니다.</div>
        </section>
        <section className="page-panel">
          <div className="tab-line section-heading"><span>알림 수신</span><span className="chip amber">사용 불가</span></div>
          <div className="panel-state">원격 운영 설정에서 제공되지 않습니다.</div>
        </section>
      </div>
    );
  }

  if (!mockSettings) return <div className="page-grid" />;

  return (
    <div className="page-grid">
      <section className="page-panel">
        <div className="tab-line section-heading"><span>운영 시간</span></div>
        <table className="page-table"><tbody><tr><th>준비 시작</th><td><input className="setting-input" aria-label="준비 시작 시간" type="time" value={mockSettings.loadingStartTime} onChange={(event) => updateMock('loadingStartTime', event.target.value)} /></td></tr><tr><th>출발 예정</th><td><input className="setting-input" aria-label="출발 예정 시간" type="time" value={mockSettings.plannedDepartureTime} onChange={(event) => updateMock('plannedDepartureTime', event.target.value)} /></td></tr></tbody></table>
      </section>
      <section className="page-panel">
        <div className="tab-line section-heading"><span>알림 기준</span><span className="chip amber">임시 저장</span></div>
        <table className="page-table"><tbody><tr><th>특장 온도 상한</th><td><input className="setting-input" type="number" value={mockSettings.temperatureLimit} step="0.5" onChange={(event) => updateMock('temperatureLimit', Number(event.target.value))} /> ℃</td></tr><tr><th>ETA 지연 알림</th><td><input className="setting-input" type="number" value={mockSettings.etaDelayMinutes} onChange={(event) => updateMock('etaDelayMinutes', Number(event.target.value))} /> 분 이상</td></tr><tr><th>GPS 미수신 알림</th><td><input className="setting-input" type="number" value={mockSettings.gpsSilenceSeconds} onChange={(event) => updateMock('gpsSilenceSeconds', Number(event.target.value))} /> 초 이상</td></tr><tr><th>도착 후 대기시간</th><td><input className="setting-input" type="number" min="1" max="30" value={mockSettings.dwellMinutes} onChange={(event) => updateMock('dwellMinutes', Number(event.target.value))} /> 분</td></tr></tbody></table>
      </section>
      <section className="page-panel">
        <div className="tab-line section-heading"><span>알림 수신</span><span className="chip blue">운영</span></div>
        <table className="page-table"><tbody><tr><th>온도 경고</th><td><label><input type="checkbox" checked={mockSettings.showTemperatureAlerts} onChange={(event) => updateMock('showTemperatureAlerts', event.target.checked)} /> 관제 화면 표시</label></td></tr><tr><th>배송 지연</th><td><label><input type="checkbox" checked={mockSettings.forwardDelayAlerts} onChange={(event) => updateMock('forwardDelayAlerts', event.target.checked)} /> 배송원에게 전달</label></td></tr><tr><th>증빙 누락</th><td><label><input type="checkbox" checked={mockSettings.recordMissingProof} onChange={(event) => updateMock('recordMissingProof', event.target.checked)} /> 기록 페이지에 표시</label></td></tr></tbody></table>
      </section>
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '설정 요청에 실패했습니다.';
}
