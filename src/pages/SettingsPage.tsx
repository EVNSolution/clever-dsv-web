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

const defaultOperationalSettings: OperationalSettings = defaultAdminSettings;

export function SettingsPage({ description, title }: { description: string; title: string }): ReactElement {
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
        setLoadWarning('설정을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.');
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
    <>
      <div className="page-hero settings-hero">
        <div><h2>{title}</h2><p>{description}</p></div>
        <div className="settings-header-tools">
          <div className="settings-feedback" aria-live="polite">
            {loadState === 'loading' ? <span role="status">설정을 불러오는 중입니다.</span> : null}
            {loadWarning ? <span role="status">{loadWarning} <button className="text-button" type="button" onClick={() => setLoadRequest((request) => request + 1)}>다시 불러오기</button></span> : null}
            {saveState === 'saved' ? <span role="status">설정을 저장했습니다.</span> : null}
            {saveState === 'error' ? <span className="error" role="alert">{saveError}</span> : null}
            {resetNotice ? <span role="status">{resetNotice}</span> : null}
          </div>
          <div className="settings-actions">
            <button className="btn" type="button" disabled={saveState === 'saving'} onClick={resetDraft}>초기화</button>
            <button className="btn primary" type="button" disabled={loadState === 'loading' || saveState === 'saving'} onClick={() => void saveDraft()}>
              {saveState === 'saving' ? '저장 중' : '저장'}
            </button>
          </div>
        </div>
      </div>
      <div className="page-grid">
        <section className="page-panel">
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

        <section className="page-panel">
        <div className="tab-line section-heading"><span>알림 기준</span></div>
        <table className="page-table"><tbody><tr><th>특장 온도 상한</th><td><input className="setting-input" aria-label="특장 온도 상한" type="number" value={settings.temperatureLimit} step="0.5" min="-50" max="50" onChange={(event) => isRemote ? updateRemote('temperatureLimit', Number(event.target.value)) : updateMock('temperatureLimit', Number(event.target.value))} /> ℃</td></tr><tr><th>ETA 지연 알림</th><td><input className="setting-input" aria-label="ETA 지연 알림" type="number" min="1" max="240" value={settings.etaDelayMinutes} onChange={(event) => isRemote ? updateRemote('etaDelayMinutes', Number(event.target.value)) : updateMock('etaDelayMinutes', Number(event.target.value))} /> 분 이상</td></tr><tr><th>GPS 미수신 알림</th><td><input className="setting-input" aria-label="GPS 미수신 알림" type="number" min="5" max="3600" value={settings.gpsSilenceSeconds} onChange={(event) => isRemote ? updateRemote('gpsSilenceSeconds', Number(event.target.value)) : updateMock('gpsSilenceSeconds', Number(event.target.value))} /> 초 이상</td></tr><tr><th>도착 후 대기시간</th><td><input className="setting-input" aria-label="도착 후 대기시간" type="number" min="0" max="240" value={settings.dwellMinutes} onChange={(event) => isRemote ? updateRemote('dwellMinutes', Number(event.target.value)) : updateMock('dwellMinutes', Number(event.target.value))} /> 분</td></tr></tbody></table>
        </section>
        <section className="page-panel">
        <div className="tab-line section-heading"><span>알림 수신</span></div>
        <table className="page-table"><tbody><tr><th>온도 경고</th><td><label><input type="checkbox" checked={settings.showTemperatureAlerts} onChange={(event) => isRemote ? updateRemote('showTemperatureAlerts', event.target.checked) : updateMock('showTemperatureAlerts', event.target.checked)} /> 관제 화면 표시</label></td></tr><tr><th>배송 지연</th><td><label><input type="checkbox" checked={settings.forwardDelayAlerts} onChange={(event) => isRemote ? updateRemote('forwardDelayAlerts', event.target.checked) : updateMock('forwardDelayAlerts', event.target.checked)} /> 배송원에게 전달</label></td></tr><tr><th>증빙 누락</th><td><label><input type="checkbox" checked={settings.recordMissingProof} onChange={(event) => isRemote ? updateRemote('recordMissingProof', event.target.checked) : updateMock('recordMissingProof', event.target.checked)} /> 기록 페이지에 표시</label></td></tr></tbody></table>
        </section>
      </div>
    </>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '설정 저장에 실패했습니다.';
}
