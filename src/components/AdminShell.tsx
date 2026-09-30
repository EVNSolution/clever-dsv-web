import type { ReactElement } from 'react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, UserCog } from 'lucide-react';
import { adminTabs } from '../app-routes';
import type { AdminPath } from '../app-routes';
import type { Principal } from '../services/auth';
import { apiConfig } from '../api/config';
import { AdminCredentialDialog } from './AdminCredentialDialog';
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
import {
  controlTrailBounds,
  controlTrailSampleAt,
  visibleTrailGeometryLines,
  visibleTrailRawLines,
} from '../features/control/control-trail-playback';
import type { ManagementData } from '../demo/management';
import type { DepartureLocation } from './DepartureMarker';
import type { MapCanvasCenterRequest, MapCanvasPoint, MapCanvasRoute, MapCanvasVehiclePoint } from './MapCanvas';
import {
  assignControlDestinationProgress,
  CONTROL_PROGRESS_COLORS,
  splitControlRouteAtStop,
  splitControlRouteByProgress,
} from '../features/control/control-progress';
import { actualFirstLegLines, dailyRouteTrailLines } from '../features/control/control-daily-route';
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
  completedAt?: string;
  coordinate: [number, number];
  orderIds: string[];
  progressStatus: ControlProgressStatus;
};

export function AdminShell({
  activePath,
  onNavigate,
  onLogout,
  onSessionUpdate,
  principalId = null,
  principalScopes = [],
  previewOnly = false,
}: {
  activePath: AdminPath;
  onNavigate: (path: AdminPath) => void;
  onLogout: () => void;
  onSessionUpdate?: (principal: Principal) => void;
  principalId?: string | null;
  principalScopes?: readonly string[];
  previewOnly?: boolean;
}): ReactElement {
  const activeTab = adminTabs.find((tab) => tab.path === activePath) ?? adminTabs[0];
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [credentialMessage, setCredentialMessage] = useState('');
  const [navigationExpanded, setNavigationExpanded] = useState(false);
  const [departureLocation, setDepartureLocation] = useState<DepartureLocation | null>(null);
  const [, setControlSettings] = useState<AdminSettings | null>(null);
  const [controlManagement, setControlManagement] = useState<ManagementData>();
  const [controlOrders, setControlOrders] = useState<DispatchListItem[]>([]);
  const [controlServiceDate, setControlServiceDate] = useState<string>();
  const [controlVehicleVisibility, setControlVehicleVisibility] = useState<ControlVehicleVisibility>('ALL');
  const [selectedControlVehicleId, setSelectedControlVehicleId] = useState<string>();
  const [selectedControlDestinationId, setSelectedControlDestinationId] = useState<string>();
  const [controlMapCenterRequest, setControlMapCenterRequest] = useState<MapCanvasCenterRequest>();
  const [controlRouteResults, setControlRouteResults] = useState<ReadonlyMap<string, ControlRouteResult>>(new Map());
  const [controlVehicleTrail, setControlVehicleTrail] = useState<VehicleGpsTrailHistory>();
  const [controlVehicleTrailError, setControlVehicleTrailError] = useState('');
  const [controlTrailOpen, setControlTrailOpen] = useState(false);
  const [controlTrailCursorMs, setControlTrailCursorMs] = useState<number>();
  const [controlTrailPlaying, setControlTrailPlaying] = useState(false);
  const [controlTrailFollow, setControlTrailFollow] = useState(false);
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
  const controlDailyRouteCompletionKey = controlRouteRequests
    .filter((route) => route.vehicleId === selectedControlVehicleId)
    .map((route) => `${route.id}:${route.stops[0]?.completedAt ?? ''}`)
    .join('|');
  const controlMapRoutes = useMemo(
    () => assignedControlMapRoutes(
      controlRouteRequests,
      controlRouteResults,
      isTodayInSeoul(controlServiceDate) ? controlManagement : undefined,
      selectedControlVehicleId,
      controlVehicleTrail,
    ),
    [controlManagement, controlRouteRequests, controlRouteResults, controlServiceDate, controlVehicleTrail, selectedControlVehicleId],
  );
  const controlTrailRange = useMemo(() => controlTrailBounds(controlVehicleTrail), [controlVehicleTrail]);
  const controlTrailPlaybackSample = useMemo(
    () => controlTrailSampleAt(controlVehicleTrail, controlTrailOpen ? controlTrailCursorMs : undefined),
    [controlTrailCursorMs, controlTrailOpen, controlVehicleTrail],
  );
  const controlTrailRoutes = useMemo(
    () => controlVehicleTrail === undefined
      ? []
      : vehicleGpsTrailMapRoutes(controlVehicleTrail, controlTrailOpen ? controlTrailCursorMs : undefined),
    [controlTrailCursorMs, controlTrailOpen, controlVehicleTrail],
  );
  const controlVehiclePoints = useMemo(() => {
    const liveVehicles = isTodayInSeoul(controlServiceDate)
      ? controlVehicleMapPoints(controlOrders, departureLocation, vehicleColors, controlVehicleVisibility, controlManagement)
      : [];
    if (controlTrailPlaybackSample === undefined || selectedControlVehicleId === undefined) return liveVehicles;
    const plate = controlManagement?.vehicles.find((vehicle) => vehicle.id === selectedControlVehicleId)?.plate ?? '차량';
    return [...liveVehicles, {
      color: '#d92d20',
      id: `trail-playback:${selectedControlVehicleId}`,
      interactive: false,
      label: `${plate} ${formatControlTrailTime(controlTrailPlaybackSample.observedAt)}`,
      latitude: controlTrailPlaybackSample.latitude,
      longitude: controlTrailPlaybackSample.longitude,
    }];
  }, [
    controlManagement,
    controlOrders,
    controlServiceDate,
    controlTrailPlaybackSample,
    controlVehicleVisibility,
    departureLocation,
    selectedControlVehicleId,
    vehicleColors,
  ]);
  const handleControlOrdersChange = useCallback((orders: DispatchListItem[], serviceDate?: string) => {
    setControlOrders(orders);
    setControlServiceDate(serviceDate);
  }, []);
  const handleControlTrailToggle = useCallback(() => {
    setControlTrailOpen((open) => {
      const nextOpen = !open;
      setControlTrailPlaying(false);
      if (nextOpen) setControlTrailCursorMs(controlTrailRange?.endMs);
      return nextOpen;
    });
  }, [controlTrailRange]);

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
    setControlVehicleTrailError('');
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
        if (!controller.signal.aborted) {
          setControlVehicleTrail(undefined);
          setControlVehicleTrailError('차량 자취를 불러오지 못했습니다.');
        }
      });
    return () => controller.abort();
  }, [controlDailyRouteCompletionKey, controlServiceDate, selectedControlVehicleId]);

  useEffect(() => {
    setControlTrailOpen(false);
    setControlTrailCursorMs(undefined);
    setControlTrailPlaying(false);
    setControlTrailFollow(false);
  }, [controlServiceDate, selectedControlVehicleId]);

  useEffect(() => {
    if (!controlTrailOpen || controlTrailRange === undefined) return;
    setControlTrailCursorMs((current) => current ?? controlTrailRange.endMs);
  }, [controlTrailOpen, controlTrailRange]);

  useEffect(() => {
    if (!controlTrailOpen || !controlTrailPlaying || controlTrailRange === undefined) return undefined;
    const timer = window.setInterval(() => {
      setControlTrailCursorMs((current) => Math.min(
        controlTrailRange.endMs,
        (current ?? controlTrailRange.startMs) + 5 * 60_000,
      ));
    }, 250);
    return () => window.clearInterval(timer);
  }, [controlTrailOpen, controlTrailPlaying, controlTrailRange]);

  useEffect(() => {
    if (controlTrailRange !== undefined && controlTrailCursorMs === controlTrailRange.endMs) {
      setControlTrailPlaying(false);
    }
  }, [controlTrailCursorMs, controlTrailRange]);

  useEffect(() => {
    if (!controlTrailOpen || !controlTrailFollow || controlTrailPlaybackSample === undefined) return;
    setControlMapCenterRequest((current) => ({
      id: (current?.id ?? 0) + 1,
      latitude: controlTrailPlaybackSample.latitude,
      longitude: controlTrailPlaybackSample.longitude,
    }));
  }, [controlTrailFollow, controlTrailOpen, controlTrailPlaybackSample]);

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
        <span className="mobile-header-title" aria-hidden="true">{activeTab.label}</span>
        {adminTabs.filter((tab) => tab.path !== '/inquiries' || principalScopes.includes('dsv:accounts:read')).map((tab) => (
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
        <button className="sidebar-account" type="button" aria-label="계정 설정" onClick={() => setCredentialsOpen(true)}>
          <UserCog aria-hidden="true" />
          <span>계정 설정</span>
        </button>
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
        {credentialMessage ? <p className="admin-shell-status" role="status">{credentialMessage}</p> : null}
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
                  onManagementChange={setControlManagement}
                  onOrdersChange={handleControlOrdersChange}
                  onDestinationSelect={(destinationId) => {
                    setSelectedControlDestinationId((current) => current === destinationId ? undefined : destinationId);
                  }}
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
                  trailCursorMs={controlTrailCursorMs}
                  trailError={controlVehicleTrailError}
                  trailFollow={controlTrailFollow}
                  trailOpen={controlTrailOpen}
                  trailPlaying={controlTrailPlaying}
                  trailRange={controlTrailRange}
                  trailReady={controlTrailRange !== undefined}
                  onTrailCursorChange={(cursorMs) => {
                    setControlTrailCursorMs(cursorMs);
                    setControlTrailPlaying(false);
                  }}
                  onTrailFollowChange={setControlTrailFollow}
                  onTrailPlayingChange={setControlTrailPlaying}
                  onTrailReset={() => {
                    setControlTrailCursorMs(controlTrailRange?.startMs);
                    setControlTrailPlaying(false);
                  }}
                  onTrailToggle={handleControlTrailToggle}
                  vehicleColors={vehicleColors}
                  vehicleVisibility={controlVehicleVisibility}
                  onVehicleVisibilityChange={setControlVehicleVisibility}
                />
              ))
          : <AdminContent activePath={activePath} title={activeTab.title} description={activeTab.description} principalId={principalId} principalScopes={principalScopes} />}
      </section>
      {credentialsOpen && !previewOnly ? <AdminCredentialDialog
        onClose={() => setCredentialsOpen(false)}
        onUpdated={(updatedPrincipal) => {
          onSessionUpdate?.(updatedPrincipal);
          setCredentialsOpen(false);
          setCredentialMessage('계정 설정을 저장했습니다.');
        }}
      /> : null}
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
              ...(stop.progressStatus === 'completed' ? { completedAt: completedStopEventAt(stop.orders) } : {}),
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
  history?: VehicleGpsTrailHistory,
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
    const plannedSegments = splitControlRouteByProgress({ coordinates, stops: request.stops, vehiclePosition });
    const plannedRoutes = plannedSegments.map((segment, index) => ({
      color: CONTROL_PROGRESS_COLORS[segment.status],
      coordinates: segment.coordinates,
      id: `${request.id}:${segment.status}`,
      selected: true,
      sortOrder: index,
    }));
    const firstStop = request.stops[0];
    const completedIndex = plannedSegments.findIndex((segment) => segment.status === 'completed');
    if (
      firstStop?.progressStatus !== 'completed'
      || firstStop.completedAt === undefined
      || completedIndex < 0
      || history?.vehicleId !== request.vehicleId
    ) return plannedRoutes;
    const startedAt = history.sessions
      .filter((session) => session.routePlanId === request.id && Date.parse(session.startedAt) <= Date.parse(firstStop.completedAt!))
      .map((session) => session.startedAt)
      .sort()[0];
    if (startedAt === undefined) return plannedRoutes;
    const completedPart = splitControlRouteAtStop(plannedSegments[completedIndex]!.coordinates, firstStop.coordinate);
    if (completedPart === null) return plannedRoutes;
    const actualLines = actualFirstLegLines({
      completedAt: firstStop.completedAt,
      dailyRoute: history.dailyRoute,
      destination: firstStop.coordinate,
      origin: completedPart.firstLeg[0]!,
      startedAt,
    });
    if (actualLines.length === 0) return plannedRoutes;
    const actualRoutes: MapCanvasRoute[] = actualLines.map((line, index) => ({
      color: CONTROL_PROGRESS_COLORS.completed,
      coordinates: line.coordinates,
      id: `${request.id}:actual-first-leg:${index}`,
      ...(line.uncertain ? { kind: 'trail' as const, dashed: true } : {}),
      selected: true,
      sortOrder: index,
    }));
    const remaining: MapCanvasRoute[] = completedPart.remaining.length > 1
      ? [{
          color: CONTROL_PROGRESS_COLORS.completed,
          coordinates: completedPart.remaining,
          id: `${request.id}:completed:remaining`,
          selected: true,
          sortOrder: actualRoutes.length,
        }]
      : [];
    return [
      ...plannedRoutes.slice(0, completedIndex),
      ...actualRoutes,
      ...remaining,
      ...plannedRoutes.slice(completedIndex + 1),
    ];
  });
}

function completedStopEventAt(orders: DispatchListItem[]): string | undefined {
  const latestEvents = orders.map((order) => order.eventSummary
    .filter((event) => event.type === 'STOP_ARRIVED' || event.type === 'STOP_DELIVERED' || event.type === 'STOP_FAILED')
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))[0]);
  if (latestEvents.length === 0 || latestEvents.some((event) => event?.type !== 'STOP_DELIVERED')) return undefined;
  return latestEvents.map((event) => event!.occurredAt).sort().at(-1);
}

function vehicleGpsTrailMapRoutes(history: VehicleGpsTrailHistory, cursorMs?: number): MapCanvasRoute[] {
  if (history.dailyRoute !== null) {
    return dailyRouteTrailLines(history.dailyRoute, cursorMs).map((coordinates, index) => ({
      color: '#d92d20',
      coordinates,
      dashed: true,
      id: `vehicle-trail:daily:${index}`,
      kind: 'trail' as const,
      selected: true,
      sortOrder: 200 + index,
    }));
  }
  const sessions = [...history.sessions].sort((left, right) => {
    const timeOrder = Date.parse(left.startedAt) - Date.parse(right.startedAt);
    return timeOrder === 0 ? left.sessionIndex - right.sessionIndex : timeOrder;
  });
  return sessions.flatMap((session, sessionOrder) => session.segments.flatMap((segment, segmentOrder): MapCanvasRoute[] => {
    const matchedLines = visibleTrailGeometryLines(segment.roadMatchedGeometry, cursorMs);
    const rawLines = visibleTrailRawLines(segment.samples, segment.roadMatchedGeometry, cursorMs);
    const lines = [
      ...(matchedLines ?? []).map((line) => ({ coordinates: line.coordinates, id: `matched:${line.lineIndex}` })),
      ...rawLines.map((coordinates, lineIndex) => ({ coordinates, id: `raw:${lineIndex}` })),
    ];
    return lines.flatMap((line): MapCanvasRoute[] => {
      if (line.coordinates.length < 2) return [];
      return [{
        color: '#d92d20',
        coordinates: line.coordinates,
        dashed: true,
        id: `vehicle-trail:${session.routePlanId}:${session.sessionIndex}:${segmentOrder}:${line.id}`,
        kind: 'trail' as const,
        selected: true,
        sortOrder: 200 + sessionOrder * 100 + segmentOrder * 10,
      }];
    });
  }));
}

function formatControlTrailTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value));
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
    return [{
      color: controlVehicleDisplayColor(vehicle.id, vehicleColors),
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
