import type { ReactElement } from 'react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
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
import type { DispatchListItem } from '../services/dispatch';
import { loadControlRoutes } from '../services/control-routes';
import type { ControlRouteResult } from '../services/control-routes';
import type { DepartureLocation } from './DepartureMarker';
import type { MapCanvasPoint, MapCanvasRoute, MapCanvasVehiclePoint } from './MapCanvas';

const MapCanvas = lazy(() => import('./MapCanvas').then((module) => ({ default: module.MapCanvas })));
const compactNavigationQuery = '(max-width: 768px)';
const controlVehiclePalette = [
  '#0066cc',
  '#c4458f',
  '#d56b1d',
  '#6f52b5',
  '#007f78',
  '#c4493d',
  '#8a5a44',
  '#2b7a9b',
  '#7a7f00',
  '#b33f62',
  '#4b6cb7',
  '#aa5a00',
  '#008f5a',
  '#7b4fa3',
  '#b84c8a',
  '#4e7d2a',
] as const;
type ControlRouteRequest = {
  color: string;
  id: string;
  orderIds: string[];
  vehicleId: string;
};

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
  const [controlSettings, setControlSettings] = useState<AdminSettings | null>(null);
  const [controlOrders, setControlOrders] = useState<DispatchListItem[]>([]);
  const [controlServiceDate, setControlServiceDate] = useState<string>();
  const [selectedControlVehicleId, setSelectedControlVehicleId] = useState<string>();
  const [controlRouteResults, setControlRouteResults] = useState<ReadonlyMap<string, ControlRouteResult>>(new Map());
  const vehicleColors = useMemo(() => controlVehicleColors(controlOrders), [controlOrders]);
  const controlMapPoints = useMemo(
    () => assignedControlMapPoints(controlOrders, vehicleColors, selectedControlVehicleId),
    [controlOrders, selectedControlVehicleId, vehicleColors],
  );
  const controlRouteRequests = useMemo(
    () => assignedControlRouteRequests(controlOrders, vehicleColors),
    [controlOrders, vehicleColors],
  );
  const controlMapRoutes = useMemo(
    () => assignedControlMapRoutes(controlRouteRequests, controlRouteResults, selectedControlVehicleId),
    [controlRouteRequests, controlRouteResults, selectedControlVehicleId],
  );
  const controlEstimatedArrivalByOrderId = useMemo(
    () => configuredControlEtas(
      controlRouteRequests,
      controlRouteResults,
      controlServiceDate,
      controlSettings?.plannedDepartureTime,
      controlSettings?.dwellMinutes,
    ),
    [controlRouteRequests, controlRouteResults, controlServiceDate, controlSettings],
  );
  const controlVehiclePoints = useMemo(
    () => scheduledControlVehiclePoints(controlOrders, departureLocation),
    [controlOrders, departureLocation],
  );
  const handleControlOrdersChange = useCallback((orders: DispatchListItem[], serviceDate?: string) => {
    setControlOrders(orders);
    setControlServiceDate(serviceDate);
  }, []);

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
    if (activePath === '/control') {
      setBasemapReady(false);
      return;
    }
    setControlOrders([]);
    setControlServiceDate(undefined);
    setSelectedControlVehicleId(undefined);
  }, [activePath, previewOnly]);

  useEffect(() => {
    if (
      selectedControlVehicleId !== undefined
      && !controlOrders.some((order) => order.vehicleId === selectedControlVehicleId)
    ) {
      setSelectedControlVehicleId(undefined);
    }
  }, [controlOrders, selectedControlVehicleId]);

  useEffect(() => {
    const controller = new AbortController();
    setControlRouteResults(new Map());
    if (controlServiceDate === undefined || controlRouteRequests.length === 0) return () => controller.abort();
    void loadControlRoutes(controlServiceDate, controller.signal)
      .then((routes) => {
        if (controller.signal.aborted) return;
        const requestedIds = new Set(controlRouteRequests.map((route) => route.id));
        setControlRouteResults(new Map([...routes].filter(([routePlanId]) => requestedIds.has(routePlanId))));
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setControlRouteResults(new Map());
        }
      });
    return () => controller.abort();
  }, [controlRouteRequests, controlServiceDate]);

  useEffect(() => {
    if (activePath !== '/control' || previewOnly) {
      setDepartureLocation(null);
      setControlSettings(null);
      return undefined;
    }
    let cancelled = false;
    const applySettings = (settings: AdminSettings) => {
      if (!cancelled) {
        setDepartureLocation(departureLocationFrom(settings));
        setControlSettings(settings);
      }
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
        if (!cancelled) {
          setDepartureLocation(null);
          setControlSettings(null);
        }
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
                  onPointSelect={(pointId) => {
                    const vehicleId = controlOrders.find((order) => order.sellerOrderId === pointId)?.vehicleId;
                    if (vehicleId !== null && vehicleId !== undefined) setSelectedControlVehicleId(vehicleId);
                  }}
                  onReady={() => setBasemapReady(true)}
                  points={controlMapPoints}
                  routes={controlMapRoutes}
                  selectedPointIds={selectedControlVehicleId === undefined ? [] : controlMapPoints.map((point) => point.id)}
                  vehicles={controlVehiclePoints}
                />
              </Suspense>
            )
        ) : null}
        {activePath === '/control'
          ? (previewOnly || !basemapReady
              ? <ControlPreviewPanels />
              : (
                <ControlPage
                  estimatedArrivalByOrderId={controlEstimatedArrivalByOrderId}
                  onOrdersChange={handleControlOrdersChange}
                  onVehicleSelect={(vehicleId) => setSelectedControlVehicleId((current) => current === vehicleId ? undefined : vehicleId)}
                  selectedVehicleId={selectedControlVehicleId}
                  vehicleColors={vehicleColors}
                />
              ))
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

function assignedControlMapPoints(
  orders: DispatchListItem[],
  vehicleColors: ReadonlyMap<string, string>,
  selectedVehicleId?: string,
): MapCanvasPoint[] {
  return orders.flatMap((order) => (
    order.assignmentStatus === 'ASSIGNED'
    && order.vehicleId !== null
    && (selectedVehicleId === undefined || order.vehicleId === selectedVehicleId)
    && order.latitude !== null
    && order.longitude !== null
    && Number.isFinite(order.latitude)
    && Number.isFinite(order.longitude)
      ? [{
          color: vehicleColors.get(order.vehicleId) ?? controlVehiclePalette[0],
          id: order.sellerOrderId,
          label: order.routeStopSequence === null ? undefined : String(order.routeStopSequence),
          latitude: order.latitude,
          longitude: order.longitude,
          sortOrder: order.routeStopSequence ?? Number.MAX_SAFE_INTEGER,
          tone: 'assigned' as const,
        }]
      : []
  ));
}

function assignedControlRouteRequests(
  orders: DispatchListItem[],
  vehicleColors: ReadonlyMap<string, string>,
): ControlRouteRequest[] {
  const routeOrders = new Map<string, DispatchListItem[]>();
  for (const order of orders) {
    if (
      order.assignmentStatus !== 'ASSIGNED'
      || order.vehicleId === null
      || order.latitude === null
      || order.longitude === null
      || !Number.isFinite(order.latitude)
      || !Number.isFinite(order.longitude)
    ) continue;
    const routeId = order.routePlanId ?? order.vehicleId;
    routeOrders.set(routeId, [...(routeOrders.get(routeId) ?? []), order]);
  }
  return [...routeOrders].map(([routeId, groupedOrders]) => {
    const orderedStops = [...groupedOrders].sort((left, right) => (
      (left.routeStopSequence ?? Number.MAX_SAFE_INTEGER)
      - (right.routeStopSequence ?? Number.MAX_SAFE_INTEGER)
    ));
    const vehicleId = orderedStops[0]?.vehicleId;
    return {
      color: vehicleId === null || vehicleId === undefined
        ? controlVehiclePalette[0]
        : vehicleColors.get(vehicleId) ?? controlVehiclePalette[0],
      id: routeId,
      orderIds: orderedStops.map((order) => order.sellerOrderId),
      vehicleId: vehicleId ?? '',
    };
  });
}

function assignedControlMapRoutes(
  requests: ControlRouteRequest[],
  results: ReadonlyMap<string, ControlRouteResult>,
  selectedVehicleId?: string,
): MapCanvasRoute[] {
  return requests.flatMap((request) => {
    const coordinates = results.get(request.id)?.coordinates;
    return coordinates !== undefined
      && (selectedVehicleId === undefined || request.vehicleId === selectedVehicleId)
      ? [{
          color: request.color,
          coordinates,
          id: request.id,
          selected: selectedVehicleId !== undefined,
        }]
      : [];
  });
}

function configuredControlEtas(
  requests: ControlRouteRequest[],
  results: ReadonlyMap<string, ControlRouteResult>,
  serviceDate?: string,
  departureTime?: string,
  dwellMinutes?: number,
): ReadonlyMap<string, string> {
  if (
    serviceDate === undefined
    || departureTime === undefined
    || !/^\d{4}-\d{2}-\d{2}$/u.test(serviceDate)
    || !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(departureTime)
  ) return new Map();
  const startAt = new Date(`${serviceDate}T${departureTime}:00+09:00`);
  if (Number.isNaN(startAt.getTime())) return new Map();
  const stopMinutes = typeof dwellMinutes === 'number' && Number.isFinite(dwellMinutes) && dwellMinutes >= 0
    ? dwellMinutes
    : 0;
  const estimates = new Map<string, string>();
  for (const request of requests) {
    const durations = results.get(request.id)?.legDurationsSeconds ?? [];
    let cursorMs = startAt.getTime();
    for (const [index, orderId] of request.orderIds.entries()) {
      const durationSeconds = durations[index];
      if (durationSeconds === undefined || durationSeconds === null) break;
      cursorMs += durationSeconds * 1000;
      estimates.set(orderId, new Date(cursorMs).toISOString());
      cursorMs += stopMinutes * 60_000;
    }
  }
  return estimates;
}

function controlVehicleColors(orders: DispatchListItem[]): ReadonlyMap<string, string> {
  const vehicleIds = [...new Set(orders.flatMap((order) => (
    order.assignmentStatus === 'ASSIGNED' && order.vehicleId !== null ? [order.vehicleId] : []
  )))].sort();
  return new Map(vehicleIds.map((vehicleId, index) => [
    vehicleId,
    controlVehiclePalette[index % controlVehiclePalette.length],
  ]));
}

function scheduledControlVehiclePoints(
  orders: DispatchListItem[],
  departureLocation: DepartureLocation | null,
): MapCanvasVehiclePoint[] {
  if (departureLocation === null) return [];
  const vehicleIds = new Set(
    orders.flatMap((order) => (
      order.assignmentStatus === 'ASSIGNED' && order.vehicleId !== null
        ? [order.vehicleId]
        : []
    )),
  );
  if (vehicleIds.size === 0) return [];
  return [{
    id: 'scheduled-vehicles',
    label: `${vehicleIds.size}대 예정`,
    latitude: departureLocation.latitude,
    longitude: departureLocation.longitude,
  }];
}
