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
import { loadVehicleGpsTrailHistory } from '../services/control';
import type { VehicleGpsTrailHistory } from '../services/control';
import type { ManagementData } from '../demo/management';
import type { DepartureLocation } from './DepartureMarker';
import type { MapCanvasCenterRequest, MapCanvasPoint, MapCanvasRoute, MapCanvasVehiclePoint } from './MapCanvas';
import {
  assignControlDestinationProgress,
  CONTROL_PROGRESS_COLORS,
  splitControlRouteByProgress,
} from '../features/control/control-progress';
import type { ControlProgressStatus } from '../features/control/control-progress';
import {
  controlVehicleColor,
  controlVehicleColorMap,
  controlVehicleDisplayColor,
  controlVehicleOrderCounts,
  visibleControlVehicles,
} from '../features/control/control-vehicles';
import type { ControlVehicleVisibility } from '../features/control/control-vehicles';

const MapCanvas = lazy(() => import('./MapCanvas').then((module) => ({ default: module.MapCanvas })));
const compactNavigationQuery = '(max-width: 768px)';
type ControlRouteRequest = {
  color: string;
  id: string;
  stops: ControlRouteStopRequest[];
  vehicleId: string;
};
type ControlRouteStopRequest = {
  coordinate: [number, number];
  orderIds: string[];
  progressStatus: ControlProgressStatus;
};

export function AdminShell({
  activePath,
  onNavigate,
  onLogout,
  principalId = null,
  principalScopes = [],
  previewOnly = false,
}: {
  activePath: AdminPath;
  onNavigate: (path: AdminPath) => void;
  onLogout: () => void;
  principalId?: string | null;
  principalScopes?: readonly string[];
  previewOnly?: boolean;
}): ReactElement {
  const activeTab = adminTabs.find((tab) => tab.path === activePath) ?? adminTabs[0];
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [navigationExpanded, setNavigationExpanded] = useState(false);
  const [departureLocation, setDepartureLocation] = useState<DepartureLocation | null>(null);
  const [controlSettings, setControlSettings] = useState<AdminSettings | null>(null);
  const [controlManagement, setControlManagement] = useState<ManagementData>();
  const [controlOrders, setControlOrders] = useState<DispatchListItem[]>([]);
  const [controlServiceDate, setControlServiceDate] = useState<string>();
  const [controlVehicleVisibility, setControlVehicleVisibility] = useState<ControlVehicleVisibility>('ALL');
  const [selectedControlVehicleId, setSelectedControlVehicleId] = useState<string>();
  const [selectedControlDestinationId, setSelectedControlDestinationId] = useState<string>();
  const [controlMapCenterRequest, setControlMapCenterRequest] = useState<MapCanvasCenterRequest>();
  const [controlRouteResults, setControlRouteResults] = useState<ReadonlyMap<string, ControlRouteResult>>(new Map());
  const [controlVehicleTrail, setControlVehicleTrail] = useState<VehicleGpsTrailHistory>();
  const vehicleColors = useMemo(
    () => controlVehicleColorMap(controlManagement?.vehicles ?? [], controlOrders),
    [controlManagement, controlOrders],
  );
  const controlMapPoints = useMemo(
    () => assignedControlMapPoints(controlOrders, vehicleColors, selectedControlVehicleId),
    [controlOrders, selectedControlVehicleId, vehicleColors],
  );
  const controlRouteRequests = useMemo(
    () => assignedControlRouteRequests(controlOrders, vehicleColors),
    [controlOrders, vehicleColors],
  );
  const controlMapRoutes = useMemo(
    () => assignedControlMapRoutes(
      controlRouteRequests,
      controlRouteResults,
      isTodayInSeoul(controlServiceDate) ? controlManagement : undefined,
      selectedControlVehicleId,
    ),
    [controlManagement, controlRouteRequests, controlRouteResults, controlServiceDate, selectedControlVehicleId],
  );
  const controlTrailRoutes = useMemo(
    () => controlVehicleTrail === undefined ? [] : vehicleGpsTrailMapRoutes(controlVehicleTrail),
    [controlVehicleTrail],
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
    () => isTodayInSeoul(controlServiceDate)
      ? controlVehicleMapPoints(controlOrders, departureLocation, vehicleColors, controlVehicleVisibility, controlManagement)
      : [],
    [controlManagement, controlOrders, controlServiceDate, controlVehicleVisibility, departureLocation, vehicleColors],
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
    if (activePath === '/control') return;
    setControlOrders([]);
    setControlServiceDate(undefined);
    setControlManagement(undefined);
    setSelectedControlVehicleId(undefined);
    setSelectedControlDestinationId(undefined);
  }, [activePath, previewOnly]);

  useEffect(() => {
    if (
      selectedControlVehicleId !== undefined
      && (
        !controlManagement?.vehicles.some((vehicle) => vehicle.id === selectedControlVehicleId)
        || (
          controlVehicleVisibility === 'WITH_ORDERS'
          && !controlOrders.some((order) => order.assignmentStatus === 'ASSIGNED' && order.vehicleId === selectedControlVehicleId)
        )
      )
    ) {
      setSelectedControlVehicleId(undefined);
      setSelectedControlDestinationId(undefined);
    }
  }, [controlManagement, controlOrders, controlVehicleVisibility, selectedControlVehicleId]);

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
    const controller = new AbortController();
    setControlVehicleTrail(undefined);
    if (
      apiConfig.mode !== 'remote'
      || selectedControlVehicleId === undefined
      || controlServiceDate === undefined
    ) return () => controller.abort();
    void loadVehicleGpsTrailHistory(selectedControlVehicleId, controlServiceDate, controller.signal)
      .then((history) => {
        if (!controller.signal.aborted) setControlVehicleTrail(history);
      })
      .catch(() => {
        if (!controller.signal.aborted) setControlVehicleTrail(undefined);
      });
    return () => controller.abort();
  }, [controlServiceDate, selectedControlVehicleId]);

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
                  centerRequest={controlMapCenterRequest}
                  departureLocation={departureLocation}
                  onPointSelect={(pointId) => {
                    const vehicleId = controlOrders.find((order) => order.destinationId === pointId)?.vehicleId;
                    if (vehicleId !== null && vehicleId !== undefined) {
                      setSelectedControlVehicleId(vehicleId);
                      setSelectedControlDestinationId(pointId);
                    }
                  }}
                  onVehicleSelect={(vehicleId) => {
                    setSelectedControlDestinationId(undefined);
                    setSelectedControlVehicleId(vehicleId);
                  }}
                  points={controlMapPoints}
                  routes={[...controlMapRoutes, ...controlTrailRoutes]}
                  selectedPointId={selectedControlDestinationId}
                  showEveryPoint={selectedControlVehicleId !== undefined}
                  vehicles={controlVehiclePoints}
                />
              </Suspense>
            )
        ) : null}
        {activePath === '/control'
          ? (previewOnly
              ? <ControlPreviewPanels />
              : (
                <ControlPage
                  estimatedArrivalByOrderId={controlEstimatedArrivalByOrderId}
                  onManagementChange={setControlManagement}
                  onOrdersChange={handleControlOrdersChange}
                  onDestinationSelect={setSelectedControlDestinationId}
                  onVehicleSelect={(vehicleId) => {
                    setSelectedControlDestinationId(undefined);
                    setSelectedControlVehicleId((current) => current === vehicleId ? undefined : vehicleId);
                  }}
                  onVehicleCenter={(latitude, longitude) => {
                    setControlMapCenterRequest((current) => ({
                      id: (current?.id ?? 0) + 1,
                      latitude,
                      longitude,
                    }));
                  }}
                  selectedDestinationId={selectedControlDestinationId}
                  selectedVehicleId={selectedControlVehicleId}
                  vehicleColors={vehicleColors}
                  vehicleVisibility={controlVehicleVisibility}
                  onVehicleVisibilityChange={setControlVehicleVisibility}
                />
              ))
          : <AdminContent activePath={activePath} title={activeTab.title} description={activeTab.description} principalId={principalId} principalScopes={principalScopes} />}
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
  return groupAssignedControlDestinations(orders, selectedVehicleId).flatMap(({ orders: group, progressStatus, sequence }) => {
    const anchor = group.find((order) => (
      order.latitude !== null
      && order.longitude !== null
      && Number.isFinite(order.latitude)
      && Number.isFinite(order.longitude)
    ));
    if (anchor === undefined || anchor.latitude === null || anchor.longitude === null || anchor.vehicleId === null) return [];
    return [{
      color: selectedVehicleId === undefined
        ? vehicleColors.get(anchor.vehicleId) ?? controlVehicleColor(anchor.vehicleId)
        : CONTROL_PROGRESS_COLORS[progressStatus],
      id: anchor.destinationId,
      label: String(sequence),
      latitude: anchor.latitude,
      longitude: anchor.longitude,
      sortOrder: sequence,
      tone: 'assigned' as const,
    }];
  });
}

function assignedControlRouteRequests(
  orders: DispatchListItem[],
  vehicleColors: ReadonlyMap<string, string>,
): ControlRouteRequest[] {
  const routeOrders = new Map<string, Map<string, DispatchListItem[]>>();
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
    const destinationOrders = routeOrders.get(routeId) ?? new Map<string, DispatchListItem[]>();
    destinationOrders.set(order.destinationId, [...(destinationOrders.get(order.destinationId) ?? []), order]);
    routeOrders.set(routeId, destinationOrders);
  }
  return [...routeOrders].map(([routeId, destinationOrders]) => {
    const orderedStops = [...destinationOrders.entries()]
      .map(([destinationId, groupedOrders]) => ({
        destinationId,
        orders: [...groupedOrders].sort(compareControlRouteStops),
        sequence: firstControlSequence(groupedOrders),
      }))
      .sort((left, right) => {
        const sequenceOrder = (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER);
        if (sequenceOrder !== 0) return sequenceOrder;
        return left.destinationId.localeCompare(right.destinationId, 'ko');
      });
    const progressStops = assignControlDestinationProgress(orderedStops);
    const vehicleId = orderedStops[0]?.orders[0]?.vehicleId;
    return {
      color: vehicleId === null || vehicleId === undefined
        ? '#0066cc'
        : vehicleColors.get(vehicleId) ?? controlVehicleColor(vehicleId),
      id: routeId,
      stops: progressStops.flatMap((stop) => {
        const anchor = stop.orders.find((order) => order.latitude !== null && order.longitude !== null);
        return anchor?.latitude === null || anchor?.latitude === undefined || anchor.longitude === null
          ? []
          : [{
              coordinate: [anchor.longitude, anchor.latitude] as [number, number],
              orderIds: stop.orders.map((order) => order.sellerOrderId),
              progressStatus: stop.progressStatus,
            }];
      }),
      vehicleId: vehicleId ?? '',
    };
  });
}

function assignedControlMapRoutes(
  requests: ControlRouteRequest[],
  results: ReadonlyMap<string, ControlRouteResult>,
  management?: ManagementData,
  selectedVehicleId?: string,
): MapCanvasRoute[] {
  return requests.flatMap((request) => {
    const coordinates = results.get(request.id)?.coordinates;
    if (coordinates === undefined || (selectedVehicleId !== undefined && request.vehicleId !== selectedVehicleId)) return [];
    if (selectedVehicleId === undefined) return [{ color: request.color, coordinates, id: request.id }];
    const vehicle = management?.vehicles.find((item) => item.id === request.vehicleId);
    const vehiclePosition = vehicle !== undefined
      && vehicle.vehiclePositionStale !== true
      && typeof vehicle.vehicleLongitude === 'number'
      && typeof vehicle.vehicleLatitude === 'number'
      && Number.isFinite(vehicle.vehicleLongitude)
      && Number.isFinite(vehicle.vehicleLatitude)
      ? [vehicle.vehicleLongitude, vehicle.vehicleLatitude] as [number, number]
      : undefined;
    return splitControlRouteByProgress({ coordinates, stops: request.stops, vehiclePosition }).map((segment, index) => ({
      color: CONTROL_PROGRESS_COLORS[segment.status],
      coordinates: segment.coordinates,
      id: `${request.id}:${segment.status}`,
      selected: true,
      sortOrder: index,
    }));
  });
}

function vehicleGpsTrailMapRoutes(history: VehicleGpsTrailHistory): MapCanvasRoute[] {
  const sessions = [...history.sessions].sort((left, right) => {
    const timeOrder = Date.parse(left.startedAt) - Date.parse(right.startedAt);
    return timeOrder === 0 ? left.sessionIndex - right.sessionIndex : timeOrder;
  });
  return sessions.flatMap((session, sessionOrder) => session.segments.map((segment, segmentOrder) => ({
    casingColor: '#ffffff',
    color: '#d92d20',
    coordinates: segment.samples.map((sample) => [sample.longitude, sample.latitude] as [number, number]),
    dashed: true,
    endMarker: segmentOrder < session.segments.length - 1 ? 'interrupted' as const : 'end' as const,
    id: `vehicle-trail:${session.routePlanId}:${session.sessionIndex}:${segmentOrder}`,
    selected: true,
    sortOrder: 200 + sessionOrder * 10 + segmentOrder,
    startMarker: sessionOrder === 0 && segmentOrder === 0 ? 'start' as const : 'restart' as const,
  })));
}

function isTodayInSeoul(serviceDate?: string): boolean {
  if (serviceDate === undefined) return true;
  const today = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Seoul',
    year: 'numeric',
  }).format(new Date());
  return serviceDate === today;
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
    for (const [index, stop] of request.stops.entries()) {
      const durationSeconds = durations[index];
      if (durationSeconds === undefined || durationSeconds === null) break;
      cursorMs += durationSeconds * 1000;
      const estimatedArrivalAt = new Date(cursorMs).toISOString();
      for (const orderId of stop.orderIds) estimates.set(orderId, estimatedArrivalAt);
      cursorMs += stopMinutes * 60_000;
    }
  }
  return estimates;
}

function groupAssignedControlDestinations(
  orders: DispatchListItem[],
  selectedVehicleId?: string,
): Array<{ orders: DispatchListItem[]; progressStatus: ControlProgressStatus; sequence: number }> {
  const vehicleGroups = new Map<string, Map<string, DispatchListItem[]>>();
  for (const order of orders) {
    if (
      order.assignmentStatus !== 'ASSIGNED'
      || order.vehicleId === null
      || (selectedVehicleId !== undefined && order.vehicleId !== selectedVehicleId)
    ) continue;
    const destinationGroups = vehicleGroups.get(order.vehicleId) ?? new Map<string, DispatchListItem[]>();
    destinationGroups.set(order.destinationId, [...(destinationGroups.get(order.destinationId) ?? []), order]);
    vehicleGroups.set(order.vehicleId, destinationGroups);
  }
  return [...vehicleGroups.values()].flatMap((destinationGroups) => {
    const groups = [...destinationGroups.values()]
      .map((group) => [...group].sort(compareControlRouteStops))
      .sort((left, right) => compareControlRouteStops(left[0], right[0]))
      .map((group, index) => ({ orders: group, sequence: index + 1 }));
    return assignControlDestinationProgress(groups);
  });
}

function firstControlSequence(orders: DispatchListItem[]): number | null {
  return [...orders]
    .map((order) => order.routeStopSequence)
    .filter((sequence): sequence is number => sequence !== null)
    .sort((left, right) => left - right)[0] ?? null;
}

function compareControlRouteStops(left: DispatchListItem, right: DispatchListItem): number {
  const sequenceOrder = (left.routeStopSequence ?? Number.MAX_SAFE_INTEGER) - (right.routeStopSequence ?? Number.MAX_SAFE_INTEGER);
  if (sequenceOrder !== 0) return sequenceOrder;
  return left.sellerOrderKey.localeCompare(right.sellerOrderKey, 'ko');
}

function controlVehicleMapPoints(
  orders: DispatchListItem[],
  departureLocation: DepartureLocation | null,
  vehicleColors: ReadonlyMap<string, string>,
  visibility: ControlVehicleVisibility,
  management?: ManagementData,
): MapCanvasVehiclePoint[] {
  const orderCounts = controlVehicleOrderCounts(orders);
  const vehicles = visibleControlVehicles(management?.vehicles ?? [], orderCounts, visibility);
  const positionedVehicles = vehicles.flatMap((vehicle) => {
    const { vehicleLatitude: latitude, vehicleLongitude: longitude } = vehicle;
    if (
      typeof latitude !== 'number'
      || typeof longitude !== 'number'
      || !Number.isFinite(latitude)
      || !Number.isFinite(longitude)
      || latitude < -90
      || latitude > 90
      || longitude < -180
      || longitude > 180
    ) return [];
    const orderCount = orderCounts.get(vehicle.id) ?? 0;
    return [{
      color: controlVehicleDisplayColor(vehicle.id, orderCounts, vehicleColors),
      id: vehicle.id,
      label: vehicle.plate || vehicle.type || '차량 위치',
      latitude,
      longitude,
    }];
  });
  const positionedVehicleIds = new Set(positionedVehicles.map((vehicle) => vehicle.id));
  const fallbackCount = vehicles.filter((vehicle) => (
    (orderCounts.get(vehicle.id) ?? 0) > 0 && !positionedVehicleIds.has(vehicle.id)
  )).length;
  if (departureLocation === null || fallbackCount === 0) return positionedVehicles;
  return [
    ...positionedVehicles,
    {
      id: 'scheduled-vehicles',
      label: `${fallbackCount}대 예정`,
      latitude: departureLocation.latitude,
      longitude: departureLocation.longitude,
    },
  ];
}
