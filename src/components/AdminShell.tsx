import type { ReactElement } from 'react';
import { lazy, Suspense, useState } from 'react';
import { adminTabs } from '../app-routes';
import type { AdminPath } from '../app-routes';
import { apiConfig } from '../api/config';
import { getControlPage } from '../dev-db/queries';
import { defaultShellControls, MapToolbar } from './MapControls';
import type { ShellControlsState } from './MapControls';
import { NotificationIsland } from './NotificationIsland';
import { ControlPage } from '../pages/ControlPage';
import { AdminContent } from '../pages/AdminContent';
import type { DeliveryStopSelection } from '../services/control';

const MapCanvas = lazy(() => import('./MapCanvas').then((module) => ({ default: module.MapCanvas })));

export function AdminShell({
  activePath,
  onNavigate,
}: {
  activePath: AdminPath;
  onNavigate: (path: AdminPath) => void;
}): ReactElement {
  const activeTab = adminTabs.find((tab) => tab.path === activePath) ?? adminTabs[0];
  const control = getControlPage();
  const [controls, setControls] = useState<ShellControlsState>(defaultShellControls);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [navigationExpanded, setNavigationExpanded] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState('depart01');
  const [spotlightVehicleId, setSpotlightVehicleId] = useState<string>();
  const [selectedDeliveryStop, setSelectedDeliveryStop] = useState<DeliveryStopSelection>();
  const [vehicleLookupRequest, setVehicleLookupRequest] = useState(0);
  return (
    <main className={`page map-${controls.mapMode} destination-${controls.destinationMode}${activePath === '/control' ? '' : ' static-page'}${navigationExpanded ? ' nav-expanded' : ''}`}>
      <nav className="left-tabs overlay-scroll" aria-label="주 메뉴">
        <button className="sidebar-brand" type="button" aria-expanded={navigationExpanded} aria-label={navigationExpanded ? '사이드바 접기' : '사이드바 펼치기'} onClick={() => setNavigationExpanded((expanded) => !expanded)}>
          <span className="sidebar-brand-mark" aria-hidden="true">C</span><h1 className="sidebar-brand-title">CLEVER DSV</h1><span className="sidebar-brand-toggle" aria-hidden="true" />
        </button>
        {adminTabs.map((tab) => (
          <a
            key={tab.path}
            className={`main-tab${tab.path === activePath ? ' active' : ''}`}
            href={tab.path}
            aria-label={tab.label}
            aria-current={tab.path === activePath ? 'page' : undefined}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(tab.path);
            }}
          >
            <span className="main-tab-copy"><strong>{tab.label}</strong><small aria-hidden="true">{tab.navDescription}</small></span>
          </a>
        ))}
      </nav>

      <div className="top-cluster">
        {activePath === '/control' ? <MapToolbar controls={controls} onChange={setControls} /> : null}
        {apiConfig.mode === 'mock' ? <NotificationIsland
          open={notificationOpen}
          onToggle={() => setNotificationOpen((open) => !open)}
          onClose={() => setNotificationOpen(false)}
          onVehicleLookup={(vehicleId) => {
            setSelectedVehicleId(vehicleId);
            setSpotlightVehicleId(vehicleId);
            setSelectedDeliveryStop(undefined);
            setVehicleLookupRequest((request) => request + 1);
            onNavigate('/control');
            setNotificationOpen(false);
          }}
        /> : null}
      </div>

      <section className="grid" aria-label="배송 관제">
        {activePath === '/control' ? (
          <Suspense fallback={<article className="card map-card" aria-label="지도 불러오는 중" />}>
            <MapCanvas
              ariaLabel={`관리자 관제 지도 - ${control.routeEngine.provider} ${control.routeEngine.endpoint}`}
              endpoint={control.routeEngine.endpoint}
              mapMode={controls.mapMode}
              destinationMode={controls.destinationMode}
              showOperationalLayers={apiConfig.mode === 'mock'}
              vehicleId={spotlightVehicleId}
              showFleetOverview
              selectedDeliveryStop={selectedDeliveryStop}
              onVehicleSelect={(vehicleId) => {
                setSelectedVehicleId(vehicleId);
                setSpotlightVehicleId(vehicleId);
                setSelectedDeliveryStop(undefined);
              }}
              onDeliveryStopSelect={(selection) => {
                setSelectedVehicleId(selection.vehicleId);
                setSpotlightVehicleId(selection.vehicleId);
                setSelectedDeliveryStop(selection);
              }}
            />
          </Suspense>
        ) : null}
        {activePath === '/control' ? <ControlPage endpoint={control.routeEngine.endpoint} selectedVehicleId={selectedVehicleId} selectedDeliveryStop={selectedDeliveryStop} spotlightVehicleId={spotlightVehicleId} vehicleLookupRequest={vehicleLookupRequest} onSelectDeliveryStop={setSelectedDeliveryStop} onSelectVehicle={(vehicleId) => { setSelectedVehicleId(vehicleId); setSelectedDeliveryStop(undefined); setSpotlightVehicleId((current) => current === vehicleId ? undefined : vehicleId); }} /> : <AdminContent activePath={activePath} title={activeTab.title} description={activeTab.description} />}
      </section>
    </main>
  );
}
