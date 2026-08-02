import type { ReactElement, TransitionEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import maplibregl from 'maplibre-gl';
import { loadMapProviderProfile } from '../services/map-provider';
import { MapPreview } from './MapPreview';
import {
  applyDepartureMarkerMetadata,
  createDepartureMarkerElement,
} from './DepartureMarker';
import type { DepartureLocation } from './DepartureMarker';
import { updateDestinationMarkers } from './map/DestinationMarkers';
import { updateOperationalRoutes } from './map/OperationalRoutes';
import { updateVehicleMarkers } from './map/VehicleMarkers';

type MapCanvasProps = {
  ariaLabel: string;
  departureLocation?: DepartureLocation | null;
  onMapPointAdd?: (coordinate: MapCanvasCoordinate) => void;
  onReady?: () => void;
  onPointSelect?: (pointId: string) => void;
  onSelectionChange?: (coordinates: MapCanvasCoordinate[]) => void;
  onSelectionComplete?: (coordinates: MapCanvasCoordinate[]) => void;
  points?: MapCanvasPoint[];
  selectionCoordinates?: MapCanvasCoordinate[];
  selectionMode?: boolean;
  selectedPointId?: string;
  selectedPointIds?: string[];
  routes?: MapCanvasRoute[];
  showEveryPoint?: boolean;
  variant?: 'embedded' | 'fullscreen';
  vehicles?: MapCanvasVehiclePoint[];
};

export type { DepartureLocation } from './DepartureMarker';

export type MapCanvasCoordinate = [longitude: number, latitude: number];

export type MapCanvasPoint = {
  color?: string;
  id: string;
  label?: string;
  latitude: number;
  longitude: number;
  sortOrder?: number;
  tone?: 'assigned' | 'unassigned';
};

export type MapCanvasRoute = {
  color: string;
  coordinates: MapCanvasCoordinate[];
  id: string;
  selected?: boolean;
};

export type MapCanvasVehiclePoint = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

type MapLoadState =
  | { status: 'preview' }
  | { status: 'revealing' }
  | { status: 'ready' }
  | { message: string; status: 'failed' };

const initialMapLoadTimeoutMs = 15_000;

export function MapCanvas({
  ariaLabel,
  departureLocation = null,
  onMapPointAdd,
  onReady,
  onPointSelect,
  onSelectionChange,
  onSelectionComplete,
  points = [],
  selectionCoordinates = [],
  selectionMode = false,
  selectedPointId,
  selectedPointIds = [],
  routes = [],
  showEveryPoint = false,
  variant = 'fullscreen',
  vehicles = [],
}: MapCanvasProps): ReactElement {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const departureMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onReadyRef = useRef(onReady);
  const onMapPointAddRef = useRef(onMapPointAdd);
  const onPointSelectRef = useRef(onPointSelect);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onSelectionCompleteRef = useRef(onSelectionComplete);
  const selectionCoordinatesRef = useRef(selectionCoordinates);
  const readyNotifiedRef = useRef(false);
  const [loadState, setLoadState] = useState<MapLoadState>({ status: 'preview' });
  const [loadAttempt, setLoadAttempt] = useState(0);
  onReadyRef.current = onReady;
  onMapPointAddRef.current = onMapPointAdd;
  onPointSelectRef.current = onPointSelect;
  onSelectionChangeRef.current = onSelectionChange;
  onSelectionCompleteRef.current = onSelectionComplete;
  selectionCoordinatesRef.current = selectionCoordinates;

  useEffect(() => {
    if (!mapRef.current) return undefined;
    const abortController = new AbortController();
    let cancelled = false;
    let map: maplibregl.Map | null = null;
    let initialLoadComplete = false;
    let initialLoadFailed = false;
    let initialLoadTimeout: number | undefined;
    readyNotifiedRef.current = false;
    setLoadState({ status: 'preview' });

    loadMapProviderProfile(abortController.signal)
      .then((profile) => {
        if (cancelled || !mapRef.current) return;
        map = new maplibregl.Map({
          attributionControl: false,
          bearing: 0,
          center: profile.initialView.center,
          container: mapRef.current,
          dragRotate: false,
          maxBounds: profile.bounds,
          maxPitch: 0,
          pitch: 0,
          pitchWithRotate: false,
          style: profile.styleUrl,
          touchPitch: false,
          zoom: profile.initialView.zoom,
        });
        mapInstanceRef.current = map;
        (window as typeof window & { dsvMap?: maplibregl.Map }).dsvMap = map;
        map.addControl(new maplibregl.AttributionControl({ compact: true }));
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
        initialLoadTimeout = window.setTimeout(() => {
          if (cancelled || initialLoadComplete) return;
          initialLoadFailed = true;
          setLoadState({
            message: '지도 공급자의 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
            status: 'failed',
          });
        }, initialMapLoadTimeoutMs);
        map.on('load', () => {
          if (initialLoadTimeout !== undefined) window.clearTimeout(initialLoadTimeout);
          if (initialLoadFailed) return;
          initialLoadComplete = true;
          if (!cancelled) {
            setLoadState({ status: 'revealing' });
            notifyMapReady();
          }
        });
        map.on('error', () => {
          if (!cancelled && !initialLoadComplete && !initialLoadFailed) {
            initialLoadFailed = true;
            if (initialLoadTimeout !== undefined) window.clearTimeout(initialLoadTimeout);
            setLoadState({
              message: '지도 데이터를 불러오지 못했습니다. 네트워크 연결과 지도 공급자 상태를 확인해 주세요.',
              status: 'failed',
            });
          }
        });
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return;
        setLoadState({
          message: '지도 공급자 설정을 불러오지 못했습니다.',
          status: 'failed',
        });
      });

    return () => {
      cancelled = true;
      abortController.abort();
      if (initialLoadTimeout !== undefined) window.clearTimeout(initialLoadTimeout);
      departureMarkerRef.current?.remove();
      departureMarkerRef.current = null;
      mapInstanceRef.current = null;
      delete (window as typeof window & { dsvMap?: maplibregl.Map }).dsvMap;
      map?.remove();
    };
  }, [loadAttempt]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (
      !map
      || !departureLocation
      || (loadState.status !== 'revealing' && loadState.status !== 'ready')
    ) {
      departureMarkerRef.current?.remove();
      departureMarkerRef.current = null;
      return;
    }
    const coordinates: [number, number] = [
      departureLocation.longitude,
      departureLocation.latitude,
    ];
    if (!departureMarkerRef.current) {
      departureMarkerRef.current = new maplibregl.Marker({
        anchor: 'bottom',
        element: createDepartureMarkerElement(departureLocation),
      })
        .setLngLat(coordinates)
        .addTo(map);
      return;
    }
    departureMarkerRef.current.setLngLat(coordinates);
    applyDepartureMarkerMetadata(
      departureMarkerRef.current.getElement(),
      departureLocation,
    );
  }, [departureLocation, loadState.status]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || (loadState.status !== 'revealing' && loadState.status !== 'ready')) return;
    const selectedIds = new Set(selectedPointIds);
    if (selectedPointId !== undefined) selectedIds.add(selectedPointId);
    updateDestinationMarkers(map, points, selectedIds, showEveryPoint, (pointId) => onPointSelectRef.current?.(pointId));
  }, [loadState.status, points, selectedPointId, selectedPointIds, showEveryPoint]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || (loadState.status !== 'revealing' && loadState.status !== 'ready')) return;
    updateOperationalRoutes(map, routes);
  }, [loadState.status, routes]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || (loadState.status !== 'revealing' && loadState.status !== 'ready')) return;
    void updateVehicleMarkers(map, vehicles).catch(() => undefined);
  }, [loadState.status, vehicles]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || (loadState.status !== 'revealing' && loadState.status !== 'ready')) return;
    const sourceId = 'dispatch-selection-source';
    const fillLayerId = 'dispatch-selection-fill';
    const lineLayerId = 'dispatch-selection-line';
    const vertexLayerId = 'dispatch-selection-vertices';
    const features: Feature[] = selectionFeatures(selectionCoordinates);
    const data: FeatureCollection = { type: 'FeatureCollection', features };
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
      return;
    }
    map.addSource(sourceId, { type: 'geojson', data });
    map.addLayer({
      id: fillLayerId,
      type: 'fill',
      source: sourceId,
      filter: ['==', '$type', 'Polygon'],
      paint: {
        'fill-color': '#0066cc',
        'fill-opacity': 0.14,
      },
    });
    map.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      filter: ['in', '$type', 'LineString', 'Polygon'],
      paint: {
        'line-color': '#0066cc',
        'line-width': 2,
        'line-dasharray': [2, 1],
      },
    });
    map.addLayer({
      id: vertexLayerId,
      type: 'circle',
      source: sourceId,
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-color': '#ffffff',
        'circle-radius': 6,
        'circle-stroke-color': '#0066cc',
        'circle-stroke-width': 2.5,
      },
    });
  }, [loadState.status, selectionCoordinates]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || loadState.status !== 'ready') return;
    const canvas = map.getCanvas();
    canvas.style.cursor = selectionMode ? 'crosshair' : '';
    if (!selectionMode) return;
    const vertexLayerId = 'dispatch-selection-vertices';
    const appendSelectionPoint = (coordinate: MapCanvasCoordinate) => {
      if (onSelectionChangeRef.current === undefined) {
        onMapPointAddRef.current?.(coordinate);
        return;
      }
      const nextCoordinates = [...selectionCoordinatesRef.current, coordinate];
      selectionCoordinatesRef.current = nextCoordinates;
      onSelectionChangeRef.current(nextCoordinates);
    };
    const handleClick = (event: maplibregl.MapMouseEvent) => {
      if (
        map.getLayer(vertexLayerId)
        && map.queryRenderedFeatures(event.point, { layers: [vertexLayerId] }).length > 0
      ) return;
      if (event.originalEvent.detail > 1) return;
      appendSelectionPoint([event.lngLat.lng, event.lngLat.lat]);
    };
    const handleDoubleClick = (event: maplibregl.MapMouseEvent) => {
      event.preventDefault();
      const coordinate: MapCanvasCoordinate = [event.lngLat.lng, event.lngLat.lat];
      const lastCoordinate = selectionCoordinatesRef.current.at(-1);
      const completedCoordinates = lastCoordinate !== undefined && coordinatesAreClose(lastCoordinate, coordinate)
        ? [...selectionCoordinatesRef.current]
        : [...selectionCoordinatesRef.current, coordinate];
      if (completedCoordinates.length < 3) return;
      selectionCoordinatesRef.current = completedCoordinates;
      onSelectionChangeRef.current?.(completedCoordinates);
      onSelectionCompleteRef.current?.(completedCoordinates);
    };
    const wasDoubleClickZoomEnabled = map.doubleClickZoom.isEnabled();
    map.doubleClickZoom.disable();
    map.on('click', handleClick);
    map.on('dblclick', handleDoubleClick);
    return () => {
      canvas.style.cursor = '';
      if (wasDoubleClickZoomEnabled) map.doubleClickZoom.enable();
      map.off('click', handleClick);
      map.off('dblclick', handleDoubleClick);
    };
  }, [loadState.status, selectionMode]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || selectionCoordinatesRef.current.length === 0 || loadState.status !== 'ready') return;
    const vertexLayerId = 'dispatch-selection-vertices';
    if (!map.getLayer(vertexLayerId)) return;
    let draggedVertexIndex: number | null = null;
    let dragPanWasEnabled = false;
    let ignoreVertexClickUntil = 0;

    const startDrag = (event: maplibregl.MapLayerMouseEvent | maplibregl.MapLayerTouchEvent) => {
      const vertexIndex = Number(event.features?.[0]?.properties?.vertexIndex);
      if (!Number.isInteger(vertexIndex)) return;
      draggedVertexIndex = vertexIndex;
      dragPanWasEnabled = map.dragPan.isEnabled();
      map.dragPan.disable();
      map.getCanvas().style.cursor = 'grabbing';
      event.preventDefault();
    };
    const moveDrag = (event: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      if (draggedVertexIndex === null) return;
      ignoreVertexClickUntil = window.performance.now() + 200;
      const nextCoordinates = selectionCoordinatesRef.current.map((coordinate, index) => (
        index === draggedVertexIndex
          ? [event.lngLat.lng, event.lngLat.lat] as MapCanvasCoordinate
          : coordinate
      ));
      selectionCoordinatesRef.current = nextCoordinates;
      onSelectionChangeRef.current?.(nextCoordinates);
    };
    const finishDrag = () => {
      if (draggedVertexIndex === null) return;
      draggedVertexIndex = null;
      if (dragPanWasEnabled) map.dragPan.enable();
      map.getCanvas().style.cursor = selectionMode ? 'crosshair' : 'grab';
    };
    const finishSelection = (event: maplibregl.MapLayerMouseEvent) => {
      if (!selectionMode) return;
      event.preventDefault();
      if (window.performance.now() < ignoreVertexClickUntil) return;
      if (selectionCoordinatesRef.current.length >= 3) {
        onSelectionCompleteRef.current?.([...selectionCoordinatesRef.current]);
      }
    };
    const showGrabCursor = () => {
      if (draggedVertexIndex === null) map.getCanvas().style.cursor = 'grab';
    };
    const restoreSelectionCursor = () => {
      if (draggedVertexIndex === null) map.getCanvas().style.cursor = selectionMode ? 'crosshair' : '';
    };

    map.on('mousedown', vertexLayerId, startDrag);
    map.on('touchstart', vertexLayerId, startDrag);
    map.on('mousemove', moveDrag);
    map.on('touchmove', moveDrag);
    map.on('mouseup', finishDrag);
    map.on('touchend', finishDrag);
    map.on('click', vertexLayerId, finishSelection);
    map.on('mouseenter', vertexLayerId, showGrabCursor);
    map.on('mouseleave', vertexLayerId, restoreSelectionCursor);
    return () => {
      if (dragPanWasEnabled) map.dragPan.enable();
      map.getCanvas().style.cursor = '';
      map.off('mousedown', vertexLayerId, startDrag);
      map.off('touchstart', vertexLayerId, startDrag);
      map.off('mousemove', moveDrag);
      map.off('touchmove', moveDrag);
      map.off('mouseup', finishDrag);
      map.off('touchend', finishDrag);
      map.off('click', vertexLayerId, finishSelection);
      map.off('mouseenter', vertexLayerId, showGrabCursor);
      map.off('mouseleave', vertexLayerId, restoreSelectionCursor);
    };
  }, [loadState.status, selectionCoordinates.length, selectionMode]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const selected = points.find((point) => point.id === selectedPointId);
    if (!map || !selected || loadState.status !== 'ready') return;
    map.easeTo({
      center: [selected.longitude, selected.latitude],
      duration: 260,
      zoom: Math.max(map.getZoom(), 12),
    });
  }, [loadState.status, points, selectedPointId]);

  useEffect(() => {
    if (loadState.status !== 'revealing' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    completeReveal();
  }, [loadState.status]);

  function notifyMapReady(): void {
    if (readyNotifiedRef.current) return;
    readyNotifiedRef.current = true;
    onReadyRef.current?.();
  }

  function completeReveal(): void {
    setLoadState({ status: 'ready' });
  }

  function finishCanvasTransition(event: TransitionEvent<HTMLDivElement>): void {
    if (event.propertyName === 'opacity' && loadState.status === 'revealing') completeReveal();
  }

  const liveMapVisible = loadState.status === 'revealing' || loadState.status === 'ready';
  const previewFading = loadState.status === 'revealing' || loadState.status === 'ready';

  return (
    <article className={`card map-card ${variant}`} aria-busy={loadState.status === 'preview' || loadState.status === 'revealing'} aria-label={ariaLabel}>
      <div className="map-wrap">
        <MapPreview
          fading={previewFading}
          loading={loadState.status === 'preview'}
          showAttribution={loadState.status === 'preview' || loadState.status === 'failed'}
        />
        <div
          className={`map-canvas${liveMapVisible ? ' visible' : ''}${loadState.status === 'ready' ? ' ready' : ''}`}
          ref={mapRef}
          aria-label={ariaLabel}
          onTransitionEnd={finishCanvasTransition}
        />
        {loadState.status === 'failed' ? (
          <div className="map-load-state error" role="alert">
            <p>{loadState.message}</p>
            <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>다시 시도</button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function selectionFeatures(coordinates: MapCanvasCoordinate[]): Feature[] {
  const vertices: Feature[] = coordinates.map((coordinate, vertexIndex) => ({
    type: 'Feature',
    properties: { vertexIndex },
    geometry: { type: 'Point', coordinates: coordinate },
  }));
  if (coordinates.length < 2) return vertices;
  const line: Feature = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  };
  if (coordinates.length < 3) return [line, ...vertices];
  const polygon: Feature = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [[...coordinates, coordinates[0]]] },
  };
  return [polygon, ...vertices];
}

function coordinatesAreClose(left: MapCanvasCoordinate, right: MapCanvasCoordinate): boolean {
  return Math.abs(left[0] - right[0]) < 0.000001 && Math.abs(left[1] - right[1]) < 0.000001;
}
