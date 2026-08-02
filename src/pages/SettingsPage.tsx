import type { ReactElement } from 'react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { apiConfig } from '../api/config';
import { AdminPageHeader, AdminSectionHeader } from '../components/AdminUi';
import { MapPreview } from '../components/MapPreview';
import {
  defaultAdminSettings,
  geocodeDepartureAddress,
  loadAdminSettings,
  loadRemoteOperationalSettings,
  saveAdminSettings,
  saveRemoteOperationalSettings,
} from '../services/settings';
import type { AdminSettings, OperationalSettings } from '../services/settings';

const DepartureLocationMap = lazy(() => import('../components/DepartureLocationMap').then((module) => ({ default: module.DepartureLocationMap })));

type LoadState = 'error' | 'loading' | 'ready';
type SaveState = 'error' | 'idle' | 'saving' | 'saved';
type GeocodeState = 'error' | 'idle' | 'loading' | 'resolved';

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
  const [geocodeState, setGeocodeState] = useState<GeocodeState>('idle');
  const [geocodeMessage, setGeocodeMessage] = useState('');
  const geocodeRequest = useRef(0);

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
        setLoadWarning('설정을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.');
        setLoadState('error');
      });
    return () => { active = false; };
  }, [isRemote, loadRequest]);

  const beginEdit = () => {
    setSaveState('idle');
    setSaveError('');
    setResetNotice('');
  };

  const updateLocation = (patch: Partial<Pick<AdminSettings, 'departureAddress' | 'departureLatitude' | 'departureLongitude'>>) => {
    geocodeRequest.current += 1;
    beginEdit();
    if (isRemote) setRemoteSettings((current) => ({ ...current, ...patch }));
    else setMockSettings((current) => ({ ...current, ...patch }));
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
      if (!validLocation(settings)) throw new Error('출발지 주소와 지도 좌표를 모두 설정해 주세요.');
      if (isRemote) await saveRemoteOperationalSettings(remoteSettings);
      else saveAdminSettings(mockSettings);
      setSaveState('saved');
    } catch (error) {
      setSaveError(errorMessage(error));
      setSaveState('error');
    }
  };

  const resetDraft = () => {
    geocodeRequest.current += 1;
    if (isRemote) setRemoteSettings(defaultOperationalSettings);
    else setMockSettings(defaultAdminSettings);
    setSaveState('idle');
    setSaveError('');
    setResetNotice('기본값으로 되돌렸습니다. 저장을 누르면 적용됩니다.');
    setGeocodeState('idle');
    setGeocodeMessage('');
  };

  const settings = isRemote ? remoteSettings : mockSettings;

  const searchDepartureAddress = async () => {
    const request = ++geocodeRequest.current;
    setGeocodeState('loading');
    setGeocodeMessage('');
    try {
      const result = await geocodeDepartureAddress(settings.departureAddress);
      if (request !== geocodeRequest.current) return;
      updateLocation({
        departureAddress: result.address,
        departureLatitude: result.latitude,
        departureLongitude: result.longitude,
      });
      setGeocodeState('resolved');
      setGeocodeMessage('주소 좌표를 확인했습니다.');
    } catch (error) {
      if (request !== geocodeRequest.current) return;
      setGeocodeState('error');
      setGeocodeMessage(errorMessage(error));
    }
  };

  return (
    <>
      <AdminPageHeader className="settings-hero" title={title} description={description} actions={(
        <div className="settings-header-tools">
          <div className="settings-feedback" aria-live="polite">
            {loadState === 'loading' ? <span role="status">설정을 불러오는 중입니다.</span> : null}
            {loadWarning ? <span role="status">{loadWarning} <button className="text-button" type="button" onClick={() => setLoadRequest((request) => request + 1)}>다시 불러오기</button></span> : null}
            {saveState === 'saved' ? <span role="status">설정을 저장했습니다.</span> : null}
            {saveState === 'error' ? <span className="error" role="alert">{saveError}</span> : null}
            {resetNotice ? <span role="status">{resetNotice}</span> : null}
          </div>
          <div className="settings-actions">
            <button className="btn" type="button" disabled={loadState !== 'ready' || saveState === 'saving'} onClick={resetDraft}>초기화</button>
            <button className="btn primary" type="button" disabled={loadState !== 'ready' || saveState === 'saving'} onClick={() => void saveDraft()}>
              {saveState === 'saving' ? '저장 중' : '저장'}
            </button>
          </div>
        </div>
      )} />
      {loadState === 'ready' ? <div className="page-grid">
        <section className="page-panel settings-location-panel wide">
          <div className="settings-location-grid">
            <div className="settings-location-fields">
              <AdminSectionHeader title="출발 위치" />
              <label className="settings-location-address">
                <span>주소</span>
                <span className="settings-location-address-control">
                  <input
                    aria-label="출발지 주소"
                    type="text"
                    value={settings.departureAddress}
                    onChange={(event) => {
                      updateLocation({
                        departureAddress: event.target.value,
                        departureLatitude: null,
                        departureLongitude: null,
                      });
                      setGeocodeState('idle');
                      setGeocodeMessage('');
                    }}
                  />
                  <button className="btn" type="button" disabled={geocodeState === 'loading' || settings.departureAddress.trim() === ''} onClick={() => void searchDepartureAddress()}>
                    {geocodeState === 'loading' ? '검색 중' : '주소 검색'}
                  </button>
                </span>
              </label>
              <div className="settings-coordinate-grid">
                <label>
                  <span>위도</span>
                  <input
                    aria-label="출발지 위도"
                    inputMode="decimal"
                    max="90"
                    min="-90"
                    step="any"
                    type="number"
                    value={settings.departureLatitude ?? ''}
                    onChange={(event) => updateLocation({ departureLatitude: coordinateInput(event.target.value, -90, 90) })}
                  />
                </label>
                <label>
                  <span>경도</span>
                  <input
                    aria-label="출발지 경도"
                    inputMode="decimal"
                    max="180"
                    min="-180"
                    step="any"
                    type="number"
                    value={settings.departureLongitude ?? ''}
                    onChange={(event) => updateLocation({ departureLongitude: coordinateInput(event.target.value, -180, 180) })}
                  />
                </label>
              </div>
              <p className="settings-location-help">지도를 클릭하거나 마커를 드래그해 정확한 출발 좌표를 지정합니다.</p>
              {geocodeMessage ? (
                <p className={`settings-location-message${geocodeState === 'error' ? ' error' : ''}`} role={geocodeState === 'error' ? 'alert' : 'status'}>
                  {geocodeMessage}
                </p>
              ) : null}
            </div>
            <Suspense fallback={<DepartureLocationMapFallback />}>
              <DepartureLocationMap
                address={settings.departureAddress}
                latitude={settings.departureLatitude}
                longitude={settings.departureLongitude}
                onChange={(latitude, longitude) => {
                  updateLocation({ departureLatitude: latitude, departureLongitude: longitude });
                  setGeocodeState('resolved');
                  setGeocodeMessage('지도에서 출발 좌표를 지정했습니다.');
                }}
              />
            </Suspense>
          </div>
        </section>
        <section className="page-panel">
        <AdminSectionHeader title="운영 시간" />
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
        <AdminSectionHeader title="알림 기준" />
        <table className="page-table"><tbody><tr><th>특장 온도 상한</th><td><input className="setting-input" aria-label="특장 온도 상한" type="number" value={settings.temperatureLimit} step="0.5" min="-50" max="50" onChange={(event) => isRemote ? updateRemote('temperatureLimit', Number(event.target.value)) : updateMock('temperatureLimit', Number(event.target.value))} /> ℃</td></tr><tr><th>ETA 지연 알림</th><td><input className="setting-input" aria-label="ETA 지연 알림" type="number" min="1" max="240" value={settings.etaDelayMinutes} onChange={(event) => isRemote ? updateRemote('etaDelayMinutes', Number(event.target.value)) : updateMock('etaDelayMinutes', Number(event.target.value))} /> 분 이상</td></tr><tr><th>GPS 미수신 알림</th><td><input className="setting-input" aria-label="GPS 미수신 알림" type="number" min="5" max="3600" value={settings.gpsSilenceSeconds} onChange={(event) => isRemote ? updateRemote('gpsSilenceSeconds', Number(event.target.value)) : updateMock('gpsSilenceSeconds', Number(event.target.value))} /> 초 이상</td></tr><tr><th>도착 후 대기시간</th><td><input className="setting-input" aria-label="도착 후 대기시간" type="number" min="0" max="240" value={settings.dwellMinutes} onChange={(event) => isRemote ? updateRemote('dwellMinutes', Number(event.target.value)) : updateMock('dwellMinutes', Number(event.target.value))} /> 분</td></tr></tbody></table>
        </section>
        <section className="page-panel">
        <AdminSectionHeader title="알림 수신" />
        <table className="page-table"><tbody><tr><th>온도 경고</th><td><label><input type="checkbox" checked={settings.showTemperatureAlerts} onChange={(event) => isRemote ? updateRemote('showTemperatureAlerts', event.target.checked) : updateMock('showTemperatureAlerts', event.target.checked)} /> 관제 화면 표시</label></td></tr><tr><th>배송 지연</th><td><label><input type="checkbox" checked={settings.forwardDelayAlerts} onChange={(event) => isRemote ? updateRemote('forwardDelayAlerts', event.target.checked) : updateMock('forwardDelayAlerts', event.target.checked)} /> 배송원에게 전달</label></td></tr><tr><th>증빙 누락</th><td><label><input type="checkbox" checked={settings.recordMissingProof} onChange={(event) => isRemote ? updateRemote('recordMissingProof', event.target.checked) : updateMock('recordMissingProof', event.target.checked)} /> 기록 페이지에 표시</label></td></tr></tbody></table>
        </section>
      </div> : null}
    </>
  );
}

function DepartureLocationMapFallback(): ReactElement {
  return (
    <div className="settings-location-map-shell" aria-label="출발 위치 지도" aria-busy="true">
      <MapPreview loading />
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '설정 저장에 실패했습니다.';
}

function coordinateInput(value: string, min: number, max: number): number | null {
  if (value.trim() === '') return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max ? coordinate : null;
}

function validLocation(settings: AdminSettings): boolean {
  return settings.departureAddress.trim() !== ''
    && settings.departureLatitude !== null
    && settings.departureLongitude !== null;
}
