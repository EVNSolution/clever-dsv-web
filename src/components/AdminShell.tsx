import type { ReactElement } from 'react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { adminTabs } from '../app-routes';
import type { AdminPath } from '../app-routes';
import { apiConfig } from '../api/config';
import { NotificationIsland } from './NotificationIsland';
import { ControlPage, ControlPreviewPanels } from '../pages/ControlPage';
import { AdminContent } from '../pages/AdminContent';
import { MapPreview } from './MapPreview';
import {
  loadAdminSettings,
  loadRemoteOperationalSettings,
} from '../services/settings';
import type { AdminSettings } from '../services/settings';
import type { DepartureLocation } from './DepartureMarker';

const MapCanvas = lazy(() => import('./MapCanvas').then((module) => ({ default: module.MapCanvas })));
const compactNavigationQuery = '(max-width: 768px)';

export function AdminShell({
  activePath,
  onNavigate,
  onLogout,
  previewOnly = false,
}: {
  activePath: AdminPath;
  onNavigate: (path: AdminPath) => void;
  onLogout: () => void;
  previewOnly?: boolean;
}): ReactElement {
  const activeTab = adminTabs.find((tab) => tab.path === activePath) ?? adminTabs[0];
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [navigationExpanded, setNavigationExpanded] = useState(false);
  const [basemapReady, setBasemapReady] = useState(false);
  const [departureLocation, setDepartureLocation] = useState<DepartureLocation | null>(null);

  useEffect(() => {
    const compactViewport = window.matchMedia(compactNavigationQuery);
    const closeNavigationOutsideCompactViewport = (event: MediaQueryListEvent) => {
      if (!event.matches) setNavigationExpanded(false);
    };
    compactViewport.addEventListener('change', closeNavigationOutsideCompactViewport);
    return () => compactViewport.removeEventListener('change', closeNavigationOutsideCompactViewport);
  }, []);

  useEffect(() => {
    const compactViewport = window.matchMedia(compactNavigationQuery).matches;
    document.body.classList.toggle('mobile-navigation-open', compactViewport && navigationExpanded);
    if (!compactViewport || !navigationExpanded) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavigationExpanded(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.body.classList.remove('mobile-navigation-open');
    };
  }, [navigationExpanded]);

  useEffect(() => {
    if (activePath === '/control') setBasemapReady(false);
  }, [activePath, previewOnly]);

  useEffect(() => {
    if (activePath !== '/control' || previewOnly) {
      setDepartureLocation(null);
      return undefined;
    }
    let cancelled = false;
    const applySettings = (settings: AdminSettings) => {
      if (!cancelled) setDepartureLocation(departureLocationFrom(settings));
    };
    if (apiConfig.mode === 'mock') {
      applySettings(loadAdminSettings());
      return () => {
        cancelled = true;
      };
    }
    loadRemoteOperationalSettings()
      .then(applySettings)
      .catch(() => {
        if (!cancelled) setDepartureLocation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activePath, previewOnly]);

  return (
    <main className={`page${activePath === '/control' ? '' : ' static-page'}${navigationExpanded ? ' nav-expanded' : ''}`}>
      <nav className="left-tabs overlay-scroll" id="primaryNavigation" aria-label="주 메뉴">
        <button
          className="sidebar-brand"
          type="button"
          aria-controls="primaryNavigation"
          aria-expanded={navigationExpanded}
          aria-label={navigationExpanded ? 'C 버튼으로 사이드바 접기' : '사이드바 펼치기'}
          onClick={() => setNavigationExpanded((expanded) => !expanded)}
        >
          <span className="sidebar-brand-mark" aria-hidden="true">C</span>
          <h1 className="sidebar-brand-title">CLEVER DSV</h1>
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
              if (window.matchMedia(compactNavigationQuery).matches) setNavigationExpanded(false);
              onNavigate(tab.path);
            }}
          >
            <span className="main-tab-copy"><strong>{tab.label}</strong><small aria-hidden="true">{tab.navDescription}</small></span>
          </a>
        ))}
        <button className="sidebar-logout" type="button" aria-label="로그아웃" onClick={onLogout}>
          <LogOut aria-hidden="true" />
          <span>로그아웃</span>
        </button>
        {navigationExpanded ? (
          <button
            className="sidebar-collapse-rail"
            type="button"
            aria-controls="primaryNavigation"
            aria-expanded="true"
            aria-label="사이드바 접기"
            onClick={() => setNavigationExpanded(false)}
          >
            <span aria-hidden="true" />
          </button>
        ) : null}
      </nav>

      <div className="top-cluster">
        {activePath === '/control' ? <NotificationIsland
          open={notificationOpen}
          onToggle={() => setNotificationOpen((open) => !open)}
          onClose={() => setNotificationOpen(false)}
          onVehicleLookup={() => {
            onNavigate('/control');
            setNotificationOpen(false);
          }}
        /> : null}
      </div>

      <section className="grid" aria-label="배송 관제">
        {activePath === '/control' ? (
          previewOnly
            ? <MapFallback />
            : (
              <Suspense fallback={<MapFallback />}>
                <MapCanvas
                  ariaLabel="관리자 관제 지도 - OpenFreeMap"
                  departureLocation={departureLocation}
                  onReady={() => setBasemapReady(true)}
                />
              </Suspense>
            )
        ) : null}
        {activePath === '/control'
          ? (previewOnly || !basemapReady ? <ControlPreviewPanels /> : <ControlPage />)
          : <AdminContent activePath={activePath} title={activeTab.title} description={activeTab.description} />}
      </section>
    </main>
  );
}

function MapFallback(): ReactElement {
  return (
    <article className="card map-card" aria-busy="true" aria-label="지도 불러오는 중">
      <div className="map-wrap"><MapPreview /></div>
    </article>
  );
}

function departureLocationFrom(settings: AdminSettings): DepartureLocation | null {
  const {
    departureAddress: address,
    departureLatitude: latitude,
    departureLongitude: longitude,
  } = settings;
  return address.trim() !== ''
    && latitude !== null
    && longitude !== null
    ? { address, latitude, longitude }
    : null;
}
