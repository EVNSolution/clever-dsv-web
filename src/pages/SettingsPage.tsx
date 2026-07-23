import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { apiConfig } from '../api/config';
import {
  defaultAdminSettings,
  loadAdminSettings,
  loadRemoteOperationalSettings,
  saveAdminSettings,
  saveRemoteOperationalSettings,
} from '../services/settings';
import type { AdminSettings, OperationalSettings } from '../services/settings';

type LoadState = 'loading' | 'ready';
type SaveState = 'error' | 'idle' | 'saving' | 'saved';

const defaultOperationalSettings: OperationalSettings = {
  loadingStartTime: defaultAdminSettings.loadingStartTime,
  plannedDepartureTime: defaultAdminSettings.plannedDepartureTime,
};

export function SettingsPage(): ReactElement {
  const isRemote = apiConfig.mode === 'remote';
  const [mockSettings, setMockSettings] = useState<AdminSettings>(() => isRemote ? defaultAdminSettings : loadAdminSettings());
  const [remoteSettings, setRemoteSettings] = useState<OperationalSettings>(defaultOperationalSettings);
  const [loadState, setLoadState] = useState<LoadState>(() => isRemote ? 'loading' : 'ready');
  const [loadWarning, setLoadWarning] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const [resetNotice, setResetNotice] = useState('');
  const [loadRequest, setLoadRequest] = useState(0);

  useEffect(() => {
    if (!isRemote) return undefined;
    let active = true;
    setLoadState('loading');
    setLoadWarning('');
    loadRemoteOperationalSettings()
      .then((settings) => {
        if (!active) return;
        setRemoteSettings(settings);
        setLoadState('ready');
      })
      .catch(() => {
        if (!active) return;
        setRemoteSettings(defaultOperationalSettings);
        setLoadWarning('저장된 설정을 불러오지 못해 기본값을 표시했습니다.');
        setLoadState('ready');
      });
    return () => { active = false; };
  }, [isRemote, loadRequest]);

  const beginEdit = () => {
    setSaveState('idle');
    setSaveError('');
    setResetNotice('');
  };

  const updateMock = <Key extends keyof AdminSettings>(key: Key, value: AdminSettings[Key]) => {
    beginEdit();
    setMockSettings((current) => ({ ...current, [key]: value }));
  };

  const updateRemote = <Key extends keyof OperationalSettings>(key: Key, value: OperationalSettings[Key]) => {
    beginEdit();
    setRemoteSettings((current) => ({ ...current, [key]: value }));
  };

  const saveDraft = async () => {
    setSaveState('saving');
    setSaveError('');
    setResetNotice('');
    try {
      if (isRemote) await saveRemoteOperationalSettings(remoteSettings);
      else saveAdminSettings(mockSettings);
      setSaveState('saved');
    } catch (error) {
      setSaveError(errorMessage(error));
      setSaveState('error');
    }
  };

  const resetDraft = () => {
    if (isRemote) setRemoteSettings(defaultOperationalSettings);
    else setMockSettings(defaultAdminSettings);
    setSaveState('idle');
    setSaveError('');
    setResetNotice('기본값으로 되돌렸습니다. 저장을 누르면 적용됩니다.');
  };

  const settings = isRemote ? remoteSettings : mockSettings;

  return (
    <div className="page-grid">
      <section className="page-panel wide settings-command-panel">
        <div className="tab-line section-heading">
          <span>설정 적용</span>
          <span className="settings-actions">
            <button className="btn" type="button" disabled={saveState === 'saving'} onClick={resetDraft}>초기화</button>
            <button className="btn primary" type="button" disabled={loadState === 'loading' || saveState === 'saving'} onClick={() => void saveDraft()}>
              {saveState === 'saving' ? '저장 중' : '저장'}
            </button>
          </span>
        </div>
        {loadState === 'loading' ? <div className="panel-state" role="status">설정을 불러오는 중입니다.</div> : null}
        {loadWarning ? <div className="panel-state settings-warning" role="status"><span>{loadWarning}</span><button className="btn" type="button" onClick={() => setLoadRequest((request) => request + 1)}>다시 불러오기</button></div> : null}
        {saveState === 'saved' ? <div className="panel-state" role="status">설정을 저장했습니다.</div> : null}
        {saveState === 'error' ? <div className="panel-state error" role="alert">{saveError}</div> : null}
        {resetNotice ? <div className="panel-state" role="status">{resetNotice}</div> : null}
      </section>

      <section className={`page-panel ${isRemote ? 'wide' : ''}`}>
        <div className="tab-line section-heading"><span>운영 시간</span></div>
        <table className="page-table">
          <tbody>
            <tr>
              <th>준비 시작</th>
              <td><input className="setting-input" aria-label="준비 시작 시간" type="time" value={settings.loadingStartTime} onChange={(event) => isRemote ? updateRemote('loadingStartTime', event.target.value) : updateMock('loadingStartTime', event.target.value)} /></td>
            </tr>
            <tr>
              <th>출발 예정</th>
              <td><input className="setting-input" aria-label="출발 예정 시간" type="time" value={settings.plannedDepartureTime} onChange={(event) => isRemote ? updateRemote('plannedDepartureTime', event.target.value) : updateMock('plannedDepartureTime', event.target.value)} /></td>
            </tr>
          </tbody>
        </table>
      </section>

      {!isRemote ? (
        <>
          <section className="page-panel">
            <div className="tab-line section-heading"><span>알림 기준</span></div>
            <table className="page-table"><tbody><tr><th>특장 온도 상한</th><td><input className="setting-input" type="number" value={mockSettings.temperatureLimit} step="0.5" onChange={(event) => updateMock('temperatureLimit', Number(event.target.value))} /> ℃</td></tr><tr><th>ETA 지연 알림</th><td><input className="setting-input" type="number" value={mockSettings.etaDelayMinutes} onChange={(event) => updateMock('etaDelayMinutes', Number(event.target.value))} /> 분 이상</td></tr><tr><th>GPS 미수신 알림</th><td><input className="setting-input" type="number" value={mockSettings.gpsSilenceSeconds} onChange={(event) => updateMock('gpsSilenceSeconds', Number(event.target.value))} /> 초 이상</td></tr><tr><th>도착 후 대기시간</th><td><input className="setting-input" type="number" min="1" max="30" value={mockSettings.dwellMinutes} onChange={(event) => updateMock('dwellMinutes', Number(event.target.value))} /> 분</td></tr></tbody></table>
          </section>
          <section className="page-panel">
            <div className="tab-line section-heading"><span>알림 수신</span></div>
            <table className="page-table"><tbody><tr><th>온도 경고</th><td><label><input type="checkbox" checked={mockSettings.showTemperatureAlerts} onChange={(event) => updateMock('showTemperatureAlerts', event.target.checked)} /> 관제 화면 표시</label></td></tr><tr><th>배송 지연</th><td><label><input type="checkbox" checked={mockSettings.forwardDelayAlerts} onChange={(event) => updateMock('forwardDelayAlerts', event.target.checked)} /> 배송원에게 전달</label></td></tr><tr><th>증빙 누락</th><td><label><input type="checkbox" checked={mockSettings.recordMissingProof} onChange={(event) => updateMock('recordMissingProof', event.target.checked)} /> 기록 페이지에 표시</label></td></tr></tbody></table>
          </section>
        </>
      ) : null}
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '설정 저장에 실패했습니다.';
}
