import type { ReactElement } from 'react';

export type DestinationDisplayMode = 'point' | 'marker';
export type MapViewMode = '2d' | '3d';
export type ShellControlsState = { destinationMode: DestinationDisplayMode; mapMode: MapViewMode };
export const defaultShellControls: ShellControlsState = { destinationMode: 'marker', mapMode: '2d' };

export function ProductHeader({
  title,
  section,
  onHome,
  showDestinationMode = true,
  controls,
  onChange,
}: {
  title: string;
  section?: string;
  onHome?: () => void;
  showDestinationMode?: boolean;
  controls?: ShellControlsState;
  onChange: (next: ShellControlsState) => void;
}): ReactElement {
  return (
    <header className="app-header">
      <button className="brand-home" type="button" onClick={onHome} aria-label="관제 홈으로 이동">
        <span className="brand-mark" aria-hidden="true">C</span>
        <span className="brand-copy"><h1>{title}</h1>{section ? <small>{section}</small> : null}</span>
      </button>
      {controls ? <MapToolbar controls={controls} onChange={onChange} showDestinationMode={showDestinationMode} /> : null}
    </header>
  );
}

export function MapToolbar({ controls, onChange, showDestinationMode = true }: { controls: ShellControlsState; onChange: (next: ShellControlsState) => void; showDestinationMode?: boolean }): ReactElement {
  return (
    <div className="map-toolbar" aria-label="지도 표시 설정">
      {showDestinationMode ? (
        <div className="segmented destination-mode" aria-label="배송지 표기 방식">
          <button type="button" className={controls.destinationMode === 'marker' ? 'active' : ''} aria-pressed={controls.destinationMode === 'marker'} onClick={() => onChange({ ...controls, destinationMode: 'marker' })}>마커</button>
          <button type="button" className={controls.destinationMode === 'point' ? 'active' : ''} aria-pressed={controls.destinationMode === 'point'} onClick={() => onChange({ ...controls, destinationMode: 'point' })}>포인트</button>
        </div>
      ) : null}
      <div className="segmented" aria-label="지도 보기 방식">
        <button type="button" className={controls.mapMode === '2d' ? 'active' : ''} aria-pressed={controls.mapMode === '2d'} onClick={() => onChange({ ...controls, mapMode: '2d' })}>2D</button>
        <button type="button" className={controls.mapMode === '3d' ? 'active' : ''} aria-pressed={controls.mapMode === '3d'} onClick={() => onChange({ ...controls, mapMode: '3d' })}>3D</button>
      </div>
    </div>
  );
}
